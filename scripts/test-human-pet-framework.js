'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { validatePetpack } = require('../src/petpack-validator');

const projectRoot = path.resolve(__dirname, '..');
const testRoot = path.join(projectRoot, 'tmp', `human-pet-framework-test-${process.pid}`);

function run(argumentsList) {
  const result = spawnSync(process.execPath, [path.join(projectRoot, 'scripts', 'make-human-pet.js'), ...argumentsList], {
    cwd: projectRoot,
    encoding: 'utf8'
  });
  if (result.status !== 0) throw new Error([result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout;
}

function entryData(zip, name) {
  const entry = zip.getEntry(name);
  assert(entry, `missing archive entry: ${name}`);
  return entry.getData();
}

function buildFixture({ id, name, source, features, extra = [] }) {
  const outputDir = path.join(testRoot, id, 'package');
  const petpack = path.join(testRoot, id, `${id}.petpack`);
  run([
    '--id', id,
    '--name', name,
    '--frames-dir', `pets/work/${source}/frames`,
    '--preview', `pets/work/${source}/package/preview.png`,
    '--output-dir', outputDir,
    '--petpack-output', petpack,
    '--features', features,
    '--force',
    ...extra
  ]);
  return { outputDir, petpack, inspected: validatePetpack(petpack) };
}

function main() {
  const resolvedTestRoot = path.resolve(testRoot);
  assert(resolvedTestRoot.startsWith(path.join(projectRoot, 'tmp') + path.sep));
  fs.mkdirSync(testRoot, { recursive: true });
  try {
    const friend = buildFixture({
      id: 'framework-friend-human',
      name: '朋友甲',
      source: 'friend-human',
      features: 'call-relative,kowtow'
    });
    assert.deepStrictEqual(friend.inspected.manifest.contextMenuActions.map((item) => item.id), ['call-relative', 'kowtow']);
    assert.strictEqual(friend.inspected.manifest.contextMenuActions[0].label, '称呼');
    assert.strictEqual(friend.inspected.manifest.contextMenuActions[0].message, undefined);
    assert.strictEqual(friend.inspected.manifest.contextMenuActions[1].action, 'sit');
    assert(entryData(friend.inspected.zip, 'animations/sleep/01.png').equals(entryData(friend.inspected.zip, 'animations/idle/01.png')));
    assert(!entryData(friend.inspected.zip, 'animations/sit/01.png').equals(entryData(friend.inspected.zip, 'animations/idle/01.png')));

    const athletic = buildFixture({
      id: 'framework-athletic-human',
      name: '朋友乙',
      source: 'athletic-young-man',
      features: 'call-relative',
      extra: ['--call-label', '叫哥哥', '--call-message', '赖荣杰哥哥', '--call-speech', '赖荣杰哥哥']
    });
    assert.deepStrictEqual(athletic.inspected.manifest.contextMenuActions.map((item) => item.id), ['call-relative']);
    assert.strictEqual(athletic.inspected.manifest.contextMenuActions[0].message, '赖荣杰哥哥');
    assert.strictEqual(athletic.inspected.manifest.contextMenuActions[0].speech, '赖荣杰哥哥');
    assert(entryData(athletic.inspected.zip, 'animations/sit/01.png').equals(entryData(athletic.inspected.zip, 'animations/idle/01.png')));
    assert(!entryData(athletic.inspected.zip, 'animations/reaction/01.png').equals(entryData(athletic.inspected.zip, 'animations/idle/01.png')));

    const plan = JSON.parse(run(['--id', 'framework-plan', '--name', '计划', '--features', 'kowtow', '--plan-only']));
    assert.deepStrictEqual(plan.requiredGeneratedActions, ['idle', 'walk', 'sit']);
    assert.deepStrictEqual(plan.compatibilityClones, { sleep: 'idle', reaction: 'idle' });

    const choicePlan = JSON.parse(run([
      '--id', 'framework-choice-plan',
      '--name', '选择式计划',
      '--features', 'call-relative,kowtow,edge-sit,fan-greeting,drink-water,stretch,wave-hello,dance',
      '--plan-only'
    ]));
    assert.deepStrictEqual(choicePlan.requiredGeneratedActions, [
      'idle', 'walk', 'reaction', 'sit', 'edge-sit', 'fan-greeting', 'drink-water', 'stretch', 'wave-hello', 'dance'
    ]);
    assert.strictEqual(choicePlan.requiredFrameCounts['drink-water'], 6);
    assert(choicePlan.processingCommand.includes('drink-water=6'));
    assert(choicePlan.processingCommand.includes('fan-greeting=4'));

    const listedFeatures = JSON.parse(run(['--list-features']));
    assert(listedFeatures.some((item) => item.id === 'drink-water' && item.action === 'drink-water'));
    assert(listedFeatures.some((item) => item.id === 'call-relative' && item.defaults.message === ''));

    const extraConfig = path.join(testRoot, 'extra-plan.json');
    fs.writeFileSync(extraConfig, JSON.stringify({
      schemaVersion: 1,
      id: 'framework-extra-plan',
      name: '多动作计划',
      features: [],
      extraAnimations: [
        { action: 'write-note', durations: [260, 320, 480, 1600], loop: false, holdLastFrame: true },
        { action: 'finger-heart', durations: [260, 300, 700, 1200], loop: false, holdLastFrame: true }
      ]
    }));
    const extraPlan = JSON.parse(run(['--config', extraConfig, '--plan-only']));
    assert.deepStrictEqual(extraPlan.requiredGeneratedActions, ['idle', 'walk', 'write-note', 'finger-heart']);
    assert.deepStrictEqual(extraPlan.requiredFrameCounts, { idle: 4, walk: 6, 'write-note': 4, 'finger-heart': 4 });
    assert(extraPlan.processingCommand.includes('--frame-counts write-note=4,finger-heart=4'));

    console.log('human pet framework checks passed (2 distinct human frame sets)');
  } finally {
    fs.rmSync(resolvedTestRoot, { recursive: true, force: true });
  }
}

main();

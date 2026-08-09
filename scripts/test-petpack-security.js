'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');
const { safeRelative, validateManifest, validatePetpack } = require('../src/petpack-validator');

const fixture = path.join(__dirname, '..', 'pets', 'packages', 'xiaogou.petpack');
assert.doesNotThrow(() => validatePetpack(fixture), 'reviewed demo package must validate');

const playerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'main-v3.js'), 'utf8');
for (const forbidden of ['不要离开我', '别走太远', '你回来啦', '我就在这里陪你', '你好，我是']) {
  assert(!playerSource.includes(forbidden), `player must not hard-code bubble text: ${forbidden}`);
}

function assertRejected(name, mutate, expected) {
  const output = path.join(os.tmpdir(), `desktop-pet-${process.pid}-${name}.petpack`);
  const zip = new AdmZip(fixture);
  mutate(zip);
  zip.writeZip(output);
  try { assert.throws(() => validatePetpack(output), expected); }
  finally { fs.rmSync(output, { force: true }); }
}

assertRejected('extra-file', (zip) => zip.addFile('private/notes.txt', Buffer.from('should not ship')), /未引用文件/);
assertRejected('case-collision', (zip) => zip.addFile('PET.JSON', Buffer.from('{}')), /重复或大小写冲突路径/);
assert.throws(() => safeRelative('private\\notes.txt'), /不安全的资源路径/);
assert.throws(() => safeRelative('../preview.png'), /不安全的资源路径/);
assertRejected('bad-preview', (zip) => {
  const manifest = JSON.parse(zip.readAsText('pet.json'));
  manifest.preview = 'preview.jpg';
  zip.updateFile('pet.json', Buffer.from(JSON.stringify(manifest)));
}, /preview 必须是 PNG/);

const interactiveManifest = validatePetpack(fixture).manifest;
interactiveManifest.animations['write-note'] = {
  frames: [...interactiveManifest.animations.idle.frames],
  durations: [260, 320, 480, 1600],
  loop: false,
  holdLastFrame: true
};
interactiveManifest.contextMenuActions = [
  {
    id: 'random-note',
    label: '随机纸条',
    action: 'reaction',
    messages: ['今天也辛苦了。', '记得喝水。'],
    duration: 3800
  },
  {
    id: 'demo-sequence',
    label: '演示序列',
    sequence: [
      { action: 'reaction', message: '你好。', duration: 1200 },
      { action: 'idle', message: '我陪着你。', duration: 3000 },
      { action: 'sit', message: '坐一会儿。', duration: 4200 }
    ]
  },
  {
    id: 'quiet-company',
    label: '安静陪伴',
    action: 'idle',
    message: '我安静陪你一会儿。',
    duration: 600000
  }
];
assert.doesNotThrow(() => validateManifest(interactiveManifest), 'random messages, sequences, and long quiet mode must validate');
interactiveManifest.behavior.random[0].messages = ['去散步。', '慢慢走。'];
interactiveManifest.behavior.random[0].speech = '散步';
assert.doesNotThrow(() => validateManifest(interactiveManifest), 'resource-driven random behavior dialogue must validate');
assert.throws(() => validateManifest({
  ...interactiveManifest,
  behavior: {
    random: interactiveManifest.behavior.random.map((item, index) => index === 0
      ? { ...item, message: '冲突', messages: ['重复配置'] }
      : item)
  }
}), /不能同时配置 message 和 messages/);

assert.throws(() => validateManifest({
  ...interactiveManifest,
  animations: {
    ...interactiveManifest.animations,
    'bad-extra': { frames: [interactiveManifest.animations.idle.frames[0]], durations: [100], loop: false }
  }
}), /可选动画必须包含 2 到 12 帧/);
assert.throws(() => validateManifest({
  ...interactiveManifest,
  contextMenuActions: [{ id: 'bad-pool', label: '坏配置', action: 'idle', message: 'a', messages: ['b'] }]
}), /不能同时配置 message 和 messages/);

console.log('petpack archive security checks passed');

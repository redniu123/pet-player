'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const frameworkRoot = path.join(projectRoot, 'pet-framework');
const featureRoot = path.join(frameworkRoot, 'features');
const basePath = path.join(frameworkRoot, 'human', 'base.json');
const petpackTool = path.join(projectRoot, 'skills', 'desktop-pet-maker', 'scripts', 'petpack_tool.py');
const PET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

function usage() {
  console.log([
    '用法：',
    '  npm run make:human -- --config <build.json> [--force] [--build-exe]',
    '  npm run make:human -- --id <id> --name <名字> --frames-dir <目录> --preview <png> --features <列表>',
    '',
    '常用参数：',
    '  --features drink-water,stretch,wave-hello（可多选；默认不选）',
    '  --call-label <菜单文字>       --call-message <气泡>       --call-speech <系统语音>',
    '  --kowtow-label <菜单文字>     --kowtow-message <气泡>',
    '  --output-dir <package目录>    --petpack-output <file.petpack>',
    '  --plan-only                   只输出需要生成的动作和提示词',
    '  --list-features               列出可选功能模块',
    '  --plan-output <file.json>     保存生成计划',
    '  --force                       覆盖既有输出',
    '  --build-exe --app-name <名称> [--delivery-id <id>] [--customer-output <目录>]',
    '',
    '最小核心素材只有 frames/idle/*.png 与 frames/walk/*.png。',
    '每个所选功能只需提供计划中对应的独立动作帧；运行 --list-features 查看全部选项。',
    'sleep 以及未选择功能对应的标准动作会自动复制 idle 帧作为 schema-v1 兼容资源。'
  ].join('\n'));
}

function parseArgs(argv) {
  const options = { overrides: {} };
  const booleanFlags = new Set(['--help', '--plan-only', '--list-features', '--force', '--build-exe']);
  const valueFlags = new Map([
    ['--config', 'config'], ['--id', 'id'], ['--name', 'name'], ['--description', 'description'],
    ['--personality', 'personality'], ['--package-version', 'packageVersion'], ['--frames-dir', 'framesDir'],
    ['--preview', 'preview'], ['--output-dir', 'outputDir'], ['--petpack-output', 'petpackOutput'],
    ['--features', 'features'], ['--plan-output', 'planOutput'], ['--app-name', 'appName'],
    ['--delivery-id', 'deliveryId'], ['--customer-output', 'customerOutput']
  ]);
  const convenience = new Map([
    ['--call-label', ['call-relative', 'label']], ['--call-message', ['call-relative', 'message']],
    ['--call-speech', ['call-relative', 'speech']], ['--kowtow-label', ['kowtow', 'label']],
    ['--kowtow-message', ['kowtow', 'message']], ['--kowtow-speech', ['kowtow', 'speech']]
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (booleanFlags.has(argument)) {
      options[argument.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = true;
      continue;
    }
    const key = valueFlags.get(argument);
    const override = convenience.get(argument);
    if (!key && !override) throw new Error(`未知参数：${argument}`);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`参数缺少值：${argument}`);
    if (key) options[key] = value;
    else {
      const [featureId, field] = override;
      options.overrides[featureId] ||= {};
      options.overrides[featureId][field] = value;
    }
    index += 1;
  }
  return options;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label}不是有效 JSON：${filePath}（${error.message}）`);
  }
}

function resolveProjectPath(value, label) {
  if (!value) throw new Error(`缺少${label}`);
  return path.isAbsolute(value) ? path.normalize(value) : path.resolve(projectRoot, value);
}

function assertOutputInsideProject(target, label) {
  const resolved = path.resolve(target);
  if (resolved === projectRoot || !resolved.startsWith(`${projectRoot}${path.sep}`)) {
    throw new Error(`${label}必须位于项目目录内：${resolved}`);
  }
  return resolved;
}

function normalizedFeatureSelections(value) {
  if (!value) return [];
  const raw = typeof value === 'string' ? value.split(',').filter(Boolean).map((id) => ({ id: id.trim() })) : value;
  if (!Array.isArray(raw)) throw new Error('features 必须是数组或逗号分隔列表');
  const seen = new Set();
  return raw.map((entry) => {
    const item = typeof entry === 'string' ? { id: entry } : entry;
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9][a-z0-9-]{1,47}$/.test(item.id)) throw new Error('功能 id 不合法');
    if (seen.has(item.id)) throw new Error(`功能重复：${item.id}`);
    seen.add(item.id);
    if (item.options !== undefined && (!item.options || typeof item.options !== 'object' || Array.isArray(item.options))) throw new Error(`功能参数格式不正确：${item.id}`);
    return { id: item.id, options: { ...(item.options || {}) } };
  });
}

function loadFeature(selection, overrides) {
  const filePath = path.join(featureRoot, `${selection.id}.json`);
  if (!fs.statSync(filePath, { throwIfNoEntry: false })?.isFile()) throw new Error(`找不到功能模块：${selection.id}`);
  const definition = readJson(filePath, `功能模块 ${selection.id}`);
  if (definition.schemaVersion !== 1 || definition.id !== selection.id) throw new Error(`功能模块清单不匹配：${selection.id}`);
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(definition.id)) throw new Error(`功能模块 id 不合法：${selection.id}`);
  const action = String(definition.action || '');
  if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(action) || ['idle', 'walk', 'sleep'].includes(action)) {
    throw new Error(`功能动作 id 不合法或占用核心动作：${selection.id}`);
  }
  if (!Number.isInteger(definition.frameCount) || definition.frameCount < 2 || definition.frameCount > 12) {
    throw new Error(`功能必须声明 2 到 12 帧：${selection.id}`);
  }
  if (!definition.animation || !Array.isArray(definition.animation.durations) || definition.animation.durations.length !== definition.frameCount
    || definition.animation.durations.some((duration) => !Number.isInteger(duration) || duration < 40 || duration > 10000)) {
    throw new Error(`功能动画时长必须与帧数一致：${selection.id}`);
  }

  const options = { ...(definition.defaults || {}), ...selection.options, ...(overrides[selection.id] || {}) };
  const limits = definition.limits || {};
  for (const field of ['label', 'message', 'speech']) {
    if (typeof options[field] !== 'string') throw new Error(`${selection.id}.${field} 必须是字符串`);
    if (Number.isInteger(limits[field]) && options[field].length > limits[field]) throw new Error(`${selection.id}.${field} 超过 ${limits[field]} 个字符`);
  }
  options.duration = Number(options.duration);
  if (!Number.isInteger(options.duration) || options.duration < limits.minDuration || options.duration > limits.maxDuration) {
    throw new Error(`${selection.id}.duration 超出允许范围`);
  }
  return { definition, options };
}

function renderTemplate(value, options) {
  if (typeof value !== 'string') return value;
  const match = value.match(/^\$\{([a-zA-Z][a-zA-Z0-9]*)\}$/);
  return match ? options[match[1]] : value;
}

function contextMenuAction(feature) {
  const rendered = {};
  for (const [key, value] of Object.entries(feature.definition.contextMenuAction || {})) {
    const result = renderTemplate(value, feature.options);
    if ((key === 'speech' || key === 'message') && result === '') continue;
    rendered[key] = result;
  }
  return rendered;
}

function normalizedExtraAnimations(value) {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 27) throw new Error('extraAnimations 必须是最多 27 项的数组');
  const seen = new Set();
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('extraAnimations 配置格式不正确');
    const action = String(item.action || '');
    if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(action) || ['idle', 'walk', 'sit', 'sleep', 'reaction'].includes(action) || seen.has(action)) {
      throw new Error(`extraAnimations 动作 id 不合法、重复或占用标准动作：${action}`);
    }
    seen.add(action);
    if (!Array.isArray(item.durations) || item.durations.length < 2 || item.durations.length > 12 || item.durations.some((duration) => !Number.isInteger(duration) || duration < 40 || duration > 10000)) {
      throw new Error(`${action}.durations 必须包含 2 到 12 个合法帧时长`);
    }
    if (item.loop !== undefined && typeof item.loop !== 'boolean') throw new Error(`${action}.loop 必须是布尔值`);
    if (item.holdLastFrame !== undefined && typeof item.holdLastFrame !== 'boolean') throw new Error(`${action}.holdLastFrame 必须是布尔值`);
    if (item.scale !== undefined && (!Number.isFinite(item.scale) || item.scale < 0.5 || item.scale > 1.5)) throw new Error(`${action}.scale 必须在 0.5 到 1.5 之间`);
    if (item.imagePrompt !== undefined && (typeof item.imagePrompt !== 'string' || item.imagePrompt.length > 3000)) throw new Error(`${action}.imagePrompt 格式不正确`);
    const animation = { durations: [...item.durations], loop: item.loop === true };
    if (item.holdLastFrame !== undefined) animation.holdLastFrame = item.holdLastFrame;
    if (item.scale !== undefined) animation.scale = item.scale;
    return { action, frameCount: item.durations.length, animation, imagePrompt: item.imagePrompt || '' };
  });
}

function resolveConfiguration(cli) {
  const config = cli.config ? readJson(resolveProjectPath(cli.config, '配置文件'), '构建配置') : {};
  if (config.schemaVersion !== undefined && config.schemaVersion !== 1) throw new Error('构建配置只支持 schemaVersion 1');
  const merged = { ...config };
  for (const key of ['id', 'name', 'description', 'packageVersion', 'framesDir', 'preview', 'outputDir', 'petpackOutput', 'planOutput', 'appName', 'deliveryId', 'customerOutput']) {
    if (cli[key] !== undefined) merged[key] = cli[key];
  }
  if (cli.personality !== undefined) merged.personality = cli.personality.split(',').map((item) => item.trim()).filter(Boolean);
  if (cli.features !== undefined) merged.features = cli.features;
  merged.planOnly = Boolean(cli.planOnly);
  merged.force = Boolean(cli.force);
  merged.buildExe = Boolean(cli.buildExe);
  merged.overrides = cli.overrides || {};
  merged.packageVersion ||= '1.0.0';
  merged.description ||= '真人照片风格桌面宠物。';
  merged.personality ||= [];
  if (!merged.id || !PET_ID_PATTERN.test(String(merged.id))) throw new Error('id 必须是 2–48 位小写字母、数字或连字符');
  if (typeof merged.name !== 'string' || !merged.name.trim() || merged.name.length > 80) throw new Error('name 必须是 1–80 个字符');
  if (!Array.isArray(merged.personality) || merged.personality.length > 12 || merged.personality.some((item) => typeof item !== 'string' || !item.trim() || item.length > 32)) throw new Error('personality 必须是最多 12 个短字符串');
  merged.features = normalizedFeatureSelections(merged.features);
  merged.loadedFeatures = merged.features.map((selection) => loadFeature(selection, merged.overrides));
  merged.extraAnimations = normalizedExtraAnimations(merged.extraAnimations);
  const actionOwners = new Map();
  for (const feature of merged.loadedFeatures) {
    const prior = actionOwners.get(feature.definition.action);
    if (prior) throw new Error(`功能 ${prior} 与 ${feature.definition.id} 共用动作 ${feature.definition.action}，不能同时选择`);
    actionOwners.set(feature.definition.action, feature.definition.id);
  }
  for (const extra of merged.extraAnimations) {
    const prior = actionOwners.get(extra.action);
    if (prior) throw new Error(`功能 ${prior} 与 extraAnimations 共用动作 ${extra.action}`);
  }
  return merged;
}

function buildPlan(config, base) {
  const generated = ['idle', 'walk', ...config.loadedFeatures.map((item) => item.definition.action), ...config.extraAnimations.map((item) => item.action)];
  const frameCounts = { idle: 4, walk: 6 };
  for (const feature of config.loadedFeatures) frameCounts[feature.definition.action] = feature.definition.frameCount;
  for (const extra of config.extraAnimations) frameCounts[extra.action] = extra.frameCount;
  const compatibility = {};
  for (const [action, source] of Object.entries(base.compatibilityFallbacks)) {
    if (!generated.includes(action)) compatibility[action] = source;
  }
  const standardActions = new Set(['idle', 'walk', 'sit', 'sleep', 'reaction']);
  const customCounts = generated.filter((action) => !standardActions.has(action)).map((action) => `${action}=${frameCounts[action]}`);
  const extraCountArg = customCounts.length ? ` --frame-counts ${customCounts.join(',')}` : '';
  return {
    schemaVersion: 1,
    mode: 'human',
    pet: { id: config.id, name: config.name },
    selectedFeatures: config.loadedFeatures.map((feature) => ({
      id: feature.definition.id,
      displayName: feature.definition.displayName,
      action: feature.definition.action,
      frameCount: feature.definition.frameCount,
      options: feature.options,
      imagePrompt: feature.definition.imagePrompt
    })),
    extraAnimations: config.extraAnimations.map((extra) => ({
      action: extra.action,
      frameCount: extra.frameCount,
      animation: extra.animation,
      imagePrompt: extra.imagePrompt
    })),
    requiredGeneratedActions: generated,
    requiredFrameCounts: Object.fromEntries(generated.map((action) => [action, frameCounts[action]])),
    processingCommand: `python skills/desktop-pet-maker/scripts/process_animation_strips.py --input-dir <transparent-strips> --output-dir <frames-dir> --actions ${generated.join(',')}${extraCountArg}`,
    compatibilityClones: compatibility,
    note: '先生成并处理 requiredGeneratedActions；兼容动作由组装器复制 idle 帧，不需要额外生成。'
  };
}

function listFrames(directory, expected, action) {
  if (!fs.statSync(directory, { throwIfNoEntry: false })?.isDirectory()) throw new Error(`缺少 ${action} 帧目录：${directory}`);
  const frames = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name).toLowerCase() === '.png')
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right, 'en', { numeric: true }));
  if (frames.length !== expected) throw new Error(`${action} 需要 ${expected} 帧，实际找到 ${frames.length} 帧`);
  return frames;
}

function copyFrames(frames, targetDirectory, action) {
  fs.mkdirSync(targetDirectory, { recursive: true });
  return frames.map((source, index) => {
    const name = String(index + 1).padStart(2, '0') + '.png';
    fs.copyFileSync(source, path.join(targetDirectory, name));
    return `animations/${action}/${name}`;
  });
}

function animationManifest(paths, config) {
  return { frames: paths, ...config };
}

function runPythonTool(argumentsList) {
  const candidates = [];
  if (process.env.PYTHON) candidates.push([process.env.PYTHON, []]);
  candidates.push(['python', []], ['py', ['-3']]);
  let last;
  for (const [command, prefix] of candidates) {
    const result = spawnSync(command, [...prefix, petpackTool, ...argumentsList], { cwd: projectRoot, encoding: 'utf8', stdio: 'pipe' });
    if (!result.error && result.status === 0) {
      if (result.stdout.trim()) console.log(result.stdout.trim());
      return;
    }
    last = result;
    if (result.error?.code === 'ENOENT') continue;
    break;
  }
  const details = [last?.stdout, last?.stderr, last?.error?.message].filter(Boolean).join('\n').trim();
  throw new Error(`petpack 工具失败${details ? `：\n${details}` : ''}`);
}

function writePlan(config, plan) {
  const json = JSON.stringify(plan, null, 2) + '\n';
  if (config.planOutput) {
    const target = assertOutputInsideProject(resolveProjectPath(config.planOutput, '计划输出'), '计划输出');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, json, 'utf8');
    console.log(`生成计划：${target}`);
  }
  console.log(json.trim());
}

function listFeatures() {
  const features = fs.readdirSync(featureRoot, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => readJson(path.join(featureRoot, entry.name), `功能模块 ${entry.name}`))
    .map((item) => ({ id: item.id, name: item.displayName, description: item.description, action: item.action, frameCount: item.frameCount, defaults: item.defaults }));
  console.log(JSON.stringify(features, null, 2));
}

function assemble(config, base, plan) {
  const framesDir = resolveProjectPath(config.framesDir, 'frames-dir');
  const preview = resolveProjectPath(config.preview, 'preview');
  if (!fs.statSync(preview, { throwIfNoEntry: false })?.isFile() || path.extname(preview).toLowerCase() !== '.png') throw new Error(`preview 必须是 PNG 文件：${preview}`);
  const outputDir = assertOutputInsideProject(resolveProjectPath(config.outputDir || `pets/work/${config.id}/package`, 'output-dir'), 'output-dir');
  const petpackOutput = assertOutputInsideProject(resolveProjectPath(config.petpackOutput || `pets/packages/${config.id}.petpack`, 'petpack-output'), 'petpack-output');
  if ((fs.existsSync(outputDir) || fs.existsSync(petpackOutput)) && !config.force) throw new Error('输出已存在；确认覆盖时请添加 --force');

  const outputParent = path.dirname(outputDir);
  const stage = path.join(outputParent, `.${path.basename(outputDir)}-stage-${process.pid}-${Date.now()}`);
  const stagedPetpack = path.join(path.dirname(petpackOutput), `.${path.basename(petpackOutput)}-stage-${process.pid}-${Date.now()}`);
  assertOutputInsideProject(stage, '临时 package 目录');
  assertOutputInsideProject(stagedPetpack, '临时 petpack');
  fs.mkdirSync(stage, { recursive: true });
  fs.mkdirSync(path.dirname(stagedPetpack), { recursive: true });
  try {
    fs.copyFileSync(preview, path.join(stage, 'preview.png'));
    const sourceFrames = {};
    sourceFrames.idle = listFrames(path.join(framesDir, 'idle'), 4, 'idle');
    sourceFrames.walk = listFrames(path.join(framesDir, 'walk'), 6, 'walk');
    for (const feature of config.loadedFeatures) {
      sourceFrames[feature.definition.action] = listFrames(path.join(framesDir, feature.definition.action), feature.definition.frameCount, feature.definition.action);
    }
    for (const extra of config.extraAnimations) {
      sourceFrames[extra.action] = listFrames(path.join(framesDir, extra.action), extra.frameCount, extra.action);
    }

    const manifest = {
      schemaVersion: 1,
      packageVersion: String(config.packageVersion),
      id: config.id,
      name: config.name.trim(),
      description: String(config.description),
      personality: config.personality,
      defaultSize: 'large',
      preview: 'preview.png',
      animations: {},
      behavior: config.behavior || base.behavior,
      normalizationMetric: 'alpha-area-v1',
      contextMenuActions: [
        ...config.loadedFeatures.map(contextMenuAction),
        ...(Array.isArray(config.contextMenuActions) ? config.contextMenuActions : [])
      ]
    };

    for (const action of ['idle', 'walk', 'sit', 'sleep', 'reaction']) {
      const feature = config.loadedFeatures.find((item) => item.definition.action === action);
      const frames = sourceFrames[action] || sourceFrames[base.compatibilityFallbacks[action]];
      const animation = feature?.definition.animation || base.animations[action];
      manifest.animations[action] = animationManifest(copyFrames(frames, path.join(stage, 'animations', action), action), animation);
    }
    for (const feature of config.loadedFeatures) {
      const action = feature.definition.action;
      if (['idle', 'walk', 'sit', 'sleep', 'reaction'].includes(action)) continue;
      manifest.animations[action] = animationManifest(copyFrames(sourceFrames[action], path.join(stage, 'animations', action), action), feature.definition.animation);
    }
    for (const extra of config.extraAnimations) {
      manifest.animations[extra.action] = animationManifest(copyFrames(sourceFrames[extra.action], path.join(stage, 'animations', extra.action), extra.action), extra.animation);
    }
    fs.writeFileSync(path.join(stage, 'pet.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');

    console.log('[1/4] 验证组装目录');
    runPythonTool(['validate', stage]);
    console.log('[2/4] 构建 petpack');
    runPythonTool(['build', stage, stagedPetpack]);
    console.log('[3/4] 验证 petpack');
    runPythonTool(['validate', stagedPetpack]);

    if (config.force) {
      if (fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
      if (fs.existsSync(petpackOutput)) fs.rmSync(petpackOutput, { force: true });
    }
    fs.mkdirSync(outputParent, { recursive: true });
    fs.renameSync(stage, outputDir);
    fs.renameSync(stagedPetpack, petpackOutput);
    console.log(`[4/4] 完成\npackage：${outputDir}\npetpack：${petpackOutput}`);

    if (config.buildExe) {
      const customerArgs = [path.join(projectRoot, 'scripts', 'build-customer.js'), '--pet', petpackOutput, '--name', config.appName || `${config.name}桌面宠物`, '--delivery-id', config.deliveryId || config.id];
      if (config.customerOutput) customerArgs.push('--output', resolveProjectPath(config.customerOutput, 'customer-output'));
      const result = spawnSync(process.execPath, customerArgs, { cwd: projectRoot, encoding: 'utf8', stdio: 'inherit' });
      if (result.error || result.status !== 0) throw new Error(`客户 EXE 构建失败${result.error ? `：${result.error.message}` : ''}`);
    }
    return { outputDir, petpackOutput, plan };
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
    if (fs.existsSync(stagedPetpack)) fs.rmSync(stagedPetpack, { force: true });
  }
}

function main() {
  const cli = parseArgs(process.argv.slice(2));
  if (cli.help) {
    usage();
    return;
  }
  if (cli.listFeatures) {
    listFeatures();
    return;
  }
  const base = readJson(basePath, '真人基础模板');
  if (base.schemaVersion !== 1 || base.mode !== 'human') throw new Error('真人基础模板格式不受支持');
  const config = resolveConfiguration(cli);
  const plan = buildPlan(config, base);
  if (config.planOnly) {
    writePlan(config, plan);
    return;
  }
  assemble(config, base, plan);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`真人桌宠框架构建失败：${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { buildPlan, contextMenuAction, loadFeature, normalizedExtraAnimations, normalizedFeatureSelections, resolveConfiguration };

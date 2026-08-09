'use strict';

const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

const REQUIRED_ACTIONS = Object.freeze({ idle: 4, walk: 6, sit: 4, sleep: 4, reaction: 4 });
const ACTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,31}$/;
const PET_ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;
const MAX_ARCHIVE_ENTRIES = 300;
const MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;
const MAX_ASSET_BYTES = 50 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_IMAGE_DIMENSION = 4096;
const MAX_IMAGE_PIXELS = 16 * 1024 * 1024;

function safeRelative(value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || value.includes('\0')) {
    throw new Error(`不安全的资源路径：${value}`);
  }
  const parts = value.split('/');
  if (value.startsWith('/') || parts.some((part) => !part || part === '.' || part === '..')) {
    throw new Error(`不安全的资源路径：${value}`);
  }
  for (const part of parts) {
    if (/[:<>"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part)) {
      throw new Error(`不安全的 Windows 资源路径：${value}`);
    }
  }
  return parts;
}

function resolveInside(root, relative) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, ...safeRelative(relative));
  if (resolved !== resolvedRoot && !resolved.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error('资源路径越界');
  }
  return resolved;
}

function referencedFiles(manifest) {
  const referenced = new Set(['pet.json', manifest.preview]);
  for (const animation of Object.values(manifest.animations || {})) {
    for (const frame of animation.frames || []) referenced.add(frame);
  }
  return referenced;
}

function validateMenuStep(item, manifest, label) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`${label}格式不正确`);
  if (typeof item.action !== 'string' || !manifest.animations[item.action]) throw new Error(`${label}引用了不存在的动画：${item.action}`);
  if (item.message !== undefined && (typeof item.message !== 'string' || item.message.length > 80)) throw new Error(`${label} message 不能超过 80 个字符`);
  if (item.messages !== undefined) {
    if (!Array.isArray(item.messages) || !item.messages.length || item.messages.length > 12) throw new Error(`${label} messages 必须是 1 到 12 项的数组`);
    if (item.messages.some((message) => typeof message !== 'string' || !message.trim() || message.length > 80)) throw new Error(`${label} messages 必须是 1 到 80 个字符的非空字符串`);
    if (new Set(item.messages).size !== item.messages.length) throw new Error(`${label} messages 不能重复`);
  }
  if (item.message !== undefined && item.messages !== undefined) throw new Error(`${label} 不能同时配置 message 和 messages`);
  if (item.speech !== undefined && (typeof item.speech !== 'string' || item.speech.length > 20)) throw new Error(`${label} speech 不能超过 20 个字符`);
  if (item.duration !== undefined && (!Number.isInteger(item.duration) || item.duration < 600 || item.duration > 3600000)) {
    throw new Error(`${label} duration 必须为 600 到 3600000 毫秒`);
  }
}

function validateOptionalDialogue(item, label) {
  if (item.message !== undefined && (typeof item.message !== 'string' || item.message.length > 80)) {
    throw new Error(`${label} message 不能超过 80 个字符`);
  }
  if (item.messages !== undefined) {
    if (!Array.isArray(item.messages) || !item.messages.length || item.messages.length > 12) {
      throw new Error(`${label} messages 必须是 1 到 12 项的数组`);
    }
    if (item.messages.some((message) => typeof message !== 'string' || !message.trim() || message.length > 80)) {
      throw new Error(`${label} messages 必须是 1 到 80 个字符的非空字符串`);
    }
    if (new Set(item.messages).size !== item.messages.length) throw new Error(`${label} messages 不能重复`);
  }
  if (item.message !== undefined && item.messages !== undefined) throw new Error(`${label} 不能同时配置 message 和 messages`);
  if (item.speech !== undefined && (typeof item.speech !== 'string' || item.speech.length > 20)) {
    throw new Error(`${label} speech 不能超过 20 个字符`);
  }
}

function validateManifest(manifest, root = '', requireFiles = false) {
  if (!manifest || manifest.schemaVersion !== 1) throw new Error('只支持 schemaVersion 1');
  if (!PET_ID_PATTERN.test(String(manifest.id || ''))) throw new Error('宠物 id 不合法');
  if (typeof manifest.name !== 'string' || !manifest.name.trim() || manifest.name.length > 80) {
    throw new Error('宠物名称长度必须为 1 到 80 个字符');
  }
  if (manifest.description !== undefined && (typeof manifest.description !== 'string' || manifest.description.length > 500)) {
    throw new Error('description 不能超过 500 个字符');
  }
  if (manifest.personality !== undefined) {
    if (!Array.isArray(manifest.personality) || manifest.personality.length > 12 || manifest.personality.some((item) => typeof item !== 'string' || !item.trim() || item.length > 32)) {
      throw new Error('personality 必须是最多 12 个非空短字符串');
    }
  }
  safeRelative(manifest.preview);
  if (path.posix.extname(manifest.preview).toLowerCase() !== '.png') throw new Error('preview 必须是 PNG');
  if (!manifest.animations || typeof manifest.animations !== 'object' || Array.isArray(manifest.animations)) {
    throw new Error('animations 缺失');
  }

  const animations = Object.entries(manifest.animations);
  if (animations.length > 32) throw new Error('animations 不能超过 32 项');
  for (const [action, expected] of Object.entries(REQUIRED_ACTIONS)) {
    if (!manifest.animations[action]) throw new Error(`${action} 必须包含 ${expected} 帧`);
  }
  for (const [action, animation] of animations) {
    if (!ACTION_ID_PATTERN.test(action)) throw new Error(`动画 id 不合法：${action}`);
    if (!animation || typeof animation !== 'object' || Array.isArray(animation) || !Array.isArray(animation.frames)) {
      throw new Error(`${action} 动画配置格式不正确`);
    }
    const expected = REQUIRED_ACTIONS[action];
    if (expected && animation.frames.length !== expected) {
      throw new Error(`${action} 必须包含 ${expected} 帧`);
    }
    if (!expected && (animation.frames.length < 2 || animation.frames.length > 12)) {
      throw new Error(`${action} 可选动画必须包含 2 到 12 帧`);
    }
    if (!Array.isArray(animation.durations) || animation.durations.length !== animation.frames.length) {
      throw new Error(`${action} 的 durations 数量不匹配`);
    }
    if (animation.durations.some((value) => !Number.isInteger(value) || value < 40 || value > 10000)) {
      throw new Error(`${action} 存在非法帧时长`);
    }
    if (animation.scale !== undefined && (!Number.isFinite(animation.scale) || animation.scale < 0.5 || animation.scale > 1.5)) {
      throw new Error(`${action} 的 scale 必须在 0.5 到 1.5 之间`);
    }
    const uniqueFrames = new Set();
    for (const frame of animation.frames) {
      safeRelative(frame);
      if (path.posix.extname(frame).toLowerCase() !== '.png') throw new Error(`${action} 的帧必须是 PNG`);
      const canonical = frame.toLowerCase();
      if (uniqueFrames.has(canonical)) throw new Error(`${action} 包含重复帧路径`);
      uniqueFrames.add(canonical);
    }
  }

  if (manifest.contextMenuActions !== undefined) {
    if (!Array.isArray(manifest.contextMenuActions) || manifest.contextMenuActions.length > 16) {
      throw new Error('contextMenuActions 必须是最多 16 项的数组');
    }
    const actionIds = new Set();
    for (const item of manifest.contextMenuActions) {
      if (!item || typeof item !== 'object') throw new Error('右键动作配置格式不正确');
      if (!/^[a-z0-9][a-z0-9-]{1,31}$/.test(String(item.id || '')) || actionIds.has(item.id)) {
        throw new Error('右键动作 id 不合法或重复');
      }
      actionIds.add(item.id);
      if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 24) throw new Error('右键动作 label 必须为 1 到 24 个字符');
      if (item.sequence !== undefined) {
        if (item.action !== undefined || item.message !== undefined || item.messages !== undefined || item.speech !== undefined || item.duration !== undefined) {
          throw new Error('序列右键动作不能同时配置单步字段');
        }
        if (!Array.isArray(item.sequence) || !item.sequence.length || item.sequence.length > 8) throw new Error('右键动作 sequence 必须是 1 到 8 步');
        let totalDuration = 0;
        for (const [index, step] of item.sequence.entries()) {
          validateMenuStep(step, manifest, `右键动作 sequence[${index}]`);
          totalDuration += Number.isInteger(step.duration) ? step.duration : 3000;
        }
        if (totalDuration > 60000) throw new Error('右键动作 sequence 总时长不能超过 60000 毫秒');
      } else {
        validateMenuStep(item, manifest, '右键动作');
      }
    }
  }

  if (manifest.behavior?.random !== undefined) {
    if (!Array.isArray(manifest.behavior.random) || !manifest.behavior.random.length || manifest.behavior.random.length > 20) {
      throw new Error('behavior.random 必须是 1 到 20 项的数组');
    }
    for (const [index, item] of manifest.behavior.random.entries()) {
      if (!item || typeof item !== 'object' || !manifest.animations[item.state]) throw new Error('behavior.random 引用了不存在的动画');
      if (!Number.isFinite(item.weight) || item.weight <= 0 || item.weight > 10000) throw new Error('behavior.random weight 不合法');
      if (!Number.isFinite(item.minDuration) || !Number.isFinite(item.maxDuration) || item.minDuration < 600 || item.maxDuration > 60000 || item.maxDuration < item.minDuration) {
        throw new Error('behavior.random duration 不合法');
      }
      validateOptionalDialogue(item, `behavior.random[${index}]`);
    }
  }

  if (requireFiles) {
    for (const relative of referencedFiles(manifest)) {
      if (relative === 'pet.json') continue;
      if (!fs.statSync(resolveInside(root, relative), { throwIfNoEntry: false })?.isFile()) throw new Error(`资源缺失：${relative}`);
    }
  }
  return manifest;
}

function validatePngEntry(entry, relative) {
  const size = Number(entry.header?.size || 0);
  if (size <= 0 || size > MAX_ASSET_BYTES) throw new Error(`PNG 文件大小不合法：${relative}`);
  const data = entry.getData();
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length < 33 || !data.subarray(0, 8).equals(signature) || data.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`不是有效 PNG：${relative}`);
  }
  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  const colorType = data[25];
  if (!width || !height || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error(`PNG 尺寸超限：${relative}`);
  }
  if (![4, 6].includes(colorType)) throw new Error(`PNG 必须包含 alpha 通道：${relative}`);
}

function validatePetpack(filePath) {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  if (!entries.length || entries.length > MAX_ARCHIVE_ENTRIES) throw new Error('资源包文件数量不合法');
  const canonicalNames = new Set();
  const files = new Map();
  let total = 0;
  for (const entry of entries) {
    const raw = String(entry.entryName || '');
    const name = raw.endsWith('/') ? raw.slice(0, -1) : raw;
    safeRelative(name);
    const canonical = name.toLowerCase();
    if (canonicalNames.has(canonical)) throw new Error(`资源包包含重复或大小写冲突路径：${name}`);
    canonicalNames.add(canonical);
    const size = Number(entry.header?.size || 0);
    if (!Number.isSafeInteger(size) || size < 0) throw new Error(`资源大小不合法：${name}`);
    total += size;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error('资源包解压后不能超过 200MB');
    if (!entry.isDirectory) files.set(name, entry);
  }

  const manifestEntry = files.get('pet.json');
  if (!manifestEntry) throw new Error('资源包缺少 pet.json');
  if (Number(manifestEntry.header?.size || 0) > MAX_MANIFEST_BYTES) throw new Error('pet.json 不能超过 1MB');
  let manifest;
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf8'));
  } catch {
    throw new Error('pet.json 不是有效 JSON');
  }
  validateManifest(manifest);
  const allowed = referencedFiles(manifest);
  for (const name of files.keys()) {
    if (!allowed.has(name)) throw new Error(`资源包包含未引用文件：${name}`);
  }
  for (const relative of allowed) {
    const entry = files.get(relative);
    if (!entry) throw new Error(`资源包缺少文件：${relative}`);
    if (relative.endsWith('.png')) validatePngEntry(entry, relative);
  }
  return { zip, manifest, previewEntry: files.get(manifest.preview) };
}

module.exports = {
  MAX_ARCHIVE_ENTRIES,
  MAX_UNCOMPRESSED_BYTES,
  PET_ID_PATTERN,
  REQUIRED_ACTIONS,
  referencedFiles,
  resolveInside,
  safeRelative,
  validateManifest,
  validatePetpack
};

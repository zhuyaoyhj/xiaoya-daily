// utils/store/backup.js —— 备份、快照、合并导入、备份提醒
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');
const mergeUtil = require('../merge.js');

/* ---------------- 备份：导出 / 导入 ---------------- */

const BACKUP_MAGIC = 'XYD1';
// 天气缓存、进行中的计时、云同步状态是本机临时数据，不进备份
const BACKUP_KEYS = Object.keys(ctx.KEYS).filter(function (k) {
  return k !== 'weatherCache' && k !== 'careActive' && k !== 'sync';
});

/** 本机全部业务数据的快照（备份、云同步共用同一结构） */
function snapshot() {
  const data = {};
  BACKUP_KEYS.forEach(function (k) {
    if (k === 'careIndex') return;
    const v = ctx.read(ctx.KEYS[k], undefined);
    if (v !== undefined) data[k] = v;
  });
  const shards = {};
  ctx.getCareIndex().forEach(function (m) {
    const list = ctx.read(ctx.CARE_PREFIX + m, []);
    if (Array.isArray(list) && list.length) shards[m] = list;
  });
  data.careShards = shards;
  return data;
}

/**
 * 把一份快照整体写进本机（替换）。不记墓碑、不算「新改动」——这是搬运，不是用户操作
 */
function applySnapshot(data) {
  ctx.write._silent = true;
  try {
    if (data.careShards && typeof data.careShards === 'object') {
      ctx.getCareIndex().forEach(function (m) {
        ctx.write(ctx.CARE_PREFIX + m, '');
      });
      const months = [];
      Object.keys(data.careShards).forEach(function (m) {
        if (!/^\d{6}$/.test(m) || !Array.isArray(data.careShards[m]) || !data.careShards[m].length) return;
        ctx.write(ctx.CARE_PREFIX + m, data.careShards[m]);
        months.push(m);
      });
      ctx.write(ctx.KEYS.careIndex, months.sort());
    }
    BACKUP_KEYS.forEach(function (k) {
      if (k === 'careIndex') return;
      if (!Object.prototype.hasOwnProperty.call(data, k)) return;
      if (k === 'settings') {
        // 设置里本机自己的东西（记录人、引导、备份时间、地点）不被别人的覆盖
        const mine = ctx.getSettings();
        const keep = {
          me: mine.me,
          onboarded: mine.onboarded,
          lastBackupAt: mine.lastBackupAt,
          backupNudgeAt: mine.backupNudgeAt,
          lastChangeAt: mine.lastChangeAt,
          changeSeq: mine.changeSeq,
          backupSeq: mine.backupSeq,
          activeBabyId: mine.activeBabyId,
          manualTemp: mine.manualTemp
        };
        ctx.write(ctx.KEYS.settings, Object.assign({}, data.settings || {}, keep));
        return;
      }
      ctx.write(ctx.KEYS[k], data[k]);
    });
    ctx.write(ctx.KEYS.weatherCache, '');
  } finally {
    ctx.write._silent = false;
  }
  // 当前宝宝不在了就换成第一个
  const babies = ctx.getBabies();
  const s = ctx.getSettings();
  if (babies.length && !babies.some(function (b) {
    return b.id === s.activeBabyId;
  })) {
    ctx.updateSettings({ activeBabyId: babies[0].id });
  }
}

/** 把全部业务数据打成一段可复制的文本 */
function exportBackup() {
  const payload = { v: 1, at: Date.now(), data: snapshot() };
  return BACKUP_MAGIC + ':' + JSON.stringify(payload);
}

/** 导出成功后调用：记下备份时间，首页提醒随之消失 */
function markBackedUp() {
  const s = ctx.getSettings();
  return ctx.updateSettings({ lastBackupAt: Date.now(), backupSeq: Number(s.changeSeq) || 0 });
}

const BACKUP_REMIND_DAYS = 14;
const DAY_MS = 86400000;

/**
 * 首页要不要提醒备份：有数据、而且（从没备份过，或备份后又记了新东西且超过 14 天），
 * 同一条提醒点掉后一周内不再出现
 */
function backupReminder(now) {
  const t = now || Date.now();
  const s = ctx.getSettings();
  // 首页每次显示都会调：只看设置里的计数，不去读全部记录（一年后照护分片近 1MB）
  if (s.backupNudgeAt && t - s.backupNudgeAt < 7 * DAY_MS) return null;
  if (!s.lastBackupAt) {
    // 新用户先记几天再提，别一上来就吓人；firstRecordAt 只读最早一个月的分片
    const first = firstRecordAt();
    if (!first || t - first < 3 * DAY_MS) return null;
    return { never: true, days: 0, text: '记录只存在这台手机上，建议备份一份' };
  }
  const days = Math.floor((t - s.lastBackupAt) / DAY_MS);
  if (days < BACKUP_REMIND_DAYS || !ctx.changedSinceBackup(s)) return null;
  return { never: false, days: days, text: '上次备份是 ' + days + ' 天前，之后又记了新内容' };
}

function dismissBackupReminder() {
  return ctx.updateSettings({ backupNudgeAt: Date.now() });
}

/** 最早一条记录的录入时间（判断「是不是刚开始用」） */
function firstRecordAt() {
  let min = 0;
  const see = function (r) {
    const c = r && r.createdAt;
    if (c && (!min || c < min)) min = c;
  };
  ctx.getAllVaccineRecords().forEach(see);
  ctx.getAllFoodRecords().forEach(see);
  ctx.getAllMealLogs().forEach(see);
  const idx = ctx.getCareIndex();
  if (idx.length) ctx.getCareShard(idx[0]).forEach(see);
  return min;
}

/** 统计备份/本机数据量，给用户一个直观的数字 */
function backupStats(data) {
  const d = data || {};
  const len = function (k) {
    return Array.isArray(d[k]) ? d[k].length : 0;
  };
  let care = 0;
  const shards = d.careShards && typeof d.careShards === 'object' ? d.careShards : {};
  Object.keys(shards).forEach(function (m) {
    if (Array.isArray(shards[m])) care += shards[m].length;
  });
  return {
    babies: len('babies'),
    vaccine: len('vaccineRecords'),
    food: len('foodRecords'),
    meals: len('mealLogs'),
    growth: len('growth'),
    care: care
  };
}

function localStats() {
  return backupStats(snapshot());
}

/** 解析备份文本；失败抛错，不写入任何数据 */
function parseBackup(text) {
  const raw = String(text || '').trim();
  if (raw.indexOf(BACKUP_MAGIC + ':') !== 0) throw new Error('BAD_FORMAT');
  let payload;
  try {
    payload = JSON.parse(raw.slice(BACKUP_MAGIC.length + 1));
  } catch (e) {
    throw new Error('BAD_JSON');
  }
  if (!payload || typeof payload.data !== 'object' || !payload.data) throw new Error('BAD_FORMAT');
  return { at: payload.at || 0, data: payload.data, stats: backupStats(payload.data) };
}

/**
 * 导入备份
 * @param {String} text
 * @param {'merge'|'replace'} mode 默认合并：两台手机各记各的，合起来谁的都不丢；
 *                                 replace 用在「换新手机、本机是空的或不要了」
 * @return parsed + { mode, result: { added, updated, removed } }
 */
function importBackup(text, mode) {
  const parsed = parseBackup(text);
  const m = mode === 'replace' ? 'replace' : 'merge';
  let result = { added: 0, updated: 0, removed: 0 };
  if (m === 'replace') {
    applySnapshot(parsed.data);
  } else {
    const merged = mergeUtil.mergeSnapshots(snapshot(), parsed.data, ctx.monthKeyOf);
    applySnapshot(merged.data);
    result = merged.stats;
  }
  ctx.markChanged();
  return Object.assign({}, parsed, { mode: m, result: result });
}

Object.assign(ctx, {
  BACKUP_MAGIC: BACKUP_MAGIC,
  BACKUP_KEYS: BACKUP_KEYS,
  snapshot: snapshot,
  applySnapshot: applySnapshot,
  exportBackup: exportBackup,
  markBackedUp: markBackedUp,
  BACKUP_REMIND_DAYS: BACKUP_REMIND_DAYS,
  DAY_MS: DAY_MS,
  backupReminder: backupReminder,
  dismissBackupReminder: dismissBackupReminder,
  firstRecordAt: firstRecordAt,
  backupStats: backupStats,
  localStats: localStats,
  parseBackup: parseBackup,
  importBackup: importBackup
});

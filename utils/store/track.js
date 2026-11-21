// utils/store/track.js —— 变更追踪：删除墓碑、改动计数、「我是谁」、给记录打时间戳
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');

/* ---------------- 变更追踪：墓碑 / 改动时间 / 谁记的 ---------------- */

function getTombstones() {
  const t = ctx.read(ctx.KEYS.tombstones, {});
  return t && typeof t === 'object' && !Array.isArray(t) ? t : {};
}

function addTombstones(ids) {
  const t = getTombstones();
  const now = Date.now();
  ids.forEach(function (id) {
    t[id] = now;
  });
  wx.setStorageSync(ctx.KEYS.tombstones, t);
}

/** 记录又出现了（跨月搬分片、撤销删除）：把墓碑撤掉 */
function clearTombstone(id) {
  const t = getTombstones();
  if (t[id]) {
    delete t[id];
    wx.setStorageSync(ctx.KEYS.tombstones, t);
  }
}

function markChanged() {
  const raw = ctx.read(ctx.KEYS.settings, null);
  const s = raw && typeof raw === 'object' ? raw : {};
  s.lastChangeAt = Date.now();
  s.changeSeq = (Number(s.changeSeq) || 0) + 1;
  wx.setStorageSync(ctx.KEYS.settings, s);
}

/** 备份之后有没有新改动 */
function changedSinceBackup(s) {
  return (Number(s.changeSeq) || 0) > (Number(s.backupSeq) || 0);
}

/** 当前手机的记录人：{ id, label }，没设置时 null */
function getMe() {
  const s = ctx.getSettings();
  if (!s.me) return null;
  const m = (s.family || []).filter(function (f) {
    return f.id === s.me;
  })[0];
  return m ? { id: m.id, label: m.relation && m.relation !== '其他' ? m.relation : m.name } : null;
}

function setMe(id) {
  return ctx.updateSettings({ me: id || '' });
}

/**
 * 给即将落库的记录打时间戳：新记录补 id / createdAt / by，所有记录刷新 updatedAt
 * by 只在新建时写入（改别人记的那条，不该把「谁记的」改成自己）
 */
function stamp(rec, newId) {
  const now = Date.now();
  if (!rec.id) {
    rec.id = newId();
    rec.createdAt = now;
    const me = getMe();
    if (me && !rec.by) rec.by = me.label;
  }
  rec.updatedAt = Math.max(now, (rec.updatedAt || 0) + 1);
  return rec;
}

Object.assign(ctx, {
  getTombstones: getTombstones,
  addTombstones: addTombstones,
  clearTombstone: clearTombstone,
  markChanged: markChanged,
  changedSinceBackup: changedSinceBackup,
  getMe: getMe,
  setMe: setMe,
  stamp: stamp
});

// utils/store/growth.js —— 生长测量：身高体重的每一次记录
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');

/* ---------------- 生长测量：身高体重的每一次记录 ---------------- */

function getAllGrowth() {
  const list = ctx.read(ctx.KEYS.growth, []);
  return Array.isArray(list) ? list : [];
}

/** 某宝宝的测量，按日期正序（画曲线用） */
function getGrowth(babyId) {
  return getAllGrowth()
    .filter(function (g) {
      return g.babyId === babyId;
    })
    .sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : (a.createdAt || 0) - (b.createdAt || 0);
    });
}

function newGrowthId() {
  return ctx.uid('g');
}

/**
 * 新增或更新一次测量。体重 kg、身高 cm，至少填一个
 * 同时把档案上的「当前体重 / 身高」同步为最新一次（档案页、首页的显示不用改）
 */
function upsertGrowth(input) {
  const rec = Object.assign({}, input);
  const w = rec.weight === '' || rec.weight === undefined || rec.weight === null ? null : Number(rec.weight);
  const h = rec.height === '' || rec.height === undefined || rec.height === null ? null : Number(rec.height);
  if (w === null && h === null) throw new Error('EMPTY');
  if (w !== null && !(w >= 1 && w <= 40)) throw new Error('BAD_WEIGHT');
  if (h !== null && !(h >= 30 && h <= 130)) throw new Error('BAD_HEIGHT');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(rec.date || ''))) throw new Error('BAD_DATE');
  rec.weight = w;
  rec.height = h;
  rec.note = String(rec.note || '').trim().slice(0, 40);
  ctx.stamp(rec, newGrowthId);

  const list = getAllGrowth();
  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === rec.id) {
      list[i] = Object.assign({}, list[i], rec);
      found = true;
      break;
    }
  }
  if (!found) list.push(rec);
  ctx.write(ctx.KEYS.growth, list);
  syncBabyMeasure(rec.babyId);
  return rec;
}

function removeGrowth(id) {
  const list = getAllGrowth();
  const hit = list.filter(function (g) {
    return g.id === id;
  })[0];
  ctx.write(
    ctx.KEYS.growth,
    list.filter(function (g) {
      return g.id !== id;
    })
  );
  if (hit) syncBabyMeasure(hit.babyId);
  return !!hit;
}

/** 档案上的体重 / 身高 = 最近一次有值的测量 */
function syncBabyMeasure(babyId) {
  const baby = ctx.getBaby(babyId);
  if (!baby) return;
  const list = getGrowth(babyId);
  let w = '';
  let h = '';
  for (let i = list.length - 1; i >= 0; i--) {
    if (w === '' && list[i].weight !== null && list[i].weight !== undefined) w = String(list[i].weight);
    if (h === '' && list[i].height !== null && list[i].height !== undefined) h = String(list[i].height);
  }
  if (!list.length) return;
  if (String(baby.weight || '') === w && String(baby.height || '') === h) return;
  ctx.upsertBaby(Object.assign({}, baby, { weight: w || baby.weight || '', height: h || baby.height || '' }));
}

/**
 * 老用户迁移：档案里填过体重身高、但还没有任何测量记录时，补一条（日期记为档案最后修改那天）
 */
function migrateGrowth(babyId) {
  const baby = ctx.getBaby(babyId);
  if (!baby || getGrowth(babyId).length) return null;
  if (!baby.weight && !baby.height) return null;
  const d = new Date(baby.updatedAt || Date.now());
  const p = function (n) {
    return n < 10 ? '0' + n : '' + n;
  };
  try {
    return upsertGrowth({
      babyId: babyId,
      date: d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()),
      weight: baby.weight || '',
      height: baby.height || '',
      note: '从档案带过来'
    });
  } catch (e) {
    return null;
  }
}

Object.assign(ctx, {
  getAllGrowth: getAllGrowth,
  getGrowth: getGrowth,
  newGrowthId: newGrowthId,
  upsertGrowth: upsertGrowth,
  removeGrowth: removeGrowth,
  syncBabyMeasure: syncBabyMeasure,
  migrateGrowth: migrateGrowth
});

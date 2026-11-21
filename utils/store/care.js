// utils/store/care.js —— 照护记录：喂奶 / 睡眠 / 尿布（按月分片）
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');

/* ---------------- 照护记录：喂奶 / 睡眠 / 尿布 ---------------- */
// 一天 15-20 条，3 年约 2 万条。单个 key 上限 1MB，所以按「开始时间所在月份」分片：
//   xyd_care_202611 = [entry, ...]   xyd_care_index = ['202610', '202611']
// entry: { id, babyId, type: 'feed'|'sleep'|'diaper', start, end, ...类型字段, note, createdAt }

const CARE_TYPES = ['feed', 'sleep', 'diaper'];

function monthKeyOf(ts) {
  const d = new Date(ts);
  const m = d.getMonth() + 1;
  return d.getFullYear() + (m < 10 ? '0' + m : '' + m);
}

function getCareIndex() {
  const list = ctx.read(ctx.KEYS.careIndex, []);
  return Array.isArray(list) ? list : [];
}

function getCareShard(month) {
  const list = ctx.read(ctx.CARE_PREFIX + month, []);
  return Array.isArray(list) ? list : [];
}

function saveCareShard(month, list) {
  const idx = getCareIndex();
  if (list.length) {
    ctx.write(ctx.CARE_PREFIX + month, list);
    if (idx.indexOf(month) === -1) {
      idx.push(month);
      ctx.write(ctx.KEYS.careIndex, idx.sort());
    }
  } else {
    ctx.write(ctx.CARE_PREFIX + month, '');
    if (idx.indexOf(month) > -1) {
      ctx.write(
        ctx.KEYS.careIndex,
        idx.filter(function (m) {
          return m !== month;
        })
      );
    }
  }
}

function newCareId() {
  return ctx.uid('c');
}

function findCareShardOf(id) {
  const idx = getCareIndex();
  // 从最近的月份往前找，编辑的绝大多数是最近的记录
  for (let i = idx.length - 1; i >= 0; i--) {
    const list = getCareShard(idx[i]);
    for (let j = 0; j < list.length; j++) {
      if (list[j].id === id) return { month: idx[i], list: list, index: j };
    }
  }
  return null;
}

function getCareEntry(id) {
  const hit = id ? findCareShardOf(id) : null;
  return hit ? hit.list[hit.index] : null;
}

/** 新增或更新；开始时间改到别的月份时会自动搬分片 */
function upsertCare(entry) {
  const e = Object.assign({}, entry);
  if (CARE_TYPES.indexOf(e.type) === -1) throw new Error('BAD_TYPE');
  e.start = Number(e.start);
  if (!isFinite(e.start)) throw new Error('BAD_START');
  if (e.end !== null && e.end !== undefined) e.end = Number(e.end);
  e.note = String(e.note || '').trim().slice(0, 60);

  if (e.id) {
    const old = findCareShardOf(e.id);
    if (old) {
      e.updatedAt = Math.max(Date.now(), (old.list[old.index].updatedAt || 0) + 1);
      const merged = Object.assign({}, old.list[old.index], e);
      const target = monthKeyOf(merged.start);
      if (target === old.month) {
        old.list[old.index] = merged;
        saveCareShard(old.month, old.list);
      } else {
        old.list.splice(old.index, 1);
        saveCareShard(old.month, old.list);
        const tl = getCareShard(target);
        tl.push(merged);
        saveCareShard(target, tl);
        ctx.clearTombstone(merged.id); // 只是换了月份，不是删除
      }
      return merged;
    }
  } else {
    ctx.stamp(e, newCareId);
  }
  const month = monthKeyOf(e.start);
  const list = getCareShard(month);
  list.push(e);
  saveCareShard(month, list);
  return e;
}

function removeCare(id) {
  const hit = findCareShardOf(id);
  if (!hit) return false;
  ctx.addTombstones([id]); // 显式记：不依赖「读出来是拷贝」这个前提
  hit.list.splice(hit.index, 1);
  saveCareShard(hit.month, hit.list);
  return true;
}

/**
 * 取 [fromTs, toTs) 内有交集的记录（睡眠可能跨夜，所以多读前一个月的分片）
 * 按开始时间倒序
 */
function getCareRange(babyId, fromTs, toTs) {
  const months = {};
  months[monthKeyOf(fromTs - 24 * 3600 * 1000)] = true;
  for (let t = fromTs; t < toTs; t += 24 * 3600 * 1000) months[monthKeyOf(t)] = true;
  months[monthKeyOf(toTs - 1)] = true;

  const out = [];
  Object.keys(months).forEach(function (m) {
    getCareShard(m).forEach(function (e) {
      if (babyId && e.babyId !== babyId) return;
      const end = e.end || e.start;
      if (e.start < toTs && end >= fromTs) out.push(e);
    });
  });
  return out.sort(function (a, b) {
    return b.start - a.start;
  });
}

/** 某一类最近的一条（往回最多翻 3 个月分片就够判断「距上次」） */
function getLatestCare(babyId, type, beforeTs) {
  const idx = getCareIndex();
  const limit = beforeTs || Infinity;
  let seen = 0;
  for (let i = idx.length - 1; i >= 0 && seen < 3; i--, seen++) {
    let best = null;
    getCareShard(idx[i]).forEach(function (e) {
      if (e.babyId !== babyId || e.type !== type || e.start >= limit) return;
      // 同一毫秒的记录（连点）取后写入的那条：分片按写入顺序追加，所以用 >=
      if (!best || e.start >= best.start) best = e;
    });
    if (best) return best;
  }
  return null;
}

/* 进行中的计时：{ [babyId]: { feed: {...}, sleep: {...} } }，只存开始时间，页面现算时长 */

function getAllCareActive() {
  const v = ctx.read(ctx.KEYS.careActive, {});
  return v && typeof v === 'object' ? v : {};
}

function getCareActive(babyId) {
  const all = getAllCareActive();
  return all[babyId] || {};
}

function setCareActive(babyId, type, value) {
  const all = getAllCareActive();
  const mine = Object.assign({}, all[babyId] || {});
  if (value) mine[type] = value;
  else delete mine[type];
  if (Object.keys(mine).length) all[babyId] = mine;
  else delete all[babyId];
  ctx.write(ctx.KEYS.careActive, all);
  return mine;
}

function removeCareOfBaby(babyId) {
  getCareIndex().forEach(function (m) {
    const list = getCareShard(m);
    const rest = list.filter(function (e) {
      return e.babyId !== babyId;
    });
    if (rest.length !== list.length) saveCareShard(m, rest);
  });
  const all = getAllCareActive();
  if (all[babyId]) {
    delete all[babyId];
    ctx.write(ctx.KEYS.careActive, all);
  }
}

Object.assign(ctx, {
  CARE_TYPES: CARE_TYPES,
  monthKeyOf: monthKeyOf,
  getCareIndex: getCareIndex,
  getCareShard: getCareShard,
  saveCareShard: saveCareShard,
  newCareId: newCareId,
  findCareShardOf: findCareShardOf,
  getCareEntry: getCareEntry,
  upsertCare: upsertCare,
  removeCare: removeCare,
  getCareRange: getCareRange,
  getLatestCare: getLatestCare,
  getAllCareActive: getAllCareActive,
  getCareActive: getCareActive,
  setCareActive: setCareActive,
  removeCareOfBaby: removeCareOfBaby
});

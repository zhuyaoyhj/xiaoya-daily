// utils/store/meal.js —— 进食流水账
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');

/* ---------------- 进食流水账 ---------------- */
// 记录结构：
// { id, babyId, date, slot, recipeId, recipeName, foods[], amount, amountText,
//   accept, poop, note, createdAt }
//
// 与 foodRecords 的分工必须分清：
//   foodRecords  = 「某种食材第一次吃 + 有没有反应」，一个食材一条，用于排敏
//   流水账        = 「这一餐吃了什么、吃了多少」，一餐一条，用于回顾
// 两者互不派生：流水账不反哺 statusOf，也不会自动生成排敏记录（那等于伪造数据）。
//
// 隔离方式与 foodRecords 一致：单数组 + babyId 过滤，删宝宝时级联清掉。

const MEAL_SLOTS = ['am', 'noon', 'pm', 'eve', 'other'];

/** 单宝宝最多留多少条：约 3 年的一日三餐，够用且离 1MB 单 key 上限还远 */
const LOG_LIMIT_PER_BABY = 2000;

const AMOUNT_KEYS = ['little', 'half', 'most', 'all'];
const ACCEPT_KEYS = ['love', 'ok', 'refuse'];
const POOP_KEYS = ['normal', 'loose', 'hard', 'none'];

function getAllMealLogs() {
  const list = ctx.read(ctx.KEYS.mealLogs, []);
  return Array.isArray(list) ? list : [];
}

/** 取某个宝宝的流水账（不传 babyId 则返回全部） */
function getMealLogs(babyId) {
  const list = getAllMealLogs();
  if (!babyId) return list;
  return list.filter(function (l) {
    return l.babyId === babyId;
  });
}

/** 取某宝宝某一天的流水账，按录入先后排 */
function getMealLogsByDate(babyId, date) {
  return getMealLogs(babyId)
    .filter(function (l) {
      return l.date === date;
    })
    .sort(function (a, b) {
      return (a.createdAt || 0) - (b.createdAt || 0);
    });
}

function getMealLog(id) {
  const list = getAllMealLogs();
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function newMealLogId() {
  return ctx.uid('m');
}

/** 字段清洗：只做结构与长度约束，枚举值由调用方负责 */
function normalizeMealLog(record) {
  const r = record && typeof record === 'object' ? record : {};
  const foods = Array.isArray(r.foods) ? r.foods : [];
  const seen = {};
  const cleanFoods = [];
  foods.forEach(function (id) {
    const key = String(id || '').trim();
    if (!key || seen[key]) return;
    seen[key] = true;
    cleanFoods.push(key);
  });

  const slot = MEAL_SLOTS.indexOf(r.slot) > -1 ? r.slot : 'other';
  const amount = AMOUNT_KEYS.indexOf(r.amount) > -1 ? r.amount : '';
  const accept = ACCEPT_KEYS.indexOf(r.accept) > -1 ? r.accept : 'ok';
  const poop = POOP_KEYS.indexOf(r.poop) > -1 ? r.poop : '';

  return Object.assign({}, r, {
    babyId: r.babyId || '',
    date: String(r.date || ''),
    slot: slot,
    recipeId: String(r.recipeId || ''),
    recipeName: String(r.recipeName || '').slice(0, 20),
    foods: cleanFoods,
    amount: amount,
    amountText: String(r.amountText || '').trim().slice(0, 20),
    accept: accept,
    poop: poop,
    note: String(r.note || '').trim().slice(0, 60)
  });
}

/** 新增或更新一餐（有 id 且命中则更新）；返回落库后的那条 */
function upsertMealLog(record) {
  const list = getAllMealLogs();
  const rec = ctx.stamp(normalizeMealLog(record), newMealLogId);

  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === rec.id) {
      list[i] = Object.assign({}, list[i], rec);
      found = true;
      break;
    }
  }
  if (!found) list.push(rec);

  ctx.write(ctx.KEYS.mealLogs, list);
  if (rec.babyId) trimMealLogs(rec.babyId, LOG_LIMIT_PER_BABY);
  return rec;
}

function removeMealLog(id) {
  const list = getAllMealLogs().filter(function (l) {
    return l.id !== id;
  });
  ctx.write(ctx.KEYS.mealLogs, list);
  return list;
}

/**
 * 安全阀：单宝宝超量时按「日期 + 录入时间」留最近的
 * 正常使用 3 年内不会触发，留着是防单 key 1MB 上限
 * @returns {Object} { trimmed, total }
 */
function trimMealLogs(babyId, max) {
  const limit = Math.max(1, Number(max) || LOG_LIMIT_PER_BABY);
  if (!babyId) return { trimmed: 0, total: 0 };

  const all = getAllMealLogs();
  const mine = all.filter(function (l) {
    return l.babyId === babyId;
  });
  if (mine.length <= limit) return { trimmed: 0, total: mine.length };

  mine.sort(function (a, b) {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return (b.createdAt || 0) - (a.createdAt || 0);
  });

  const keep = {};
  mine.slice(0, limit).forEach(function (l) {
    keep[l.id] = true;
  });

  const rest = all.filter(function (l) {
    return l.babyId !== babyId || keep[l.id];
  });
  ctx.write(ctx.KEYS.mealLogs, rest);
  return { trimmed: mine.length - limit, total: limit };
}

Object.assign(ctx, {
  MEAL_SLOTS: MEAL_SLOTS,
  LOG_LIMIT_PER_BABY: LOG_LIMIT_PER_BABY,
  AMOUNT_KEYS: AMOUNT_KEYS,
  ACCEPT_KEYS: ACCEPT_KEYS,
  POOP_KEYS: POOP_KEYS,
  getAllMealLogs: getAllMealLogs,
  getMealLogs: getMealLogs,
  getMealLogsByDate: getMealLogsByDate,
  getMealLog: getMealLog,
  newMealLogId: newMealLogId,
  normalizeMealLog: normalizeMealLog,
  upsertMealLog: upsertMealLog,
  removeMealLog: removeMealLog,
  trimMealLogs: trimMealLogs
});

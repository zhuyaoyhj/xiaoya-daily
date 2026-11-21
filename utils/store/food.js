// utils/store/food.js —— 辅食：尝试记录、自定义食材、不想试的食材、一周餐单替换
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');

/* ---------------- 辅食尝试记录 ---------------- */
// 记录结构：{ id, babyId, foodId, date, reaction, reactionNote, note, createdAt }
// reaction: none 无 / mild 轻微 / allergy 明确过敏 / severe 严重
// 只记「第一次吃某种新食材」，不是每日喂养流水账

function getAllFoodRecords() {
  const list = ctx.read(ctx.KEYS.foodRecords, []);
  return Array.isArray(list) ? list : [];
}

/** 取某个宝宝的辅食记录（不传 babyId 则返回全部） */
function getFoodRecords(babyId) {
  const list = getAllFoodRecords();
  if (!babyId) return list;
  return list.filter(function (r) {
    return r.babyId === babyId;
  });
}

function newFoodRecordId() {
  return ctx.uid('fr');
}

function upsertFoodRecord(record) {
  const list = getAllFoodRecords();
  const rec = ctx.stamp(Object.assign({}, record), newFoodRecordId);

  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === rec.id) {
      list[i] = Object.assign({}, list[i], rec);
      found = true;
      break;
    }
  }
  if (!found) list.push(rec);

  ctx.write(ctx.KEYS.foodRecords, list);
  return rec;
}

function removeFoodRecord(id) {
  const list = getAllFoodRecords().filter(function (r) {
    return r.id !== id;
  });
  ctx.write(ctx.KEYS.foodRecords, list);
  return list;
}

/** 每种食材的首次尝试日：{ [foodId]: 'YYYY-MM-DD' }，取最早的那条 */
function getFirstTryMap(babyId) {
  const map = {};
  getFoodRecords(babyId).forEach(function (r) {
    if (!r.foodId || !r.date) return;
    const cur = map[r.foodId];
    if (!cur || r.date < cur) map[r.foodId] = r.date;
  });
  return map;
}

/* ---------------- 自定义食材 ---------------- */
// 结构：{ id, name, group, fromMonth, note, custom: true, createdAt }
// 食材本身与宝宝无关（同一个家庭共用一份），所以全局存一份

const FOOD_GROUPS = ['grain', 'veg', 'fruit', 'meat', 'liver', 'fish', 'egg', 'dairy', 'bean', 'nut', 'oil'];

function getCustomFoods() {
  const list = ctx.read(ctx.KEYS.customFoods, []);
  return Array.isArray(list) ? list : [];
}

function saveCustomFoods(list) {
  return ctx.write(ctx.KEYS.customFoods, list || []);
}

function getCustomFood(id) {
  const list = getCustomFoods();
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

/**
 * 新增自定义食材
 * @param {Object} input { name, group, fromMonth, note }
 */
function addCustomFood(input) {
  const d = input || {};
  const name = String(d.name || '').trim();
  if (!name) return null;

  const group = FOOD_GROUPS.indexOf(d.group) > -1 ? d.group : 'veg';
  const fromMonth = Math.max(6, Math.min(36, Number(d.fromMonth) || 6));

  const item = {
    id: ctx.uid('cf'),
    name: name,
    emoji: '🍽',
    group: group,
    fromMonth: fromMonth,
    allergen: false,
    allergenGroup: '',
    ironRich: false,
    how: '',
    note: String(d.note || '').trim(),
    custom: true,
    createdAt: Date.now()
  };

  const list = getCustomFoods();
  list.push(item);
  saveCustomFoods(list);
  return item;
}

/** 删除自定义食材，连带清掉它的尝试记录；返回 { removed, records, logs } */
function removeCustomFood(id) {
  saveCustomFoods(
    getCustomFoods().filter(function (f) {
      return f.id !== id;
    })
  );

  const all = getAllFoodRecords();
  const kept = all.filter(function (r) {
    return r.foodId !== id;
  });
  const records = all.length - kept.length;
  if (records) ctx.write(ctx.KEYS.foodRecords, kept);

  // 流水账不删整条：一餐里还有别的食材，只把这个 id 摘掉
  let logs = 0;
  const allLogs = ctx.getAllMealLogs();
  let logTouched = false;
  allLogs.forEach(function (l) {
    const foods = Array.isArray(l.foods) ? l.foods : [];
    if (foods.indexOf(id) === -1) return;
    l.foods = foods.filter(function (f) {
      return f !== id;
    });
    logs += 1;
    logTouched = true;
  });
  if (logTouched) ctx.write(ctx.KEYS.mealLogs, allLogs);

  return { removed: true, records: records, logs: logs };
}

/* ---------------- 不想试 / 暂时跳过的食材 ---------------- */
// 存 `${babyId}#${foodId}`，按宝宝隔离（疫苗的 planHidden 是全局的，多宝宝会互相污染，这里不重复那个坑）

function getRawFoodHidden() {
  const list = ctx.read(ctx.KEYS.foodHidden, []);
  return Array.isArray(list) ? list : [];
}

/** 传 babyId 返回该宝宝的 foodId 数组；不传返回原始 key 数组 */
function getFoodHidden(babyId) {
  const list = getRawFoodHidden();
  if (!babyId) return list;
  const prefix = babyId + '#';
  return list
    .filter(function (k) {
      return String(k).indexOf(prefix) === 0;
    })
    .map(function (k) {
      return String(k).slice(prefix.length);
    });
}

function hideFood(babyId, foodId) {
  if (!babyId || !foodId) return getRawFoodHidden();
  const key = babyId + '#' + foodId;
  const list = getRawFoodHidden();
  if (list.indexOf(key) === -1) {
    list.push(key);
    ctx.write(ctx.KEYS.foodHidden, list);
  }
  return list;
}

function unhideFood(babyId, foodId) {
  const key = babyId + '#' + foodId;
  const list = getRawFoodHidden().filter(function (k) {
    return k !== key;
  });
  ctx.write(ctx.KEYS.foodHidden, list);
  return list;
}

function clearFoodHidden(babyId) {
  if (!babyId) {
    ctx.write(ctx.KEYS.foodHidden, []);
    return [];
  }
  const prefix = babyId + '#';
  const list = getRawFoodHidden().filter(function (k) {
    return String(k).indexOf(prefix) !== 0;
  });
  ctx.write(ctx.KEYS.foodHidden, list);
  return list;
}

/* ---------------- 一周餐单的手动替换 ---------------- */
// 菜单本身不存库（用 babyId + 周一日期做种子现算），只存家长手动换掉的那一格
// 形状：{ [babyId]: { 'YYYY-MM-DD#slot': recipeId } }

function getAllMenuSwap() {
  const obj = ctx.read(ctx.KEYS.menuSwap, {});
  return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
}

function getMenuSwap(babyId) {
  const all = getAllMenuSwap();
  const mine = all[babyId];
  return mine && typeof mine === 'object' ? mine : {};
}

function setMenuSwap(babyId, dateSlot, recipeId) {
  if (!babyId || !dateSlot) return getMenuSwap(babyId);
  const all = getAllMenuSwap();
  const mine = all[babyId] && typeof all[babyId] === 'object' ? all[babyId] : {};
  if (recipeId) mine[dateSlot] = recipeId;
  else delete mine[dateSlot];
  all[babyId] = mine;
  ctx.write(ctx.KEYS.menuSwap, all);
  return mine;
}

/** 清掉某宝宝的全部替换；不传 babyId 则全清 */
function clearMenuSwap(babyId) {
  if (!babyId) {
    ctx.write(ctx.KEYS.menuSwap, {});
    return {};
  }
  const all = getAllMenuSwap();
  delete all[babyId];
  ctx.write(ctx.KEYS.menuSwap, all);
  return {};
}

Object.assign(ctx, {
  getAllFoodRecords: getAllFoodRecords,
  getFoodRecords: getFoodRecords,
  newFoodRecordId: newFoodRecordId,
  upsertFoodRecord: upsertFoodRecord,
  removeFoodRecord: removeFoodRecord,
  getFirstTryMap: getFirstTryMap,
  FOOD_GROUPS: FOOD_GROUPS,
  getCustomFoods: getCustomFoods,
  saveCustomFoods: saveCustomFoods,
  getCustomFood: getCustomFood,
  addCustomFood: addCustomFood,
  removeCustomFood: removeCustomFood,
  getRawFoodHidden: getRawFoodHidden,
  getFoodHidden: getFoodHidden,
  hideFood: hideFood,
  unhideFood: unhideFood,
  clearFoodHidden: clearFoodHidden,
  getAllMenuSwap: getAllMenuSwap,
  getMenuSwap: getMenuSwap,
  setMenuSwap: setMenuSwap,
  clearMenuSwap: clearMenuSwap
});

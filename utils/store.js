// utils/store.js —— 本地存储（宝宝档案 / 设置 / 地点 / 家人名单）

const placeUtil = require('./place.js');

const KEYS = {
  babies: 'xyd_babies',
  settings: 'xyd_settings',
  weatherCache: 'xyd_weather_cache',
  vaccineRecords: 'xyd_vaccine_records',
  customVaccines: 'xyd_custom_vaccines',
  planHidden: 'xyd_plan_hidden',
  foodRecords: 'xyd_food_records',
  customFoods: 'xyd_custom_foods',
  foodHidden: 'xyd_food_hidden',
  menuSwap: 'xyd_menu_swap',
  mealLogs: 'xyd_meal_logs'
};

const DEFAULT_SETTINGS = {
  activeBabyId: '',
  place: null, // 当前生效地点 { city, district, community, lat, lon, source }
  places: [], // 常用地点 [{ id, label, ...place }]
  activePlaceId: '',
  family: [],
  pushTargets: [],
  subscribeEnabled: false,
  lastPushAt: 0
};

function read(key, fallback) {
  try {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || v === undefined) return fallback;
    return v;
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    wx.setStorageSync(key, value);
    return true;
  } catch (e) {
    console.warn('[store] 写入失败', key, e && e.message);
    return false;
  }
}

/* ---------------- 宝宝档案 ---------------- */

function getBabies() {
  const list = read(KEYS.babies, []);
  return Array.isArray(list) ? list : [];
}

function saveBabies(list) {
  return write(KEYS.babies, list || []);
}

function getBaby(id) {
  const list = getBabies();
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

function upsertBaby(baby) {
  const list = getBabies();
  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === baby.id) {
      list[i] = Object.assign({}, list[i], baby);
      found = true;
      break;
    }
  }
  if (!found) list.push(baby);
  saveBabies(list);
  return baby;
}

function removeBaby(id) {
  const list = getBabies().filter(function (b) {
    return b.id !== id;
  });
  saveBabies(list);

  // 宝宝删了，他的接种记录也一起清掉，避免留下孤儿数据
  const rest = getAllVaccineRecords().filter(function (r) {
    return r.babyId !== id;
  });
  write(KEYS.vaccineRecords, rest);

  // 辅食记录与「不想试」清单同样按宝宝隔离，一并清掉
  const foodRest = getAllFoodRecords().filter(function (r) {
    return r.babyId !== id;
  });
  write(KEYS.foodRecords, foodRest);

  const hiddenRest = getRawFoodHidden().filter(function (k) {
    return String(k).indexOf(id + '#') !== 0;
  });
  write(KEYS.foodHidden, hiddenRest);

  // 进食流水账同理，一个宝宝一条都不能留
  const logRest = getAllMealLogs().filter(function (l) {
    return l.babyId !== id;
  });
  write(KEYS.mealLogs, logRest);

  const swap = read(KEYS.menuSwap, {});
  if (swap && typeof swap === 'object' && swap[id]) {
    delete swap[id];
    write(KEYS.menuSwap, swap);
  }

  const s = getSettings();
  if (s.activeBabyId === id) {
    updateSettings({ activeBabyId: list.length ? list[0].id : '' });
  }
  return list;
}

function newBabyId() {
  return 'b' + Date.now() + Math.floor(Math.random() * 1000);
}

/** 当前选中的宝宝；没有选中则取第一个 */
function getActiveBaby() {
  const s = getSettings();
  const list = getBabies();
  if (!list.length) return null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === s.activeBabyId) return list[i];
  }
  return list[0];
}

function setActiveBabyId(id) {
  return updateSettings({ activeBabyId: id });
}

/* ---------------- 设置 ---------------- */

function getSettings() {
  const raw = read(KEYS.settings, null);
  const merged = Object.assign({}, DEFAULT_SETTINGS, raw && typeof raw === 'object' ? raw : {});

  // 旧版本只存了 city / lat / lon，这里一次性迁移成结构化地点
  if (!merged.place && typeof merged.lat === 'number' && typeof merged.lon === 'number') {
    const migrated = placeUtil.migrateLegacy(merged);
    if (migrated) {
      merged.place = migrated;
      write(KEYS.settings, merged);
    }
  }
  return merged;
}

function updateSettings(patch) {
  const next = Object.assign({}, getSettings(), patch || {});
  write(KEYS.settings, next);
  return next;
}

/* ---------------- 地点 ---------------- */

/** 当前生效地点（可能是常用地点里的一项，也可能是临时设置的地点） */
function getPlace() {
  const s = getSettings();
  const list = Array.isArray(s.places) ? s.places : [];

  if (s.activePlaceId) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === s.activePlaceId) return list[i];
    }
  }
  return s.place || null;
}

/**
 * 保存当前地点
 * - 带 id 且命中常用地点 → 更新该项并设为当前
 * - 不带 id → 作为临时地点写入
 */
function savePlace(place) {
  const p = placeUtil.normalize(place);
  const s = getSettings();
  const list = Array.isArray(s.places) ? s.places.slice() : [];
  let activeId = '';

  if (p.id) {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === p.id) {
        list[i] = Object.assign({}, list[i], p);
        activeId = p.id;
        break;
      }
    }
  }

  updateSettings({ place: p, places: list, activePlaceId: activeId });
  return p;
}

function getPlaces() {
  const s = getSettings();
  return Array.isArray(s.places) ? s.places : [];
}

/** 把某个地点加入常用并设为当前 */
function addPlace(label, place) {
  const s = getSettings();
  const list = Array.isArray(s.places) ? s.places.slice() : [];
  const item = Object.assign(placeUtil.normalize(place), {
    id: 'p' + Date.now() + Math.floor(Math.random() * 100),
    label: label || placeUtil.placeLabel(place) || '常用地点'
  });
  list.push(item);
  updateSettings({ places: list, place: item, activePlaceId: item.id });
  return item;
}

function activatePlace(id) {
  const s = getSettings();
  const list = Array.isArray(s.places) ? s.places : [];
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) {
      updateSettings({ activePlaceId: id, place: list[i] });
      return list[i];
    }
  }
  return null;
}

function removePlace(id) {
  const s = getSettings();
  const list = (Array.isArray(s.places) ? s.places : []).filter(function (p) {
    return p.id !== id;
  });
  const patch = { places: list };
  if (s.activePlaceId === id) {
    patch.activePlaceId = '';
    patch.place = list.length ? list[0] : null;
  }
  updateSettings(patch);
  return list;
}

/* ---------------- 家人名单 ---------------- */

const RELATIONS = ['妈妈', '爸爸', '奶奶', '爷爷', '外婆', '外公', '阿姨', '月嫂', '其他'];

function getFamily() {
  const s = getSettings();
  return Array.isArray(s.family) ? s.family : [];
}

function saveFamily(list) {
  return updateSettings({ family: list || [] });
}

function addFamilyMember(name, relation) {
  const list = getFamily();
  const member = {
    id: 'f' + Date.now() + Math.floor(Math.random() * 100),
    name: name,
    relation: relation || '其他'
  };
  list.push(member);
  saveFamily(list);
  return member;
}

function removeFamilyMember(id) {
  saveFamily(
    getFamily().filter(function (m) {
      return m.id !== id;
    })
  );
  const s = getSettings();
  updateSettings({
    pushTargets: (s.pushTargets || []).filter(function (t) {
      return t !== id;
    })
  });
}

function getPushTargets() {
  const s = getSettings();
  const ids = Array.isArray(s.pushTargets) ? s.pushTargets : [];
  return getFamily().filter(function (m) {
    return ids.indexOf(m.id) > -1;
  });
}

function togglePushTarget(id) {
  const s = getSettings();
  const ids = Array.isArray(s.pushTargets) ? s.pushTargets.slice() : [];
  const i = ids.indexOf(id);
  if (i > -1) ids.splice(i, 1);
  else ids.push(id);
  updateSettings({ pushTargets: ids });
  return ids;
}

/* ---------------- 天气缓存 ---------------- */

function getWeatherCache() {
  return read(KEYS.weatherCache, null);
}

function setWeatherCache(data) {
  return write(KEYS.weatherCache, data);
}

/* ---------------- 疫苗接种记录 ---------------- */
// 记录结构：{ id, babyId, vaccineId, dose, date, time, place, note, createdAt }
// 一个宝宝一份记录集，按 babyId 过滤，删宝宝时一起清掉

function getAllVaccineRecords() {
  const list = read(KEYS.vaccineRecords, []);
  return Array.isArray(list) ? list : [];
}

/** 取某个宝宝的接种记录（不传 babyId 则返回全部） */
function getVaccineRecords(babyId) {
  const list = getAllVaccineRecords();
  if (!babyId) return list;
  return list.filter(function (r) {
    return r.babyId === babyId;
  });
}

function newVaccineRecordId() {
  return 'v' + Date.now() + Math.floor(Math.random() * 1000);
}

/** 新增或更新一条记录（有 id 且命中则更新） */
function upsertVaccineRecord(record) {
  const list = getAllVaccineRecords();
  const rec = Object.assign({}, record);
  if (!rec.id) {
    rec.id = newVaccineRecordId();
    rec.createdAt = Date.now();
  }

  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === rec.id) {
      list[i] = Object.assign({}, list[i], rec);
      found = true;
      break;
    }
  }
  if (!found) list.push(rec);

  write(KEYS.vaccineRecords, list);
  return rec;
}

function removeVaccineRecord(id) {
  const list = getAllVaccineRecords().filter(function (r) {
    return r.id !== id;
  });
  write(KEYS.vaccineRecords, list);
  return list;
}

/** 同一种疫苗已记录的剂次，用于编辑页标记「已打」 */
function getDoseMap(babyId) {
  const map = {};
  getVaccineRecords(babyId).forEach(function (r) {
    map[r.vaccineId + '#' + r.dose] = r;
  });
  return map;
}

/* ---------------- 自定义疫苗（二类自费，本地添加） ---------------- */
// 结构：{ id, name, short, category: 'paid', doses: 剂次数, note, custom: true, createdAt }

function getCustomVaccines() {
  const list = read(KEYS.customVaccines, []);
  return Array.isArray(list) ? list : [];
}

function saveCustomVaccines(list) {
  return write(KEYS.customVaccines, list || []);
}

function getCustomVaccine(id) {
  const list = getCustomVaccines();
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i];
  }
  return null;
}

/**
 * 新增自定义疫苗
 * @param {Object} input { name, short, doses, note }
 */
function addCustomVaccine(input) {
  const d = input || {};
  const name = String(d.name || '').trim();
  if (!name) return null;

  const total = Math.max(1, Math.min(6, Number(d.doses) || 1));
  const item = {
    id: 'c' + Date.now() + Math.floor(Math.random() * 1000),
    name: name,
    short: String(d.short || '').trim() || name.slice(0, 6),
    category: 'paid',
    doses: total,
    note: String(d.note || '').trim(),
    custom: true,
    createdAt: Date.now()
  };

  const list = getCustomVaccines();
  list.push(item);
  saveCustomVaccines(list);
  return item;
}

/** 删除自定义疫苗，连带清掉用它的接种记录；返回 { removed, records } */
function removeCustomVaccine(id) {
  const list = getCustomVaccines().filter(function (v) {
    return v.id !== id;
  });
  saveCustomVaccines(list);

  const kept = getAllVaccineRecords().filter(function (r) {
    return r.vaccineId !== id;
  });
  const records = getAllVaccineRecords().length - kept.length;
  if (records) write(KEYS.vaccineRecords, kept);

  return { removed: true, records: records };
}

/* ---------------- 免疫规划表里被移除的项 ---------------- */
// 存 key 数组，key 形如 'polio#2'。用于「已打过五联 / 医生说不打 / 外地打过了」这类情况

function getPlanHidden() {
  const list = read(KEYS.planHidden, []);
  return Array.isArray(list) ? list : [];
}

function setPlanHidden(list) {
  return write(KEYS.planHidden, list || []);
}

function hidePlanItem(key) {
  const list = getPlanHidden();
  if (list.indexOf(key) === -1) {
    list.push(key);
    setPlanHidden(list);
  }
  return list;
}

function unhidePlanItem(key) {
  const list = getPlanHidden().filter(function (k) {
    return k !== key;
  });
  setPlanHidden(list);
  return list;
}

function clearPlanHidden() {
  setPlanHidden([]);
  return [];
}

/* ---------------- 辅食尝试记录 ---------------- */
// 记录结构：{ id, babyId, foodId, date, reaction, reactionNote, note, createdAt }
// reaction: none 无 / mild 轻微 / allergy 明确过敏 / severe 严重
// 只记「第一次吃某种新食材」，不是每日喂养流水账

function getAllFoodRecords() {
  const list = read(KEYS.foodRecords, []);
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

// 同一毫秒内可能连续插入多条，靠自增序号保证 id 不撞
let foodSeq = 0;

function newFoodRecordId() {
  foodSeq = (foodSeq + 1) % 100000;
  return 'f' + Date.now() + foodSeq;
}

function upsertFoodRecord(record) {
  const list = getAllFoodRecords();
  const rec = Object.assign({}, record);
  if (!rec.id) {
    rec.id = newFoodRecordId();
    rec.createdAt = Date.now();
  }

  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === rec.id) {
      list[i] = Object.assign({}, list[i], rec);
      found = true;
      break;
    }
  }
  if (!found) list.push(rec);

  write(KEYS.foodRecords, list);
  return rec;
}

function removeFoodRecord(id) {
  const list = getAllFoodRecords().filter(function (r) {
    return r.id !== id;
  });
  write(KEYS.foodRecords, list);
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
  const list = read(KEYS.customFoods, []);
  return Array.isArray(list) ? list : [];
}

function saveCustomFoods(list) {
  return write(KEYS.customFoods, list || []);
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
    id: 'cf' + Date.now() + Math.floor(Math.random() * 1000),
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
  if (records) write(KEYS.foodRecords, kept);

  // 流水账不删整条：一餐里还有别的食材，只把这个 id 摘掉
  let logs = 0;
  const allLogs = getAllMealLogs();
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
  if (logTouched) write(KEYS.mealLogs, allLogs);

  return { removed: true, records: records, logs: logs };
}

/* ---------------- 不想试 / 暂时跳过的食材 ---------------- */
// 存 `${babyId}#${foodId}`，按宝宝隔离（疫苗的 planHidden 是全局的，多宝宝会互相污染，这里不重复那个坑）

function getRawFoodHidden() {
  const list = read(KEYS.foodHidden, []);
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
    write(KEYS.foodHidden, list);
  }
  return list;
}

function unhideFood(babyId, foodId) {
  const key = babyId + '#' + foodId;
  const list = getRawFoodHidden().filter(function (k) {
    return k !== key;
  });
  write(KEYS.foodHidden, list);
  return list;
}

function clearFoodHidden(babyId) {
  if (!babyId) {
    write(KEYS.foodHidden, []);
    return [];
  }
  const prefix = babyId + '#';
  const list = getRawFoodHidden().filter(function (k) {
    return String(k).indexOf(prefix) !== 0;
  });
  write(KEYS.foodHidden, list);
  return list;
}

/* ---------------- 一周餐单的手动替换 ---------------- */
// 菜单本身不存库（用 babyId + 周一日期做种子现算），只存家长手动换掉的那一格
// 形状：{ [babyId]: { 'YYYY-MM-DD#slot': recipeId } }

function getAllMenuSwap() {
  const obj = read(KEYS.menuSwap, {});
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
  write(KEYS.menuSwap, all);
  return mine;
}

/** 清掉某宝宝的全部替换；不传 babyId 则全清 */
function clearMenuSwap(babyId) {
  if (!babyId) {
    write(KEYS.menuSwap, {});
    return {};
  }
  const all = getAllMenuSwap();
  delete all[babyId];
  write(KEYS.menuSwap, all);
  return {};
}

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
  const list = read(KEYS.mealLogs, []);
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

// 与 foodSeq 同理：同一毫秒内连续插入也不撞 id
let mealSeq = 0;

function newMealLogId() {
  mealSeq = (mealSeq + 1) % 100000;
  return 'm' + Date.now() + mealSeq;
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
  const rec = normalizeMealLog(record);
  if (!rec.id) {
    rec.id = newMealLogId();
    rec.createdAt = Date.now();
  }

  let found = false;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === rec.id) {
      list[i] = Object.assign({}, list[i], rec);
      found = true;
      break;
    }
  }
  if (!found) list.push(rec);

  write(KEYS.mealLogs, list);
  if (rec.babyId) trimMealLogs(rec.babyId, LOG_LIMIT_PER_BABY);
  return rec;
}

function removeMealLog(id) {
  const list = getAllMealLogs().filter(function (l) {
    return l.id !== id;
  });
  write(KEYS.mealLogs, list);
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
  write(KEYS.mealLogs, rest);
  return { trimmed: mine.length - limit, total: limit };
}

module.exports = {
  KEYS,
  RELATIONS,
  getBabies: getBabies,
  saveBabies: saveBabies,
  getBaby: getBaby,
  upsertBaby: upsertBaby,
  removeBaby: removeBaby,
  newBabyId: newBabyId,
  getActiveBaby: getActiveBaby,
  setActiveBabyId: setActiveBabyId,
  getSettings: getSettings,
  updateSettings: updateSettings,
  getPlace: getPlace,
  savePlace: savePlace,
  getPlaces: getPlaces,
  addPlace: addPlace,
  activatePlace: activatePlace,
  removePlace: removePlace,
  getFamily: getFamily,
  saveFamily: saveFamily,
  addFamilyMember: addFamilyMember,
  removeFamilyMember: removeFamilyMember,
  getPushTargets: getPushTargets,
  togglePushTarget: togglePushTarget,
  getWeatherCache: getWeatherCache,
  setWeatherCache: setWeatherCache,
  getAllVaccineRecords: getAllVaccineRecords,
  getVaccineRecords: getVaccineRecords,
  newVaccineRecordId: newVaccineRecordId,
  upsertVaccineRecord: upsertVaccineRecord,
  removeVaccineRecord: removeVaccineRecord,
  getDoseMap: getDoseMap,
  getCustomVaccines: getCustomVaccines,
  saveCustomVaccines: saveCustomVaccines,
  getCustomVaccine: getCustomVaccine,
  addCustomVaccine: addCustomVaccine,
  removeCustomVaccine: removeCustomVaccine,
  getPlanHidden: getPlanHidden,
  setPlanHidden: setPlanHidden,
  hidePlanItem: hidePlanItem,
  unhidePlanItem: unhidePlanItem,
  clearPlanHidden: clearPlanHidden,
  // 辅食
  FOOD_GROUPS: FOOD_GROUPS,
  getAllFoodRecords: getAllFoodRecords,
  getFoodRecords: getFoodRecords,
  newFoodRecordId: newFoodRecordId,
  upsertFoodRecord: upsertFoodRecord,
  removeFoodRecord: removeFoodRecord,
  getFirstTryMap: getFirstTryMap,
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
  clearMenuSwap: clearMenuSwap,
  // 进食流水账
  MEAL_SLOTS: MEAL_SLOTS,
  LOG_LIMIT_PER_BABY: LOG_LIMIT_PER_BABY,
  getAllMealLogs: getAllMealLogs,
  getMealLogs: getMealLogs,
  getMealLogsByDate: getMealLogsByDate,
  getMealLog: getMealLog,
  newMealLogId: newMealLogId,
  normalizeMealLog: normalizeMealLog,
  upsertMealLog: upsertMealLog,
  removeMealLog: removeMealLog,
  trimMealLogs: trimMealLogs
};

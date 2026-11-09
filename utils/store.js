// utils/store.js —— 本地存储（宝宝档案 / 设置 / 地点 / 家人名单）

const placeUtil = require('./place.js');

const KEYS = {
  babies: 'xyd_babies',
  settings: 'xyd_settings',
  weatherCache: 'xyd_weather_cache',
  vaccineRecords: 'xyd_vaccine_records',
  customVaccines: 'xyd_custom_vaccines',
  planHidden: 'xyd_plan_hidden'
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
  clearPlanHidden: clearPlanHidden
};

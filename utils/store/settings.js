// utils/store/settings.js —— 设置、地点、家人名单、天气缓存
// 不要直接 require 这个文件：统一经 utils/store.js 访问（它决定加载顺序，并把各模块挂到同一个 ctx 上）。
// 跨模块调用一律写 ctx.xxx()，在运行时才解析，避免循环 require。

const ctx = require('./ctx.js');
const placeUtil = require('../place.js');

/* ---------------- 设置 ---------------- */

function getSettings() {
  const raw = ctx.read(ctx.KEYS.settings, null);
  const merged = Object.assign({}, ctx.DEFAULT_SETTINGS, raw && typeof raw === 'object' ? raw : {});

  // 旧版本只存了 city / lat / lon，这里一次性迁移成结构化地点
  if (!merged.place && typeof merged.lat === 'number' && typeof merged.lon === 'number') {
    const migrated = placeUtil.migrateLegacy(merged);
    if (migrated) {
      merged.place = migrated;
      ctx.write(ctx.KEYS.settings, merged);
    }
  }
  return merged;
}

function updateSettings(patch) {
  const next = Object.assign({}, getSettings(), patch || {});
  ctx.write(ctx.KEYS.settings, next);
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
    id: ctx.uid('p'),
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
    id: ctx.uid('f'),
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
  return ctx.read(ctx.KEYS.weatherCache, null);
}

function setWeatherCache(data) {
  return ctx.write(ctx.KEYS.weatherCache, data);
}

Object.assign(ctx, {
  getSettings: getSettings,
  updateSettings: updateSettings,
  getPlace: getPlace,
  savePlace: savePlace,
  getPlaces: getPlaces,
  addPlace: addPlace,
  activatePlace: activatePlace,
  removePlace: removePlace,
  RELATIONS: RELATIONS,
  getFamily: getFamily,
  saveFamily: saveFamily,
  addFamilyMember: addFamilyMember,
  removeFamilyMember: removeFamilyMember,
  getPushTargets: getPushTargets,
  togglePushTarget: togglePushTarget,
  getWeatherCache: getWeatherCache,
  setWeatherCache: setWeatherCache
});

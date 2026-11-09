// utils/place.js —— 地点模型：北京市 → 区 → 小区
// 一个 place 长这样：
// { id?, label?, city:'北京市', district:'朝阳区', community:'望京西园',
//   address:'北京市朝阳区望京西园', lat:39.99, lon:116.47,
//   source:'poi' | 'map' | 'district' | 'manual' }

const { CITY, BEIJING_DISTRICTS, MOUNTAIN_OFFSET, MOUNTAIN_HINT } = require('../data/districts.js');

function emptyPlace() {
  return {
    city: CITY.name,
    district: '',
    community: '',
    address: '',
    lat: null,
    lon: null,
    source: ''
  };
}

function findDistrict(name) {
  if (!name) return null;
  for (let i = 0; i < BEIJING_DISTRICTS.length; i++) {
    if (BEIJING_DISTRICTS[i].name === name) return BEIJING_DISTRICTS[i];
  }
  return null;
}

function isMountainDistrict(name) {
  const d = findDistrict(name);
  return !!(d && d.mountain);
}

/** 选到某个区时，用区中心坐标做天气取数锚点 */
function fromDistrict(name) {
  const d = findDistrict(name);
  if (!d) return null;
  return {
    city: CITY.name,
    district: d.name,
    community: '',
    address: CITY.name + d.name,
    lat: d.lat,
    lon: d.lon,
    source: 'district'
  };
}

function toCoord(v) {
  if (v === null || v === undefined || v === '') return NaN;
  const n = Number(v);
  return isFinite(n) ? n : NaN;
}

function hasCoords(p) {
  if (!p) return false;
  return !isNaN(toCoord(p.lat)) && !isNaN(toCoord(p.lon));
}

/** 补全字段，避免页面到处判 undefined */
function normalize(p) {
  const base = emptyPlace();
  if (!p) return base;
  const out = Object.assign(base, p);
  out.city = out.city || CITY.name;
  out.district = out.district || '';
  out.community = out.community || '';
  if (typeof out.lat === 'string') out.lat = Number(out.lat);
  if (typeof out.lon === 'string') out.lon = Number(out.lon);
  if (!out.address) out.address = formatPlace(out, ' ');
  return out;
}

/** 完整地址：北京市 · 朝阳区 · 望京西园 */
function formatPlace(p, sep) {
  const s = sep === undefined ? ' · ' : sep;
  if (!p) return '';
  const names = [p.city, p.district, p.community].filter(function (x) {
    return !!x;
  });
  // 北京市 + 北京市 这类重复只留一个
  const uniq = [];
  names.forEach(function (n) {
    if (uniq.indexOf(n) === -1) uniq.push(n);
  });
  return uniq.join(s);
}

/** 短标签：望京西园 > 朝阳区 > 北京市，用于天气卡标题、卡片文案 */
function placeLabel(p) {
  if (!p) return '';
  return p.community || p.district || p.city || '';
}

/** 次一级说明：选到小区时显示「朝阳区」 */
function placeSub(p) {
  if (!p) return '';
  if (p.community && p.district) return p.district;
  if (p.district && p.city) return p.city;
  return '';
}

/** 是否为山区区域（决定穿衣是否要额外降温修正） */
function mountainInfo(p) {
  if (!p) return { mountain: false, offset: 0, hint: '' };
  const mountain = isMountainDistrict(p.district);
  return {
    mountain: mountain,
    offset: mountain ? MOUNTAIN_OFFSET : 0,
    hint: mountain ? MOUNTAIN_HINT : ''
  };
}

/** 旧版本数据迁移：只有 city/lat/lon 的老 settings → place */
function migrateLegacy(settings) {
  const s = settings || {};
  if (s.place && s.place.city) return s.place;
  if (typeof s.lat !== 'number' || typeof s.lon !== 'number') return null;
  return {
    city: s.city || CITY.name,
    district: '',
    community: '',
    address: s.city || '',
    lat: s.lat,
    lon: s.lon,
    source: 'manual'
  };
}

module.exports = {
  CITY: CITY,
  DISTRICTS: BEIJING_DISTRICTS,
  MOUNTAIN_OFFSET: MOUNTAIN_OFFSET,
  MOUNTAIN_HINT: MOUNTAIN_HINT,
  emptyPlace: emptyPlace,
  findDistrict: findDistrict,
  isMountainDistrict: isMountainDistrict,
  fromDistrict: fromDistrict,
  hasCoords: hasCoords,
  normalize: normalize,
  formatPlace: formatPlace,
  placeLabel: placeLabel,
  placeSub: placeSub,
  mountainInfo: mountainInfo,
  migrateLegacy: migrateLegacy
};

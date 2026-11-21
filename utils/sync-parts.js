// utils/sync-parts.js —— 云同步的「分块」：把快照切成小块，按内容指纹只传有变化的块（纯函数）
//
// 为什么要切：云函数一次返回最多 1MB。整份快照按每天十几条记录算约 2.8KB/天，
// 一年就会超；切块后单块最大的是「某个月的喂睡尿」，约 100KB。
//
// 块的划分：
//   core          宝宝档案、接种、辅食、测量、自定义项、隐藏项、换餐、家人名单、删除墓碑
//   care_YYYYMM   某个月的喂奶 / 睡眠 / 尿布
//   meal_YYYYMM   某个月的进食记录（一天 3 餐，放 core 里两年多就会超 1MB）
//
// 指纹：对「规范化后的 JSON」做 FNV-1a 哈希。规范化 = 列表按 id 排序 + 对象键排序，
// 这样两台手机合并出同样的内容时指纹一定相同，不会来回互推。

const CORE_KEYS = [
  'babies',
  'vaccineRecords',
  'foodRecords',
  'growth',
  'customVaccines',
  'customFoods',
  'planHidden',
  'foodHidden',
  'menuSwap',
  'settings',
  'tombstones'
];

const CARE_PREFIX = 'care_';
const MEAL_PREFIX = 'meal_';
// 单块上限：留足余量（云函数参数 / 返回值的上限按 1MB 算）
const PART_MAX_BYTES = 900 * 1024;

/** 递归规范化：对象键排序；元素都带 id 的数组按 id 排序 */
function canonical(v) {
  if (Array.isArray(v)) {
    const arr = v.map(canonical);
    const allId = arr.length && arr.every(function (x) {
      return x && typeof x === 'object' && !Array.isArray(x) && x.id;
    });
    if (allId) {
      arr.sort(function (a, b) {
        return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
      });
    }
    return arr;
  }
  if (v && typeof v === 'object') {
    const out = {};
    Object.keys(v)
      .sort()
      .forEach(function (k) {
        if (v[k] !== undefined) out[k] = canonical(v[k]);
      });
    return out;
  }
  return v;
}

/** FNV-1a 32 位，输出 8 位十六进制；够用来判断「内容变没变」 */
function fnv(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

/** UTF-8 字节数（中文 3 字节；云函数的 1MB 是按字节算的） */
function utf8Bytes(str) {
  let n = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c < 0xdc00) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/** 某一块的规范化 JSON + 指纹 + 体积（字节） */
function digest(data) {
  const json = JSON.stringify(canonical(data));
  return { json: json, hash: fnv(json) + ':' + json.length, bytes: utf8Bytes(json) };
}

/** 快照 → { core: {...}, care_202611: [...], ... }；空的照护月份不出块 */
function split(snap) {
  const s = snap || {};
  const parts = {};
  const core = {};
  CORE_KEYS.forEach(function (k) {
    if (s[k] !== undefined) core[k] = s[k];
  });
  parts.core = core;
  const shards = s.careShards || {};
  Object.keys(shards).forEach(function (m) {
    if (Array.isArray(shards[m]) && shards[m].length) parts[CARE_PREFIX + m] = shards[m];
  });
  (Array.isArray(s.mealLogs) ? s.mealLogs : []).forEach(function (l) {
    const m = /^(\d{4})-(\d{2})/.exec(String((l && l.date) || ''));
    const name = MEAL_PREFIX + (m ? m[1] + m[2] : '000000');
    (parts[name] = parts[name] || []).push(l);
  });
  return parts;
}

/** 若干块 → 快照（只含这些块的内容，合并引擎会把缺的部分当成「对方没有」） */
function assemble(parts) {
  const snap = {};
  Object.keys(parts || {}).forEach(function (name) {
    const p = parts[name];
    if (name === 'core') {
      Object.keys(p || {}).forEach(function (k) {
        snap[k] = p[k];
      });
    } else if (name.indexOf(CARE_PREFIX) === 0) {
      snap.careShards = snap.careShards || {};
      snap.careShards[name.slice(CARE_PREFIX.length)] = p;
    } else if (name.indexOf(MEAL_PREFIX) === 0) {
      snap.mealLogs = (snap.mealLogs || []).concat(Array.isArray(p) ? p : []);
    }
  });
  return snap;
}

/** 每块的指纹 { name: hash } */
function hashes(parts) {
  const out = {};
  Object.keys(parts).forEach(function (name) {
    out[name] = digest(parts[name]).hash;
  });
  return out;
}

function isPartName(name) {
  return name === 'core' || /^(care|meal)_\d{6}$/.test(String(name));
}

module.exports = {
  CORE_KEYS: CORE_KEYS,
  CARE_PREFIX: CARE_PREFIX,
  MEAL_PREFIX: MEAL_PREFIX,
  PART_MAX_BYTES: PART_MAX_BYTES,
  canonical: canonical,
  fnv: fnv,
  utf8Bytes: utf8Bytes,
  digest: digest,
  split: split,
  assemble: assemble,
  hashes: hashes,
  isPartName: isPartName
};

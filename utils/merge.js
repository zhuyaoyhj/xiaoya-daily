// utils/merge.js —— 两份数据合并（纯函数，不碰 wx）
// 用在：备份「合并导入」、云同步（客户端合并后再推上云）。
//
// 规则：
//   1. 记录按 id 对齐；两边都有时，updatedAt（没有就用 createdAt）大的赢，一样大时本机赢
//   2. 删除靠「墓碑」：tombstones = { id: 删除时间 }。墓碑晚于记录的最后修改 → 这条记录删除
//      （先删后改：别人在你删之后又改了它，就保留，避免误删别人的新内容）
//   3. 名单类（不想试的食材、移除的计划）取并集；家人名单按 id 并集

const LIST_KINDS = ['babies', 'vaccineRecords', 'foodRecords', 'mealLogs', 'growth', 'customVaccines', 'customFoods'];
const UNION_KINDS = ['planHidden', 'foodHidden'];

function stampOf(r) {
  if (!r || typeof r !== 'object') return 0;
  return Number(r.updatedAt || r.createdAt || 0) || 0;
}

/** 两条同 id 记录取一条：新的赢，平手本机赢 */
function pick(local, remote) {
  if (!local) return remote;
  if (!remote) return local;
  return stampOf(remote) > stampOf(local) ? remote : local;
}

function mergeTombstones(a, b) {
  const out = {};
  [a, b].forEach(function (t) {
    if (!t || typeof t !== 'object') return;
    Object.keys(t).forEach(function (id) {
      const v = Number(t[id]) || 0;
      if (!out[id] || v > out[id]) out[id] = v;
    });
  });
  return out;
}

function alive(rec, tomb) {
  if (!rec || !rec.id) return false;
  const t = tomb[rec.id];
  return !t || stampOf(rec) > t;
}

/** 按 id 合并两个列表；结果顺序：本机原有顺序在前，新来的按出现顺序追加 */
function mergeList(local, remote, tomb) {
  const map = {};
  const order = [];
  (Array.isArray(local) ? local : []).forEach(function (r) {
    if (!r || !r.id) return;
    if (!map[r.id]) order.push(r.id);
    map[r.id] = pick(map[r.id], r);
  });
  let added = 0;
  let updated = 0;
  (Array.isArray(remote) ? remote : []).forEach(function (r) {
    if (!r || !r.id) return;
    if (!map[r.id]) {
      order.push(r.id);
      map[r.id] = r;
      added++;
    } else {
      const before = map[r.id];
      map[r.id] = pick(before, r);
      if (map[r.id] !== before) updated++;
    }
  });
  let removed = 0;
  const out = [];
  order.forEach(function (id) {
    if (alive(map[id], tomb)) out.push(map[id]);
    else removed++;
  });
  return { list: out, added: added, updated: updated, removed: removed };
}

function union(a, b) {
  const seen = {};
  const out = [];
  [a, b].forEach(function (list) {
    (Array.isArray(list) ? list : []).forEach(function (k) {
      const key = typeof k === 'string' ? k : JSON.stringify(k);
      if (seen[key]) return;
      seen[key] = true;
      out.push(k);
    });
  });
  return out;
}

/** 照护分片 { 'YYYYMM': [entry] } 合并：先摊平按 id 合并，再按 start 重新分月 */
function mergeCare(localShards, remoteShards, tomb, monthKeyOf) {
  const flat = function (shards) {
    const out = [];
    Object.keys(shards || {}).forEach(function (m) {
      (Array.isArray(shards[m]) ? shards[m] : []).forEach(function (e) {
        out.push(e);
      });
    });
    return out;
  };
  const merged = mergeList(flat(localShards), flat(remoteShards), tomb);
  const shards = {};
  merged.list.forEach(function (e) {
    const m = monthKeyOf(e.start);
    (shards[m] = shards[m] || []).push(e);
  });
  return { shards: shards, added: merged.added, updated: merged.updated, removed: merged.removed };
}

function defaultMonthKey(ts) {
  const d = new Date(Number(ts));
  const m = d.getMonth() + 1;
  return d.getFullYear() + (m < 10 ? '0' + m : '' + m);
}

/**
 * 合并两份快照（结构同备份里的 data）
 * @return {{ data, stats: { added, updated, removed } }}
 */
function mergeSnapshots(local, remote, monthKeyOf) {
  const L = local || {};
  const R = remote || {};
  const tomb = mergeTombstones(L.tombstones, R.tombstones);
  const data = {};
  const stats = { added: 0, updated: 0, removed: 0 };

  LIST_KINDS.forEach(function (k) {
    if (L[k] === undefined && R[k] === undefined) return;
    const r = mergeList(L[k], R[k], tomb);
    data[k] = r.list;
    stats.added += r.added;
    stats.updated += r.updated;
    stats.removed += r.removed;
  });

  UNION_KINDS.forEach(function (k) {
    if (L[k] === undefined && R[k] === undefined) return;
    data[k] = union(L[k], R[k]);
  });

  // 换餐：两边都是 { babyId: { 'date#slot': recipeId } }，本机优先
  if (L.menuSwap !== undefined || R.menuSwap !== undefined) {
    const swap = {};
    [R.menuSwap, L.menuSwap].forEach(function (s) {
      if (!s || typeof s !== 'object') return;
      Object.keys(s).forEach(function (bid) {
        swap[bid] = Object.assign({}, swap[bid] || {}, s[bid] || {});
      });
    });
    data.menuSwap = swap;
  }

  // 设置：以本机为准，只把家人名单按 id 并起来（各手机自己的地点、提醒开关不互相覆盖）
  if (L.settings !== undefined || R.settings !== undefined) {
    const ls = L.settings && typeof L.settings === 'object' ? L.settings : {};
    const rs = R.settings && typeof R.settings === 'object' ? R.settings : {};
    const fam = mergeList(ls.family, rs.family, {}).list;
    data.settings = Object.assign({}, rs, ls, { family: fam });
  }

  if (L.careShards !== undefined || R.careShards !== undefined) {
    const c = mergeCare(L.careShards, R.careShards, tomb, monthKeyOf || defaultMonthKey);
    data.careShards = c.shards;
    stats.added += c.added;
    stats.updated += c.updated;
    stats.removed += c.removed;
  }

  data.tombstones = tomb;
  return { data: data, stats: stats };
}

/** 墓碑太多时只留最近 N 条（半年以前的删除不会再有冲突） */
function pruneTombstones(tomb, now, keepDays) {
  const limit = (now || Date.now()) - (keepDays || 180) * 86400000;
  const out = {};
  Object.keys(tomb || {}).forEach(function (id) {
    if (tomb[id] >= limit) out[id] = tomb[id];
  });
  return out;
}

module.exports = {
  LIST_KINDS: LIST_KINDS,
  UNION_KINDS: UNION_KINDS,
  stampOf: stampOf,
  pick: pick,
  mergeList: mergeList,
  mergeTombstones: mergeTombstones,
  mergeSnapshots: mergeSnapshots,
  pruneTombstones: pruneTombstones
};

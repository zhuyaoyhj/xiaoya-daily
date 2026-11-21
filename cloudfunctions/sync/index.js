// cloudfunctions/sync/index.js —— 家庭云同步（分块版）
//
// 为什么分块：云函数一次返回最多 1MB，整份快照大约一年就会超。现在把数据切成块，
// 每块按内容指纹存，同步时只传有变化的块。切块、合并都在客户端（utils/sync-parts.js、utils/merge.js）。
//
// 集合：
//   xyd_families      { _id, code, members: [openid], owner, rev, manifest: { 块名: 指纹 }, createdAt, updatedAt }
//   xyd_family_parts  { _id: familyId|块名|指纹, familyId, name, hash, data, createdAt }  —— 按内容寻址，写入互不覆盖
//   xyd_join_guard    { _id: openid, fails: [时间戳] }                                      —— 家庭码试错限流
//
// action:
//   create                           → { familyId, code }（空家庭，客户端随后照常同步把数据推上来）
//   join      { code }               → { familyId }；同一微信 1 小时内最多试错 5 次
//   manifest  { familyId }           → { rev, manifest }
//   getParts  { familyId, names }    → { parts: { 块名: data } }（客户端按大小分批要，单次 < 1MB）
//   putParts  { familyId, parts: { 块名: { hash, data } } } → 只写块，不改清单
//   commit    { familyId, baseRev, manifest } → 乐观锁换清单；rev 不对返回 CONFLICT；成功后清掉不再引用的旧块
//   leave     { familyId }           → 最后一个人退出时整个家庭连同数据删除
//
// 安全：除 create / join 外都校验调用者在 members 里；家庭码只用于加入，不能读数据。

const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;
const FAM = 'xyd_families';
const PARTS = 'xyd_family_parts';
const GUARD = 'xyd_join_guard';

const PART_MAX_BYTES = 900 * 1024; // 单块上限（云函数入参 / 返回值按 1MB 留余量）
const BATCH_MAX_BYTES = 900 * 1024; // 单次 getParts 返回上限
const MAX_MEMBERS = 8;
const JOIN_MAX_FAILS = 5;
const JOIN_WINDOW_MS = 60 * 60 * 1000;
const PART_NAME = /^(core|(care|meal)_\d{6})$/;
const HASH = /^[0-9a-f]{8}:\d{1,8}$/;

function fail(code, extra) {
  return Object.assign({ ok: false, code: code }, extra || {});
}

function sizeOf(data) {
  return Buffer.byteLength(JSON.stringify(data === undefined ? null : data), 'utf8');
}

function partId(familyId, name, hash) {
  return familyId + '|' + name + '|' + hash;
}

async function ensureCollections() {
  for (const c of [FAM, PARTS, GUARD]) {
    try {
      await db.createCollection(c);
    } catch (e) {
      // 已存在
    }
  }
}

async function newCode() {
  for (let i = 0; i < 10; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hit = await db.collection(FAM).where({ code: code }).count();
    if (!hit.total) return code;
  }
  throw new Error('CODE_EXHAUSTED');
}

async function getFamily(familyId, openid) {
  if (!familyId) return null;
  try {
    const r = await db.collection(FAM).doc(String(familyId)).get();
    const f = r.data;
    if (!f || (f.members || []).indexOf(openid) === -1) return null;
    return f;
  } catch (e) {
    return null;
  }
}

/* ---------- 家庭码试错限流：防止有人挨个试 6 位数字闯进别人家 ---------- */

async function recentFails(openid, now) {
  try {
    const r = await db.collection(GUARD).doc(openid).get();
    return ((r.data && r.data.fails) || []).filter(function (t) {
      return now - t < JOIN_WINDOW_MS;
    });
  } catch (e) {
    return [];
  }
}

async function recordFail(openid, fails, now) {
  const list = fails.concat([now]).slice(-JOIN_MAX_FAILS * 2);
  try {
    await db.collection(GUARD).doc(openid).set({ data: { fails: list } });
  } catch (e) {
    // 限流记录失败不影响主流程
  }
}

/** 删掉某家庭里「不在清单上」的旧块（only 给定时只看这些块名） */
async function gcParts(familyId, manifest, only) {
  const where = { familyId: familyId };
  if (only && only.length) where.name = _.in(only);
  const r = await db.collection(PARTS).where(where).field({ _id: true, name: true, hash: true }).limit(1000).get();
  const stale = (r.data || []).filter(function (p) {
    return manifest[p.name] !== p.hash;
  });
  for (const p of stale) {
    try {
      await db.collection(PARTS).doc(p._id).remove();
    } catch (e) {
      // 下次再清
    }
  }
  return stale.length;
}

exports.main = async function (event) {
  const openid = cloud.getWXContext().OPENID;
  const action = event && event.action;
  if (!openid) return fail('NO_USER');
  await ensureCollections();
  const now = Date.now();

  if (action === 'create') {
    const code = await newCode();
    const r = await db.collection(FAM).add({
      data: { code: code, members: [openid], owner: openid, rev: 0, manifest: {}, createdAt: now, updatedAt: now }
    });
    return { ok: true, familyId: r._id, code: code };
  }

  if (action === 'join') {
    const fails = await recentFails(openid, now);
    if (fails.length >= JOIN_MAX_FAILS) {
      const wait = Math.ceil((JOIN_WINDOW_MS - (now - fails[0])) / 60000);
      return fail('TOO_MANY', { waitMinutes: Math.max(1, wait) });
    }
    const code = String(event.code || '');
    if (!/^\d{6}$/.test(code)) return fail('BAD_CODE');
    const r = await db.collection(FAM).where({ code: code }).limit(1).get();
    const f = r.data && r.data[0];
    if (!f) {
      await recordFail(openid, fails, now);
      return fail('NO_FAMILY');
    }
    if ((f.members || []).indexOf(openid) === -1) {
      if ((f.members || []).length >= MAX_MEMBERS) return fail('FULL');
      await db.collection(FAM).doc(f._id).update({ data: { members: _.addToSet(openid) } });
    }
    return { ok: true, familyId: f._id };
  }

  if (action === 'manifest') {
    const f = await getFamily(event.familyId, openid);
    if (!f) return fail('NO_FAMILY');
    return { ok: true, rev: f.rev || 0, manifest: f.manifest || {} };
  }

  if (action === 'getParts') {
    const f = await getFamily(event.familyId, openid);
    if (!f) return fail('NO_FAMILY');
    const manifest = f.manifest || {};
    const names = (Array.isArray(event.names) ? event.names : []).filter(function (n) {
      return PART_NAME.test(n) && manifest[n];
    });
    const parts = {};
    let bytes = 0;
    for (const n of names) {
      let doc = null;
      try {
        doc = (await db.collection(PARTS).doc(partId(f._id, n, manifest[n])).get()).data;
      } catch (e) {
        doc = null;
      }
      if (!doc) continue;
      const b = sizeOf(doc.data);
      if (bytes && bytes + b > BATCH_MAX_BYTES) break; // 剩下的客户端下一批再要
      parts[n] = { hash: manifest[n], data: doc.data };
      bytes += b;
    }
    return { ok: true, parts: parts };
  }

  if (action === 'putParts') {
    const f = await getFamily(event.familyId, openid);
    if (!f) return fail('NO_FAMILY');
    const parts = event.parts && typeof event.parts === 'object' ? event.parts : {};
    let n = 0;
    for (const name of Object.keys(parts)) {
      const p = parts[name] || {};
      if (!PART_NAME.test(name) || !HASH.test(String(p.hash || ''))) return fail('BAD_PART');
      if (sizeOf(p.data) > PART_MAX_BYTES) return fail('TOO_LARGE');
      // 按内容寻址：同一指纹就是同一份内容，重复写是幂等的；不同指纹互不覆盖
      await db
        .collection(PARTS)
        .doc(partId(f._id, name, p.hash))
        .set({ data: { familyId: f._id, name: name, hash: p.hash, data: p.data, createdAt: now } });
      n++;
    }
    return { ok: true, written: n };
  }

  if (action === 'commit') {
    const f = await getFamily(event.familyId, openid);
    if (!f) return fail('NO_FAMILY');
    const manifest = event.manifest && typeof event.manifest === 'object' ? event.manifest : null;
    if (!manifest) return fail('BAD_MANIFEST');
    const names = Object.keys(manifest);
    for (const name of names) {
      if (!PART_NAME.test(name) || !HASH.test(String(manifest[name]))) return fail('BAD_MANIFEST');
    }
    // 清单里每一块都必须已经存在，否则别人拉到的会是半份数据
    for (const name of names) {
      if ((f.manifest || {})[name] === manifest[name]) continue;
      try {
        await db.collection(PARTS).doc(partId(f._id, name, manifest[name])).get();
      } catch (e) {
        return fail('MISSING_PART', { name: name });
      }
    }
    const baseRev = Number(event.baseRev) || 0;
    const r = await db
      .collection(FAM)
      .where({ _id: f._id, rev: baseRev })
      .update({ data: { manifest: _.set(manifest), rev: _.inc(1), updatedAt: now } });
    if (!r.stats || !r.stats.updated) return fail('CONFLICT');
    // 只清本次换掉 / 去掉的块
    const touched = Object.keys(Object.assign({}, f.manifest || {}, manifest)).filter(function (n) {
      return (f.manifest || {})[n] !== manifest[n];
    });
    if (touched.length) await gcParts(f._id, manifest, touched);
    return { ok: true, rev: baseRev + 1 };
  }

  if (action === 'leave') {
    const f = await getFamily(event.familyId, openid);
    if (!f) return { ok: true };
    const rest = (f.members || []).filter(function (m) {
      return m !== openid;
    });
    if (!rest.length) {
      // 最后一个人走了：数据没人能再访问，直接删掉
      await gcParts(f._id, {});
      await db.collection(FAM).doc(f._id).remove();
      return { ok: true, removed: true };
    }
    await db.collection(FAM).doc(f._id).update({ data: { members: _.pull(openid) } });
    return { ok: true };
  }

  return fail('BAD_ACTION');
};

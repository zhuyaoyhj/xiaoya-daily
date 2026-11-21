// utils/sync.js —— 家庭云同步（客户端）
//
// 模型：一家人共用一个「家庭空间」，云端按块存数据（utils/sync-parts.js）+ 一份清单和版本号 rev。
//   1. 创建：拿到 6 位家庭码，发给家人
//   2. 加入：输家庭码；首次加入时本机数据和云端合并（谁的都不丢）
//   3. 同步：只拉有变化的块 → 和本机合并 → 只推有变化的块 → 提交清单（乐观锁）
// 合并在客户端做（utils/merge.js），云函数只负责存取 + 乐观锁，保持简单。
//
// 云开发没开通 / 没部署 sync 云函数时：available = false，「我的」里显示「暂不可用」，备份文件照常可用。
// 照片、语音等不同步；进行中的计时、本机的地点 / 记录人 / 引导状态不同步。

const store = require('./store.js');
const mergeUtil = require('./merge.js');
const parts = require('./sync-parts.js');
const track = require('./track.js').track;

const FN = 'sync';
const MIN_INTERVAL = 60 * 1000; // 自动同步最快一分钟一次

let running = null;

function app() {
  return typeof getApp === 'function' ? getApp() : null;
}

/** 云开发能不能用（不保证云函数已部署，那要调一次才知道） */
function available() {
  const a = app();
  return !!(typeof wx !== 'undefined' && wx.cloud && a && a.globalData && a.globalData.cloudReady);
}

function call(action, data) {
  return new Promise(function (resolve, reject) {
    if (!available()) {
      reject(new Error('UNAVAILABLE'));
      return;
    }
    wx.cloud.callFunction({
      name: FN,
      data: Object.assign({ action: action }, data || {}),
      success: function (res) {
        const r = res && res.result;
        if (!r || r.ok === false) {
          reject(new Error((r && r.code) || 'SERVER'));
          return;
        }
        resolve(r);
      },
      fail: function (err) {
        const msg = (err && err.errMsg) || '';
        // 云函数没部署：-501000 / FUNCTION_NOT_FOUND
        reject(new Error(/not ?found|501000|FunctionName/i.test(msg) ? 'NOT_DEPLOYED' : 'NETWORK'));
      }
    });
  });
}

function state() {
  return store.getSync() || {};
}

function agoText(ts) {
  if (!ts) return '';
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return m + ' 分钟前';
  const h = Math.floor(m / 60);
  if (h < 24) return h + ' 小时前';
  return Math.floor(h / 24) + ' 天前';
}

/** 给「我的」页一行字用 */
function status() {
  const s = state();
  if (s.familyId) {
    return {
      joined: true,
      available: available(),
      code: s.code || '',
      text: '已加入 · ' + (s.lastSyncAt ? agoText(s.lastSyncAt) + '同步' : '还没同步过'),
      lastSyncAt: s.lastSyncAt || 0,
      error: s.lastError || ''
    };
  }
  return {
    joined: false,
    available: available(),
    text: available() ? '一家人的记录合在一起，换手机也不丢' : '暂不可用，先用备份文件',
    code: '',
    lastSyncAt: 0,
    error: ''
  };
}

/** 本机快照里不该上云的东西摘掉（地点、手动温度这类每台手机自己的） */
function outbound(snap) {
  const s = Object.assign({}, snap);
  if (s.settings) {
    s.settings = { family: Array.isArray(s.settings.family) ? s.settings.family : [] };
  }
  s.tombstones = mergeUtil.pruneTombstones(s.tombstones || {}, Date.now(), 180);
  return s;
}

/** 按大小分批：每批不超过 limit 字节（单块超限的单独一批，云函数会拒绝并报 TOO_LARGE） */
function batches(names, sizeOf, limit) {
  const out = [];
  let cur = [];
  let bytes = 0;
  names.forEach(function (n) {
    const b = sizeOf(n);
    if (cur.length && bytes + b > limit) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(n);
    bytes += b;
  });
  if (cur.length) out.push(cur);
  return out;
}

/** 下载这些块；云函数单次返回不超过 1MB，没给全的继续要 */
function fetchParts(familyId, names) {
  const got = {};
  const loop = function (rest, guard) {
    if (!rest.length || guard > 50) return Promise.resolve(got);
    return call('getParts', { familyId: familyId, names: rest }).then(function (r) {
      const parts = (r && r.parts) || {};
      const keys = Object.keys(parts);
      keys.forEach(function (k) {
        got[k] = parts[k].data;
      });
      if (!keys.length) return got; // 云端缺块：不死循环，按已有的合并
      return loop(
        rest.filter(function (n) {
          return !(n in got);
        }),
        guard + 1
      );
    });
  };
  return loop(names.slice(), 0);
}

/**
 * 同步一次（分块增量）：
 *   1. 拿云端清单（每块的内容指纹）
 *   2. 只下载「和上次同步时不一样」的块，与本机合并
 *   3. 把合并结果切块，只上传「云端没有这个指纹」的块
 *   4. 带着拿清单时的 rev 提交新清单；被别人抢先（CONFLICT）就从 1 重来，最多 3 次
 * @return Promise<{ added, updated, removed }>
 */
function syncNow(opts) {
  const s = state();
  if (!s.familyId) return Promise.reject(new Error('NOT_JOINED'));
  if (running) return running;
  const force = opts && opts.force;
  if (!force && s.lastSyncAt && Date.now() - s.lastSyncAt < MIN_INTERVAL) {
    return Promise.resolve({ added: 0, updated: 0, removed: 0, skipped: true });
  }

  let tries = 0;
  const once = function () {
    tries++;
    const known = state().manifest || {}; // 上次同步成功时的云端清单
    return call('manifest', { familyId: s.familyId }).then(function (remote) {
      const rman = remote.manifest || {};
      const changed = Object.keys(rman).filter(function (n) {
        return parts.isPartName(n) && rman[n] !== known[n];
      });
      return fetchParts(s.familyId, changed).then(function (got) {
        const local = store.snapshot();
        // 云端有变化的块拼成「远端快照」去合并；没变的块本机已经是合并过的，不用再下
        const merged = mergeUtil.mergeSnapshots(local, parts.assemble(got), store.monthKeyOf);
        const out = parts.split(outbound(merged.data));
        const digests = {};
        Object.keys(out).forEach(function (n) {
          digests[n] = parts.digest(out[n]);
        });
        const manifest = {};
        Object.keys(digests).forEach(function (n) {
          manifest[n] = digests[n].hash;
        });
        // 云端有、本机合并结果里没有的块：说明这个月的记录在本机全删了（第一次同步会把云端所有块都下下来），
        // 不放进新清单，云函数提交后会清掉
        const toPut = Object.keys(digests).filter(function (n) {
          return rman[n] !== manifest[n];
        });
        const big = toPut.filter(function (n) {
          return digests[n].bytes > parts.PART_MAX_BYTES;
        });
        if (big.length) return Promise.reject(new Error('TOO_LARGE'));
        const groups = batches(
          toPut,
          function (n) {
            return digests[n].bytes;
          },
          parts.PART_MAX_BYTES
        );
        let chain = Promise.resolve();
        groups.forEach(function (g) {
          chain = chain.then(function () {
            const payload = {};
            g.forEach(function (n) {
              payload[n] = { hash: digests[n].hash, data: out[n] };
            });
            return call('putParts', { familyId: s.familyId, parts: payload });
          });
        });
        const same = Object.keys(manifest).length === Object.keys(rman).length &&
          Object.keys(manifest).every(function (n) {
            return rman[n] === manifest[n];
          });
        return chain
          .then(function () {
            // 什么都没变就不提交，省一次写、也不抬 rev
            if (same) return { rev: remote.rev || 0 };
            return call('commit', { familyId: s.familyId, baseRev: remote.rev || 0, manifest: manifest });
          })
          .then(function (c) {
            store.applySnapshot(merged.data);
            store.setSync(
              Object.assign({}, state(), {
                lastSyncAt: Date.now(),
                rev: (c && c.rev) || remote.rev || 0,
                manifest: manifest,
                lastError: ''
              })
            );
            return merged.stats;
          });
      });
    }).catch(function (err) {
      if (err && err.message === 'CONFLICT' && tries < 3) return once();
      throw err;
    });
  };

  running = once()
    .catch(function (err) {
      store.setSync(Object.assign({}, state(), { lastError: (err && err.message) || 'ERROR' }));
      throw err;
    })
    .finally(function () {
      running = null;
    });
  return running;
}

/** 新建家庭空间：云端先建空家庭，再同步一次把本机数据推上去 */
function createFamily() {
  return call('create', {}).then(function (r) {
    store.setSync({ familyId: r.familyId, code: r.code, rev: 0, manifest: {}, lastSyncAt: 0, lastError: '' });
    return syncNow({ force: true }).then(function () {
      return r;
    });
  });
}

/** 用家庭码加入：本机已有记录会和家里的合并 */
function joinFamily(code) {
  const c = String(code || '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return Promise.reject(new Error('BAD_CODE'));
  return call('join', { code: c }).then(function (r) {
    store.setSync({ familyId: r.familyId, code: c, rev: 0, manifest: {}, lastSyncAt: 0, lastError: '' });
    track('sync_join', {});
    return syncNow({ force: true });
  });
}

/** 退出：本机记录保留，只是不再同步 */
function leaveFamily() {
  const s = state();
  store.setSync('');
  if (s.familyId && available()) {
    return call('leave', { familyId: s.familyId }).catch(function () {
      return null;
    });
  }
  return Promise.resolve(null);
}

/** 页面 onShow 时调：加入了家庭就静默同步一次（失败不打扰） */
function autoSync() {
  if (!state().familyId || !available()) return Promise.resolve(null);
  return syncNow().catch(function () {
    return null;
  });
}

const ERROR_TEXT = {
  UNAVAILABLE: '云同步暂不可用，可以先用备份文件',
  NOT_DEPLOYED: '云同步还没开通，可以先用备份文件',
  NETWORK: '网络不太好，稍后再试',
  BAD_CODE: '家庭码是 6 位数字',
  NO_FAMILY: '没找到这个家庭码，核对一下',
  CONFLICT: '刚好有家人也在同步，稍后再试',
  TOO_LARGE: '这个月的记录太多，一次传不完，请联系我们',
  TOO_MANY: '试错次数太多，请 1 小时后再试',
  FULL: '这个家庭人数已满（最多 8 人）',
  NOT_JOINED: '还没加入家庭'
};

function errorText(err) {
  return ERROR_TEXT[(err && err.message) || ''] || '同步没成功，稍后再试';
}

module.exports = {
  available: available,
  status: status,
  syncNow: syncNow,
  autoSync: autoSync,
  createFamily: createFamily,
  joinFamily: joinFamily,
  leaveFamily: leaveFamily,
  errorText: errorText,
  _outbound: outbound
};

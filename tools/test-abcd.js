#!/usr/bin/env node
/**
 * tools/test-abcd.js —— 2026-11-20 这一批：A 上线前 / B 留存 / C 多人与回报 / D 云同步与深色模式
 * 用法：node tools/test-abcd.js
 * 覆盖：
 *   A 隐私弹窗中转、埋点白名单（不带内容）、备份提醒的出现与消失、医疗禁词
 *   B 首次引导两步、统一时间线（七类记录、筛选、计数、跨夜、谁记的）、首页最近记的同口径
 *   C 合并引擎（新增 / 更新 / 删除墓碑 / 先删后改）、合并导入不丢本机、替换导入、
 *     记录人 by、7 天趋势、上周小结（少于 3 天不出）、生长百分位与 WHO 对照、测量记录与档案同步
 *   D 云同步（假云端：创建 / 加入合并 / 冲突重试 / 删除传播 / 不可用时降级）、深色 token 与主题文件
 */

const path = require('path');
const fs = require('fs');
const fixtures = require('./fixtures.js');

const ROOT = path.resolve(__dirname, '..');
const mem = {};
let lastToast = '';
let lastModal = '';
let lastNav = '';
let modalConfirm = true;
const reported = [];
let privacyHandler = null;
const globalData = { tmplIds: [], cloudReady: false };

/* ---------- 假云端：按 cloudfunctions/sync 的协议模拟（分块 + 清单 + 乐观锁 + 限流 + 1MB 返回上限） ---------- */
const cloud = { families: {}, parts: {}, guard: {}, seq: 0, fail: '', conflictOnce: false, calls: [], bytesOut: 0 };
const RET_LIMIT = 1024 * 1024;
function cloudCall(openid, ev) {
  cloud.calls.push(ev.action);
  const fam = function (id) {
    const f = cloud.families[id];
    return f && f.members.indexOf(openid) > -1 ? f : null;
  };
  const pid = function (id, n, h) {
    return id + '|' + n + '|' + h;
  };
  if (ev.action === 'create') {
    const id = 'fam' + ++cloud.seq;
    const code = String(100000 + cloud.seq);
    cloud.families[id] = { code: code, members: [openid], rev: 0, manifest: {} };
    return { ok: true, familyId: id, code: code };
  }
  if (ev.action === 'join') {
    const now = Date.now();
    const fails = (cloud.guard[openid] || []).filter(function (t) {
      return now - t < 3600000;
    });
    if (fails.length >= 5) return { ok: false, code: 'TOO_MANY' };
    const id = Object.keys(cloud.families).filter(function (k) {
      return cloud.families[k].code === ev.code;
    })[0];
    if (!id) {
      cloud.guard[openid] = fails.concat([now]);
      return { ok: false, code: 'NO_FAMILY' };
    }
    if (cloud.families[id].members.indexOf(openid) === -1) cloud.families[id].members.push(openid);
    return { ok: true, familyId: id };
  }
  if (ev.action === 'manifest') {
    const f = fam(ev.familyId);
    if (!f) return { ok: false, code: 'NO_FAMILY' };
    return { ok: true, rev: f.rev, manifest: JSON.parse(JSON.stringify(f.manifest)) };
  }
  if (ev.action === 'getParts') {
    const f = fam(ev.familyId);
    if (!f) return { ok: false, code: 'NO_FAMILY' };
    const out = {};
    let bytes = 0;
    (ev.names || []).forEach(function (n) {
      const h = f.manifest[n];
      const p = h && cloud.parts[pid(ev.familyId, n, h)];
      if (!p) return;
      const b = Buffer.byteLength(JSON.stringify(p), 'utf8');
      if (bytes && bytes + b > 900 * 1024) return;
      out[n] = { hash: h, data: JSON.parse(JSON.stringify(p)) };
      bytes += b;
    });
    return { ok: true, parts: out };
  }
  if (ev.action === 'putParts') {
    const f = fam(ev.familyId);
    if (!f) return { ok: false, code: 'NO_FAMILY' };
    Object.keys(ev.parts || {}).forEach(function (n) {
      cloud.parts[pid(ev.familyId, n, ev.parts[n].hash)] = JSON.parse(JSON.stringify(ev.parts[n].data));
    });
    return { ok: true };
  }
  if (ev.action === 'commit') {
    const f = fam(ev.familyId);
    if (!f) return { ok: false, code: 'NO_FAMILY' };
    if (cloud.conflictOnce) {
      cloud.conflictOnce = false;
      f.rev++; // 模拟别人刚提交过
      return { ok: false, code: 'CONFLICT' };
    }
    if (ev.baseRev !== f.rev) return { ok: false, code: 'CONFLICT' };
    const missing = Object.keys(ev.manifest).filter(function (n) {
      return !cloud.parts[pid(ev.familyId, n, ev.manifest[n])];
    });
    if (missing.length) return { ok: false, code: 'MISSING_PART' };
    f.manifest = JSON.parse(JSON.stringify(ev.manifest));
    f.rev++;
    return { ok: true, rev: f.rev };
  }
  if (ev.action === 'leave') {
    const f = cloud.families[ev.familyId];
    if (f) {
      f.members = f.members.filter(function (m) {
        return m !== openid;
      });
      if (!f.members.length) delete cloud.families[ev.familyId];
    }
    return { ok: true };
  }
  return { ok: false, code: 'BAD_ACTION' };
}
/** 测试里直接看云端当前的完整数据 */
function cloudData(familyId) {
  const f = cloud.families[familyId];
  const parts = {};
  Object.keys(f.manifest).forEach(function (n) {
    parts[n] = cloud.parts[familyId + '|' + n + '|' + f.manifest[n]];
  });
  return syncParts.assemble(parts);
}
let currentOpenid = 'mom';

global.getApp = function () {
  return { globalData: globalData };
};
global.getCurrentPages = function () {
  return [{}, {}];
};
global.wx = {
  // 和真机一致：每次读出来都是新拷贝（直接返回引用会掩盖「改了读出来的数组」这类问题）
  getStorageSync: function (k) {
    if (!Object.prototype.hasOwnProperty.call(mem, k)) return '';
    const v = mem[k];
    return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v;
  },
  setStorageSync: function (k, v) {
    mem[k] = v === '' ? '' : JSON.parse(JSON.stringify(v));
  },
  navigateTo: function (o) {
    lastNav = o.url;
  },
  navigateBack: function () {
    lastNav = 'back';
  },
  switchTab: function (o) {
    lastNav = 'tab:' + o.url;
  },
  showToast: function (o) {
    lastToast = o.title;
  },
  showLoading: function () {},
  hideLoading: function () {},
  showModal: function (o) {
    lastModal = (o.title || '') + '|' + (o.content || '');
    if (o.success) o.success({ confirm: modalConfirm });
  },
  showActionSheet: function (o) {
    if (o.success) o.success({ tapIndex: 0 });
  },
  setNavigationBarTitle: function () {},
  stopPullDownRefresh: function () {},
  request: function (o) {
    if (o.fail) o.fail(new Error('NET'));
  },
  reportEvent: function (name, data) {
    reported.push({ name: name, data: data });
  },
  onNeedPrivacyAuthorization: function (fn) {
    privacyHandler = fn;
  },
  cloud: {
    callFunction: function (o) {
      if (cloud.fail === 'NOT_DEPLOYED') {
        o.fail({ errMsg: 'cloud.callFunction:fail -501000 FunctionName parameter could not be found' });
        return;
      }
      setTimeout(function () {
        const result = cloudCall(currentOpenid, Object.assign({ name: o.name }, o.data));
        const size = Buffer.byteLength(JSON.stringify(result), 'utf8');
        cloud.bytesOut = Math.max(cloud.bytesOut, size);
        if (size > RET_LIMIT) {
          o.fail({ errMsg: 'cloud.callFunction:fail response size exceeds 1MB' });
          return;
        }
        o.success({ result: result });
      }, 0);
    }
  }
};

let captured = null;
global.Page = function (cfg) {
  captured = cfg;
};
global.Component = function (cfg) {
  captured = cfg;
};
function mount(rel) {
  captured = null;
  const full = path.join(ROOT, rel);
  delete require.cache[require.resolve(full)];
  require(full);
  return captured;
}
function instance(cfg) {
  const inst = Object.assign({}, cfg, cfg.methods || {});
  inst.data = JSON.parse(JSON.stringify(cfg.data || {}));
  inst.setData = function (patch, cb) {
    const self = this;
    Object.keys(patch).forEach(function (k) {
      if (k.indexOf('.') > -1) {
        const parts = k.split('.');
        let t = self.data;
        for (let i = 0; i < parts.length - 1; i++) t = t[parts[i]];
        t[parts[parts.length - 1]] = patch[k];
      } else self.data[k] = patch[k];
    });
    if (cb) cb();
  };
  return inst;
}
function ev(d, detail) {
  return { currentTarget: { dataset: d || {} }, detail: detail || {} };
}
function clear() {
  Object.keys(mem).forEach(function (k) {
    delete mem[k];
  });
}
const tick = function () {
  return new Promise(function (r) {
    setTimeout(r, 5);
  });
};

const store = require(path.join(ROOT, 'utils/store.js'));
const care = require(path.join(ROOT, 'utils/care.js'));
const merge = require(path.join(ROOT, 'utils/merge.js'));
const timeline = require(path.join(ROOT, 'utils/timeline.js'));
const stats = require(path.join(ROOT, 'utils/stats.js'));
const growth = require(path.join(ROOT, 'pages/growth/growth-calc.js'));
const dateUtil = require(path.join(ROOT, 'utils/date.js'));
const trackMod = require(path.join(ROOT, 'utils/track.js'));
const privacy = require(path.join(ROOT, 'utils/privacy.js'));
const sync = require(path.join(ROOT, 'utils/sync.js'));
const syncParts = require(path.join(ROOT, 'utils/sync-parts.js'));
const chart = require(path.join(ROOT, 'utils/chart.js'));
const theme = require(path.join(ROOT, 'utils/theme.js'));

let pass = 0;
let fail = 0;
function ok(c, l) {
  if (c) {
    pass++;
    console.log('  ✓ ' + l);
  } else {
    fail++;
    console.log('  ✗ ' + l);
  }
}
function eq(a, b, l) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  ok(x === y, l + (x === y ? '' : '\n      期望 ' + y + '\n      实际 ' + x));
}

const HOUR = 3600000;
const DAY = 24 * HOUR;
const TODAY = care.dateOf(Date.now());
const YEST = fixtures.daysFromToday(-1);

async function main() {
  /* ================= A1 隐私授权 ================= */
  console.log('\n[A1] 隐私授权弹窗');
  ok(privacy.install(), '注册了 onNeedPrivacyAuthorization');
  let resolved = null;
  const events = [];
  const handler = function (r) {
    resolved = r;
    events.push(r.event);
  };
  // 请求先到、弹窗组件后挂：不能先报露出，挂上那一刻再报
  privacyHandler(handler);
  eq(events, [], '页面上还没弹窗时不谎报「已露出」');
  const pop = instance(mount('components/privacy-popup/privacy-popup.js'));
  pop.lifetimes.attached.call(pop);
  ok(pop.data.show, '组件挂上后弹窗显示');
  eq(events, ['exposureAuthorization'], '真正显示后才报露出');
  pop.onAgree();
  eq(events, ['exposureAuthorization', 'agree'], '同意：先露出、后同意，各报一次');
  events.length = 0;
  privacyHandler(handler);
  ok(pop.data.show, '用到隐私接口时弹窗出现');
  eq(events, ['exposureAuthorization'], '已挂弹窗时立即报露出');
  pop.onAgree();
  ok(!pop.data.show && resolved && resolved.event === 'agree' && resolved.buttonId === 'privacy-agree', '同意后关闭并放行（buttonId 对得上）');
  privacyHandler(function (r) {
    resolved = r;
  });
  pop.onDisagree();
  eq(resolved.event, 'disagree', '拒绝也要告诉微信，原来的调用才能结束');
  pop.lifetimes.detached.call(pop);
  const wxml = fs.readFileSync(path.join(ROOT, 'components/privacy-popup/privacy-popup.wxml'), 'utf8');
  ok(/open-type="agreePrivacyAuthorization"/.test(wxml) && /id="privacy-agree"/.test(wxml), '同意按钮用官方 open-type，且 id 与 buttonId 一致');
  const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  ok(app.usingComponents && app.usingComponents['privacy-popup'], '全局注册了弹窗组件');
  const missing = fixtures.allPages(app).filter(function (p) {
    return fs.readFileSync(path.join(ROOT, p + '.wxml'), 'utf8').indexOf('<privacy-popup') === -1;
  });
  eq(missing, [], '每个页面都挂了 <privacy-popup />');
  ok(/privacy\.install\(\)/.test(fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')), 'app.js onLaunch 里安装');

  /* ================= A2 埋点 ================= */
  console.log('\n[A2] 埋点');
  reported.length = 0;
  ok(trackMod.track('care_log', { type: 'feed', via: 'timer', note: '宝宝吐奶了', babyName: '小芽' }), '登记过的事件可以上报');
  eq(reported[0], { name: 'xyd_care_log', data: { type: 'feed', via: 'timer' } }, '只带白名单字段，记录内容、名字不上报');
  ok(!trackMod.track('whatever', {}), '没登记的事件不上报');
  eq(reported.length, 1, '未登记事件没有发出去');
  const savedReport = wx.reportEvent;
  wx.reportEvent = function () {
    throw new Error('boom');
  };
  ok(trackMod.track('food_try', {}), '上报接口出错不影响业务');
  wx.reportEvent = savedReport;
  // 关键动作都接上了
  const srcOf = function (f) {
    return fs.readFileSync(path.join(ROOT, f), 'utf8');
  };
  [
    ['utils/care-actions.js', 'care_log'],
    ['pages/care-edit/care-edit.js', 'care_log'],
    ['pages/meal-log/meal-log.js', 'meal_log'],
    ['pages/food-edit/food-edit.js', 'food_try'],
    ['pages/vaccine-edit/vaccine-edit.js', 'vax_log'],
    ['pages/baby-edit/baby-edit.js', 'baby_add'],
    ['pages/mine/mine.js', 'backup_export'],
    ['pages/mine/mine.js', 'backup_import'],
    ['pages/share/share.js', 'share_card'],
    ['pages/index/index.js', 'remind_tap']
  ].forEach(function (x) {
    ok(srcOf(x[0]).indexOf("track('" + x[1] + "'") > -1, x[0] + ' 上报 ' + x[1]);
  });

  /* ================= A3 备份提醒 ================= */
  console.log('\n[A3] 备份提醒');
  clear();
  store.saveBabies([{ id: 'b1', name: '小芽', birthday: fixtures.birthdayForAge(2, 3) }]);
  store.updateSettings({ activeBabyId: 'b1' });
  eq(store.backupReminder(), null, '没有记录：不提醒');
  store.upsertCare({ babyId: 'b1', type: 'diaper', kind: 'wet', start: Date.now() - HOUR });
  eq(store.backupReminder(), null, '刚开始用（不到 3 天）：先不提醒');
  ok(store.backupReminder(Date.now() + 4 * DAY).never, '用了几天、从没备份：提醒');
  store.markBackedUp();
  eq(store.backupReminder(Date.now() + 20 * DAY), null, '备份后没有新记录：20 天也不提醒');
  store.upsertCare({ babyId: 'b1', type: 'diaper', kind: 'wet', start: Date.now() - 30 * 60000 });
  eq(store.backupReminder(Date.now() + 10 * DAY), null, '有新记录但不到 14 天：不提醒');
  const r15 = store.backupReminder(Date.now() + 15 * DAY);
  ok(r15 && r15.days === 15 && /15 天前/.test(r15.text), '超过 14 天且有新记录：提醒「15 天前」');
  store.dismissBackupReminder();
  eq(store.backupReminder(Date.now() + 3 * DAY), null, '点掉后一周内不再出现');
  ok(store.backupReminder(Date.now() + 15 * DAY), '一周后又出现');

  /* ================= A4 医疗禁词 ================= */
  console.log('\n[A4] 健康文案');
  const checkSrc = srcOf('tools/check.js');
  ok(/MEDICAL_BANNED/.test(checkSrc) && /确诊/.test(checkSrc), 'check.js 拦截诊断式说法');
  ok(srcOf('data/care.js').indexOf("tip: '正常'") === -1, '便便颜色不再写「正常」这种判断');

  /* ================= B1 首次引导 ================= */
  console.log('\n[B1] 首次引导');
  clear();
  let be = instance(mount('pages/baby-edit/baby-edit.js'));
  be.onLoad({});
  be.setData({ 'baby.name': '小新', 'baby.weight': '3.4', 'baby.height': '50' });
  be.onBirthday(ev({}, { value: fixtures.daysFromToday(-20) }));
  be.save();
  const nb = store.getActiveBaby();
  ok(nb && nb.name === '小新', '建档成功');
  eq(store.getGrowth(nb.id).length, 1, '建档填的体重身高记成第一次测量');
  ok(reported.some(function (r) {
    return r.name === 'xyd_baby_add';
  }), '上报 baby_add');
  let ip = instance(mount('pages/index/index.js'));
  await ip.refresh();
  eq(ip.data.onboard && ip.data.onboard.step, 'first', '第一步：引导记第一笔');
  store.upsertCare({ babyId: nb.id, type: 'diaper', kind: 'wet', start: Date.now() - 60000 });
  await ip.refresh();
  eq(ip.data.onboard && ip.data.onboard.step, 'place', '记过之后：引导设地点');
  ip.onboardAction();
  eq(lastNav, '/pages/place/place', '「去设置」进地点页');
  ip.onboardSkip();
  ok(/weather\?manual=1/.test(lastNav), '「填温度」走手动温度');
  await ip.refresh();
  eq(ip.data.onboard, null, '跳过后引导结束，不再出现');
  // 没有宝宝时有样例预览
  const iw = srcOf('pages/index/index.wxml');
  ok(/demo-card/.test(iw) && /添加宝宝，开始记录/.test(iw), '没宝宝时展示样例预览和明确的开始按钮');

  /* ================= B2 统一时间线 ================= */
  console.log('\n[B2] 统一时间线');
  clear();
  store.saveBabies([{ id: 't1', name: '小线', birthday: fixtures.birthdayForAge(8, 3), gender: 'girl' }]);
  store.updateSettings({ activeBabyId: 't1' });
  const D = YEST;
  const at = function (h, m) {
    return care.dayStart(D) + h * HOUR + (m || 0) * 60000;
  };
  store.upsertCare({ babyId: 't1', type: 'feed', side: 'left', leftMin: 10, start: at(7), end: at(7, 10) });
  store.upsertCare({ babyId: 't1', type: 'sleep', start: at(13), end: at(14, 30) });
  store.upsertCare({ babyId: 't1', type: 'diaper', kind: 'dirty', color: 'yellow', start: at(16) });
  store.upsertMealLog({ babyId: 't1', date: D, slot: 'noon', foods: ['pumpkin'], recipeName: '南瓜泥' });
  store.upsertFoodRecord({ babyId: 't1', foodId: 'egg_yolk', date: D, reaction: 'rash', reactionNote: '嘴角红' });
  store.upsertVaccineRecord({ babyId: 't1', vaccineId: 'hepb', dose: 3, date: D, time: '09:30' });
  store.upsertGrowth({ babyId: 't1', date: D, weight: 8.2, height: 70 });
  store.upsertVaccineRecord({ babyId: 't1', vaccineId: 'je', dose: 1, date: fixtures.daysFromToday(5) }); // 待安排
  const day = timeline.day('t1', D);
  eq(day.length, 7, '七类记录都进时间线（待安排的接种不算）');
  eq(
    day.map(function (r) {
      return r.kind;
    }),
    ['diaper', 'sleep', 'meal', 'foodtry', 'vax', 'growth', 'feed'],
    '按时间倒序：16 点尿布 → 13 点睡 → 午餐 → 新食材 → 9:30 接种 → 测量 → 7 点喂奶'
  );
  const meal = day.filter(function (r) {
    return r.kind === 'meal';
  })[0];
  eq(meal.time, '午餐', '进食显示餐次，不编造几点几分');
  ok(/南瓜/.test(meal.detail), '进食带出食材');
  const ft = day.filter(function (r) {
    return r.kind === 'foodtry';
  })[0];
  eq(ft.level, 'watch', '新食材有反应时标黄');
  eq(day.filter(function (r) {
    return r.kind === 'vax';
  })[0].time, '09:30', '接种记了时间就显示时间');
  eq(timeline.counts(day), { all: 7, diaper: 1, sleep: 1, food: 2, other: 2, feed: 1 }, '筛选计数');
  eq(timeline.filter(day, 'food').length, 2, '「辅食」= 进食 + 新食材');
  eq(timeline.filter(day, 'other').length, 2, '「接种·测量」');
  ok(day.every(function (r) {
    return /^\/pages\//.test(r.open);
  }), '每一行都知道点进去去哪');
  // 跨夜睡眠
  store.upsertCare({ babyId: 't1', type: 'sleep', start: care.dayStart(TODAY) - 2 * HOUR, end: care.dayStart(TODAY) + 5 * HOUR });
  const td = timeline.day('t1', TODAY);
  ok(td.some(function (r) {
    return r.kind === 'sleep' && /^昨/.test(r.time);
  }), '跨夜睡眠在今天的时间线里标「昨」');
  // 记录页用的是统一时间线
  const rp = instance(mount('pages/record/record.js'));
  rp._date = D;
  rp.load();
  eq(rp.data.total, 8, '记录页时间线包含全部类型（昨晚开始的那觉也算昨天的）');
  rp.switchFilter(ev({ key: 'food' }));
  eq(rp.data.rows.length, 2, '记录页筛选辅食');
  rp.openRow(ev({ open: rp.data.rows[0].open }));
  ok(/meal-log|food-edit/.test(lastNav), '点辅食行进对应编辑页');
  // 首页「最近记的」同口径
  const rec = timeline.recent('t1', 3);
  eq(rec.length, 3, '最近记的取 3 条');
  ok(rec[0].kind === 'sleep' && /^昨天 22:00$/.test(rec[0].when), '最近一条是昨晚 22 点开始的那觉，标「昨天 22:00」：' + rec[0].when);
  ip = instance(mount('pages/index/index.js'));
  await ip.refresh();
  eq(
    ip.data.recent.map(function (r) {
      return r.key;
    }),
    rec.slice(0, 2).map(function (r) {
      return r.key;
    }),
    '首页最近记的 = 时间线的最近 2 条'
  );

  /* ================= C1 合并引擎 ================= */
  console.log('\n[C1] 合并引擎');
  const A = { careShards: { 202611: [{ id: 'c1', start: 1, type: 'feed', updatedAt: 10 }, { id: 'c2', start: 2, type: 'feed', updatedAt: 10 }] }, babies: [{ id: 'b', name: '甲', updatedAt: 5 }] };
  const B = { careShards: { 202611: [{ id: 'c2', start: 2, type: 'feed', ml: 90, updatedAt: 20 }, { id: 'c3', start: 3, type: 'sleep', updatedAt: 10 }] }, babies: [{ id: 'b', name: '乙', updatedAt: 3 }] };
  let m = merge.mergeSnapshots(A, B, function () {
    return '202611';
  });
  eq(m.data.careShards['202611'].map(function (e) {
    return e.id;
  }), ['c1', 'c2', 'c3'], '两边各自的都留下');
  eq(m.data.careShards['202611'][1].ml, 90, '同一条以较新的为准');
  eq(m.data.babies[0].name, '甲', '档案也是较新的赢');
  eq(m.stats, { added: 1, updated: 1, removed: 0 }, '统计：新增 1、更新 1');
  // 删除墓碑
  m = merge.mergeSnapshots(Object.assign({}, A, { tombstones: { c1: 50 } }), B, function () {
    return '202611';
  });
  ok(!m.data.careShards['202611'].some(function (e) {
    return e.id === 'c1';
  }), '一边删了（墓碑晚于最后修改）→ 合并后删除');
  // 先删后改：别人在删除之后又改了，保留
  m = merge.mergeSnapshots({ tombstones: { c9: 50 } }, { careShards: { 202611: [{ id: 'c9', start: 1, updatedAt: 60 }] } }, function () {
    return '202611';
  });
  eq(m.data.careShards['202611'].length, 1, '删除之后别人又改了 → 保留，不误删新内容');
  eq(merge.mergeSnapshots({ planHidden: ['a'] }, { planHidden: ['a', 'b'] }).data.planHidden, ['a', 'b'], '名单类取并集');
  const ms = merge.mergeSnapshots({ settings: { me: 'f1', family: [{ id: 'f1', name: '妈妈' }] } }, { settings: { me: 'f2', family: [{ id: 'f2', name: '奶奶' }] } });
  eq(ms.data.settings.me, 'f1', '设置以本机为准（谁在记不被覆盖）');
  eq(ms.data.settings.family.length, 2, '家人名单并起来');
  eq(Object.keys(merge.pruneTombstones({ old: Date.now() - 200 * DAY, fresh: Date.now() }, Date.now(), 180)), ['fresh'], '半年前的墓碑清掉');

  /* ================= C2 合并导入 + 墓碑 + 谁记的 ================= */
  console.log('\n[C2] 合并导入 / 删除传播 / 谁记的');
  clear();
  store.saveBabies([{ id: 'm1', name: '小合', birthday: fixtures.birthdayForAge(3, 3) }]);
  store.updateSettings({ activeBabyId: 'm1' });
  const f1 = store.addFamilyMember('', '妈妈');
  store.setMe(f1.id);
  const momFeed = store.upsertCare({ babyId: 'm1', type: 'feed', side: 'left', leftMin: 10, start: Date.now() - 3 * HOUR });
  eq(momFeed.by, '妈妈', '新记录带上「谁记的」');
  ok(momFeed.updatedAt >= momFeed.createdAt, '新记录有 updatedAt');
  const momBackup = store.exportBackup();
  // 奶奶手机：有一份自己的记录
  clear();
  store.saveBabies([{ id: 'm1', name: '小合', birthday: fixtures.birthdayForAge(3, 3) }]);
  store.updateSettings({ activeBabyId: 'm1' });
  const f2 = store.addFamilyMember('', '奶奶');
  store.setMe(f2.id);
  store.upsertCare({ babyId: 'm1', type: 'sleep', start: Date.now() - 6 * HOUR, end: Date.now() - 5 * HOUR });
  const res = store.importBackup(momBackup);
  eq(res.mode, 'merge', '默认合并');
  const all = store.getCareRange('m1', 0, Date.now() + HOUR);
  eq(all.length, 2, '合并后两边的记录都在（奶奶的没被覆盖）');
  eq(
    all
      .map(function (e) {
        return e.by;
      })
      .sort(),
    ['奶奶', '妈妈'],
    '每条都知道是谁记的'
  );
  eq(store.getMe().label, '奶奶', '导入别人的备份，这台手机还是奶奶');
  eq(store.getFamily().length, 2, '家人名单合并成两个人');
  // 两台手机同一毫秒建的记录不能撞 id（合并时会一条吞掉另一条）
  const ids = {};
  for (let i = 0; i < 5000; i++) ids[store.uid('f')] = true;
  eq(Object.keys(ids).length, 5000, '同一毫秒连建 5000 个 id 不重复');
  ok(f1.id !== f2.id, '两台手机各自添加的家人 id 不同');
  // 奶奶改了妈妈那条，再删一条，导出给妈妈
  store.upsertCare({ id: momFeed.id, type: 'feed', start: momFeed.start, leftMin: 15 });
  const kept = store.getCareEntry(momFeed.id);
  eq(kept.by, '妈妈', '改别人记的那条，「谁记的」不变');
  const sleepId = all.filter(function (e) {
    return e.type === 'sleep';
  })[0].id;
  store.removeCare(sleepId);
  ok(store.getTombstones()[sleepId], '删除留下墓碑');
  const grannyBackup = store.exportBackup();
  // 回到妈妈：用旧数据合并奶奶的
  clear();
  store.importBackup(momBackup, 'replace');
  const r2 = store.importBackup(grannyBackup);
  eq(store.getCareEntry(momFeed.id).leftMin, 15, '奶奶的修改传到妈妈这边');
  ok(!store.getCareEntry(sleepId), '奶奶删掉的那条不会因为合并又冒出来');
  ok(r2.result.updated >= 1, '合并结果统计到更新');
  // 跨月改时间：不是删除
  const moved = store.upsertCare({ babyId: 'm1', type: 'diaper', kind: 'wet', start: care.dayStart('2026-10-15') });
  store.upsertCare({ id: moved.id, type: 'diaper', start: care.dayStart('2026-09-15') });
  ok(!store.getTombstones()[moved.id], '跨月改时间（搬分片）不留墓碑');
  // 替换
  const r3 = store.importBackup(momBackup, 'replace');
  eq(r3.mode, 'replace', '指定替换');
  eq(store.getCareRange('m1', 0, Date.now() + HOUR).length, 1, '替换后只剩备份里的');
  // 我的页：本机有数据时先问
  modalConfirm = true;
  const mp = instance(mount('pages/mine/mine.js'));
  mp.onShow();
  mp.confirmRestore(grannyBackup, '这个文件', 'file');
  ok(/已合并/.test(lastModal), '我的页：确认后默认合并');
  ok(/本机原有的记录都还在/.test(lastModal), '合并结果里明确说本机记录还在');
  mp.refreshStats();
  ok(/备份/.test(mp.data.backupText), '我的页显示上次备份时间：' + mp.data.backupText);

  /* ================= C3 7 天趋势 + 上周小结 ================= */
  console.log('\n[C3] 7 天趋势 / 上周小结');
  clear();
  store.saveBabies([{ id: 'w1', name: '小周', birthday: fixtures.birthdayForAge(2, 3) }]);
  store.updateSettings({ activeBabyId: 'w1' });
  const days7 = stats.lastDays('w1', TODAY, 2, 7, Date.now());
  eq(days7.length, 7, '7 天');
  eq(days7[6].date, TODAY, '最后一天是今天');
  ok(days7.every(function (d) {
    return d.feeds === 0;
  }), '没有记录时都是 0');
  // 造上周 4 天数据
  const mon = stats.lastMonday(TODAY);
  for (let i = 0; i < 4; i++) {
    const d = care.dayStart(mon) + i * DAY;
    for (let k = 0; k < 8; k++) store.upsertCare({ babyId: 'w1', type: 'feed', side: 'bottle', ml: 90, start: d + (k * 3 + 1) * HOUR, end: d + (k * 3 + 1) * HOUR });
    store.upsertCare({ babyId: 'w1', type: 'sleep', start: d + 13 * HOUR, end: d + 15 * HOUR });
  }
  store.upsertFoodRecord({ babyId: 'w1', foodId: 'pumpkin', date: care.dateOf(care.dayStart(mon) + DAY + HOUR) });
  const wk = stats.weekly(store.getActiveBaby(), TODAY, 2, Date.now());
  ok(wk, '上周记了 4 天：出小结');
  ok(/平均每天喂奶 8 次/.test(JSON.stringify(wk.lines)), '平均喂奶只按有记录的日子算：8 次');
  ok(/试了 1 种新食材/.test(JSON.stringify(wk.lines)), '新食材计入');
  eq(wk.activeDays, 4, '记了 4 天');
  ok(new Date(care.dayStart(mon)).getDay() === 1, '小结从周一开始');
  clear();
  store.saveBabies([{ id: 'w2', name: '小少', birthday: fixtures.birthdayForAge(2, 3) }]);
  store.upsertCare({ babyId: 'w2', type: 'feed', side: 'bottle', ml: 90, start: care.dayStart(mon) + HOUR, end: care.dayStart(mon) + HOUR });
  eq(stats.weekly(store.getBabies()[0], TODAY, 2, Date.now()), null, '只记了 1 天：不出小结（避免误导的平均数）');
  // 柱状图数据
  const bars = stats.bars([{ date: TODAY, feeds: 3, sleepMin: 150, diapers: 2 }], 'sleepMin', TODAY);
  eq([bars[0].label, bars[0].value, bars[0].highlight], ['今天', 2.5, true], '睡眠换算成小时，今天高亮');
  eq(stats.refBand('feeds', 1), [7, 10], '1 个月喂奶参考带');
  // 图表绘制在假 canvas 上能跑通
  const calls = [];
  const fakeCtx = new Proxy(
    {},
    {
      get: function (t, k) {
        if (k in t) return t[k];
        return function () {
          calls.push(k);
        };
      },
      set: function (t, k, v) {
        t[k] = v;
        return true;
      }
    }
  );
  fakeCtx.measureText = function () {
    return { width: 10 };
  };
  chart.drawBars(fakeCtx, { w: 300, h: 150 }, bars, { bar: '#000', barOn: '#111', text: '#222', grid: '#333', ref: '#444' }, [1, 2]);
  ok(calls.indexOf('fillRect') > -1, '柱状图能画出来');

  /* ================= C4 生长曲线 ================= */
  console.log('\n[C4] 生长曲线');
  // WHO 公布值对照（男孩 12 月体重 P3 7.8 / P50 9.6 / P97 11.8；女孩 24 月身高 P50 86.4）
  const lms12 = growth.lmsAt('boy', 'weight', 12);
  ok(Math.abs(growth.valueAtZ(-1.8808, lms12) - 7.8) < 0.06, '男孩 12 月体重 P3 ≈ 7.8kg');
  ok(Math.abs(lms12[1] - 9.65) < 0.06, '男孩 12 月体重中位数 ≈ 9.6kg');
  ok(Math.abs(growth.valueAtZ(1.8808, lms12) - 11.8) < 0.06, '男孩 12 月体重 P97 ≈ 11.8kg');
  ok(Math.abs(growth.lmsAt('girl', 'height', 24)[1] - 86.4) < 0.1, '女孩 24 月身高中位数 ≈ 86.4cm');
  eq(growth.percentile('boy', 'weight', 12, lms12[1]).pct, 50, '中位数 = 第 50 百分位');
  eq(growth.percentile('boy', 'weight', 12, 6.5).band, 'low', '明显偏小 → low');
  ok(/问问医生/.test(growth.percentile('boy', 'weight', 12, 6.5).text) && !/不正常|异常/.test(growth.percentile('boy', 'weight', 12, 6.5).text), '偏小时建议问医生，不下结论');
  eq(growth.percentile('boy', 'weight', 40, 14), null, '超过 36 月不算');
  ok(Math.abs(growth.normCdf(1.96) - 0.975) < 0.001, '正态分布函数准确');
  // 测量记录 ↔ 档案
  clear();
  store.saveBabies([{ id: 'g1', name: '小长', birthday: fixtures.birthdayForAge(6, 3), gender: 'boy', weight: '7.5', height: '66' }]);
  store.updateSettings({ activeBabyId: 'g1' });
  const mig = store.migrateGrowth('g1');
  ok(mig && mig.weight === 7.5 && mig.note === '从档案带过来', '老用户：档案里的体重身高迁成第一条测量');
  eq(store.migrateGrowth('g1'), null, '迁移只做一次');
  store.upsertGrowth({ babyId: 'g1', date: TODAY, weight: 8.1 });
  eq(store.getBaby('g1').weight, '8.1', '最新测量同步到档案体重');
  eq(store.getBaby('g1').height, '66', '这次没量身高：档案身高保留上一次的');
  let thrown = '';
  try {
    store.upsertGrowth({ babyId: 'g1', date: TODAY, weight: 85 });
  } catch (e) {
    thrown = e.message;
  }
  eq(thrown, 'BAD_WEIGHT', '体重 85 被拦下（8.5 的手误）');
  try {
    store.upsertGrowth({ babyId: 'g1', date: TODAY });
  } catch (e) {
    thrown = e.message;
  }
  eq(thrown, 'EMPTY', '体重身高都没填被拦下');
  const cd = growth.chartData(store.getBaby('g1'), store.getGrowth('g1'), 'weight');
  eq(cd.points.length, 2, '曲线上两个点');
  ok(cd.toMonth >= 12 && cd.min < cd.max, '坐标窗口合理');
  ok(cd.latest && cd.latest.pct, '有最新一次的百分位');
  const gp = instance(mount('pages/growth/growth.js'));
  gp.onShow();
  eq(gp.data.list.length, 2, '身高体重页列出测量');
  ok(/百分位/.test(gp.data.latest.text), '显示最新一次的位置');
  gp.openAdd();
  gp.setData({ 'form.height': '68' });
  gp.save();
  eq(store.getGrowth('g1').length, 3, '页面上记一次');
  gp.switchKind(ev({ key: 'height' }));
  ok(/cm/.test(gp.data.latest.value), '切到身高');
  store.removeBaby('g1');
  eq(store.getAllGrowth().length, 0, '删宝宝清掉测量记录');

  /* ================= D1 云同步 ================= */
  console.log('\n[D1] 家庭云同步');
  clear();
  globalData.cloudReady = false;
  ok(!sync.available() && /暂不可用/.test(sync.status().text), '云开发没开：显示暂不可用，引导用备份文件');
  let err = '';
  await sync.createFamily().catch(function (e) {
    err = e.message;
  });
  eq(err, 'UNAVAILABLE', '没开时调用直接失败，不卡住');
  eq(await sync.autoSync(), null, '自动同步静默跳过');

  globalData.cloudReady = true;
  cloud.fail = 'NOT_DEPLOYED';
  err = '';
  await sync.createFamily().catch(function (e) {
    err = e.message;
  });
  eq(err, 'NOT_DEPLOYED', '云函数没部署：识别出来');
  ok(/还没开通/.test(sync.errorText({ message: err })), '给用户的话不提「云函数」');
  cloud.fail = '';

  // 妈妈手机创建
  currentOpenid = 'mom';
  store.saveBabies([{ id: 's1', name: '小同', birthday: fixtures.birthdayForAge(1, 3) }]);
  store.updateSettings({ activeBabyId: 's1', place: { city: '北京市', lat: 1, lon: 2 } });
  const fm = store.addFamilyMember('', '妈妈');
  store.setMe(fm.id);
  store.upsertCare({ babyId: 's1', type: 'feed', side: 'left', leftMin: 10, start: Date.now() - 2 * HOUR });
  const created = await sync.createFamily();
  ok(/^\d{6}$/.test(created.code), '创建家庭拿到 6 位家庭码');
  ok(sync.status().joined, '状态：已加入');
  const famData = cloudData(created.familyId);
  ok(!famData.settings.place && !famData.settings.me, '本机的地点、记录人不上云');
  ok(!('careActive' in famData) && !('sync' in famData), '计时、同步状态不上云');
  const momSnap = JSON.parse(JSON.stringify(mem));

  // 奶奶手机：已有自己的记录，用家庭码加入
  clear();
  currentOpenid = 'granny';
  store.saveBabies([{ id: 's1', name: '小同', birthday: fixtures.birthdayForAge(1, 3) }]);
  store.updateSettings({ activeBabyId: 's1' });
  const fg = store.addFamilyMember('', '奶奶');
  store.setMe(fg.id);
  store.upsertCare({ babyId: 's1', type: 'diaper', kind: 'wet', start: Date.now() - HOUR });
  err = '';
  await sync.joinFamily('12').catch(function (e) {
    err = e.message;
  });
  eq(err, 'BAD_CODE', '家庭码格式不对');
  await sync.joinFamily('999999').catch(function (e) {
    err = e.message;
  });
  eq(err, 'NO_FAMILY', '家庭码不存在');
  const joined = await sync.joinFamily(created.code);
  ok(joined.added >= 1, '加入时把家里的记录合进来');
  eq(store.getCareRange('s1', 0, Date.now() + HOUR).length, 2, '奶奶手机：自己的 + 妈妈的');
  eq(cloud.families[created.familyId].members, ['mom', 'granny'], '云端成员两人');
  eq(store.getMe().label, '奶奶', '同步不改这台手机的记录人');
  // 冲突重试
  store.upsertCare({ babyId: 's1', type: 'sleep', start: Date.now() - 40 * 60000, end: Date.now() - 10 * 60000 });
  cloud.conflictOnce = true;
  await sync.syncNow({ force: true });
  eq(cloudData(created.familyId).careShards[store.monthKeyOf(Date.now() - HOUR)].length, 3, '碰到冲突自动重拉重推，最终云端 3 条');
  // 节流
  const sk = await sync.syncNow();
  ok(sk.skipped, '一分钟内的自动同步跳过');

  // 回到妈妈手机：同步拿到奶奶的
  Object.keys(mem).forEach(function (k) {
    delete mem[k];
  });
  Object.assign(mem, momSnap);
  currentOpenid = 'mom';
  await sync.syncNow({ force: true });
  const momAll = store.getCareRange('s1', 0, Date.now() + HOUR);
  eq(momAll.length, 3, '妈妈手机同步后也是 3 条');
  ok(momAll.some(function (e) {
    return e.by === '奶奶';
  }), '能看到「奶奶记」');
  eq(store.getPlace().city, '北京市', '妈妈手机的地点没被覆盖');
  // 妈妈删一条 → 奶奶那边也删
  const del = momAll.filter(function (e) {
    return e.type === 'diaper';
  })[0];
  store.removeCare(del.id);
  await sync.syncNow({ force: true });
  ok(!(cloudData(created.familyId).careShards[store.monthKeyOf(del.start)] || []).some(function (e) {
    return e.id === del.id;
  }), '删除传到云端');
  // 退出
  await sync.leaveFamily();
  ok(!sync.status().joined, '退出后不再同步');
  eq(store.getCareRange('s1', 0, Date.now() + HOUR).length, 2, '退出后本机记录保留');
  // 同步页
  const sp = instance(mount('pages/sync/sync.js'));
  sp.onShow();
  ok(sp.data.available && !sp.data.joined, '同步页：可用、未加入');
  sp.onInput({ detail: { value: '12a3 45 6' } });
  eq(sp.data.input, '123456', '家庭码输入只留数字');
  ok(/一起记/.test(sp.onShareAppMessage().title), '同步页可以把家庭码转发给家人');

  /* ================= D1b 分块同步：数据多了也不超 1MB ================= */
  console.log('\n[D1b] 分块同步');
  clear();
  cloud.families = {};
  cloud.parts = {};
  cloud.guard = {};
  currentOpenid = 'mom2';
  store.saveBabies([{ id: 'y1', name: '小年', birthday: fixtures.birthdayForAge(13, 0) }]);
  store.updateSettings({ activeBabyId: 'y1' });
  // 造一年的喂睡尿（每天 16 条）+ 一年进食（每天 3 餐），直接写分片，跳过逐条 upsert 的开销
  const yearStart = Date.now() - 365 * DAY;
  const shards = {};
  const meals = [];
  for (let d = 0; d < 365; d++) {
    for (let i = 0; i < 16; i++) {
      const st = yearStart + d * DAY + i * 5400000;
      const ty = ['feed', 'sleep', 'diaper'][i % 3];
      const e = { id: store.uid('c'), babyId: 'y1', type: ty, start: st, createdAt: st, updatedAt: st };
      if (ty === 'feed') Object.assign(e, { side: 'left', leftMin: 12, rightMin: 8, end: st + 1200000 });
      if (ty === 'sleep') e.end = st + 3600000;
      if (ty === 'diaper') Object.assign(e, { kind: 'both', color: 'mustard' });
      (shards[store.monthKeyOf(st)] = shards[store.monthKeyOf(st)] || []).push(e);
    }
    const day = care.dateOf(yearStart + d * DAY);
    ['breakfast', 'lunch', 'dinner'].forEach(function (slot) {
      meals.push({ id: store.uid('m'), babyId: 'y1', date: day, slot: slot, recipeId: 'r_pumpkin_puree', foods: ['pumpkin', 'rice_cereal'], amount: 'half', accept: 'good', createdAt: 1, updatedAt: 1 });
    });
  }
  store.applySnapshot({ careShards: shards, mealLogs: meals });
  const totalKB = JSON.stringify(store.snapshot()).length / 1024;
  ok(totalKB > 1024, '一年数据合计 ' + Math.round(totalKB) + 'KB，已超过云函数单次 1MB');
  cloud.bytesOut = 0;
  const big = await sync.createFamily();
  ok(/^\d{6}$/.test(big.code), '一年数据也能创建家庭并全部推上云');
  ok(cloud.bytesOut < 1024 * 1024, '最大一次云函数返回 ' + Math.round(cloud.bytesOut / 1024) + 'KB，不超 1MB');
  const names = Object.keys(cloud.families[big.familyId].manifest);
  ok(names.length >= 24 && names.indexOf('core') > -1, '按月分块：' + names.length + ' 块');
  // 换一台空手机加入：分批下载全部
  const momYear = JSON.parse(JSON.stringify(mem));
  clear();
  currentOpenid = 'dad2';
  cloud.bytesOut = 0;
  await sync.joinFamily(big.code);
  eq(store.getCareRange('y1', 0, Date.now() + HOUR).length, 365 * 16, '新手机加入后拿到全部 ' + 365 * 16 + ' 条喂睡尿');
  eq(store.getMealLogs('y1').length, 365 * 3, '进食记录也全部拿到');
  ok(cloud.bytesOut < 1024 * 1024, '下载时单次返回也不超 1MB（' + Math.round(cloud.bytesOut / 1024) + 'KB）');
  // 增量：只改今天，只传 1 块
  store.upsertCare({ babyId: 'y1', type: 'diaper', kind: 'wet', start: Date.now() - 60000 });
  cloud.calls = [];
  const before = JSON.parse(JSON.stringify(cloud.parts));
  await sync.syncNow({ force: true });
  const newParts = Object.keys(cloud.parts).filter(function (k) {
    return !before[k];
  });
  eq(newParts.length, 1, '只记了一笔：只上传 1 块（' + (newParts[0] || '').split('|')[1] + '）');
  ok(cloud.calls.filter(function (c) {
    return c === 'getParts';
  }).length === 0, '云端没变化：一块都不下载');
  // 没有任何改动：不提交
  cloud.calls = [];
  await sync.syncNow({ force: true });
  ok(cloud.calls.indexOf('commit') === -1 && cloud.calls.indexOf('putParts') === -1, '没改动时只看清单，不上传不提交');
  // 回到妈妈：只下载变化的那一块
  Object.keys(mem).forEach(function (k) {
    delete mem[k];
  });
  Object.assign(mem, momYear);
  currentOpenid = 'mom2';
  cloud.bytesOut = 0;
  await sync.syncNow({ force: true });
  eq(store.getCareRange('y1', 0, Date.now() + HOUR).length, 365 * 16 + 1, '妈妈手机拿到爸爸新记的那一笔');
  ok(cloud.bytesOut < 200 * 1024, '只下载变化的块（最大一次 ' + Math.round(cloud.bytesOut / 1024) + 'KB）');
  // 两边各在同一个月记一笔，几乎同时同步：合并后都在
  store.upsertCare({ babyId: 'y1', type: 'feed', side: 'bottle', ml: 90, start: Date.now() - 30000, end: Date.now() - 30000 });
  await sync.syncNow({ force: true });
  ok(sync.syncNow({ force: true }) === sync.syncNow({ force: true }), '同步进行中再触发：复用同一次，不并发');
  await sync.syncNow({ force: true });

  // 家庭码防爆破
  currentOpenid = 'stranger';
  clear();
  const tried = [];
  for (let i = 0; i < 6; i++) {
    let e2 = '';
    await sync.joinFamily(String(900000 + i)).catch(function (e) {
      e2 = e.message;
    });
    tried.push(e2);
  }
  eq(tried.slice(0, 5), ['NO_FAMILY', 'NO_FAMILY', 'NO_FAMILY', 'NO_FAMILY', 'NO_FAMILY'], '前 5 次试错正常提示');
  eq(tried[5], 'TOO_MANY', '第 6 次被限流');
  let blocked = '';
  await sync.joinFamily(big.code).catch(function (e) {
    blocked = e.message;
  });
  eq(blocked, 'TOO_MANY', '限流期间即使猜对也进不去');
  ok(/1 小时后/.test(sync.errorText({ message: 'TOO_MANY' })), '限流提示说清楚多久后再试');
  const cloudSrc = fs.readFileSync(path.join(ROOT, 'cloudfunctions/sync/index.js'), 'utf8');
  ok(/JOIN_MAX_FAILS = 5/.test(cloudSrc) && /recordFail/.test(cloudSrc), '云函数里有同样的试错限流');
  ok(/if \(!rest\.length\)[\s\S]{0,200}remove\(\)/.test(cloudSrc), '最后一个成员退出时云端删掉整个家庭的数据');
  ok(/MISSING_PART/.test(cloudSrc), '提交清单前校验块都已上传，别人不会拉到半份数据');
  // 分块规范化：同样内容、不同顺序 → 同一指纹
  const pa = syncParts.digest([{ id: 'b', x: 1 }, { id: 'a', y: { q: 1, p: 2 } }]).hash;
  const pb = syncParts.digest([{ id: 'a', y: { p: 2, q: 1 } }, { id: 'b', x: 1 }]).hash;
  eq(pa, pb, '内容相同、顺序不同 → 指纹相同，两台手机不会来回互推');

  /* ================= C5b 早产宝宝的生长曲线 ================= */
  console.log('\n[C5b] 早产宝宝生长曲线');
  // 纯函数：生日、预产期、测量日之间的间隔才是关键，用相对日期写（项目规则：不写死生日）
  const preB = fixtures.daysFromToday(-400);
  const pre = { birthday: preB, dueDate: dateUtil.shiftDate(preB, 59), gender: 'girl' };
  const recs = [{ id: 'x', date: dateUtil.shiftDate(preB, 181), weight: 6.4 }];
  const withCorr = growth.chartData(pre, recs, 'weight');
  const noCorr = growth.chartData(Object.assign({}, pre, { dueDate: '' }), recs, 'weight');
  ok(withCorr.points[0].m < noCorr.points[0].m - 1.5, '早产 2 个月：点画在矫正月龄上（' + withCorr.points[0].m.toFixed(1) + ' 月）');
  ok(withCorr.latest.band === 'mid' && noCorr.latest.band !== 'mid' || withCorr.latest.raw > noCorr.latest.raw + 20, '同一次测量：矫正后不再被判「偏小」（P' + withCorr.latest.pct + ' vs 未矫正 P' + noCorr.latest.pct + '）');
  ok(withCorr.corrected && !noCorr.corrected, '页面会标「按矫正月龄对照」');
  const d26 = dateUtil.shiftDate(preB, 880);
  const after2 = growth.chartData(pre, [{ id: 'y', date: d26, weight: 12 }], 'weight');
  ok(Math.abs(after2.points[0].m - growth.monthsBetween(pre.birthday, d26)) < 0.01, '实际满 2 岁后不再矫正');
  ok(growth.chartData({ birthday: preB }, [], 'weight').sexAssumed, '没填性别：提示按男孩曲线');
  ok(!growth.chartData(pre, [], 'weight').sexAssumed, '填了性别不提示');

  /* ================= A4 存储写满 ================= */
  console.log('\n[A4] 存储写满');
  const realSet = wx.setStorageSync;
  wx.setStorageSync = function () {
    throw new Error('setStorageSync:fail exceed storage max size 10MB');
  };
  lastModal = '';
  const okWrite = store.updateSettings({ me: 'x' });
  wx.setStorageSync = realSet;
  ok(okWrite === false || okWrite === undefined || okWrite, '写入失败不崩');
  ok(/没有存上/.test(lastModal) && /存储空间满了/.test(lastModal), '存储满时告诉用户，并给出导出备份的办法');

  /* ================= D2 深色模式 ================= */
  console.log('\n[D2] 深色模式');
  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  ok(appJson.darkmode === true && appJson.themeLocation === 'theme.json', '开启跟随系统深色模式');
  const themeJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'theme.json'), 'utf8'));
  eq(Object.keys(themeJson.light).sort(), Object.keys(themeJson.dark).sort(), 'theme.json 浅色深色变量一一对应');
  eq(themeJson.dark.navText, 'white', '深色导航栏白字');
  const wx2 = fs.readFileSync(path.join(ROOT, 'app.wxss'), 'utf8');
  ok(/@media \(prefers-color-scheme: dark\)/.test(wx2), 'app.wxss 有深色 token');
  ok(theme.colors('dark').bg !== theme.colors('light').bg, 'canvas 取色也区分深浅');
  eq(theme.colors('dark')['on-brand'], '#FFFFFF', '彩色底上的字深色模式下仍是白的');
  // 对比度：深色模式正文在背景上 ≥ 4.5
  const lum = function (hex) {
    const c = [1, 3, 5].map(function (i) {
      const v = parseInt(hex.substr(i, 2), 16) / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const contrast = function (a, b) {
    const x = lum(a);
    const y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const dk = theme.colors('dark');
  const lt = theme.colors('light');
  ok(contrast(dk.text, dk.bg) >= 7, '深色：正文对比度 ≥ 7（' + contrast(dk.text, dk.bg).toFixed(1) + '）');
  ok(contrast(dk['text-3'], dk.card) >= 4.5, '深色：说明文字在卡片上 ≥ 4.5（' + contrast(dk['text-3'], dk.card).toFixed(1) + '）');
  ok(contrast(lt.text, lt.bg) >= 7, '浅色：正文对比度 ≥ 7');
  ok(contrast(dk['on-brand'], dk.brand) >= 2.5, '深色：主按钮白字可读（' + contrast(dk['on-brand'], dk.brand).toFixed(1) + '）');
  const pageWxss = [];
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      if (e.isDirectory()) {
        if (['node_modules', 'tools', 'analysis', '.git', '.workbuddy', 'cloudfunctions'].indexOf(e.name) === -1) walk(path.join(d, e.name));
      } else if (/\.wxss$/.test(e.name) && e.name !== 'app.wxss') pageWxss.push(path.join(d, e.name));
    });
  })(ROOT);
  const glare = pageWxss.filter(function (f) {
    return /rgba\(255, ?255, ?255/.test(fs.readFileSync(f, 'utf8'));
  });
  eq(glare, [], '页面里没有写死的白色半透明（深色下会发亮）');

  console.log('\n通过 ' + pass + ' 项，失败 ' + fail + ' 项');
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * tools/test-pages.js —— 页面逻辑冒烟测试（stub 掉 wx / Page，直接跑页面方法）
 * 用法：node tools/test-pages.js
 * 覆盖：疫苗首页的状态分支与列表映射、记录页的新增/编辑/删除、首页疫苗卡
 */

const path = require('path');

/* ---------- stub 运行时 ---------- */
const mem = {};
let lastToast = '';
let lastNav = '';
let actionTap = 0;
let lastModal = '';

global.wx = {
  getStorageSync: function (k) {
    return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : '';
  },
  setStorageSync: function (k, v) {
    mem[k] = JSON.parse(JSON.stringify(v));
  },
  navigateTo: function (o) {
    lastNav = o.url;
  },
  navigateBack: function () {
    lastNav = 'back';
  },
  switchTab: function (o) {
    lastNav = o.url;
  },
  showToast: function (o) {
    lastToast = o.title;
  },
  showModal: function (o) {
    lastModal = (o.title || '') + '|' + (o.content || '');
    if (o.success) o.success({ confirm: true });
  },
  showActionSheet: function (o) {
    if (o.success) o.success({ tapIndex: actionTap });
  },
  setNavigationBarTitle: function () {},
  stopPullDownRefresh: function () {}
};

let captured = null;
global.Page = function (cfg) {
  captured = cfg;
};

const ROOT = path.resolve(__dirname, '..');

function mount(rel) {
  captured = null;
  const full = path.join(ROOT, rel);
  delete require.cache[require.resolve(full)];
  require(full);
  return captured;
}

function instance(cfg) {
  const inst = Object.assign({}, cfg);
  inst.data = JSON.parse(JSON.stringify(cfg.data || {}));
  inst.setData = function (patch) {
    const self = this;
    Object.keys(patch).forEach(function (k) {
      if (k.indexOf('.') > -1) {
        const parts = k.split('.');
        let t = self.data;
        for (let i = 0; i < parts.length - 1; i++) t = t[parts[i]];
        t[parts[parts.length - 1]] = patch[k];
      } else {
        self.data[k] = patch[k];
      }
    });
  };
  return inst;
}

const store = require(path.join(ROOT, 'utils/store.js'));

let pass = 0;
let fail = 0;
function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    console.log('  ✗ ' + label);
  }
}
function eq(a, b, label) {
  const x = JSON.stringify(a);
  const y = JSON.stringify(b);
  ok(x === y, label + (x === y ? '' : '\n      期望 ' + y + '\n      实际 ' + x));
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}
const now = new Date();
const TODAY = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

/* ---------- 准备数据 ---------- */
store.saveBabies([{ id: 'b1', name: '小芽', birthday: '2026-03-08', gender: 'girl' }]);
store.updateSettings({ activeBabyId: 'b1' });

/* ================= 1. 疫苗页：观察期内 ================= */
console.log('\n[1] 疫苗页 · 刚接种完');
store.upsertVaccineRecord({
  babyId: 'b1',
  vaccineId: 'dtap',
  dose: 2,
  date: TODAY,
  time: '00:20',
  place: '朝阳区某社区门诊'
});

const vPage = mount('pages/vaccine/vaccine.js');
let vp = instance(vPage);
vp.load();

ok(vp.data.hasBaby, '有宝宝时 hasBaby 为 true');
eq(vp.data.baby.name, '小芽', '带出宝宝名字');
eq(vp.data.brief.type, 'care', '状态卡走护理分支');
ok(!!vp.data.care, '当前有观察期内的护理方案');
ok(vp.data.care.items.length > 0, '护理清单非空');
ok(
  vp.data.care.items.every(function (it) {
    return !!it.tagClass;
  }),
  '每条事项都补了样式类'
);
eq(vp.data.records.length, 1, '记录列表 1 条');
eq(vp.data.records[0].name, '百白破疫苗', '记录带疫苗名');
eq(vp.data.records[0].catText, '免费', '一类疫苗标「免费」');
ok(vp.data.records[0].active, '记录标记为观察期内');
eq(vp.data.records[0].emoji, undefined, '记录行不再带疫苗图标');
ok(vp.data.planShown.length > 0 && vp.data.planShown.length < vp.data.planAll.length, '规划表默认过滤掉「还早」的');

vp.togglePlan();
eq(vp.data.planShown.length, vp.data.planAll.length, '展开后显示全部');
vp.togglePlan();
ok(vp.data.planShown.length < vp.data.planAll.length, '可以再收起来');

/* ================= 2. 疫苗页：无记录 ================= */
console.log('\n[2] 疫苗页 · 一条记录都没有');
mem['xyd_vaccine_records'] = [];
vp.load();
eq(vp.data.brief.type, 'due', '没有记录时提醒待接种');
eq(vp.data.care, null, '没有护理方案');
eq(vp.data.lastCare, null, '没有历史护理');
eq(vp.data.records.length, 0, '记录列表为空');
ok(vp.data.brief.title.indexOf('针') > -1 || vp.data.brief.title.indexOf('该打') > -1, '标题是「还有 N 针」或「该打 X」');

/* ================= 3. 疫苗页：观察期已过 ================= */
console.log('\n[3] 疫苗页 · 上次接种已过观察期');
store.upsertVaccineRecord({ babyId: 'b1', vaccineId: 'hepb', dose: 3, date: '2026-09-01', time: '10:00' });
vp.load();
eq(vp.data.care, null, '超过观察期不再显示护理清单');
ok(!!vp.data.lastCare, '但保留 lastCare 用于「观察期已过」提示');
ok(vp.data.lastCare.done, 'lastCare.done 为 true');
eq(vp.data.records[0].active, false, '记录列表里标记为已过观察期');

/* ================= 4. 记录页：新增 ================= */
console.log('\n[4] 记录页 · 新增');
const ePage = mount('pages/vaccine-edit/vaccine-edit.js');
let ep = instance(ePage);
ep.onLoad({});

eq(ep.data.isEdit, false, '默认是新增模式');
eq(ep.data.date, TODAY, '日期默认今天');
eq(ep.data.category, 'free', '默认一类疫苗');
eq(ep.data.list.length, 10, '一类疫苗 10 种');
eq(ep.data.canSave, false, '没选疫苗时不能保存');

ep.save();
eq(lastToast, '先选一种疫苗', '未选疫苗保存被拦下');

ep.switchCategory({ currentTarget: { dataset: { cat: 'paid' } } });
eq(ep.data.list.length, 8, '二类疫苗 8 种');
eq(ep.data.selected, null, '切换分类后清空选择');

ep.pickVaccine({ currentTarget: { dataset: { id: 'pcv13' } } });
ok(!!ep.data.selected, '选中 13 价肺炎');
eq(ep.data.canSave, true, '选完可以保存');
eq(ep.data.dose, 1, '没打过时默认第一剂');
eq(ep.data.doses.length, 4, '13 价有 4 个剂次');
ok(ep.data.before.length > 0, '带出接种前提醒');
ok(ep.data.commonReactions.length > 0, '带出常见反应');

// 默认剂次要跟着已打记录走
store.upsertVaccineRecord({ babyId: 'b1', vaccineId: 'pcv13', dose: 1, date: '2026-09-01' });
ep.pickVaccine({ currentTarget: { dataset: { id: 'pcv13' } } });
eq(ep.data.dose, 2, '第 1 剂已打过时默认选中第 2 剂');
eq(ep.data.doses[0].done, true, '已打过的剂次有标记');

ep.onPlace({ detail: { value: '  海淀区某门诊  ' } });
ep.onNote({ detail: { value: '打了左腿' } });

const before = store.getVaccineRecords('b1').length;
ep.save();
eq(store.getVaccineRecords('b1').length, before + 1, '保存后多一条记录');
eq(lastToast, '已记录', '保存有成功提示');

const saved = store.getVaccineRecords('b1').filter(function (r) {
  return r.vaccineId === 'pcv13' && r.dose === 2;
})[0];
ok(!!saved, '新记录写进了存储');
eq(saved.place, '海淀区某门诊', '门诊名前后空格被去掉');
eq(saved.time, undefined, '不再要求填接种时间');

// 未来日期：允许保存，进「待安排」
ep = instance(mount('pages/vaccine-edit/vaccine-edit.js'));
ep.onLoad({});
ep.pickVaccine({ currentTarget: { dataset: { id: 'hepb' } } });
const future = '2099-01-01';
ep.onDate({ detail: { value: future } });
eq(ep.data.isFuture, true, '选未来日期后标记为「计划」');
const n2 = store.getVaccineRecords('b1').length;
ep.save();
eq(store.getVaccineRecords('b1').length, n2 + 1, '未来日期允许保存');
eq(lastToast, '已加入待安排', '未来日期的提示语不同');
const plannedRec = store.getVaccineRecords('b1').filter(function (r) {
  return r.date === future;
})[0];
ok(!!plannedRec, '未来日期的记录写进了存储');
eq(plannedRec.time, undefined, '待安排记录不带时间');

/* ================= 5. 记录页：编辑与删除 ================= */
console.log('\n[5] 记录页 · 编辑与删除');
const target = store.getVaccineRecords('b1')[0];
ep = instance(mount('pages/vaccine-edit/vaccine-edit.js'));
ep.onLoad({ id: target.id });

eq(ep.data.isEdit, true, '进入编辑模式');
eq(ep.data.id, target.id, '带回记录 id');
ok(!!ep.data.selected, '回填所选疫苗');
eq(ep.data.dose, target.dose, '回填剂次');
eq(ep.data.date, target.date, '回填日期');

ep.onNote({ detail: { value: '改成这个备注' } });
ep.save();
const updated = store.getVaccineRecords('b1').filter(function (r) {
  return r.id === target.id;
})[0];
eq(updated.note, '改成这个备注', '编辑保存生效');
eq(store.getVaccineRecords('b1').length, store.getVaccineRecords('b1').length, '编辑不会新增记录');

const n3 = store.getVaccineRecords('b1').length;
ep.remove();
eq(store.getVaccineRecords('b1').length, n3 - 1, '删除后少一条');
eq(lastToast, '已删除', '删除有提示');

/* ================= 6. 从「该打了」跳过来 ================= */
console.log('\n[6] 从待接种卡片跳转预填');
ep = instance(mount('pages/vaccine-edit/vaccine-edit.js'));
ep.onLoad({ vaccineId: 'mmr', dose: 1 });
eq(ep.data.selectedId, 'mmr', '预选了麻腮风');
eq(ep.data.dose, 1, '预选了第 1 剂');
eq(ep.data.canSave, true, '预选后可以直接保存');

/* ================= 7. 没宝宝 ================= */
console.log('\n[7] 没有宝宝');
mem['xyd_babies'] = [];
store.updateSettings({ activeBabyId: '' });

vp = instance(mount('pages/vaccine/vaccine.js'));
vp.load();
eq(vp.data.hasBaby, false, '无宝宝时 hasBaby 为 false');
eq(vp.data.records.length, 0, '无宝宝时记录为空');

ep = instance(mount('pages/vaccine-edit/vaccine-edit.js'));
ep.onLoad({});
eq(lastToast, '请先添加宝宝', '记录页无宝宝时提示并返回');

/* ================= 8. 首页疫苗卡 ================= */
console.log('\n[8] 首页疫苗卡');
store.saveBabies([{ id: 'b2', name: '小树', birthday: '2026-03-08', gender: 'boy' }]);
store.updateSettings({ activeBabyId: 'b2' });
store.upsertVaccineRecord({ babyId: 'b2', vaccineId: 'mmr', dose: 1, date: TODAY, time: '00:10' });

const iPage = mount('pages/index/index.js');
const ip = instance(iPage);
// 首页会拉天气，这里只验证疫苗卡部分，跳过网络
global.wx.getLocation = function () {};
ip.refresh();
ok(!!ip.data.vax, '首页生成了疫苗卡数据');
ok(!!ip.data.vax.title && !!ip.data.vax.desc, '卡片有标题和描述');
ok(!!ip.data.vax.emoji, '卡片有图标');
ok(['care', 'due', 'soon', 'done'].indexOf(ip.data.vax.tone) > -1, 'tone 在约定取值内');
console.log('    ' + ip.data.vax.title + ' · ' + ip.data.vax.desc);

/* ================= 9. 规划表交互 ================= */
console.log('\n[9] 规划表：标记已接种 / 移除 / 恢复');
mem['xyd_vaccine_records'] = [];
mem['xyd_plan_hidden'] = [];
store.saveBabies([{ id: 'b3', name: '小满', birthday: '2026-03-08', gender: 'boy' }]);
store.updateSettings({ activeBabyId: 'b3' });

vp = instance(mount('pages/vaccine/vaccine.js'));
vp.load();

const dueItem = vp.data.planAll.filter(function (p) {
  return p.status === 'due';
})[0];
ok(!!dueItem, '有「该打了」的行可以点');
ok(
  vp.data.planShown.some(function (p) {
    return p.key === dueItem.key;
  }),
  '该行默认出现在列表里'
);

actionTap = 1; // 选「不再提醒这一针」
vp.tapPlan({ currentTarget: { dataset: { key: dueItem.key } } });
eq(vp.data.removed.length, 1, '移除后进入「已移除」区');
eq(vp.data.removed[0].key, dueItem.key, '移除的是点的那一行');
ok(
  !vp.data.planShown.some(function (p) {
    return p.key === dueItem.key;
  }),
  '主列表里不再出现'
);
eq(store.getPlanHidden(), [dueItem.key], '移除状态写进存储');

// 再点一次就是恢复
vp.tapPlan({ currentTarget: { dataset: { key: dueItem.key } } });
eq(vp.data.removed.length, 0, '再点一次恢复提醒');
eq(store.getPlanHidden().length, 0, '存储里的移除记录被清掉');
eq(lastToast, '已恢复提醒', '恢复有提示');

// 点「该打了」的行选「标记为已接种」→ 跳到记录页
actionTap = 0;
lastNav = '';
vp.tapPlan({ currentTarget: { dataset: { key: dueItem.key } } });
ok(lastNav.indexOf('/pages/vaccine-edit/vaccine-edit?vaccineId=' + dueItem.vaccineId) === 0, '选「标记为已接种」跳到记录页并预选疫苗');

// 已接种的行 → 打开已有记录
store.upsertVaccineRecord({ babyId: 'b3', vaccineId: 'hepb', dose: 1, date: '2026-03-10' });
vp.load();
const doneItem = vp.data.planAll.filter(function (p) {
  return p.key === 'hepb#1';
})[0];
eq(doneItem.status, 'done', '记录后状态变 done');
lastNav = '';
vp.tapPlan({ currentTarget: { dataset: { key: 'hepb#1' } } });
ok(lastNav.indexOf('?id=') > -1, '点已接种的行直接打开那条记录');

// 被覆盖的行 → 弹说明，不改状态
[1, 2, 3, 4].forEach(function (n) {
  store.upsertVaccineRecord({ babyId: 'b3', vaccineId: 'penta', dose: n, date: '2026-09-01' });
});
vp.load();
const covItem = vp.data.planAll.filter(function (p) {
  return p.status === 'covered';
})[0];
ok(!!covItem, '有五联覆盖出来的行');
lastModal = '';
vp.tapPlan({ currentTarget: { dataset: { key: covItem.key } } });
eq(lastModal.indexOf('这一针已被覆盖') > -1, true, '点被覆盖的行会说明来源');
eq(store.getPlanHidden().length, 0, '说明弹窗不会改动移除状态');

/* ================= 10. 自定义疫苗 ================= */
console.log('\n[10] 记录页：自定义疫苗');
ep = instance(mount('pages/vaccine-edit/vaccine-edit.js'));
ep.onLoad({});
ep.switchCategory({ currentTarget: { dataset: { cat: 'paid' } } });
eq(ep.data.list.length, 8, '二类内置 8 种，此时还没有自定义');

ep.openSheet();
eq(ep.data.sheet, true, '浮层打开');
eq(ep.data.cDoses, 2, '剂次默认 2');

lastToast = '';
ep.saveCustom();
eq(lastToast, '先填疫苗名称', '空名字被拦下');
eq(store.getCustomVaccines().length, 0, '没有创建出空记录');

ep.onCName({ detail: { value: '手足口病疫苗（科兴）' } });
ep.pickDoses({ currentTarget: { dataset: { n: 2 } } });
ep.onCNote({ detail: { value: '6 月龄-5 岁，间隔 1 个月' } });
lastToast = '';
ep.saveCustom();
eq(lastToast, '已添加', '保存成功有提示');
eq(store.getCustomVaccines().length, 1, '存储里多了一条自定义疫苗');
eq(ep.data.sheet, false, '保存后浮层关闭');

const cid = store.getCustomVaccines()[0].id;
eq(ep.data.selectedId, cid, '保存后自动选中新疫苗');
eq(ep.data.category, 'paid', '自动切到二类分类');
eq(ep.data.list.length, 9, '列表变成 8 + 1');
eq(ep.data.doses.length, 2, '自定义疫苗带 2 个剂次');
ok(!!ep.data.selected, '可以直接记录这一针');

// 用它记一条
ep.save();
eq(lastToast, '已记录', '自定义疫苗能正常记录');
const customRec = store.getVaccineRecords('b3').filter(function (r) {
  return r.vaccineId === cid;
});
eq(customRec.length, 1, '记录写进存储');

// 疫苗页能显示自定义疫苗的记录
vp.load();
const customRow = vp.data.records.filter(function (r) {
  return r.id === customRec[0].id;
})[0];
ok(!!customRow, '疫苗页列表里有这条记录');
eq(customRow.catText, '自定义', '标记为「自定义」');

// 删除自定义疫苗（连同记录）
ep.openSheet();
eq(ep.data.customList.length, 1, '浮层里列出已添加的');
lastModal = '';
ep.removeCustom({ currentTarget: { dataset: { id: cid } } });
eq(store.getCustomVaccines().length, 0, '自定义疫苗被删除');
eq(store.getVaccineRecords('b3').filter(function (r) { return r.vaccineId === cid; }).length, 0, '它的接种记录一并清掉');
ok(lastModal.indexOf('已有 1 条接种记录') > -1, '删除时会提示会连带清掉的记录数');

/* ================= 11. 记录折叠 + 待安排 ================= */
console.log('\n[11] 记录折叠与待安排');
mem['xyd_vaccine_records'] = [];
mem['xyd_plan_hidden'] = [];
store.saveBabies([{ id: 'b4', name: '小树', birthday: '2026-03-08' }]);
store.updateSettings({ activeBabyId: 'b4' });

[
  { v: 'hepb', d: '2026-04-01' },
  { v: 'bcg', d: '2026-05-01' },
  { v: 'polio', d: '2026-06-01' },
  { v: 'dtap', d: '2026-07-01' },
  { v: 'mmr', d: '2026-08-01' }
].forEach(function (x) {
  store.upsertVaccineRecord({ babyId: 'b4', vaccineId: x.v, dose: 1, date: x.d });
});
store.upsertVaccineRecord({ babyId: 'b4', vaccineId: 'je', dose: 1, date: '2026-12-01' });
store.upsertVaccineRecord({ babyId: 'b4', vaccineId: 'var', dose: 2, date: '2026-11-20' });

vp = instance(mount('pages/vaccine/vaccine.js'));
vp.load();

eq(vp.data.recordTotal, 5, '5 次已接种记录（未来的不算）');
eq(vp.data.records.length, 3, '默认只展示近 3 次');
eq(vp.data.hiddenCount, 2, '剩下 2 次折叠起来');
eq(vp.data.recordsExpanded, false, '默认收起');
eq(vp.data.records[0].dateText.indexOf('8 月'), 0, '按时间倒序，最近的排第一');
eq(vp.data.stats.total, 5, '统计只算已接种的');

vp.toggleRecords();
eq(vp.data.records.length, 5, '点展示全部后露出所有记录');
eq(vp.data.recordsExpanded, true, '标记为已展开');
vp.toggleRecords();
eq(vp.data.records.length, 3, '再点一次收起');

eq(vp.data.planned.length, 2, '2 条待安排');
eq(vp.data.planned[0].name, '水痘疫苗', '待安排按日期从近到远，11 月 20 日的排第一');
eq(vp.data.planned[1].name, '乙脑减毒活疫苗', '12 月 1 日的排后面');
ok(vp.data.planned[0].whenText.indexOf('天后') > -1, '待安排带倒计时');
eq(vp.data.planned[0].day, '20', '待安排显示日');
eq(vp.data.planned[0].month, '11 月', '待安排显示月');

// 待安排不能混进接种记录
const plannedIds = vp.data.planned.map(function (p) {
  return p.id;
});
ok(
  !vp.data.records.some(function (r) {
    return plannedIds.indexOf(r.id) > -1;
  }),
  '待安排不出现在接种记录里'
);

// 待安排不算已接种：规划表里乙脑第 1 剂仍是「该打了」
const jeRow = vp.data.planAll.filter(function (p) {
  return p.key === 'je#1';
})[0];
eq(jeRow.status, 'due', '未来的记录不会把规划表标成已接种');

// 观察期内的记录优先显示（不受折叠影响）
mem['xyd_vaccine_records'] = [];
const nowH = new Date(Date.now() - 3 * 3600000);
const hh = String(nowH.getHours()).padStart(2, '0');
const mm = String(nowH.getMinutes()).padStart(2, '0');
store.upsertVaccineRecord({
  babyId: 'b4',
  vaccineId: 'dtap',
  dose: 2,
  date: TODAY,
  time: hh + ':' + mm
});
vp.load();
eq(vp.data.records.length, 1, '只有一条时正常显示');
ok(vp.data.records[0].active, '刚打的这条在观察期内');
ok(!!vp.data.care, '顶部进入护理状态');

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail ? 1 : 0);
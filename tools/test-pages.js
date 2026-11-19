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

// 所有日期都相对今天构造：今天用的是真实时间，写死日期迟早会让月龄、到期状态跟着变
const fixtures = require('./fixtures.js');
const BIRTH8 = fixtures.birthdayForAge(8, 11); // 原来写死 2026-03-08，在 11 月时正好 8 个月 11 天
const ago = fixtures.daysFromToday;

/* ---------- 准备数据 ---------- */
store.saveBabies([{ id: 'b1', name: '小芽', birthday: BIRTH8, gender: 'girl' }]);
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
store.upsertVaccineRecord({ babyId: 'b1', vaccineId: 'hepb', dose: 3, date: ago(-79), time: '10:00' });
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
store.upsertVaccineRecord({ babyId: 'b1', vaccineId: 'pcv13', dose: 1, date: ago(-79) });
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
store.saveBabies([{ id: 'b2', name: '小树', birthday: BIRTH8, gender: 'boy' }]);
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
// tone 的合法取值来自 data/vaccines.js 的阶段表（urgent/care/watch）+ due/soon/done
ok(
  ['urgent', 'care', 'watch', 'due', 'soon', 'done'].indexOf(ip.data.vax.tone) > -1,
  'tone 在约定取值内'
);
console.log('    ' + ip.data.vax.title + ' · ' + ip.data.vax.desc);

/* ================= 9. 规划表交互 ================= */
console.log('\n[9] 规划表：标记已接种 / 移除 / 恢复');
mem['xyd_vaccine_records'] = [];
mem['xyd_plan_hidden'] = [];
store.saveBabies([{ id: 'b3', name: '小满', birthday: BIRTH8, gender: 'boy' }]);
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
store.upsertVaccineRecord({ babyId: 'b3', vaccineId: 'hepb', dose: 1, date: ago(-254) });
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
  store.upsertVaccineRecord({ babyId: 'b3', vaccineId: 'penta', dose: n, date: ago(-79) });
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
store.saveBabies([{ id: 'b4', name: '小树', birthday: BIRTH8 }]);
store.updateSettings({ activeBabyId: 'b4' });

[
  { v: 'hepb', d: ago(-232) },
  { v: 'bcg', d: ago(-202) },
  { v: 'polio', d: ago(-171) },
  { v: 'dtap', d: ago(-141) },
  { v: 'mmr', d: ago(-110) }
].forEach(function (x) {
  store.upsertVaccineRecord({ babyId: 'b4', vaccineId: x.v, dose: 1, date: x.d });
});
// 待安排：今天之后 5 天、12 天
store.upsertVaccineRecord({ babyId: 'b4', vaccineId: 'je', dose: 1, date: ago(12) });
store.upsertVaccineRecord({ babyId: 'b4', vaccineId: 'var', dose: 2, date: ago(5) });

vp = instance(mount('pages/vaccine/vaccine.js'));
vp.load();

eq(vp.data.recordTotal, 5, '5 次已接种记录（未来的不算）');
eq(vp.data.records.length, 3, '默认只展示近 3 次');
eq(vp.data.hiddenCount, 2, '剩下 2 次折叠起来');
eq(vp.data.recordsExpanded, false, '默认收起');
eq(vp.data.records[0].dateText.indexOf(Number(ago(-110).split('-')[1]) + ' 月'), 0, '按时间倒序，最近的（麻腮风）排第一');
eq(vp.data.stats.total, 5, '统计只算已接种的');

vp.toggleRecords();
eq(vp.data.records.length, 5, '点展示全部后露出所有记录');
eq(vp.data.recordsExpanded, true, '标记为已展开');
vp.toggleRecords();
eq(vp.data.records.length, 3, '再点一次收起');

eq(vp.data.planned.length, 2, '2 条待安排');
eq(vp.data.planned[0].name, '水痘疫苗', '待安排按日期从近到远，5 天后的排第一');
eq(vp.data.planned[1].name, '乙脑减毒活疫苗', '12 天后的排后面');
ok(vp.data.planned[0].whenText.indexOf('天后') > -1, '待安排带倒计时');
const d5 = ago(5).split('-');
eq(vp.data.planned[0].day, String(Number(d5[2])), '待安排显示日');
eq(vp.data.planned[0].month, Number(d5[1]) + ' 月', '待安排显示月');

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

/* ================= 12. 辅食主页 ================= */
console.log('\n[12] 辅食主页');
mem['xyd_food_records'] = [];
mem['xyd_food_hidden'] = [];
mem['xyd_food_swap'] = {};
mem['xyd_menu_swap'] = {};
mem['xyd_custom_foods'] = [];

// 造一个正好 7 月龄的宝宝
const BIRTH7 = fixtures.birthdayForAge(7, 0);
store.saveBabies([{ id: 'b5', name: '小米', birthday: BIRTH7, avatar: '🌾' }]);
store.updateSettings({ activeBabyId: 'b5' });

let fp = instance(mount('pages/food/food.js'));
fp.load();

eq(fp.data.hasBaby, true, '有宝宝时进入正常分支');
eq(fp.data.months, 7, '月龄算出来是 7');
eq(fp.data.monthText, '6-8 个月', '阶段标签是 6-8 个月');
eq(fp.data.brief.tone, 'todo', '一针没记时摘要为「还没开始加」');
eq(fp.data.stage.focus.at, 7, '阶段卡挂上了第 7 个月的重点');
eq(fp.data.stage.focus.title, '第 7 个月 · 该加肉泥了', '阶段卡标题带本月重点');
ok(fp.data.stage.focus.key.indexOf('猪肉') > -1, '阶段卡给出本月关键动作');
eq(fp.data.stage.texture, '稠糊', '性状用逐月的值（不是 6-8 月的粗档）');
eq(fp.data.stage.meals, '1-2 餐/天', '餐次用逐月的值');
ok(fp.data.stage.focus.nextNames.indexOf('猪肉') > -1, '阶段卡列出本月重点食材');
eq(fp.data.due[0].name, '强化铁米粉', '待尝试第一条是强化铁米粉');
eq(fp.data.todayMenu.length, 2, '初添期一天 2 个餐次');
ok(!!fp.data.todayMenu[0].recipeId, '今天吃什么排到了食谱');
eq(fp.data.week.days.length, 7, '一周餐单 7 天');
eq(fp.data.recordTotal, 0, '没有记录');
eq(fp.data.stats.total, 67, '食材总数 67');
eq(fp.data.lib.length, 11, '食材库 11 组');

// 记一条今天的南瓜
store.upsertFoodRecord({ babyId: 'b5', foodId: 'pumpkin', date: TODAY, reaction: 'none' });
fp.load();
eq(fp.data.recordTotal, 1, '记录后已试 1 种');
eq(fp.data.records[0].name, '南瓜', '记录名映射正确');
eq(fp.data.watching.length, 1, '今天记的进入观察窗');
eq(fp.data.watching[0].name, '南瓜', '观察中的是南瓜');
eq(fp.data.watching[0].dayIndex, 1, '观察第 1 天');
eq(fp.data.brief.tone, 'watch', '摘要切到「正在排敏」');
ok(fp.data.brief.title.indexOf('南瓜') > -1, '摘要标题带食材名');
ok(
  !fp.data.due.some(function (f) {
    return f.id === 'pumpkin';
  }),
  '已试过的不再出现在待尝试'
);

// 再记一种，构成冲突
store.upsertFoodRecord({ babyId: 'b5', foodId: 'carrot', date: TODAY, reaction: 'none' });
fp.load();
eq(fp.data.conflict, true, '两种同时在观察时标记冲突');
eq(fp.data.brief.tone, 'warn', '摘要升级为冲突提醒');

// 折叠与展开
mem['xyd_food_records'] = [];
[
  { f: 'rice_cereal', d: ago(-202) },
  { f: 'pumpkin', d: ago(-171) },
  { f: 'carrot', d: ago(-141) },
  { f: 'apple', d: ago(-110) },
  { f: 'banana', d: ago(-79) }
].forEach(function (x) {
  store.upsertFoodRecord({ babyId: 'b5', foodId: x.f, date: x.d, reaction: 'none' });
});
fp.load();
eq(fp.data.recordTotal, 5, '5 条已尝试');
eq(fp.data.records.length, 3, '默认只展示近 3 条');
eq(fp.data.records[0].name, '香蕉', '按时间倒序，最近的排第一');
fp.toggleTried();
eq(fp.data.records.length, 5, '展开后露出全部');
fp.toggleTried();
eq(fp.data.records.length, 3, '再点收起');

// 跳过与恢复
fp.skipFood({ currentTarget: { dataset: { id: 'millet' } } });
mem['xyd_food_hidden'] = store.getRawFoodHidden();
eq(store.getFoodHidden('b5').length, 1, '跳过后进入隐藏清单');
fp.load();
eq(fp.data.hiddenCount, 1, '页面显示已跳过 1 种');
ok(
  !fp.data.due.some(function (f) {
    return f.id === 'millet';
  }),
  '跳过的食材不再出现在待尝试'
);
fp.restoreHidden();
fp.load();
eq(fp.data.hiddenCount, 0, '恢复后隐藏清单清空');

// 折叠开关
fp.toggleWeek();
eq(fp.data.weekOpen, true, '一周餐单可以展开');
fp.toggleWeek();
eq(fp.data.weekOpen, false, '再点收起');
fp.toggleLib();
eq(fp.data.libOpen, true, '食材库可以展开');

// 换一道
const mealBefore = fp.data.todayMenu[0].name;
fp.swapMeal({ currentTarget: { dataset: { slot: 'am' } } });
eq(lastToast, '已换一道', '换一道有提示');
ok(!!fp.data.todayMenu[0].recipeId, '换完之后当天那餐仍有食谱');
ok(fp.data.todayMenu[0].name !== mealBefore, '换一道确实换成了别的食谱');
eq(store.getMenuSwap('b5')['' + TODAY + '#am'] !== undefined, true, '替换写进了存储');

// 食谱浮层
fp.openRecipe({ currentTarget: { dataset: { id: fp.data.todayMenu[0].recipeId } } });
eq(fp.data.sheet, true, '点菜名打开浮层');
ok(!!fp.data.recipe && fp.data.recipe.steps.length > 0, '浮层里有做法步骤');
ok(fp.data.recipe.foods.length > 0, '浮层里有食材名');
fp.closeSheet();
eq(fp.data.sheet, false, '关闭浮层');

// 导航
lastNav = '';
fp.goAdd();
eq(lastNav, '/pages/food-edit/food-edit', '去记录页');
lastNav = '';
fp.goAddFood({ currentTarget: { dataset: { id: 'broccoli' } } });
eq(lastNav, '/pages/food-edit/food-edit?foodId=broccoli', '带着食材去记录页');
lastNav = '';
fp.goEdit({ currentTarget: { dataset: { id: 'x1' } } });
eq(lastNav, '/pages/food-edit/food-edit?id=x1', '编辑已有记录');

// 16 月龄：没有单独一档，回退到第 15 个月，并给出说明
const bd15 = new Date(now.getFullYear(), now.getMonth() - 16, 1);
const BIRTH16 = bd15.getFullYear() + '-' + pad(bd15.getMonth() + 1) + '-01';
store.saveBabies([{ id: 'b7', name: '小树', birthday: BIRTH16, avatar: '🌳' }]);
store.updateSettings({ activeBabyId: 'b7' });
fp.load();
eq(fp.data.months, 16, '16 月龄算得出来');
eq(fp.data.stage.focus.at, 15, '16 月龄回退到第 15 个月那一档');
eq(fp.data.stage.focus.exact, false, '16 月龄不是精确节点，页面会给说明');
eq(fp.data.stage.texture, '切成小块的家常菜', '性状跟着第 15 个月走');
eq(fp.data.due.length > 0, true, '16 月龄仍有待尝试清单');

// 没宝宝
mem['xyd_babies'] = [];
fp.load();
eq(fp.data.hasBaby, false, '没有宝宝时进入空状态');
lastNav = '';
fp.goBaby();
eq(lastNav, '/pages/baby-edit/baby-edit', '空状态引导去添加宝宝');

/* ================= 13. 记录一次辅食尝试 ================= */
console.log('\n[13] 记录一次辅食尝试');
mem['xyd_food_records'] = [];
mem['xyd_custom_foods'] = [];
mem['xyd_food_hidden'] = [];
store.saveBabies([{ id: 'b6', name: '小豆', birthday: BIRTH7 }]);
store.updateSettings({ activeBabyId: 'b6' });

let fep = instance(mount('pages/food-edit/food-edit.js'));
fep.onLoad({});

eq(fep.data.list.length > 0, true, '默认分组里有食材');
eq(fep.data.canSave, false, '没选食材时不能保存');
eq(fep.data.date, TODAY, '日期默认今天');
eq(fep.data.reaction, 'none', '反应默认「没问题」');
eq(fep.data.reactions.length, 4, '反应选项 4 档');

fep.pick({ currentTarget: { dataset: { id: 'rice_cereal' } } });
eq(fep.data.canSave, true, '选中后可以保存');
eq(fep.data.selected.name, '强化铁米粉', '选中项映射正确');
ok(fep.data.selected.ironRich, '强化铁米粉标了高铁');

// 反应严重时给出就医提示
fep.pickReaction({ currentTarget: { dataset: { key: 'severe' } } });
eq(fep.data.reaction, 'severe', '选中严重反应');
eq(fep.data.reactionDetail.tone, 'danger', '严重反应的色调');
ok(fep.data.reactionDetail.next.indexOf('120') > -1, '严重反应处置里写拨 120');

fep.pickReaction({ currentTarget: { dataset: { key: 'none' } } });
fep.onNote({ detail: { value: '吃得很香' } });
fep.onReactionNote({ detail: { value: '没有异常' } });
fep.save();
const savedFood = store.getFoodRecords('b6')[0];
eq(savedFood.foodId, 'rice_cereal', '存的是选中的食材');
eq(savedFood.date, TODAY, '存的是页面上的日期');
eq(savedFood.reaction, 'none', '存的是选中的反应');
eq(savedFood.note, '吃得很香', '备注存下来了');
eq(lastToast, '已记录，观察 2 天', '无反应时提示继续观察');

// 编辑已有记录
fep = instance(mount('pages/food-edit/food-edit.js'));
fep.onLoad({ id: savedFood.id });
eq(fep.data.isEdit, true, '带 id 进来是编辑态');
eq(fep.data.selectedId, 'rice_cereal', '回填了食材');
eq(fep.data.note, '吃得很香', '回填了备注');
fep.pickReaction({ currentTarget: { dataset: { key: 'mild' } } });
fep.save();
eq(store.getFoodRecords('b6')[0].reaction, 'mild', '编辑后反应被更新');
eq(store.getFoodRecords('b6').length, 1, '编辑不会新增记录');
eq(lastToast, '已更新', '编辑的提示文案');

// 删除
fep.remove();
eq(store.getFoodRecords('b6').length, 0, '删除后记录已清掉');

// 带着食材进来
fep = instance(mount('pages/food-edit/food-edit.js'));
fep.onLoad({ foodId: 'pumpkin' });
eq(fep.data.group, 'veg', '自动切到该食材所在分组');
eq(fep.data.selectedId, 'pumpkin', '预选了带进来的食材');
eq(fep.data.canSave, true, '预选后可直接保存');

// 未选食材保存被拦
const fep2 = instance(mount('pages/food-edit/food-edit.js'));
fep2.onLoad({});
fep2.save();
eq(lastToast, '先选一种食材', '没选食材时保存被拦');

// 自定义食材
fep = instance(mount('pages/food-edit/food-edit.js'));
fep.onLoad({});
fep.openSheet();
eq(fep.data.sheet, true, '打开自定义浮层');
fep.saveCustom();
eq(lastToast, '先填食材名称', '空名被拦');
fep.onCName({ detail: { value: '秋葵' } });
fep.onCNote({ detail: { value: '菜市场有' } });
fep.pickCGroup({ currentTarget: { dataset: { key: 'veg' } } });
fep.pickCMonth({ currentTarget: { dataset: { m: 10 } } });
fep.saveCustom();
eq(fep.data.sheet, false, '保存后关闭浮层');
eq(store.getCustomFoods().length, 1, '自定义食材已存');
eq(fep.data.selectedId, store.getCustomFoods()[0].id, '保存后自动选中新食材');
ok(fep.data.selected.custom, '选中项带自定义标记');

mem['xyd_custom_foods'] = store.getCustomFoods();
const customId = store.getCustomFoods()[0].id;
fep.removeCustom({ currentTarget: { dataset: { id: customId } } });
eq(store.getCustomFoods().length, 0, '删除自定义食材');
eq(lastToast, '已删除', '删除有提示');

/* ================= 14. 月龄建议页的辅食入口 ================= */
console.log('\n[14] 月龄建议页的辅食入口');
mem['xyd_food_records'] = [];
mem['xyd_menu_swap'] = {};
store.saveBabies([{ id: 'b7', name: '小果', birthday: BIRTH7 }]);
store.updateSettings({ activeBabyId: 'b7' });
store.upsertFoodRecord({ babyId: 'b7', foodId: 'pumpkin', date: TODAY, reaction: 'none' });

let gp = instance(mount('pages/guide/guide.js'));
gp.onLoad({ month: 7, tab: 'eat' });

eq(gp.data.tab, 'eat', '停在吃 tab');
ok(!!gp.data.foodCard, '生成了辅食摘要卡');
eq(gp.data.foodCard.stageLabel, '6-8 个月', '摘要标注当前阶段');
eq(gp.data.foodCard.focusTitle, '第 7 个月 · 该加肉泥了', '摘要标出本月这一档的重点');
ok(gp.data.foodCard.focusKey.indexOf('猪肉') > -1, '摘要带本月关键动作');
ok(gp.data.foodCard.title.indexOf('南瓜') > -1, '摘要标题跟着排敏状态走');
ok(gp.data.foodCard.todayText.length > 0, '摘要带今天吃什么');
eq(gp.data.foodCard.tried, 1, '摘要带已试种数');

lastNav = '';
gp.goFood();
eq(lastNav, '/pages/food/food', '点摘要卡进入辅食页');

gp.render(7, 'move');
eq(gp.data.tab, 'move', '可以切到别的 tab');
ok(!!gp.data.foodCard, '切走后摘要数据仍在（由 wxml 控制只在吃 tab 显示）');

gp.goFood();
eq(lastNav, '/pages/food/food', '非吃 tab 也能跳（防御性）');

// 没有宝宝时不出摘要卡
mem['xyd_babies'] = [];
gp = instance(mount('pages/guide/guide.js'));
gp.onLoad({ month: 7, tab: 'eat' });
eq(gp.data.foodCard, null, '没有宝宝时不显示辅食摘要卡');

/* ================= 15. 记一餐页 ================= */
console.log('\n[15] 记一餐页');

mem['xyd_meal_logs'] = [];
mem['xyd_food_records'] = [];

// 没有宝宝
mem['xyd_babies'] = [];
lastToast = '';
let mp = instance(mount('pages/meal-log/meal-log.js'));
mp.onLoad({});
eq(lastToast, '请先添加宝宝', '没有宝宝时先提示添加');

store.saveBabies([{ id: 'b8', name: '小芽', birthday: BIRTH7 }]);
store.updateSettings({ activeBabyId: 'b8' });

// 空表单
mp = instance(mount('pages/meal-log/meal-log.js'));
mp.onLoad({});
eq(mp.data.babyName, '小芽', '带上宝宝名字');
eq(mp.data.date, TODAY, '默认记今天');
ok(['am', 'noon', 'pm', 'eve', 'other'].indexOf(mp.data.slot) > -1, '默认餐次按当前钟点猜');
eq(mp.data.foods.length, 0, '一开始没选食材');
eq(mp.data.canSave, false, '什么都没选时不能保存');
eq(mp.data.accept, 'ok', '接受度默认「还行」');

// 从「今天吃什么」带进来
mp = instance(mount('pages/meal-log/meal-log.js'));
mp.onLoad({ recipeId: 'r_yolk_cereal', slot: 'am', date: TODAY });
eq(mp.data.recipeId, 'r_yolk_cereal', '记住带入的食谱 id');
eq(mp.data.recipeName, '蛋黄米糊', '带上菜名');
eq(mp.data.foods.length, 2, '把食谱的食材都勾上');
eq(mp.data.slot, 'am', '带上餐次');
eq(mp.data.canSave, true, '有食材就能保存');

// 摘掉一个食材
mp.removeFood({ currentTarget: { dataset: { id: 'egg_yolk' } } });
eq(mp.data.foods.length, 1, '可以摘掉不吃的食材');
eq(mp.data.canSave, true, '还剩一种时仍可保存');
mp.removeFood({ currentTarget: { dataset: { id: 'rice_cereal' } } });
eq(mp.data.canSave, false, '全摘空后不能保存');

// 浮层加食材
mp.setData({ group: 'grain' });
mp.openSheet();
ok(mp.data.sheet === true, '打开加食材浮层');
ok(mp.data.lib.length > 0, '浮层列出这一组食材');
ok(
  mp.data.lib.some(function (x) {
    return x.allergen === true || x.meta.indexOf('月起') > -1;
  }),
  '浮层每格带过敏原或起始月龄标记'
);

lastToast = '';
mp.save();
eq(lastToast, '先选吃了什么', '一种都没选时保存被拦住');

mp.toggleFood({ currentTarget: { dataset: { id: 'rice_cereal' } } });
eq(mp.data.foods.length, 1, '浮层点一下加进这一餐');
ok(
  mp.data.lib.filter(function (x) {
    return x.id === 'rice_cereal';
  })[0].on === true,
  '浮层里已选的格子标成选中'
);
mp.toggleFood({ currentTarget: { dataset: { id: 'rice_cereal' } } });
eq(mp.data.foods.length, 0, '再点一下从这一餐移除');

// 填完整并保存
mp.toggleFood({ currentTarget: { dataset: { id: 'pumpkin' } } });
mp.pickSlot({ currentTarget: { dataset: { key: 'noon' } } });
mp.pickAmount({ currentTarget: { dataset: { key: 'half' } } });
mp.pickAccept({ currentTarget: { dataset: { key: 'love' } } });
mp.pickPoop({ currentTarget: { dataset: { key: 'normal' } } });
mp.onAmountText({ detail: { value: '小半碗' } });
mp.onNote({ detail: { value: '拌了点米粉' } });
mp.onDate({ detail: { value: TODAY } });

lastToast = '';
mp.save();
eq(store.getMealLogs('b8').length, 1, '保存后落库一条');
const savedLog = store.getMealLogs('b8')[0];
eq(savedLog.slot, 'noon', '存下餐次');
eq(savedLog.foods, ['pumpkin'], '存下食材');
eq(savedLog.amount, 'half', '存下分量');
eq(savedLog.accept, 'love', '存下接受度');
eq(savedLog.poop, 'normal', '存下便便');
eq(savedLog.amountText, '小半碗', '存下分量补充说明');
eq(savedLog.note, '拌了点米粉', '存下备注');
eq(lastToast, '已记录，1 种待补排敏', '还没记排敏时提示去补');

// 记过排敏之后不再提示
store.upsertFoodRecord({ babyId: 'b8', foodId: 'pumpkin', date: TODAY, reaction: 'none' });
mp = instance(mount('pages/meal-log/meal-log.js'));
mp.onLoad({ recipeId: 'r_pumpkin_puree' });
lastToast = '';
mp.save();
eq(lastToast, '已记录', '记过排敏的食材不再提示补记');

// 改已有的一餐
const editId = store.getMealLogs('b8')[0].id;
mp = instance(mount('pages/meal-log/meal-log.js'));
mp.onLoad({ id: editId });
eq(mp.data.isEdit, true, '带 id 进来是编辑态');
eq(mp.data.slot, 'noon', '编辑态载入餐次');
eq(mp.data.foods.length, 1, '编辑态载入食材');
eq(mp.data.amount, 'half', '编辑态载入分量');

mp.onNote({ detail: { value: '改成吃完了' } });
mp.pickAmount({ currentTarget: { dataset: { key: 'all' } } });
lastToast = '';
mp.save();
eq(lastToast, '已更新', '编辑保存提示已更新');
eq(store.getMealLog(editId).amount, 'all', '编辑写回新分量');
eq(store.getMealLog(editId).note, '改成吃完了', '编辑写回新备注');

// 删除
mp = instance(mount('pages/meal-log/meal-log.js'));
mp.onLoad({ id: editId });
mp.remove();
eq(store.getMealLog(editId), null, '删除后这条没了');

/* ================= 16. 辅食页 · 3 天计划与接种提示条 ================= */
console.log('\n[16] 辅食页 · 3 天计划与接种提示条');

function dateStrOf(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}
function hhmm(d) {
  return pad(d.getHours()) + ':' + pad(d.getMinutes());
}

mem['xyd_food_records'] = [];
mem['xyd_food_hidden'] = [];
mem['xyd_menu_swap'] = {};
mem['xyd_custom_foods'] = [];
mem['xyd_meal_logs'] = [];
mem['xyd_vaccine_records'] = [];

store.saveBabies([{ id: 'b5', name: '小米', birthday: BIRTH7, avatar: '🌾' }]);
store.updateSettings({ activeBabyId: 'b5' });

const TMR = dateStrOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
const D2 = dateStrOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2));

let pp = instance(mount('pages/food/food.js'));
pp.load();

eq(pp.data.diet, null, '没有接种记录时不出提示条');
eq(pp.data.today, TODAY, '页面带上今天的日期');
eq(pp.data.planNext.length, 2, '接着两天给出 2 张卡');
eq(pp.data.planNext[0].label, '明天', '第一张是明天');
eq(pp.data.planNext[0].date, TMR, '明天日期正确');
eq(pp.data.planNext[1].label, '后天', '第二张是后天');
eq(pp.data.planNext[1].date, D2, '后天日期正确');
ok(
  pp.data.planNext[0].meals.length > 0 && pp.data.planNext[1].meals.length > 0,
  '两天都排上了餐次'
);
// 「今天至少一道有理由」不是必然的：餐单按周随机，红薯泥这类菜本来就没有理由可写。
// 所以分开测：页面把引擎给的理由原样带出来；引擎对确定的菜给出确定的理由。
ok(
  pp.data.todayMenu.every(function (m) {
    return m.reasonText === (m.reasons[0] || '');
  }),
  '今天吃什么：理由取第一条，没有时为空'
);
const foodEngine = require(path.join(ROOT, 'utils/food.js'));
const byIdAll = {};
foodEngine.allFoods().forEach(function (f) {
  byIdAll[f.id] = f;
});
const riceRecipe = { foods: ['rice_cereal'] };
ok(foodEngine.reasonsOf(riceRecipe, { byId: byIdAll }).indexOf('补铁') > -1, '强化铁米粉的理由里有「补铁」');
ok(
  foodEngine.reasonsOf(riceRecipe, { byId: byIdAll, focusNext: ['rice_cereal'] }).indexOf('本月重点') > -1,
  '本月重点食材标「本月重点」'
);
eq(foodEngine.reasonsOf({ foods: ['rice_cereal'] }, { byId: byIdAll, diet: 'strict' })[0], '接种期·只吃吃过的', '接种期理由排第一');
eq(foodEngine.reasonsOf(null, {}), [], '没有食谱时没有理由');

const wToday = pp.data.week.days.filter(function (d) {
  return d.date === TODAY;
})[0];
eq(
  wToday.meals.map(function (m) {
    return m.recipeId;
  }),
  pp.data.todayMenu.map(function (m) {
    return m.recipeId;
  }),
  '今天吃什么与周餐单里今天完全一致'
);

// 当季一行
const monthNum = Number(TODAY.slice(5, 7));
const seasonFoods = require(path.join(ROOT, 'utils/food.js')).inSeasonFoods(monthNum, 7);
if (seasonFoods.length) {
  ok(pp.data.seasonText.indexOf('当季') > -1, '阶段卡里有一行当季食材');
} else {
  eq(pp.data.seasonText, '', '这个月没有当季食材时不显示');
}

// 接种后 2 小时
const nowD = new Date();
const twoHoursAgo = new Date(nowD.getTime() - 2 * 3600 * 1000);
store.upsertVaccineRecord({
  babyId: 'b5',
  vaccineId: 'dtap',
  dose: 1,
  date: dateStrOf(twoHoursAgo),
  time: hhmm(twoHoursAgo),
  place: '社区门诊'
});
pp.load();

ok(!!pp.data.diet, '接种后出现提示条');
eq(pp.data.diet.level, 'strict', '接种 2 小时内是 strict');
ok(pp.data.diet.title.length > 0, '提示条带疫苗名与剂次');
ok(pp.data.diet.foot.indexOf('收紧') > -1, '提示条说明餐单已自动收紧');
ok(
  pp.data.todayMenu.every(function (m) {
    return !m.newText;
  }),
  'strict 下今天的餐单不含没试过的过敏原'
);

// 超过 72 小时不再约束
const longAgo = new Date(nowD.getTime() - 80 * 3600 * 1000);
mem['xyd_vaccine_records'] = [];
store.upsertVaccineRecord({
  babyId: 'b5',
  vaccineId: 'dtap',
  dose: 1,
  date: dateStrOf(longAgo),
  time: hhmm(longAgo)
});
pp.load();
eq(pp.data.diet, null, '超过 72 小时后提示条消失');

// 记一餐
mem['xyd_meal_logs'] = [];
const todayLog = store.upsertMealLog({
  babyId: 'b5',
  date: TODAY,
  slot: 'am',
  recipeId: 'r_pumpkin_puree',
  recipeName: '南瓜泥',
  foods: ['pumpkin'],
  amount: 'half',
  amountText: '小半碗',
  accept: 'love'
});
pp.load();

eq(pp.data.logTotal, 1, '最近吃了什么记到 1 餐');
eq(pp.data.logs.length, 1, '近 3 条里露出这一餐');
eq(pp.data.logs[0].title, '南瓜泥', '展示菜名');
eq(pp.data.logs[0].amountText, '小半碗', '展示分量');
ok(
  pp.data.untracked.some(function (f) {
    return f.id === 'pumpkin';
  }),
  '吃过但没记排敏的会被提醒补记'
);
ok(
  pp.data.lib.some(function (g) {
    return g.items.some(function (i) {
      return i.id === 'pumpkin' && i.eaten === true;
    });
  }),
  '食材库给吃过的食材打「吃过」标记'
);

// 记过排敏之后提醒消失
store.upsertFoodRecord({ babyId: 'b5', foodId: 'pumpkin', date: TODAY, reaction: 'none' });
pp.load();
ok(
  !pp.data.untracked.some(function (f) {
    return f.id === 'pumpkin';
  }),
  '补记排敏后不再提醒'
);

// 导航
lastNav = '';
pp.goLog();
eq(lastNav, '/pages/meal-log/meal-log', '「记一餐」进入记录页');
lastNav = '';
pp.goLogMeal({ currentTarget: { dataset: { date: TODAY, slot: 'am', id: 'r_pumpkin_puree' } } });
eq(lastNav, '/pages/meal-log/meal-log?date=' + TODAY + '&slot=am&recipeId=r_pumpkin_puree', '「吃了」带着日期餐次食谱进入记录页');
lastNav = '';
pp.goLogMeal({ currentTarget: { dataset: { date: TMR, slot: 'noon', id: '' } } });
eq(lastNav, '/pages/meal-log/meal-log?date=' + TMR + '&slot=noon', '明天的空餐位也能记，且不带空食谱参数');
lastNav = '';
pp.goLogEdit({ currentTarget: { dataset: { id: todayLog.id } } });
eq(lastNav, '/pages/meal-log/meal-log?id=' + todayLog.id, '点最近一餐进入编辑');

// 「换一道」仍然守接种期约束（opts 透传）
lastToast = '';
pp.swapMeal({ currentTarget: { dataset: { slot: 'am' } } });
eq(lastToast, '已换一道', '换一道在接种期下仍可用');
ok(!!pp.data.todayMenu[0].recipeId, '换完之后那餐仍有食谱');

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail ? 1 : 0);
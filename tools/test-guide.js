#!/usr/bin/env node
/**
 * tools/test-guide.js —— 月龄建议页重做 + 分享覆盖的冒烟测试
 * 用法：node tools/test-guide.js
 */

const path = require('path');
const fs = require('fs');

const mem = {};
let lastNav = '';
global.getApp = function () {
  return { globalData: { tmplIds: [] } };
};
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
  switchTab: function (o) {
    lastNav = 'tab:' + o.url;
  },
  showToast: function () {},
  setNavigationBarTitle: function () {}
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
      } else self.data[k] = patch[k];
    });
  };
  return inst;
}

const store = require(path.join(ROOT, 'utils/store.js'));
const guideUtil = require(path.join(ROOT, 'utils/guide.js'));

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

function birthdayMonthsAgo(n) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  const p = function (v) {
    return v < 10 ? '0' + v : '' + v;
  };
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-01';
}

/* ================= 1. 结构 ================= */
console.log('\n[1] 页面结构');
store.saveBabies([{ id: 'g1', name: '小芽', birthday: birthdayMonthsAgo(7) }]);
store.updateSettings({ activeBabyId: 'g1' });

let gp = instance(mount('pages/guide/guide.js'));
gp.onLoad({});
eq(gp.data.currentMonth, 7, '不带参数时落在宝宝当前月龄');
eq(gp.data.label, '6-8 个月', '对应月龄段');
ok(gp.data.isCurrent, '标记为宝宝当前段');
eq(gp.data.segments.length, guideUtil.listSegments().length, '段切换条列出全部月龄段');
eq(gp.data.segments[0].short, '0-1月', '段标签精简');
eq(gp.data.tab, 'all', '默认全部');
eq(gp.data.visible.length, 4, '全部 tab 下四类（吃动学睡）');
ok(
  gp.data.visible.every(function (s) {
    return s.key !== 'alerts';
  }),
  '「提示」不再混在分类里'
);
ok(!!gp.data.alerts && gp.data.alerts.items.length > 0, '要留意单独成卡');
ok(
  gp.data.visible.every(function (s) {
    return !!s.lead;
  }),
  '每类都有主建议'
);

const eat = gp.data.visible[0];
ok(
  eat.rows.filter(function (r) {
    return r.show;
  }).length <= 2,
  '细项默认最多露 2 条'
);
eq(eat.more, Math.max(0, eat.rows.length - 2), '折叠数量正确');
ok(gp.data.showFood, '宝宝当前段、全部 tab 显示辅食入口');
ok(!!gp.data.nextSeg && gp.data.nextSeg.label === '9-11 个月', '下一阶段预告');
ok(gp.data.nextSeg.points.length > 0, '预告带要点');

/* ================= 2. 交互 ================= */
console.log('\n[2] 交互');
if (eat.more > 0) {
  gp.toggleMore({ currentTarget: { dataset: { key: 'eat' } } });
  const e2 = gp.data.visible[0];
  ok(e2.open && e2.rows.every(function (r) { return r.show; }), '展开后全部可见');
  ok(!gp.data.visible[1].open, '其他类不受影响');
  gp.toggleMore({ currentTarget: { dataset: { key: 'eat' } } });
  ok(!gp.data.visible[0].open, '再点收起');
} else {
  ok(true, '（此段吃类无可折叠细项，跳过）');
}

gp.nextMonth();
eq(gp.data.label, '9-11 个月', '箭头按段前进');
ok(!gp.data.isCurrent, '离开宝宝当前段');
ok(!gp.data.showFood, '非当前段不显示辅食入口（避免误导）');
gp.prevMonth();
eq(gp.data.label, '6-8 个月', '箭头按段后退');

gp.pickSeg({ currentTarget: { dataset: { i: 0 } } });
eq(gp.data.month, 0, '点段标签跳到段首');
gp.prevMonth();
eq(gp.data.month, 0, '第一段再后退不越界');
ok(gp.data.nextSeg !== null, '第一段有下一阶段');

gp.pickSeg({ currentTarget: { dataset: { i: 3 } } });
eq(gp.data.month, 7, '选回宝宝所在段时落在真实月龄');

gp.pickSeg({ currentTarget: { dataset: { i: gp.data.segments.length - 1 } } });
eq(gp.data.nextSeg, null, '最后一段没有预告');
gp.nextMonth();
eq(gp.data.segIndex, gp.data.segments.length - 1, '最后一段再前进不越界');

gp.goNext();
gp.backToCurrent();
eq(gp.data.month, 7, '回到当前月龄');

gp.switchTab({ currentTarget: { dataset: { key: 'move' } } });
eq(gp.data.visible.length, 1, '切到单类');
eq(gp.data.alerts, null, '单类时不显示要留意');
ok(!gp.data.showFood, '动 tab 不显示辅食入口');
gp.switchTab({ currentTarget: { dataset: { key: 'eat' } } });
ok(gp.data.showFood, '吃 tab 显示辅食入口');

gp.onLoad({ month: '7', tab: 'nope' });
eq(gp.data.tab, 'all', '非法 tab 回落到全部');

/* ================= 3. 无宝宝 ================= */
console.log('\n[3] 无宝宝');
mem['xyd_babies'] = [];
gp = instance(mount('pages/guide/guide.js'));
gp.onLoad({ month: '12' });
ok(!gp.data.hasBaby, '识别无宝宝');
eq(gp.data.label, '12-17 个月', '按参数月龄展示');
ok(!gp.data.showFood, '无宝宝不显示辅食入口');
gp.goAddBaby();
eq(lastNav, '/pages/baby-edit/baby-edit', '可直接去添加宝宝');

/* ================= 4. 分享 ================= */
console.log('\n[4] 分享');
gp.render(9, 'all');
const sh = gp.onShareAppMessage();
eq(sh.path, '/pages/guide/guide?month=9&tab=all', '分享落到同一月龄段');
ok(/9-11 个月/.test(sh.title), '分享标题带月龄段');
eq(gp.onShareTimeline().query, 'month=9', '朋友圈带月龄参数');

store.saveBabies([{ id: 'g1', name: '小芽', birthday: birthdayMonthsAgo(7) }]);
const fp = instance(mount('pages/food/food.js'));
fp.onLoad();
ok(/宝宝今天吃什么/.test(fp.onShareAppMessage().title), '辅食页可分享');
fp.setData({ sheet: true, recipe: { name: '南瓜泥', fromMonth: 6 } });
ok(/南瓜泥/.test(fp.onShareAppMessage().title), '打开食谱时分享这道菜');

const MUST = ['index', 'food', 'vaccine', 'mine', 'weather', 'guide', 'share'];
MUST.forEach(function (p) {
  const js = fs.readFileSync(path.join(ROOT, 'pages', p, p + '.js'), 'utf8');
  ok(/onShareAppMessage\s*\(/.test(js), p + ' 可转发');
});
['index', 'food', 'vaccine', 'weather', 'guide'].forEach(function (p) {
  const js = fs.readFileSync(path.join(ROOT, 'pages', p, p + '.js'), 'utf8');
  ok(/onShareTimeline\s*\(/.test(js), p + ' 可分享到朋友圈');
});

/* ================= 5. 字号 ================= */
console.log('\n[5] 字号');
const wxss = fs.readFileSync(path.join(ROOT, 'pages/guide/guide.wxss'), 'utf8');
const sizes = (wxss.match(/font-size:\s*(\d+)rpx/g) || []).map(function (s) {
  return Number(s.match(/(\d+)/)[1]);
});
ok(
  sizes.every(function (n) {
    return n >= 22;
  }),
  '月龄建议页最小字号 ≥ 22rpx（实际最小 ' + Math.min.apply(null, sizes) + '）'
);

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail ? 1 : 0);

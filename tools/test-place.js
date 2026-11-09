#!/usr/bin/env node
/**
 * tools/test-place.js —— 地点存储冒烟测试（stub 掉 wx，纯 Node 跑）
 * 用法：node tools/test-place.js
 * 覆盖：地点读写、常用地点、切换/删除、旧数据迁移、坐标判定
 */

const mem = {};

global.wx = {
  getStorageSync: function (k) {
    return Object.prototype.hasOwnProperty.call(mem, k) ? JSON.parse(JSON.stringify(mem[k])) : '';
  },
  setStorageSync: function (k, v) {
    mem[k] = JSON.parse(JSON.stringify(v));
  }
};

const store = require('../utils/store.js');
const placeUtil = require('../utils/place.js');

let pass = 0;
let fail = 0;

function eq(actual, expected, label) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    console.log('  ✗ ' + label + '\n      期望 ' + b + '\n      实际 ' + a);
  }
}

function ok(cond, label) {
  if (cond) {
    pass++;
    console.log('  ✓ ' + label);
  } else {
    fail++;
    console.log('  ✗ ' + label);
  }
}

console.log('\n[1] 初始状态');
eq(store.getPlace(), null, '没有地点时返回 null');
ok(!placeUtil.hasCoords(store.getPlace()), 'hasCoords 对空值返回 false');

console.log('\n[2] 保存到小区的地点');
store.savePlace({
  city: '北京市',
  district: '朝阳区',
  community: '望京西园',
  lat: 39.9963,
  lon: 116.4715,
  source: 'poi'
});
const p1 = store.getPlace();
eq(p1.community, '望京西园', '当前地点 = 望京西园');
eq(placeUtil.formatPlace(p1), '北京市 · 朝阳区 · 望京西园', '完整地址拼接正确');
ok(placeUtil.hasCoords(p1), '有坐标');
eq(placeUtil.mountainInfo(p1).mountain, false, '朝阳区不是山区');

console.log('\n[3] 常用地点：加入 / 切换 / 删除');
const home = store.addPlace('家', p1);
eq(store.getPlaces().length, 1, '常用地点 1 条');
eq(store.getSettings().activePlaceId, home.id, '新增后自动设为当前');

const p2 = store.savePlace({
  city: '北京市',
  district: '密云区',
  community: '檀营小区',
  lat: 40.38,
  lon: 116.85,
  source: 'poi'
});
eq(store.getPlace().community, '檀营小区', '不带 id 保存后当前地点切换为密云');
eq(store.getSettings().activePlaceId, '', '临时地点会清空 activePlaceId');
eq(store.getPlaces().length, 1, '临时地点不进入常用列表');
eq(placeUtil.mountainInfo(p2).mountain, true, '密云区判定为山区');
eq(placeUtil.mountainInfo(p2).offset, -2, '山区温度修正 -2℃');

store.activatePlace(home.id);
eq(store.getPlace().community, '望京西园', '切回「家」');
eq(store.getSettings().activePlaceId, home.id, 'activePlaceId 指向家');

store.removePlace(home.id);
eq(store.getPlaces().length, 0, '删除后常用列表为空');
eq(store.getSettings().activePlaceId, '', '删除当前项后清空 activePlaceId');

console.log('\n[4] 旧版本数据迁移');
delete mem.xyd_settings;
mem.xyd_settings = { city: '北京', lat: 39.9042, lon: 116.4074, family: [], pushTargets: [] };
const migrated = store.getPlace();
ok(!!migrated, '旧数据迁移出地点');
eq(migrated.lat, 39.9042, '迁移保留原坐标');
eq(migrated.source, 'manual', '迁移来源标记为 manual');
eq(store.getSettings().city, '北京', '旧字段仍然可读（不破坏兼容）');

console.log('\n[5] 坐标判定边界');
ok(placeUtil.hasCoords({ lat: '39.9', lon: '116.4' }), '字符串坐标视为有效');
ok(!placeUtil.hasCoords({ lat: null, lon: null }), 'null 坐标无效');
ok(!placeUtil.hasCoords({ lat: '', lon: '' }), '空字符串坐标无效');
ok(placeUtil.hasCoords({ lat: 0, lon: 0 }), '0,0 是合法坐标（几内亚湾），不做特殊排除');

console.log('\n[6] 区县查找');
eq(placeUtil.findDistrict('海淀区').name, '海淀区', '找到海淀区');
eq(placeUtil.findDistrict('不存在区'), null, '不存在的区返回 null');
const d = placeUtil.fromDistrict('延庆区');
eq([d.lat, d.lon], [40.457, 115.975], '延庆区中心坐标正确');

console.log('\n========================================');
console.log('通过 ' + pass + ' 项，失败 ' + fail + ' 项');
console.log('========================================\n');
process.exit(fail ? 1 : 0);

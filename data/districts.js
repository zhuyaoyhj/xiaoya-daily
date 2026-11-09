// data/districts.js —— 行政区划基础数据（区级中心坐标用于天气取数与区级兜底）
// 说明：小区（POI）数量级太大，不走内置，靠地图检索 / 微信选点 / 手动填写三种方式获取。

const CITY = {
  name: '北京市',
  lat: 39.9042,
  lon: 116.4074
};

// 北京市 16 个市辖区，坐标为区政府所在地附近的常用点，用作「选到区」时的天气取数锚点
// mountain: 该区存在较大海拔落差，山区气温明显低于城区，穿衣建议需要额外修正
const BEIJING_DISTRICTS = [
  { name: '东城区', lat: 39.9284, lon: 116.4160, mountain: false },
  { name: '西城区', lat: 39.9123, lon: 116.3660, mountain: false },
  { name: '朝阳区', lat: 39.9215, lon: 116.4860, mountain: false },
  { name: '丰台区', lat: 39.8585, lon: 116.2860, mountain: false },
  { name: '石景山区', lat: 39.9066, lon: 116.2230, mountain: false },
  { name: '海淀区', lat: 39.9590, lon: 116.2980, mountain: false },
  { name: '门头沟区', lat: 39.9404, lon: 116.1020, mountain: true },
  { name: '房山区', lat: 39.7490, lon: 116.1430, mountain: true },
  { name: '通州区', lat: 39.9090, lon: 116.6570, mountain: false },
  { name: '顺义区', lat: 40.1300, lon: 116.6540, mountain: false },
  { name: '昌平区', lat: 40.2210, lon: 116.2310, mountain: false },
  { name: '大兴区', lat: 39.7270, lon: 116.3410, mountain: false },
  { name: '怀柔区', lat: 40.3160, lon: 116.6320, mountain: true },
  { name: '平谷区', lat: 40.1410, lon: 117.1210, mountain: true },
  { name: '密云区', lat: 40.3770, lon: 116.8430, mountain: true },
  { name: '延庆区', lat: 40.4570, lon: 115.9750, mountain: true }
];

// 山区气温修正：同一天山区通常比城区低 2-3℃，按 2℃ 折算
const MOUNTAIN_OFFSET = -2;

const MOUNTAIN_HINT = '所选区域含山区，山里气温通常比城区低 2-3℃，已按更低一档给建议';

module.exports = {
  CITY: CITY,
  BEIJING_DISTRICTS: BEIJING_DISTRICTS,
  MOUNTAIN_OFFSET: MOUNTAIN_OFFSET,
  MOUNTAIN_HINT: MOUNTAIN_HINT
};

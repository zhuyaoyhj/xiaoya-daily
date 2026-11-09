// utils/guide.js —— 月龄建议查询

const { GUIDES, SECTIONS } = require('../data/guides.js');

const ALERT_SECTION = { key: 'alerts', title: '提示', emoji: '💡', color: '#B98A2E', soft: '#FCF3DC' };

function clampMonth(month) {
  const m = Number(month);
  if (isNaN(m)) return 0;
  return Math.max(0, Math.min(36, Math.floor(m)));
}

/** 按整月龄取对应年龄段 */
function getGuideByMonth(month) {
  const m = clampMonth(month);
  for (let i = 0; i < GUIDES.length; i++) {
    if (m >= GUIDES[i].min && m <= GUIDES[i].max) return GUIDES[i];
  }
  return GUIDES[GUIDES.length - 1];
}

/** 首页四宫格：吃 / 动 / 学 / 睡 的摘要 */
function getTips(month) {
  const guide = getGuideByMonth(month);
  return SECTIONS.map(function (s) {
    const block = guide[s.key] || {};
    const items = block.items || [];
    return {
      key: s.key,
      title: s.title,
      emoji: s.emoji,
      color: s.color,
      soft: s.soft,
      heading: block.title || s.title,
      summary: items.length ? items[0] : ''
    };
  });
}

/** 详情页：五段完整内容 */
function getSections(month) {
  const guide = getGuideByMonth(month);
  const list = SECTIONS.map(function (s) {
    const block = guide[s.key] || {};
    return {
      key: s.key,
      title: s.title,
      emoji: s.emoji,
      color: s.color,
      soft: s.soft,
      heading: block.title || '',
      items: block.items || []
    };
  });
  list.push({
    key: ALERT_SECTION.key,
    title: ALERT_SECTION.title,
    emoji: ALERT_SECTION.emoji,
    color: ALERT_SECTION.color,
    soft: ALERT_SECTION.soft,
    heading: '这一阶段要留意',
    items: guide.alerts || []
  });
  return list;
}

function getSegmentLabel(month) {
  const g = getGuideByMonth(month);
  return g.label + ' · ' + g.tag;
}

/** 所有年龄段的档位边界，供月龄选择器展示 */
function listSegments() {
  return GUIDES.map(function (g) {
    return { min: g.min, max: g.max, label: g.label, tag: g.tag };
  });
}

module.exports = {
  clampMonth,
  getGuideByMonth,
  getTips,
  getSections,
  getSegmentLabel,
  listSegments
};

// utils/theme.js —— 由 tools/gen-theme.js 从 app.wxss 生成，不要手改
// 给 canvas 用（canvas 读不到 CSS 变量）。dark 只列出深色模式下不同的值。
const light = {
  "brand": "#F0876B",
  "brand-strong": "#D9724F",
  "brand-deep": "#C4643F",
  "brand-light": "#FFA07E",
  "brand-soft": "#F5C4A8",
  "brand-tint": "#FFF1E6",
  "on-brand": "#FFFFFF",
  "peach-soft": "#FFD8C3",
  "apricot": "#F0B37E",
  "text": "#3A2E26",
  "text-2": "#6B5A4D",
  "text-3": "#8C7B6E",
  "text-4": "#A8968A",
  "text-5": "#C9B8A9",
  "text-warm": "#A5836C",
  "shade": "#40301F",
  "cocoa": "#8A5A48",
  "bg": "#FFF8F0",
  "card": "#FFFFFF",
  "sunken": "#FBF6F0",
  "sunken-2": "#F6ECE2",
  "line": "#F2E6DA",
  "line-strong": "#E3D2C3",
  "danger": "#C43C2A",
  "danger-text": "#A8432F",
  "danger-soft": "#FBEBE7",
  "warn": "#A97A22",
  "warn-text": "#8A6418",
  "warn-strong": "#E0B15C",
  "warn-soft": "#FDF4E3",
  "ok": "#4B7C5C",
  "ok-soft": "#EAF3EC",
  "info": "#5B7FB8",
  "info-soft": "#EEF4FB",
  "sleep": "#7A6AA8",
  "sleep-light": "#A88FC4",
  "sleep-muted": "#9A8AA8",
  "sleep-soft": "#F0EBFA",
  "sleep-line": "#D9CEF0",
  "amber": "#B4743F",
  "amber-soft": "#F8E7C8",
  "olive": "#9A8355",
  "leaf": "#6E8F62",
  "leaf-light": "#8FBF84",
  "sage": "#5E7A6B",
  "mint": "#7FB79A"
};

const dark = {
  "brand": "#E8866A",
  "brand-strong": "#F09A7E",
  "brand-deep": "#F5A98F",
  "brand-light": "#F0957A",
  "brand-soft": "#7A4A3A",
  "brand-tint": "#3A2A24",
  "peach-soft": "#5C3C30",
  "apricot": "#B98450",
  "text": "#F2E8DF",
  "text-2": "#D8C9BC",
  "text-3": "#B5A597",
  "text-4": "#8F8073",
  "text-5": "#6B5E53",
  "text-warm": "#C9A58C",
  "shade": "#F7EEE6",
  "cocoa": "#D8A895",
  "bg": "#1C1714",
  "card": "#27201C",
  "sunken": "#211B17",
  "sunken-2": "#2E2621",
  "line": "#3A302A",
  "line-strong": "#4A3E36",
  "danger": "#F07A66",
  "danger-text": "#F29A88",
  "danger-soft": "#3D2420",
  "warn": "#E0B15C",
  "warn-text": "#EBC57E",
  "warn-strong": "#E0B15C",
  "warn-soft": "#3A3020",
  "ok": "#7FB894",
  "ok-soft": "#22332A",
  "info": "#8FB0E0",
  "info-soft": "#1F2A38",
  "sleep": "#A898D8",
  "sleep-light": "#B9A6DC",
  "sleep-muted": "#A99ABA",
  "sleep-soft": "#2A2438",
  "sleep-line": "#4A4060",
  "amber": "#D9A070",
  "amber-soft": "#3A2E20",
  "olive": "#C2AD80",
  "leaf": "#9CC08E",
  "leaf-light": "#8FBF84",
  "sage": "#98B5A5",
  "mint": "#7FB79A"
};

/** 当前主题的色值表：深色模式下用 dark 覆盖 light */
function colors(theme) {
  let mode = theme;
  if (!mode && typeof wx !== 'undefined') {
    try {
      const info = wx.getAppBaseInfo ? wx.getAppBaseInfo() : wx.getSystemInfoSync();
      mode = info && info.theme;
    } catch (e) {
      mode = 'light';
    }
  }
  return mode === 'dark' ? Object.assign({}, light, dark) : light;
}

module.exports = { light: light, dark: dark, colors: colors };

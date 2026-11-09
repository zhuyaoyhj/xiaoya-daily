// utils/card.js —— 用 Canvas 2D 绘制「今日卡片」，供转发与保存相册

const W = 640; // 设计宽度（与 640rpx 对齐）
const SCALE = 2; // 导出倍数

const BG = '#FFF8F0';
const INK = '#3A2E26';
const SUB = '#8C7B6E';

const TIP_COLORS = [
  { color: '#E8825F', soft: '#FFEDE4' },
  { color: '#5E9F7E', soft: '#E7F3EC' },
  { color: '#6E8FC4', soft: '#E9F0FA' },
  { color: '#8E7BC0', soft: '#F0EBFA' }
];

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, maxWidth, font) {
  ctx.font = font;
  const chars = String(text || '').split('');
  const lines = [];
  let line = '';
  for (let i = 0; i < chars.length; i++) {
    const test = line + chars[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = chars[i];
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** 文字过长时自动降字号，仍超长则截断加省略号 */
function fitText(ctx, text, maxWidth, size, weight) {
  const t = String(text || '');
  let fontSize = size;
  const build = function (fs) {
    return (weight ? weight + ' ' : '') + fs + 'px sans-serif';
  };
  ctx.font = build(fontSize);
  while (ctx.measureText(t).width > maxWidth && fontSize > 24) {
    fontSize -= 2;
    ctx.font = build(fontSize);
  }
  if (ctx.measureText(t).width <= maxWidth) return { text: t, font: build(fontSize) };

  let cut = t;
  while (cut.length > 1 && ctx.measureText(cut + '…').width > maxWidth) {
    cut = cut.slice(0, cut.length - 1);
  }
  return { text: cut + '…', font: build(fontSize) };
}

function build(ctx, data) {
  const PAD = 32;
  const CARD_W = W - PAD * 2;
  const INNER = CARD_W - 52;

  const tips = (data.tips || []).map(function (t) {
    const lines = wrap(ctx, t.text || '', INNER - 56, '24px sans-serif').slice(0, 2);
    return {
      emoji: t.emoji || '',
      title: t.title || '',
      heading: t.heading || '',
      lines: lines,
      h: 60 + lines.length * 34
    };
  });

  const headH = 214;
  const tipsH = 22 + tips.reduce(function (a, t) {
    return a + t.h;
  }, 0) + 20;

  const clothText = (data.clothing && data.clothing.headline) || '天气数据获取后可查看穿衣建议';
  const clothLines = wrap(ctx, clothText, INNER, 'bold 25px sans-serif').slice(0, 3);

  const sleepText = (data.clothing && data.clothing.sleep) || '';
  const sleepLines = sleepText ? wrap(ctx, sleepText, INNER, '22px sans-serif').slice(0, 2) : [];

  const weatherH = 134 + clothLines.length * 36 + (sleepLines.length ? 10 + sleepLines.length * 30 : 0);

  const footerY = headH - 10 + tipsH + 20 + weatherH + 40;
  const height = footerY + 44;

  return {
    PAD: PAD,
    CARD_W: CARD_W,
    INNER: INNER,
    tips: tips,
    tipsH: tipsH,
    weatherH: weatherH,
    headH: headH,
    clothLines: clothLines,
    sleepLines: sleepLines,
    footerY: footerY,
    height: height
  };
}

function paint(ctx, L, data) {
  const H = L.height;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';

  // 底色
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // 顶部渐变
  const grad = ctx.createLinearGradient(0, 0, W * 0.5, L.headH);
  grad.addColorStop(0, '#FFF1E5');
  grad.addColorStop(1, '#FFD8C3');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, L.headH);

  // 装饰圆
  ctx.fillStyle = 'rgba(255,255,255,0.42)';
  ctx.beginPath();
  ctx.arc(W - 24, -10, 118, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.beginPath();
  ctx.arc(48, L.headH + 10, 78, 0, Math.PI * 2);
  ctx.fill();

  // 标题行
  ctx.fillStyle = '#A9765A';
  ctx.font = '23px sans-serif';
  ctx.fillText('小芽日常 · 今日卡片', 40, 42);

  ctx.textAlign = 'right';
  ctx.font = '22px sans-serif';
  ctx.fillText(data.dateText || '', W - 40, 44);
  ctx.textAlign = 'left';

  // 宝宝名
  const nameFit = fitText(ctx, data.babyName || '宝宝', W - 120, 44, 'bold');
  ctx.font = nameFit.font;
  ctx.fillStyle = '#40301F';
  ctx.fillText(nameFit.text, 40, 86);

  // 月龄 + 城市
  ctx.font = '25px sans-serif';
  ctx.fillStyle = '#8A6C55';
  const sub =
    (data.ageText || '') +
    (data.weather && data.weather.city ? ' · ' + data.weather.city : '');
  ctx.fillText(sub, 40, 144);

  if (data.targetLine) {
    ctx.font = '22px sans-serif';
    ctx.fillStyle = '#B4743F';
    ctx.fillText(data.targetLine, 40, 180);
  }

  /* ---------- 四段建议 ---------- */
  let y = L.headH - 10;
  ctx.save();
  ctx.shadowColor = 'rgba(213,176,147,0.26)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, L.PAD, y, L.CARD_W, L.tipsH, 28);
  ctx.fill();
  ctx.restore();

  let cy = y + 22;
  for (let i = 0; i < L.tips.length; i++) {
    const t = L.tips[i];
    const c = TIP_COLORS[i % TIP_COLORS.length];
    const cx = L.PAD + 26 + 22;

    ctx.fillStyle = c.soft;
    ctx.beginPath();
    ctx.arc(cx, cy + 22, 22, 0, Math.PI * 2);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = c.color;
    ctx.font = '22px sans-serif';
    ctx.fillText(t.emoji, cx, cy + 11);
    ctx.textAlign = 'left';

    ctx.fillStyle = INK;
    ctx.font = 'bold 26px sans-serif';
    const heading = fitText(ctx, t.title + ' · ' + t.heading, L.INNER - 56, 26, 'bold');
    ctx.font = heading.font;
    ctx.fillText(heading.text, L.PAD + 26 + 56, cy + 6);

    ctx.fillStyle = SUB;
    ctx.font = '24px sans-serif';
    for (let li = 0; li < t.lines.length; li++) {
      ctx.fillText(t.lines[li], L.PAD + 26 + 56, cy + 44 + li * 34);
    }

    cy += t.h;
  }

  /* ---------- 天气 + 穿衣 ---------- */
  const wy = y + L.tipsH + 20;
  ctx.save();
  ctx.shadowColor = 'rgba(213,176,147,0.26)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, L.PAD, wy, L.CARD_W, L.weatherH, 28);
  ctx.fill();
  ctx.restore();

  const wx = L.PAD + 26;
  const wText = data.weather
    ? data.weather.icon + ' ' + data.weather.city + ' ' + data.weather.temp + '° ' + data.weather.text
    : '天气未获取';
  // 地点精确到小区后文字会变长，这里做一次自适应收缩
  const weatherFit = fitText(ctx, wText, L.INNER, 28, 'bold');
  ctx.fillStyle = INK;
  ctx.font = weatherFit.font;
  ctx.fillText(weatherFit.text, wx, wy + 26);

  ctx.fillStyle = '#C9694A';
  ctx.font = '22px sans-serif';
  ctx.fillText('今天穿什么', wx, wy + 74);

  ctx.fillStyle = INK;
  ctx.font = 'bold 25px sans-serif';
  for (let i = 0; i < L.clothLines.length; i++) {
    ctx.fillText(L.clothLines[i], wx, wy + 108 + i * 36);
  }

  if (L.sleepLines && L.sleepLines.length) {
    const sy = wy + 108 + L.clothLines.length * 36 + 10;
    ctx.fillStyle = '#7A6AA8';
    ctx.font = '22px sans-serif';
    for (let j = 0; j < L.sleepLines.length; j++) {
      ctx.fillText(L.sleepLines[j], wx, sy + j * 30);
    }
  }

  /* ---------- 页脚 ---------- */
  ctx.textAlign = 'center';
  ctx.fillStyle = '#B3A294';
  ctx.font = '20px sans-serif';
  ctx.fillText('内容为通用育儿照护参考，不构成医疗建议 · 由小芽日常生成', W / 2, L.footerY);
  ctx.textAlign = 'left';
}

/**
 * 在 canvas 节点上渲染卡片
 * @returns Promise<{ width, height }> 设备像素尺寸
 */
function render(canvas, data) {
  return new Promise(function (resolve, reject) {
    try {
      const ctx = canvas.getContext('2d');

      // 第一遍：测量高度
      canvas.width = W * SCALE;
      canvas.height = 1200 * SCALE;
      ctx.scale(SCALE, SCALE);
      const layout = build(ctx, data || {});

      // 第二遍：按最终高度重绘
      canvas.width = W * SCALE;
      canvas.height = Math.ceil(layout.height * SCALE);
      ctx.scale(SCALE, SCALE);
      paint(ctx, layout, data || {});

      resolve({ width: W * SCALE, height: Math.ceil(layout.height * SCALE) });
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { render: render };

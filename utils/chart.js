// utils/chart.js —— 极简 canvas 图表（生长曲线 / 7 天柱状图）
// 只依赖标准 CanvasRenderingContext2D 接口；颜色从调用方传入（取自 app.wxss 的 token），不在这里写死业务色。
// 设计取舍：不引第三方图表库（包体 + 审核），两种图够用即可。

/** 把数据坐标映射到像素 */
function scaler(box, xMin, xMax, yMin, yMax) {
  return {
    x: function (v) {
      return box.x + ((v - xMin) / (xMax - xMin || 1)) * box.w;
    },
    y: function (v) {
      return box.y + box.h - ((v - yMin) / (yMax - yMin || 1)) * box.h;
    }
  };
}

/** 刻度：在 [min, max] 里取 4-6 个「整」数 */
function niceTicks(min, max, want) {
  const span = max - min || 1;
  const raw = span / (want || 5);
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map(function (k) {
    return k * mag;
  }).filter(function (s) {
    return s >= raw;
  })[0];
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100);
  return out;
}

/**
 * 生长曲线
 * @param ctx  2D context（已按 dpr 缩放）
 * @param size { w, h }  逻辑像素
 * @param d    utils/growth.chartData 的结果
 * @param c    颜色 { band, mid, line, text, dot, dotStroke, grid }
 */
function drawGrowth(ctx, size, d, c) {
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const box = { x: pad.l, y: pad.t, w: size.w - pad.l - pad.r, h: size.h - pad.t - pad.b };
  const s = scaler(box, d.fromMonth, d.toMonth, d.min, d.max);
  ctx.clearRect(0, 0, size.w, size.h);

  // 网格与刻度
  ctx.strokeStyle = c.grid;
  ctx.lineWidth = 1;
  ctx.fillStyle = c.text;
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  niceTicks(d.min, d.max, 5).forEach(function (v) {
    const y = s.y(v);
    ctx.beginPath();
    ctx.moveTo(box.x, y);
    ctx.lineTo(box.x + box.w, y);
    ctx.stroke();
    ctx.fillText(String(v), box.x - 4, y);
  });
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const xStep = d.toMonth <= 12 ? 2 : d.toMonth <= 24 ? 3 : 6;
  for (let m = 0; m <= d.toMonth; m += xStep) {
    ctx.fillText(m + '月', s.x(m), box.y + box.h + 6);
  }

  // P3-P97 色带
  const lo = d.curves[3];
  const hi = d.curves[97];
  ctx.fillStyle = c.band;
  ctx.beginPath();
  lo.forEach(function (p, i) {
    if (i === 0) ctx.moveTo(s.x(p.m), s.y(p.v));
    else ctx.lineTo(s.x(p.m), s.y(p.v));
  });
  for (let i = hi.length - 1; i >= 0; i--) ctx.lineTo(s.x(hi[i].m), s.y(hi[i].v));
  ctx.closePath();
  ctx.fill();

  // P15 / P50 / P85 参考线
  [15, 50, 85].forEach(function (p) {
    ctx.strokeStyle = p === 50 ? c.mid : c.line;
    ctx.lineWidth = p === 50 ? 1.5 : 1;
    ctx.beginPath();
    d.curves[p].forEach(function (pt, i) {
      if (i === 0) ctx.moveTo(s.x(pt.m), s.y(pt.v));
      else ctx.lineTo(s.x(pt.m), s.y(pt.v));
    });
    ctx.stroke();
  });

  // 宝宝的点和连线
  if (d.points.length) {
    ctx.strokeStyle = c.dot;
    ctx.lineWidth = 2;
    ctx.beginPath();
    d.points.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(s.x(p.m), s.y(p.v));
      else ctx.lineTo(s.x(p.m), s.y(p.v));
    });
    ctx.stroke();
    d.points.forEach(function (p) {
      ctx.fillStyle = c.dot;
      ctx.strokeStyle = c.dotStroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x(p.m), s.y(p.v), 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }
  return { box: box };
}

/**
 * 7 天柱状图
 * @param days [{ label, value, highlight }]
 * @param c    { bar, barOn, text, grid, ref }
 * @param ref  可选参考区间 [lo, hi]，画成浅色横带
 */
function drawBars(ctx, size, days, c, ref) {
  const pad = { l: 8, r: 8, t: 18, b: 20 };
  const box = { x: pad.l, y: pad.t, w: size.w - pad.l - pad.r, h: size.h - pad.t - pad.b };
  let max = 0;
  days.forEach(function (d) {
    max = Math.max(max, d.value || 0);
  });
  if (ref) max = Math.max(max, ref[1]);
  max = max || 1;
  ctx.clearRect(0, 0, size.w, size.h);
  if (ref) {
    const y1 = box.y + box.h - (ref[1] / max) * box.h;
    const y0 = box.y + box.h - (ref[0] / max) * box.h;
    ctx.fillStyle = c.ref;
    ctx.fillRect(box.x, y1, box.w, y0 - y1);
  }
  const slot = box.w / days.length;
  const bw = Math.min(22, slot * 0.56);
  ctx.textAlign = 'center';
  ctx.font = '10px sans-serif';
  days.forEach(function (d, i) {
    const cx = box.x + slot * i + slot / 2;
    const h = ((d.value || 0) / max) * box.h;
    ctx.fillStyle = d.highlight ? c.barOn : c.bar;
    ctx.fillRect(cx - bw / 2, box.y + box.h - h, bw, h);
    ctx.fillStyle = c.text;
    ctx.textBaseline = 'top';
    ctx.fillText(d.label, cx, box.y + box.h + 5);
    if (d.value) {
      ctx.textBaseline = 'bottom';
      ctx.fillText(d.text || String(d.value), cx, box.y + box.h - h - 2);
    }
  });
  return { box: box, max: max };
}

/** 页面里取 canvas 2d 并按 dpr 缩放；回调 (ctx, size) */
function withCanvas(page, selector, draw) {
  wx.createSelectorQuery()
    .in(page)
    .select(selector)
    .fields({ node: true, size: true })
    .exec(function (res) {
      const r = res && res[0];
      if (!r || !r.node) return;
      const dpr = (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()).pixelRatio || 2;
      const canvas = r.node;
      canvas.width = r.width * dpr;
      canvas.height = r.height * dpr;
      const ctx = canvas.getContext('2d');
      ctx.scale(dpr, dpr);
      draw(ctx, { w: r.width, h: r.height });
    });
}

module.exports = {
  scaler: scaler,
  niceTicks: niceTicks,
  drawGrowth: drawGrowth,
  drawBars: drawBars,
  withCanvas: withCanvas
};

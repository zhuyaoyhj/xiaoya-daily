#!/usr/bin/env python3
"""
tools/gen-tab-icons.py —— 生成 tabBar 图标（线性风格，81×81 PNG，透明底）
用法：python3 tools/gen-tab-icons.py   （需要 Pillow）
产物：assets/tab/{today,record,vaccine,mine}[-on].png
未选中 #A8998C，选中 #F0876B（与 app.json tabBar 文字色一致）
先按 4 倍尺寸绘制再缩小，得到平滑边缘。设计师出稿后直接覆盖同名文件即可。
"""
import math
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'tab')
SIZE = 81
S = 4  # 超采样倍数
W = SIZE * S
STROKE = int(5.2 * S)

OFF = (168, 153, 140, 255)  # #A8998C
ON = (240, 135, 107, 255)  # #F0876B
ON_FILL = (240, 135, 107, 56)  # 选中态的浅色填充


def px(v):
    return v * S


def canvas():
    return Image.new('RGBA', (W, W), (0, 0, 0, 0))


def line(d, pts, color, width=STROKE):
    d.line([(px(x), px(y)) for x, y in pts], fill=color, width=width, joint='curve')
    r = width / 2
    for x, y in (pts[0], pts[-1]):
        d.ellipse([px(x) - r, px(y) - r, px(x) + r, px(y) + r], fill=color)


def today(color, on):
    """今日：太阳"""
    im = canvas()
    d = ImageDraw.Draw(im)
    cx, cy, r = 40.5, 40.5, 13
    if on:
        d.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], fill=ON_FILL)
    d.ellipse([px(cx - r), px(cy - r), px(cx + r), px(cy + r)], outline=color, width=STROKE)
    for i in range(8):
        a = math.pi / 4 * i
        x1, y1 = cx + math.cos(a) * 21, cy + math.sin(a) * 21
        x2, y2 = cx + math.cos(a) * 28, cy + math.sin(a) * 28
        line(d, [(x1, y1), (x2, y2)], color)
    return im


def record(color, on):
    """记录：一本带勾选行的记录本（喂奶、睡眠、尿布、辅食都记在这里）"""
    im = canvas()
    d = ImageDraw.Draw(im)
    box = [px(18), px(10), px(63), px(71)]
    if on:
        d.rounded_rectangle(box, radius=px(7), fill=ON_FILL)
    d.rounded_rectangle(box, radius=px(7), outline=color, width=STROKE)
    # 顶部装订夹
    line(d, [(32, 10), (49, 10)], color, width=int(STROKE * 1.3))
    # 三行：小圆点 + 横线
    for y in (29, 41, 53):
        r = 2.6
        d.ellipse([px(28 - r), px(y - r), px(28 + r), px(y + r)], fill=color)
        line(d, [(35, y), (53, y)], color)
    return im


def vaccine(color, on):
    """疫苗：针筒（斜放）"""
    im = canvas()
    # 先画水平针筒，再整体旋转 -45°
    big = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(big)
    # 筒身
    body = [px(20), px(31), px(56), px(50)]
    if on:
        d.rounded_rectangle(body, radius=px(4), fill=ON_FILL)
    d.rounded_rectangle(body, radius=px(4), outline=color, width=STROKE)
    # 刻度
    for x in (30, 38, 46):
        line(d, [(x, 31), (x, 38)], color, width=int(STROKE * 0.8))
    # 推杆
    line(d, [(56, 40.5), (68, 40.5)], color)
    line(d, [(68, 32), (68, 49)], color)
    # 针头
    line(d, [(20, 40.5), (8, 40.5)], color)
    big = big.rotate(45, resample=Image.BICUBIC, center=(W / 2, W / 2))
    im.alpha_composite(big)
    return im


def mine(color, on):
    """我的：小芽 + 人形（头顶两片叶子）"""
    im = canvas()
    d = ImageDraw.Draw(im)
    # 头
    hb = [px(27), px(27), px(54), px(54)]
    if on:
        d.ellipse(hb, fill=ON_FILL)
    d.ellipse(hb, outline=color, width=STROKE)
    # 肩
    d.arc([px(14), px(58), px(67), px(98)], 200, 340, fill=color, width=STROKE)
    # 芽茎
    line(d, [(40.5, 27), (40.5, 17)], color)
    # 两片尖叶：用两段圆弧围成柳叶形
    leaf(d, (40.5, 17), (25, 8), color, on)
    leaf(d, (40.5, 17), (58, 6), color, on)
    return im


def leaf(d, base, tip, color, on):
    """从 base 到 tip 的柳叶形：两侧各一条二次贝塞尔曲线"""
    bx, by = base
    tx, ty = tip
    mx, my = (bx + tx) / 2, (by + ty) / 2
    # 法向量，决定叶子胖瘦
    nx, ny = -(ty - by), (tx - bx)
    ln = math.hypot(nx, ny) or 1
    k = 5.5
    nx, ny = nx / ln * k, ny / ln * k

    def curve(cx, cy):
        pts = []
        for i in range(21):
            t = i / 20
            x = (1 - t) ** 2 * bx + 2 * (1 - t) * t * cx + t ** 2 * tx
            y = (1 - t) ** 2 * by + 2 * (1 - t) * t * cy + t ** 2 * ty
            pts.append((x, y))
        return pts

    side_a = curve(mx + nx, my + ny)
    side_b = curve(mx - nx, my - ny)
    outline = side_a + side_b[::-1]
    if on:
        d.polygon([(px(x), px(y)) for x, y in outline], fill=ON_FILL)
    w = int(STROKE * 0.85)
    line(d, side_a, color, width=w)
    line(d, side_b, color, width=w)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, fn in (('today', today), ('record', record), ('vaccine', vaccine), ('mine', mine)):
        for on in (False, True):
            im = fn(ON if on else OFF, on).resize((SIZE, SIZE), Image.LANCZOS)
            fname = name + ('-on' if on else '') + '.png'
            im.save(os.path.join(OUT, fname), optimize=True)
            print('  ✓', fname)


if __name__ == '__main__':
    main()

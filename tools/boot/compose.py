"""Compose the boot screen's picture (www/img/boot.webp) from the painted landmarks (design/art/map, the high-resolution
originals the tester sent): a storybook village at dusk under a big moon, three rows of places on three hills, the far
ones smaller and bluer. The middle of the sky is left clear for the title and the character, which the page draws on top.

usage: python3 tools/boot/compose.py
"""
import math
import pathlib
import random

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC, OUT = ROOT / 'design/art/map', ROOT / 'www/img/boot.webp'
W, H = 1170, 2532  # an iPhone in portrait at 3x; the page shows it with background-size: cover, centred low

SKY = [(0.0, (34, 22, 77)), (0.30, (61, 42, 120)), (0.52, (123, 79, 158)), (0.66, (217, 138, 166)), (0.78, (255, 195, 154))]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def sky():
    im = Image.new('RGB', (W, H))
    px = im.load()
    for y in range(H):
        v = y / H
        for (p0, c0), (p1, c1) in zip(SKY, SKY[1:]):
            if p0 <= v <= p1:
                c = lerp(c0, c1, (v - p0) / (p1 - p0))
                break
        else:
            c = SKY[-1][1]
        for x in range(W):
            px[x, y] = c
    return im.convert('RGBA')


def glow(im, cx, cy, r, color, alpha):
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(layer).ellipse((cx - r, cy - r, cx + r, cy + r), fill=color + (alpha,))
    return Image.alpha_composite(im, layer.filter(ImageFilter.GaussianBlur(r * 0.45)))


def moon(im):
    cx, cy, r = 955, 185, 112  # high in the corner, clear of the title the page writes under it
    im = glow(im, cx, cy, r * 2.2, (255, 226, 160), 120)
    d = ImageDraw.Draw(im)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 243, 210))
    for ox, oy, rr in ((-42, 30, 26), (30, -34, 17), (22, 42, 12)):
        d.ellipse((cx + ox - rr, cy + oy - rr, cx + ox + rr, cy + oy + rr), fill=(236, 214, 160))
    return im


def stars(im):
    rnd = random.Random(7)
    d = ImageDraw.Draw(im)
    for _ in range(90):
        x, y, r = rnd.uniform(0, W), rnd.uniform(0, H * 0.5), rnd.choice((2, 2, 3, 4))
        a = rnd.randint(150, 255)
        d.ellipse((x - r, y - r, x + r, y + r), fill=(255, 246, 220, a))
    return im


def hill(im, base, amp, color, phase):
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    pts = [(x, base + amp * math.sin(x / W * math.pi * 2.2 + phase) + amp * 0.4 * math.sin(x / W * math.pi * 5 + phase * 2))
           for x in range(0, W + 10, 10)]
    ImageDraw.Draw(layer).polygon(pts + [(W, H), (0, H)], fill=color)
    return Image.alpha_composite(im, layer), pts


def ground_y(pts, x):
    i = min(len(pts) - 1, max(0, int(x / 10)))
    return pts[i][1]


def place(im, name, cx, pts, size, tint=0.0, sink=0.12):
    """A landmark standing on the hill line at x = cx: `size` px wide, sunk a little into the grass, bluer when far."""
    src = Image.open(SRC / f'{name}.png').convert('RGBA')
    box = src.getbbox()
    src = src.crop(box)
    s = size / src.width
    src = src.resize((size, round(src.height * s)), Image.LANCZOS)
    if tint:
        rgb = ImageEnhance.Brightness(src.convert('RGB')).enhance(1 - tint * 0.45)
        blue = Image.new('RGB', src.size, (70, 52, 130))
        rgb = Image.blend(rgb, blue, tint * 0.35)
        src = Image.merge('RGBA', (*rgb.split(), src.split()[3]))
    y = ground_y(pts, cx) - src.height * (1 - sink)
    shadow = Image.new('RGBA', im.size, (0, 0, 0, 0))
    gy = ground_y(pts, cx)
    ImageDraw.Draw(shadow).ellipse((cx - size * 0.42, gy - size * 0.05, cx + size * 0.42, gy + size * 0.07), fill=(30, 18, 60, 90))
    im = Image.alpha_composite(im, shadow.filter(ImageFilter.GaussianBlur(8)))
    im.alpha_composite(src, (round(cx - size / 2), round(y)))
    return im


def main():
    im = stars(moon(sky()))
    # far row: small and blue with distance
    im, far = hill(im, 1560, 40, (106, 74, 150, 255), 0.4)
    for name, x in (('space', 120), ('campus', 330), ('stadium', 560), ('city', 790), ('airport', 1030)):
        im = place(im, name, x, far, 230, tint=0.7)
    # middle row
    im, mid = hill(im, 1840, 46, (74, 51, 120, 255), 1.7)
    for name, x in (('hanok', 150), ('market', 420), ('onsen', 720), ('harbor', 1000)):
        im = place(im, name, x, mid, 330, tint=0.35)
    # near row: the biggest, warm in the last light
    im, near = hill(im, 2190, 52, (46, 33, 82, 255), 2.9)
    for name, x in (('farm', 120), ('town', 420), ('nightmarket', 760), ('xmas', 1060)):
        im = place(im, name, x, near, 430, tint=0.0, sink=0.1)
    # a soft dusk haze over the far rows so the near one reads first
    haze = Image.new('RGBA', im.size, (0, 0, 0, 0))
    ImageDraw.Draw(haze).rectangle((0, 1300, W, 1900), fill=(255, 190, 170, 26))
    im = Image.alpha_composite(im, haze.filter(ImageFilter.GaussianBlur(120)))
    im.convert('RGB').save(OUT, 'WEBP', quality=80, method=6)
    print(OUT, OUT.stat().st_size // 1024, 'KB')


if __name__ == '__main__':
    main()

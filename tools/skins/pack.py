# Packs the painted skin pictures (design/art/skins/<art>.png, 192 px RGBA) into www/skin-art.js:
#   DuskSkinArt[art]  the picture as a webp data URI. A data URI is same-origin everywhere, so WebGL takes it as a
#                     texture in the app, in a browser and from file:// alike; the shop shows the same one.
#   DuskSkinFace[art] where its face is, in picture pixels: [mouthX, mouthY, eyeLX, eyeLY, eyeRX, eyeRY, skin color]
#                     (an eye at -1, -1 is covered, like the pirate's).
#                     render3d draws the wide-open mouth, the happy shut eyes and the blush over the picture there.
# The face is found by color: the open smile is the saturated red blob nearest the usual spot (NEAR overrides the
# spot where a red hat or scarf sits closer), each eye the dark blob nearest its usual offset from the mouth.
#   DuskSkinTurn[art] its side and back views, where it has them: { side, back } as data URIs, the side looking right.
#                     They come from design/art/turn/<art>.png, one sheet of three equal columns: front, side, back.
#                     The sheet's front then replaces the picture in design/art/skins, so all three match.
#                     Each view is cleaned (faint specks left by background removal go: only the biggest solid shape
#                     and what touches it stay), scaled by one factor for the three, and stood on the same line.
# Usage: python3 tools/skins/pack.py [marked-sheet.png]   (from the repository root; needs Pillow)
import base64, io, pathlib, sys
from collections import deque
from PIL import Image, ImageDraw
root = pathlib.Path(__file__).resolve().parents[2]
NEAR = {'cherry_blossom': (122, 78), 'christmas': (116, 78), 'santa': (113, 78)}
FACE_AT = {'summer': (120, 80, 106, 73, 129, 66)}  # read off the picture where the colors find nothing (a pale mouth, goggles above the eyes)
ONE_EYE = {'pirate': (1,)}  # eyes under a patch (0 left, 1 right): written as -1, -1 and left alone
EYES = ((-16, -15), (14, -17))  # from the mouth to each eye, where no dark blob is found (dark bodies)

def blobs(px, test):
    mask = {(x, y) for y in range(192) for x in range(192) if test(*px[x, y])}; seen = set(); out = []
    for p in mask:
        if p in seen: continue
        q = deque([p]); seen.add(p); pts = []
        while q:
            x, y = q.popleft(); pts.append((x, y))
            for n in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                if n in mask and n not in seen: seen.add(n); q.append(n)
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
        out.append((sum(xs) / len(pts), sum(ys) / len(pts), max(xs) - min(xs) + 1, max(ys) - min(ys) + 1, len(pts)))
    return out

def face(im, name, frontal=False):  # frontal: a three-view sheet's front, painted square on (the other pictures are three-quarter views)
    px = im.load(); nx, ny = NEAR.get(name, (100, 96)); tight = name in NEAR
    reds = [b for b in blobs(px, lambda r, g, b, a: a > 200 and r > 150 and g < 120 and b < 150 and r - g > 70) if 25 <= b[4] <= 900 and b[2] <= 40 and b[3] <= 34]
    reds = [b for b in reds if not tight or ((b[0] - nx) ** 2 + (b[1] - ny) ** 2) ** 0.5 < 14]
    m = max(reds, key=lambda b: -((b[0] - nx) ** 2 + (b[1] - ny) ** 2) ** 0.5 + min(b[4], 200) * 0.05) if reds else (nx, ny)
    mx, my = m[0], m[1] - 2  # the red is the tongue and lower lip: the mouth's middle sits a little higher
    darks = [b for b in blobs(px, lambda r, g, b, a: a > 200 and r < 95 and g < 70 and b < 120) if 30 <= b[4] <= 700 and b[2] <= 34 and b[3] <= 34]
    eyes, found = [], []
    for dx, dy in EYES:
        ex, ey = mx + dx, my + dy
        near = [b for b in darks if ((b[0] - ex) ** 2 + (b[1] - ey) ** 2) ** 0.5 < (12 if frontal else 9)]
        e = min(near, key=lambda b: (b[0] - ex) ** 2 + (b[1] - ey) ** 2) if near else (ex, ey)
        eyes += [e[0], e[1]]; found.append(bool(near))
    if frontal and found == [True, False]: eyes[2:] = [2 * mx - eyes[0], eyes[1]]  # square on: an eye not found mirrors the other across the mouth
    if frontal and found == [False, True]: eyes[:2] = [2 * mx - eyes[2], eyes[3]]
    if name in FACE_AT: mx, my, *eyes = FACE_AT[name]
    # the face's own color: between the eyes, where nothing is drawn
    sx, sy = round((eyes[0] + eyes[2]) / 2), round((eyes[1] + eyes[3]) / 2 - 1)  # between the eyes: a wide open mouth reaches up to where the old spot (toward the mouth) was
    near = [px[x, y] for x in range(max(0, sx - 3), min(192, sx + 4)) for y in range(max(0, sy - 3), min(192, sy + 4))]
    r, g, b, _ = sorted(near, key=lambda c: c[0] + c[1] + c[2])[len(near) // 2]  # the middle one by lightness: never a lip, a lash or a glint
    for k in ONE_EYE.get(name, ()): eyes[k * 2] = eyes[k * 2 + 1] = -1  # an eye that is not there to shut
    return [round(mx, 1), round(my, 1)] + [round(v, 1) for v in eyes] + [(r << 16) | (g << 8) | b]

def clean(im):  # keep the biggest connected shape of real (alpha > 40) pixels; everything else becomes clear
    w, h = im.size; px = im.load(); solid = bytearray(w * h)
    for y in range(h):
        for x in range(w):
            if px[x, y][3] > 40: solid[y * w + x] = 1
    seen = bytearray(w * h); best = []
    for i in range(w * h):
        if not solid[i] or seen[i]: continue
        q = deque([i]); seen[i] = 1; pts = []
        while q:
            j = q.popleft(); pts.append(j); x = j % w
            for n in (j - w, j + w, j - 1 if x else -1, j + 1 if x < w - 1 else -1):
                if 0 <= n < w * h and solid[n] and not seen[n]: seen[n] = 1; q.append(n)
        if len(pts) > len(best): best = pts
    keep = bytearray(w * h)
    for j in best: keep[j] = 1
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0)); op = out.load()
    for j in best: op[j % w, j // w] = px[j % w, j // w]
    return out

SIDE_LEFT = {'moss', 'cotton_candy', 'luna', 'wizard', 'eclipse', 'solaris', 'black_hole', 'midnight', 'opal', 'aurora', 'bloom', 'ember', 'frost'}  # sheets whose side view was painted looking left

def turn(sheet):  # front, side, back: each 192 px, one scale for the three, feet on the line the other pictures stand on (y 171)
    im = Image.open(sheet).convert('RGBA'); w = im.width // 3
    parts = [clean(im.crop((k * w, 0, (k + 1) * w, im.height))) for k in range(3)]
    boxes = [p.getbbox() for p in parts]
    k = 150 / max(max(b[2] - b[0], b[3] - b[1]) for b in boxes)
    views = []
    for p, b in zip(parts, boxes):
        c = p.crop(b); c = c.resize((max(1, round(c.width * k)), max(1, round(c.height * k))), Image.LANCZOS)
        v = Image.new('RGBA', (192, 192), (0, 0, 0, 0)); v.alpha_composite(c, ((192 - c.width) // 2, 171 - c.height)); views.append(v)
    if sheet.stem in SIDE_LEFT: views[1] = views[1].transpose(Image.FLIP_LEFT_RIGHT)  # every packed side looks to the right
    return views

def uri(im):
    buf = io.BytesIO(); im.save(buf, 'WEBP', quality=90, method=6)
    return 'data:image/webp;base64,' + base64.b64encode(buf.getvalue()).decode()

turns, fronts = [], set()
for sheet in sorted((root / 'design/art/turn').glob('*.png')):
    front, side, back = turn(sheet)
    fronts.add(sheet.stem); front.save(root / 'design/art/skins' / sheet.name)  # the sheet's front is the skin's picture from now on
    turns.append(f"    {sheet.stem}: {{ side: '{uri(side)}', back: '{uri(back)}' }},")
arts, faces, marked = [], [], []
for f in sorted((root / 'design/art/skins').glob('*.png')):
    im = Image.open(f).convert('RGBA'); buf = io.BytesIO(); im.save(buf, 'WEBP', quality=90, method=6)
    arts.append(f"    {f.stem}: '{uri(im)}',")
    fc = face(im, f.stem, f.stem in fronts); faces.append(f"    {f.stem}: [{', '.join(str(v) if i < 6 else hex(v) for i, v in enumerate(fc))}],")
    if len(sys.argv) > 1:
        bg = Image.new('RGBA', (384, 384), (60, 40, 100, 255)); bg.alpha_composite(im.resize((384, 384))); d = ImageDraw.Draw(bg)
        d.ellipse([2 * fc[0] - 10, 2 * fc[1] - 8, 2 * fc[0] + 10, 2 * fc[1] + 8], outline=(0, 255, 0), width=2)
        for k in (2, 4):
          if fc[k] >= 0: d.ellipse([2 * fc[k] - 8, 2 * fc[k + 1] - 8, 2 * fc[k] + 8, 2 * fc[k + 1] + 8], outline=(0, 255, 255), width=2)
        d.rectangle([330, 4, 380, 30], fill=(fc[6] >> 16, (fc[6] >> 8) & 255, fc[6] & 255)); d.text((6, 6), f.stem, fill=(255, 255, 0)); marked.append(bg.convert('RGB'))
out = root / 'www/skin-art.js'
out.write_text("// Generated by tools/skins/pack.py from design/art/skins: do not edit by hand.\n(function (root) {\n  'use strict';\n  root.DuskSkinArt = {\n"
               + '\n'.join(arts) + "\n  };\n  root.DuskSkinFace = {\n" + '\n'.join(faces) + "\n  };\n  root.DuskSkinTurn = {\n" + '\n'.join(turns) + "\n  };\n})(this);\n", encoding='utf-8')
print(len(arts), 'pictures,', out.stat().st_size // 1024, 'KB')
if marked:
    for part in (0, 1):
        sheet = Image.new('RGB', (8 * 192, 2 * 192))
        for i, im in enumerate(marked[part * 16:part * 16 + 16]): sheet.paste(im.resize((192, 192)), ((i % 8) * 192, (i // 8) * 192))
        sheet.save(sys.argv[1].replace('.png', f'{part + 1}.png'))

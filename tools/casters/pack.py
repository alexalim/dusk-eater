# Rule casters (what casts a map rule's shade, render3d CASTER_ART): painted pictures, design/art/casters/<icon>.png
# (transparent, any size) -> www/img/casters/<icon>.png, 256 px. render3d draws the old flat shape until the picture
# has loaded, and keeps it for an icon with no picture.
# Background removal leaves a soft glow round the edge (yellow, pink, grey): faint pixels are dropped, the edge is pulled
# in by 3 px of the source, only the biggest solid shape stays (stray sparkles and smears go), and the rest is trimmed and
# fitted into a 256 px square with its bottom on the bottom edge (ground casters stand on it).
# Usage: python3 tools/casters/pack.py   (from the repository root; needs Pillow)
import pathlib
from collections import deque
from PIL import Image, ImageFilter

root = pathlib.Path(__file__).resolve().parents[2]

def biggest(a):  # mask of the biggest 4-connected shape in an L image (non-zero = solid), on a quarter-size grid
    small = a.resize((a.width // 4, a.height // 4)); w, h = small.size; px = small.load()
    seen = bytearray(w * h); best = []
    for i in range(w * h):
        if seen[i] or not px[i % w, i // w]: continue
        q = deque([i]); seen[i] = 1; pts = []
        while q:
            j = q.popleft(); pts.append(j); x = j % w
            for n in (j - w, j + w, j - 1 if x else -1, j + 1 if x < w - 1 else -1):
                if 0 <= n < w * h and not seen[n] and px[n % w, n // w]: seen[n] = 1; q.append(n)
        if len(pts) > len(best): best = pts
    m = Image.new('L', (w, h), 0); mp = m.load()
    for j in best: mp[j % w, j // w] = 255
    return m.filter(ImageFilter.MaxFilter(5)).resize(a.size)

(root / 'www/img/casters').mkdir(exist_ok=True)
for src in sorted((root / 'design/art/casters').glob('*.png')):
    im = Image.open(src).convert('RGBA'); r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < 120 else v).filter(ImageFilter.MinFilter(7))
    a = Image.composite(a, Image.new('L', a.size, 0), biggest(a))
    im = Image.merge('RGBA', (r, g, b, a)); im = im.crop(a.getbbox())
    k = 250 / max(im.size); im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out = Image.new('RGBA', (256, 256), (0, 0, 0, 0)); out.alpha_composite(im, ((256 - im.width) // 2, 256 - im.height))
    out.save(root / 'www/img/casters' / src.name, optimize=True)
    print(src.stem, (root / 'www/img/casters' / src.name).stat().st_size // 1024, 'KB')

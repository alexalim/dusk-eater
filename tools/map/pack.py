# Map pictures: painted landmarks (design/art/map/<theme>.png, transparent, any size) -> www/img/map/<theme>.png, 256 px.
# The level map shows each region's picture beside the road (index.html .landmark) and as the region's icon.
# Background removal leaves a thin colored glow round the edge (yellow, pink): faint pixels are dropped, the edge is
# pulled in by 2 px of the source, and the rest is trimmed, fitted into a 256 px square (feet at the bottom) and saved.
# Maps without a painting keep the rendered tile from tools/icons/render.py, which leaves these alone.
# Usage: python3 tools/map/pack.py   (from the repository root; needs Pillow)
import pathlib
from PIL import Image, ImageFilter

root = pathlib.Path(__file__).resolve().parents[2]
for src in sorted((root / 'design/art/map').glob('*.png')):
    im = Image.open(src).convert('RGBA')
    r, g, b, a = im.split()
    a = a.point(lambda v: 0 if v < 110 else v).filter(ImageFilter.MinFilter(5))
    im = Image.merge('RGBA', (r, g, b, a)); im = im.crop(a.getbbox())
    k = 248 / max(im.size); im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    out = Image.new('RGBA', (256, 256), (0, 0, 0, 0)); out.alpha_composite(im, ((256 - im.width) // 2, 252 - im.height))
    out.save(root / 'www/img/map' / src.name, optimize=True)
    print(src.stem, (root / 'www/img/map' / src.name).stat().st_size // 1024, 'KB')

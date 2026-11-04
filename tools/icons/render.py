# Regenerates the game's raster icons (not part of the app or its tests).
#  - www/img/dex/<kind>.png: every collection-book kind, drawn with the game's own 3D part lists
#  - www/img/map/<theme>.png: each map's signature thing on a tile of the map's ground color
# Usage: python3 tools/icons/render.py   (needs Playwright + ImageMagick `convert`)
import base64, json, pathlib, re, subprocess
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[2]
WWW = ROOT / 'www'
GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']

entries = json.loads(subprocess.check_output(['node', '-e',
    "const D=require('./www/dex.js'),S=require('./www/stages.js');"
    "console.log(JSON.stringify({e:D.ENTRIES.map(e=>e.id),t:D.THEME_ORDER,g:Object.fromEntries(D.THEME_ORDER.map(t=>[t,S.THEMES[t].ground[0]]))}))"], cwd=ROOT))
SIGNATURE = {  # the thing each map is remembered by
    'town': 'building', 'city': 'taxi', 'oasis': 'fountain', 'hanok': 'pagoda', 'campus': 'student', 'snow': 'snowman',
    'market': 'stall', 'crossing': 'umbrella', 'stadium': 'ball', 'harbor': 'boat', 'construction': 'excavator',
    'park': 'carousel', 'beach': 'parasol', 'desert': 'camel', 'farm': 'cow', 'xmas': 'xtree',
}
# The instance color each kind gets in the world (index.html TYPES): its first listed color.
colors = dict(re.findall(r"^\s+(\w+):\s*\{ r: \d+,\s*color: '(#[0-9a-f]{6})'", (WWW / 'index.html').read_text(), re.M))

def save_png(data_url, path, size):
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = path.with_suffix('.raw.png'); raw.write_bytes(base64.b64decode(data_url.split(',', 1)[1]))
    subprocess.run(['convert', str(raw), '-resize', f'{size}x{size}', '-strip', '-define', 'png:compression-level=9', str(path)], check=True)
    raw.unlink()

with sync_playwright() as p:
    b = p.chromium.launch(args=GL + ['--allow-file-access-from-files'])
    pg = b.new_page()
    pg.goto((ROOT / 'tools/icons/dex.html').as_uri())
    for kid in entries['e']:
        save_png(pg.evaluate('([id, c]) => renderIcon(id, c)', [kid, colors.get(kid, '#ffffff')]), WWW / 'img/dex' / f'{kid}.png', 128)
    print('dex', len(entries['e']))

    # Map icons: the map's signature thing on a rounded tile of its ground color.
    for theme in entries['t']:
        kid = SIGNATURE[theme]
        raw = WWW / 'img/map' / f'{theme}.icon.png'
        save_png(pg.evaluate('([id, c]) => renderIcon(id, c)', [kid, colors.get(kid, '#ffffff')]), raw, 192)
        ground = entries['g'][theme]
        subprocess.run(['convert', '-size', '128x128', 'xc:none', '-fill', ground, '-draw', 'roundrectangle 2,2 125,125 30,30',
                        '(', str(raw), '-trim', '+repage', '-resize', '96x96', ')', '-gravity', 'center', '-composite', '-strip', str(WWW / 'img/map' / f'{theme}.png')], check=True)
        raw.unlink()
    print('maps', len(entries['t']))
    b.close()

# One drawing of the character, three outputs: design/app-icon.svg (1024, with background), design/splash.svg
# (2732, phone-safe middle), www/logo.svg (title screen, no background) — then the iOS PNGs through Chromium.
# The look, after the Kirby feedback: half-lidded "dusk" eyes with a star glint (no tall glossy ovals), a small
# dark void of a mouth with stars in it (no red mouth, no tongue), no pink cheeks, and a body that trails off in
# wisps at the bottom instead of sitting as a round ball. It hugs the orb of darkness and sips specks of it.
# Usage: python3 tools/icons/character.py
import os, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[2]
DEFS = '''<defs>
<radialGradient id="bg" cx="0.62" cy="0.62" r="0.85"><stop offset="0" stop-color="#7a3dff"/><stop offset=".45" stop-color="#3a0e6a"/><stop offset="1" stop-color="#0b0620"/></radialGradient>
<radialGradient id="body" cx="0.38" cy="0.3" r="0.8"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#fff7f8"/><stop offset="1" stop-color="#d9c2ff"/></radialGradient>
<radialGradient id="void" cx="0.45" cy="0.4" r="0.75"><stop offset="0" stop-color="#3a1a6a"/><stop offset=".6" stop-color="#160a33"/><stop offset="1" stop-color="#06030f"/></radialGradient>
<radialGradient id="orb" cx="0.4" cy="0.35" r="0.7"><stop offset="0" stop-color="#7a3dff"/><stop offset=".55" stop-color="#2a0b55"/><stop offset="1" stop-color="#0b0620"/></radialGradient>
<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5"><stop offset=".55" stop-color="#c94dff" stop-opacity=".7"/><stop offset="1" stop-color="#c94dff" stop-opacity="0"/></radialGradient>
</defs>'''
STAR = lambda x, y, s, fill='#fff7f8', op=1: f'<path d="M{x} {y - s} l{s * .3} {s * .7} {s * .7} {s * .3} -{s * .7} {s * .3} -{s * .3} {s * .7} -{s * .3} -{s * .7} -{s * .7} -{s * .3} {s * .7} -{s * .3}z" fill="{fill}" opacity="{op}"/>'
SHARDS = '''<g stroke="#c94dff" stroke-width="5" stroke-linejoin="round">
<path d="M150 300 l52 -30 40 44 -30 58 -58 -10z" fill="#1a0f2e"/>
<path d="M905 470 l40 22 -6 50 -46 10 -18 -44z" fill="#2a0b55"/>
<path d="M880 820 l60 -18 30 52 -40 46 -56 -26z" fill="#1a0f2e"/>
<path d="M95 880 l34 -26 34 30 -24 36 -40 -6z" fill="#2a0b55"/>
<path d="M700 95 l30 -14 24 26 -18 30 -32 -8z" fill="#2a0b55"/>
</g>
<g fill="#ead9ff" opacity=".8"><path d="M176 296 l18 -10 10 12z"/><path d="M898 812 l22 -6 8 14z"/></g>'''
# body: round on top, trailing off in two wisps at the bottom (a little dusk mist, not a ball on the ground)
BODY = ('<path d="M500 150 C 760 150 880 330 880 560 C 880 720 830 820 720 865 C 660 890 610 930 575 985 C 555 935 515 905 465 905 '
        'C 410 905 370 950 335 1000 C 330 945 300 905 250 885 C 160 850 120 760 130 680 C 140 600 170 580 160 540 C 150 320 270 150 500 150 Z" fill="url(#body)"/>'
        '<ellipse cx="380" cy="250" rx="85" ry="40" transform="rotate(-25 380 250)" fill="#fff" opacity=".7"/>')
def eye(cx, cy, rot=-8):  # a half-lidded eye: flat lid on top, round below, one star glint
    return (f'<g transform="rotate({rot} {cx} {cy})"><path d="M{cx - 48} {cy - 6} H{cx + 48} A48 52 0 0 1 {cx - 48} {cy - 6} Z" fill="#1a0f2e"/>'
            f'<path d="M{cx - 52} {cy - 6} H{cx + 52}" stroke="#cdb3f5" stroke-width="7" stroke-linecap="round"/>'
            + STAR(cx + 16, cy + 16, 13) + '</g>')
EYES = eye(300, 360) + eye(455, 320)
MOUTH = ('<ellipse cx="455" cy="500" rx="88" ry="72" transform="rotate(-8 455 500)" fill="url(#void)"/>'
         '<ellipse cx="455" cy="500" rx="88" ry="72" transform="rotate(-8 455 500)" fill="none" stroke="#c94dff" stroke-width="5" opacity=".45"/>'
         '<circle cx="428" cy="482" r="6" fill="#ead9ff"/><circle cx="480" cy="516" r="4" fill="#7debff"/><circle cx="450" cy="532" r="3" fill="#ead9ff" opacity=".8"/>'
         + STAR(470, 478, 11, op=.9))
TRAIL = '<g fill="#c94dff"><circle cx="520" cy="562" r="7" opacity=".9"/><circle cx="556" cy="598" r="6" opacity=".7"/><circle cx="586" cy="636" r="5" opacity=".5"/></g>'
ORB = '''<g transform="translate(640 720) scale(.9) translate(-640 -650)">
<circle cx="640" cy="650" r="250" fill="url(#halo)"/>
<ellipse cx="640" cy="650" rx="330" ry="92" transform="rotate(-18 640 650)" fill="none" stroke="#c94dff" stroke-width="14" opacity=".45"/>
<circle cx="640" cy="650" r="190" fill="url(#orb)"/>
<g fill="none" stroke="#c94dff" stroke-linecap="round" opacity=".9">
<path d="M520 610 C 560 520 720 520 750 620 C 770 700 680 760 620 720 C 570 690 600 630 650 650" stroke-width="16"/>
<path d="M500 700 C 540 790 700 820 770 740" stroke-width="10" opacity=".7"/>
</g>
<circle cx="575" cy="560" r="18" fill="#7debff"/><circle cx="720" cy="700" r="9" fill="#ead9ff"/>
<path d="M314 650 A 330 92 0 0 0 966 650" transform="rotate(-18 640 650)" fill="none" stroke="#e3b3ff" stroke-width="12" stroke-linecap="round" opacity=".9"/>
</g>'''
ARM = '<path d="M300 790 C 380 710 560 740 600 820 C 630 880 560 915 480 905 C 400 895 300 880 300 790 Z" fill="url(#body)" stroke="#cdb3f5" stroke-width="6"/>'
CHARACTER = SHARDS + BODY + ORB + ARM + TRAIL + MOUTH + EYES
STARS = '<g fill="#ead9ff"><circle cx="150" cy="170" r="6"/><circle cx="880" cy="140" r="8"/><circle cx="920" cy="420" r="5"/><circle cx="110" cy="560" r="5"/><circle cx="260" cy="90" r="4"/></g>' + STAR(868, 272, 42)

# the icon keeps the wisps clear of iOS's rounded corners: the scene sits a little smaller and higher
ICON = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">{DEFS}<rect width="1024" height="1024" fill="url(#bg)"/>'
        f'<g transform="translate(512 496) scale(.94) translate(-512 -512)">{STARS}{CHARACTER}</g></svg>\n')
LOGO = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="60 80 940 940">{DEFS}{CHARACTER}</svg>\n'
SPLASH = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732">\n'
          '<!-- Launch screen: the icon art on a full-bleed square (aspect-fill). A portrait phone shows about the middle\n'
          '     1260 px across, so the character and the stars stay inside x 760..1970. -->\n'
          + DEFS.replace('cx="0.62" cy="0.62" r="0.85"', 'cx="0.5" cy="0.54" r="0.5"')
          + '<rect width="2732" height="2732" fill="url(#bg)"/>'
          '<g fill="#ead9ff"><circle cx="830" cy="900" r="9"/><circle cx="1880" cy="840" r="12"/><circle cx="1930" cy="1420" r="8"/>'
          '<circle cx="800" cy="1700" r="8"/><circle cx="1050" cy="760" r="6"/><circle cx="1700" cy="1930" r="7"/><circle cx="940" cy="2010" r="6"/></g>'
          + STAR(1840, 1055, 63)
          + f'<g transform="translate(1366 1400) scale(1.05) translate(-530 -525)">{CHARACTER}</g></svg>\n')

OUT = { 'design/app-icon.svg': ICON, 'design/splash.svg': SPLASH, 'www/logo.svg': LOGO }
for rel, svg in OUT.items():
    (ROOT / rel).write_text(svg)
print('wrote', ', '.join(OUT))

# PNGs for the iOS asset catalog, rendered by Chromium so they match what the title screen shows.
from playwright.sync_api import sync_playwright
ASSETS = ROOT / 'ios/App/App/Assets.xcassets'
JOBS = [(ROOT / 'design/app-icon.svg', 1024, [ASSETS / 'AppIcon.appiconset/AppIcon-512@2x.png']),
        (ROOT / 'design/splash.svg', 2732, [ASSETS / f'Splash.imageset/splash-2732x2732{s}.png' for s in ('', '-1', '-2')])]
with sync_playwright() as p:
    b = p.chromium.launch()
    for src, size, outs in JOBS:
        pg = b.new_page(viewport={'width': size, 'height': size}, device_scale_factor=1)
        pg.goto(src.as_uri())  # the SVG as the document itself (an <img> from about:blank may not load file:// art)
        pg.wait_for_load_state('load')
        pg.screenshot(path=str(outs[0]), clip={'x': 0, 'y': 0, 'width': size, 'height': size})
        for o in outs[1:]: o.write_bytes(outs[0].read_bytes())
        pg.close()
    b.close()
print('rendered', ', '.join(str(o.relative_to(ROOT)) for _, _, outs in JOBS for o in outs))

# Writes www/img/ui/face-*.svg: the character's expressions, shaded so it reads as a soft 3D body (gradient body,
# glossy highlight, little arms, a soft ground shadow) with no outline or backdrop. Same look as tools/icons/character.py:
# half-lidded dusk eyes with a glint, a small starry void for a mouth, no pink cheeks, wisps at the bottom.
# Usage: python3 tools/icons/faces.py
import os
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'www', 'img', 'ui')
DEFS = '''<defs>
<radialGradient id="b" cx=".36" cy=".28" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#fbf4ff"/><stop offset=".85" stop-color="#e2cfff"/><stop offset="1" stop-color="#c9aef5"/></radialGradient>
<radialGradient id="a" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9c2ff"/></radialGradient>
<radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#1a0f2e" stop-opacity=".45"/><stop offset="1" stop-color="#1a0f2e" stop-opacity="0"/></radialGradient>
<radialGradient id="m" cx=".45" cy=".4" r=".75"><stop offset="0" stop-color="#3a1a6a"/><stop offset=".6" stop-color="#160a33"/><stop offset="1" stop-color="#06030f"/></radialGradient>
</defs>'''
BODY = '''<ellipse cx="32" cy="61" rx="20" ry="3" fill="url(#g)"/>
<path d="M32 11C46.5 11 55.5 23 55.5 38C55.5 48 51 54 44 56.5C41 57.5 38.5 60 37 62.5C35.5 60 33.5 58.5 31 58.5C28.5 58.5 26 60.5 24.5 63C23.5 60 21 57.5 18 56.5C11.5 54 8.5 48 8.5 38C8.5 23 17.5 11 32 11Z" fill="url(#b)"/>
<ellipse cx="22" cy="19.5" rx="7" ry="4" fill="#fff" opacity=".85" transform="rotate(-25 22 19.5)"/>
<ellipse cx="12" cy="47" rx="5.2" ry="4.4" fill="url(#a)"/><ellipse cx="52" cy="47" rx="5.2" ry="4.4" fill="url(#a)"/>'''
def eye(cx, cy, ry=4.6):  # half-lidded: a flat lavender lid, round below, a glint
    return (f'<path d="M{cx - 3.8} {cy - 1}H{cx + 3.8}A3.8 {ry} 0 0 1 {cx - 3.8} {cy - 1}Z" fill="#241640"/>'
            f'<path d="M{cx - 4.2} {cy - 1}H{cx + 4.2}" stroke="#cdb3f5" stroke-width="1.1" stroke-linecap="round"/>'
            f'<circle cx="{cx + 1.4}" cy="{cy + 1}" r="1" fill="#fff"/>')
EYES = eye(24.5, 30) + eye(39.5, 30)
VOID = lambda cx, cy, rx, ry: (f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#m)"/>'
                               f'<circle cx="{cx - rx * .3}" cy="{cy - ry * .3}" r=".7" fill="#ead9ff"/><circle cx="{cx + rx * .35}" cy="{cy + ry * .25}" r=".5" fill="#7debff"/>')
SPARK = lambda x, y, s: f'<path d="M{x} {y-s}l{s*.3} {s*.7} {s*.7} {s*.3}-{s*.7} {s*.3}-{s*.3} {s*.7}-{s*.3}-{s*.7}-{s*.7}-{s*.3} {s*.7}-{s*.3}z" fill="#ffd25c"/>'
FACES = {
    'happy': EYES + VOID(32, 43, 3.4, 2.8),
    'excited': '<path d="M20.5 31Q24.5 25 28.5 31M35.5 31Q39.5 25 43.5 31" fill="none" stroke="#241640" stroke-width="2.8" stroke-linecap="round"/>'
               + VOID(32, 44, 5, 4.6) + SPARK(9, 13, 5) + SPARK(55, 10, 4) + SPARK(57, 24, 2.6),
    'determined': '<path d="M19.5 23.5l9 3.2M44.5 23.5l-9 3.2" stroke="#241640" stroke-width="2.6" stroke-linecap="round"/>'
                  + eye(24.5, 31, 3.6) + eye(39.5, 31, 3.6)
                  + '<path d="M28 43h8" stroke="#3a1a6a" stroke-width="2.4" stroke-linecap="round"/>',
    'surprised': '<ellipse cx="24.5" cy="29.5" rx="4.8" ry="4" fill="#241640"/><ellipse cx="39.5" cy="29.5" rx="4.8" ry="4" fill="#241640"/>'
                 '<circle cx="26" cy="28.4" r="1.3" fill="#fff"/><circle cx="41" cy="28.4" r="1.3" fill="#fff"/>'
                 + VOID(32, 43.5, 4.2, 4.6)
                 + '<path d="M9 5v7M14 3.5v6.5M55 5v7" stroke="#ffd25c" stroke-width="2.8" stroke-linecap="round"/>'
                 '<circle cx="9" cy="15.5" r="1.5" fill="#ffd25c"/><circle cx="14" cy="13" r="1.5" fill="#ffd25c"/><circle cx="55" cy="15.5" r="1.5" fill="#ffd25c"/>',
    'sleepy': '<path d="M20.5 31Q24.5 34.5 28.5 31M35.5 31Q39.5 34.5 43.5 31" fill="none" stroke="#241640" stroke-width="2.6" stroke-linecap="round"/>'
              + VOID(32, 42, 2.4, 2)
              + '<path d="M45 4h6.5l-6.5 7.5h6.5M53.5 0h4l-4 4.5h4" fill="none" stroke="#b78cff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
}
for name, face in FACES.items():
    with open(os.path.join(OUT, f'face-{name}.svg'), 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{DEFS}{BODY}{face}</svg>\n')
print('wrote', len(FACES), 'faces')

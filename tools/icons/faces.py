# Writes www/img/ui/face-*.svg: the mochi character's expressions, shaded so it reads as a soft 3D body
# (gradient body, glossy highlight, little arms, a soft ground shadow) with no outline or backdrop.
# Usage: python3 tools/icons/faces.py
import os
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'www', 'img', 'ui')
DEFS = '''<defs>
<radialGradient id="b" cx=".36" cy=".28" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#fbf4ff"/><stop offset=".85" stop-color="#e2cfff"/><stop offset="1" stop-color="#c9aef5"/></radialGradient>
<radialGradient id="a" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d9c2ff"/></radialGradient>
<radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#1a0f2e" stop-opacity=".45"/><stop offset="1" stop-color="#1a0f2e" stop-opacity="0"/></radialGradient>
<radialGradient id="c" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ff8fb8" stop-opacity=".85"/><stop offset="1" stop-color="#ff8fb8" stop-opacity="0"/></radialGradient>
<linearGradient id="m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a1640"/><stop offset="1" stop-color="#d8436a"/></linearGradient>
</defs>'''
BODY = '''<ellipse cx="32" cy="58.5" rx="21" ry="3.6" fill="url(#g)"/>
<path d="M32 11C46.5 11 55.5 23 55.5 38C55.5 50.5 49.5 56.5 40 56.5H24C14.5 56.5 8.5 50.5 8.5 38C8.5 23 17.5 11 32 11Z" fill="url(#b)"/>
<ellipse cx="22" cy="19.5" rx="7" ry="4" fill="#fff" opacity=".85" transform="rotate(-25 22 19.5)"/>
<ellipse cx="12" cy="47" rx="5.2" ry="4.4" fill="url(#a)"/><ellipse cx="52" cy="47" rx="5.2" ry="4.4" fill="url(#a)"/>
<ellipse cx="17.5" cy="39" rx="5" ry="3.2" fill="url(#c)"/><ellipse cx="46.5" cy="39" rx="5" ry="3.2" fill="url(#c)"/>'''
EYES = '''<ellipse cx="24.5" cy="30" rx="3.8" ry="5.2" fill="#241640"/><ellipse cx="39.5" cy="30" rx="3.8" ry="5.2" fill="#241640"/>
<circle cx="25.8" cy="27.8" r="1.6" fill="#fff"/><circle cx="40.8" cy="27.8" r="1.6" fill="#fff"/><circle cx="23.6" cy="32.2" r=".8" fill="#fff" opacity=".8"/><circle cx="38.6" cy="32.2" r=".8" fill="#fff" opacity=".8"/>'''
SPARK = lambda x, y, s: f'<path d="M{x} {y-s}l{s*.3} {s*.7} {s*.7} {s*.3}-{s*.7} {s*.3}-{s*.3} {s*.7}-{s*.3}-{s*.7}-{s*.7}-{s*.3} {s*.7}-{s*.3}z" fill="#ffd25c"/>'
FACES = {
    'happy': EYES + '<path d="M26.5 40.5Q32 48.5 37.5 40.5Z" fill="url(#m)"/><ellipse cx="32" cy="44.6" rx="2.6" ry="1.4" fill="#ff8fb0"/>',
    'excited': '<path d="M20.5 31Q24.5 25 28.5 31M35.5 31Q39.5 25 43.5 31" fill="none" stroke="#241640" stroke-width="2.8" stroke-linecap="round"/>'
               '<path d="M24.5 38.5Q32 52 39.5 38.5Z" fill="url(#m)"/><ellipse cx="32" cy="45.2" rx="3.6" ry="2" fill="#ff8fb0"/>'
               + SPARK(9, 13, 5) + SPARK(55, 10, 4) + SPARK(57, 24, 2.6),
    'determined': '<path d="M19.5 23.5l9 3.2M44.5 23.5l-9 3.2" stroke="#241640" stroke-width="2.6" stroke-linecap="round"/>'
                  '<ellipse cx="24.5" cy="31.5" rx="3.4" ry="3.8" fill="#241640"/><ellipse cx="39.5" cy="31.5" rx="3.4" ry="3.8" fill="#241640"/>'
                  '<circle cx="25.6" cy="30" r="1.2" fill="#fff"/><circle cx="40.6" cy="30" r="1.2" fill="#fff"/>'
                  '<path d="M27.5 42.5Q32 40.5 36.5 42.5" fill="none" stroke="#a3204e" stroke-width="2.6" stroke-linecap="round"/>',
    'surprised': '<circle cx="24.5" cy="29.5" r="5.2" fill="#241640"/><circle cx="39.5" cy="29.5" r="5.2" fill="#241640"/>'
                 '<circle cx="26.2" cy="27.4" r="1.9" fill="#fff"/><circle cx="41.2" cy="27.4" r="1.9" fill="#fff"/>'
                 '<ellipse cx="32" cy="43.5" rx="4" ry="5" fill="url(#m)"/>'
                 '<path d="M9 5v7M14 3.5v6.5M55 5v7" stroke="#ffd25c" stroke-width="2.8" stroke-linecap="round"/>'
                 '<circle cx="9" cy="15.5" r="1.5" fill="#ffd25c"/><circle cx="14" cy="13" r="1.5" fill="#ffd25c"/><circle cx="55" cy="15.5" r="1.5" fill="#ffd25c"/>',
    'sleepy': '<path d="M20.5 31Q24.5 34.5 28.5 31M35.5 31Q39.5 34.5 43.5 31" fill="none" stroke="#241640" stroke-width="2.6" stroke-linecap="round"/>'
              '<ellipse cx="32" cy="42" rx="2.6" ry="2.1" fill="url(#m)"/>'
              '<path d="M45 4h6.5l-6.5 7.5h6.5M53.5 0h4l-4 4.5h4" fill="none" stroke="#b78cff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
}
for name, face in FACES.items():
    with open(os.path.join(OUT, f'face-{name}.svg'), 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{DEFS}{BODY}{face}</svg>\n')
print('wrote', len(FACES), 'faces')

# Writes www/img/ui/face-*.svg: the character's expressions, shaded so it reads as a soft 3D body (gradient body,
# glossy highlight, little arms, a soft ground shadow) with no outline or backdrop. Same look as the painted art in
# design/art and the 3D body: a curled tuft, a gold crescent on the brow, round eyes with a four-point sparkle, pink
# cheeks, a glowing star on the belly and a scalloped hem.
# Usage: python3 tools/icons/faces.py
import os
OUT = os.path.join(os.path.dirname(__file__), '..', '..', 'www', 'img', 'ui')
DEFS = '''<defs>
<radialGradient id="b" cx=".36" cy=".26" r=".9"><stop offset="0" stop-color="#ffffff"/><stop offset=".45" stop-color="#ecdfff"/><stop offset=".82" stop-color="#cfb8f8"/><stop offset="1" stop-color="#b393e6"/></radialGradient>
<radialGradient id="a" cx=".4" cy=".3" r=".8"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#d3bcfa"/></radialGradient>
<radialGradient id="g" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#1a0f2e" stop-opacity=".45"/><stop offset="1" stop-color="#1a0f2e" stop-opacity="0"/></radialGradient>
<radialGradient id="m" cx=".45" cy=".4" r=".75"><stop offset="0" stop-color="#5a2470"/><stop offset="1" stop-color="#2a1048"/></radialGradient>
<radialGradient id="e" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#5b2a9a"/><stop offset="1" stop-color="#1d0f3d"/></radialGradient>
<radialGradient id="w" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".95"/><stop offset=".5" stop-color="#ffcf8a" stop-opacity=".5"/><stop offset="1" stop-color="#ffcf8a" stop-opacity="0"/></radialGradient>
<mask id="c"><rect width="64" height="64" fill="#fff"/><circle cx="22.7" cy="19" r="4.3" fill="#000"/></mask>
</defs>'''
STAR = lambda cx, cy, r: 'M' + 'L'.join(f'{cx + (r if k % 2 == 0 else r * .5) * __import__("math").sin(k * __import__("math").pi / 5):.2f} '
                                         f'{cy - (r if k % 2 == 0 else r * .5) * __import__("math").cos(k * __import__("math").pi / 5):.2f}' for k in range(10)) + 'Z'
BODY = f'''<ellipse cx="32" cy="61" rx="20" ry="3" fill="url(#g)"/>
<path d="M28 15C28.5 8 34 2.5 40 3.6C44.2 4.4 45.4 8.8 42.8 10.4C41 11.5 39 10.3 39.6 8.6C36.6 8.4 35.4 11.4 36.4 15Z" fill="#e4d6ff"/>
<path d="M32 11.5C46 11.5 55.5 23.5 55.5 38C55.5 46.5 53 52.5 49 55.5Q45 59.5 41 56.5Q36.5 60.5 32 57.5Q27.5 60.5 23 56.5Q19 59.5 15 55.5C11 52.5 8.5 46.5 8.5 38C8.5 23.5 18 11.5 32 11.5Z" fill="url(#b)"/>
<ellipse cx="32" cy="50" rx="17" ry="10" fill="url(#w)"/>
<ellipse cx="24" cy="16.5" rx="5" ry="2.6" fill="#fff" opacity=".7" transform="rotate(-25 24 16.5)"/>
<ellipse cx="11.5" cy="46" rx="5.2" ry="4.4" fill="url(#a)"/><ellipse cx="52.5" cy="46" rx="5.2" ry="4.4" fill="url(#a)"/>
<circle cx="20.5" cy="21" r="5" fill="#f6c443" mask="url(#c)"/>
<ellipse cx="17" cy="37.5" rx="3.7" ry="2.3" fill="#ff9fb0" opacity=".8"/><ellipse cx="47" cy="37.5" rx="3.7" ry="2.3" fill="#ff9fb0" opacity=".8"/>
<path d="{STAR(32, 51, 5.2)}" fill="#ffd45e" stroke="#fff3c4" stroke-width="1" stroke-linejoin="round"/>'''
def twinkle(cx, cy, s):  # the four-point sparkle inside an eye
    return f'<path d="M{cx} {cy - s}l{s * .28} {s * .72} {s * .72} {s * .28}-{s * .72} {s * .28}-{s * .28} {s * .72}-{s * .28}-{s * .72}-{s * .72}-{s * .28} {s * .72}-{s * .28}z" fill="#fff1b8"/>'
def eye(cx, cy, r=4.7):  # round and dark with a sparkle, as in the painted art
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#e)"/>' + twinkle(cx - .2, cy - .2, r * .62)
EYES = eye(24.5, 31) + eye(39.5, 31)
SMILE = lambda cx, cy, w, h: (f'<path d="M{cx - w} {cy}Q{cx} {cy - h * .25} {cx + w} {cy}Q{cx + w * .8} {cy + h} {cx} {cy + h}Q{cx - w * .8} {cy + h} {cx - w} {cy}Z" fill="url(#m)"/>'
                              f'<ellipse cx="{cx}" cy="{cy + h * .78}" rx="{w * .5}" ry="{h * .26}" fill="#ff8fa3"/>')
VOID = lambda cx, cy, rx, ry: f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="url(#m)"/>'
SPARK = lambda x, y, s: f'<path d="M{x} {y-s}l{s*.3} {s*.7} {s*.7} {s*.3}-{s*.7} {s*.3}-{s*.3} {s*.7}-{s*.3}-{s*.7}-{s*.7}-{s*.3} {s*.7}-{s*.3}z" fill="#ffd25c"/>'
FACES = {
    'happy': EYES + SMILE(32, 40, 3.6, 4.6),
    'excited': '<path d="M20.5 32.5Q24.5 26 28.5 32.5M35.5 32.5Q39.5 26 43.5 32.5" fill="none" stroke="#2a1452" stroke-width="2.8" stroke-linecap="round"/>'
               + SMILE(32, 39.5, 4.6, 5.6) + SPARK(8, 12, 5) + SPARK(56, 12, 4) + SPARK(58, 25, 2.6),
    'determined': '<path d="M19.5 24.2l9 2.8M44.5 24.2l-9 2.8" stroke="#2a1452" stroke-width="2.6" stroke-linecap="round"/>'
                  + eye(24.5, 32, 4.1) + eye(39.5, 32, 4.1)
                  + '<path d="M28.5 42.5h7" stroke="#4a1d5e" stroke-width="2.4" stroke-linecap="round"/>',
    'surprised': '<circle cx="24.5" cy="30.5" r="5.2" fill="url(#e)"/><circle cx="39.5" cy="30.5" r="5.2" fill="url(#e)"/>'
                 '<circle cx="26.2" cy="28.8" r="1.6" fill="#fff"/><circle cx="41.2" cy="28.8" r="1.6" fill="#fff"/>'
                 + VOID(32, 42, 3, 3.4)
                 + '<path d="M7 5v7M12 3.5v6.5M56 5v7" stroke="#ffd25c" stroke-width="2.8" stroke-linecap="round"/>'
                 '<circle cx="7" cy="15.5" r="1.5" fill="#ffd25c"/><circle cx="12" cy="13" r="1.5" fill="#ffd25c"/><circle cx="56" cy="15.5" r="1.5" fill="#ffd25c"/>',
    'sleepy': '<path d="M20.5 31Q24.5 35 28.5 31M35.5 31Q39.5 35 43.5 31" fill="none" stroke="#2a1452" stroke-width="2.6" stroke-linecap="round"/>'
              + VOID(32, 41.5, 2.2, 1.8)
              + '<path d="M48 5h6.5l-6.5 7.5h6.5M56.5 .8h4l-4 4.5h4" fill="none" stroke="#b78cff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
}
for name, face in FACES.items():
    with open(os.path.join(OUT, f'face-{name}.svg'), 'w') as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">{DEFS}{BODY}{face}</svg>\n')
print('wrote', len(FACES), 'faces')

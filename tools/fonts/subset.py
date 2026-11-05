# Rebuilds www/fonts/*.woff: the KS X 1001 Hangul (2,350 common syllables) plus every character the game's sources use.
# Usage: python3 tools/fonts/subset.py <dir with Jua-Regular.ttf and NanumSquareRound{R,B,EB}.ttf>
#   Jua: github.com/google/fonts (ofl/jua)   NanumSquareRound: hangeul.naver.com (webfont .ttf)
# Re-run after adding text with a rare Hangul syllable, or it falls back to the system font.
import glob, os, sys
from fontTools import subset

src_dir = sys.argv[1]
root = os.path.join(os.path.dirname(__file__), '..', '..', 'www')
ks = ''.join(bytes([a, b]).decode('euc-kr') for a in range(0xB0, 0xC9) for b in range(0xA1, 0xFF))
used = ''.join(open(f, encoding='utf8').read() for f in glob.glob(os.path.join(root, '*.js')) + glob.glob(os.path.join(root, '*.html')))
text = set(ks) | {c for c in used if ord(c) >= 0x80} | {chr(c) for c in range(0x20, 0x7f)} | set('·‹›×…~₩★☆→←—–‘’“”•%')
chars = os.path.join(root, '..', 'tools', 'fonts', '.chars.txt')
open(chars, 'w', encoding='utf8').write(''.join(sorted(text)))
for name, out in [('Jua-Regular.ttf', 'jua.woff'), ('NanumSquareRoundR.ttf', 'nanum-round-r.woff'),
                  ('NanumSquareRoundB.ttf', 'nanum-round-b.woff'), ('NanumSquareRoundEB.ttf', 'nanum-round-eb.woff')]:
    dst = os.path.join(root, 'fonts', out)
    subset.main([os.path.join(src_dir, name), f'--text-file={chars}', f'--output-file={dst}', '--flavor=woff',
                 '--layout-features=*', '--no-hinting', '--desubroutinize'])
    print(out, os.path.getsize(dst) // 1024, 'KB')
os.remove(chars)

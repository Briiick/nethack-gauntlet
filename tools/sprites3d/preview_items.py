"""Contact sheet of rendered item icons: python3 preview_items.py objects.json items32.png out.png [cls,...]"""
import json, sys
from PIL import Image, ImageDraw
objs = json.load(open(sys.argv[1])); atlas = Image.open(sys.argv[2]).convert('RGBA'); sz = atlas.height // ((max(o['i'] for o in objs) + 32) // 32)
sz = 32 if 'items32' in sys.argv[2] else 24
cls = set(int(c) for c in sys.argv[4].split(',')) if len(sys.argv) > 4 else None
cells = []
for o in objs:
    if cls and o['cls'] not in cls: continue
    i = o['i']; c = atlas.crop(((i % 32) * sz, (i // 32) * sz, (i % 32 + 1) * sz, (i // 32 + 1) * sz))
    if c.getbbox(): cells.append((o, c))
S, cols = 4, 12
W, H = sz * S + 8, sz * S + 22
sheet = Image.new('RGBA', (cols * W, ((len(cells) + cols - 1) // cols) * H), (34, 40, 37, 255))
d = ImageDraw.Draw(sheet)
for n, (o, c) in enumerate(cells):
    x, y = (n % cols) * W, (n // cols) * H
    sheet.alpha_composite(c.resize((sz * S, sz * S), Image.NEAREST), (x + 4, y + 2))
    d.text((x + 4, y + sz * S + 4), ((o['name'] or '')[:13] + '/' + (o['descr'] or '')[:8]), fill=(220, 220, 200, 255))
sheet.save(sys.argv[3]); print(len(cells))

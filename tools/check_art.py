#!/usr/bin/env python3
"""Check the redrawn art depicts the right NetHack thing for every glyph.

Monsters: each monster glyph's sprite sheet must be the monster NetHack names for that glyph
(its gendered and {alias} names count; female forms share the species' sprite).
Objects: each object glyph's icon must be the object NetHack names for that glyph.

Usage: python3 tools/check_art.py   (exit status 1 on any mismatch)
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
t = json.loads((ROOT / 'public/assets/tiles.json').read_text())
man = json.loads((ROOT / 'public/assets/actors/manifest.json').read_text())
objs = {o['i']: o for o in json.loads((ROOT / 'tools/sprites3d/objects.json').read_text())}
cls = t['classes']
strip = lambda n: re.sub(r'^(pet |detected |ridden )?', '', n)

male = {t['gmon'][g] for g, n in enumerate(t['gname']) if cls[t['gcls'][g]] == 'mon' and strip(n).startswith('male ')}
bad, mons, female = [], 0, 0
for g, n in enumerate(t['gname']):
    m = t['gmon'][g]
    if cls[t['gcls'][g]] != 'mon' or m < 0 or n == 'invisible mon':   # the unseen-monster marker is drawn specially
        continue
    mons += 1
    base = strip(n)
    names = {re.sub(r'\s*\{[^}]*\}', '', base), *re.findall(r'\{([^}]*)\}', base)}
    names |= {re.sub(r'^(male|female) ', '', x) for x in names}
    sprite = man.get(str(m), {}).get('name')
    if sprite in names:
        continue
    if base.startswith('female ') and m in male:
        female += 1
        continue
    bad.append(f'monster glyph {g} "{n}" draws "{sprite}"')

items = 0
for g, n in enumerate(t['gname']):
    o = t['gobj'][g]
    if o < 0 or 'body of' in n:
        continue
    items += 1
    x = objs[o]
    parts = [p.strip() for p in re.sub(r'^piletop ', '', n).split(' / ')]
    if not any(p in (x['name'], x['descr'], x['name'].replace('generic ', '')) for p in parts) and x['name'] not in n:
        bad.append(f'object glyph {g} "{n}" draws "{x["name"]}"')

print(f'{mons} monster glyphs ({female} female forms share their species sprite), {items} object glyphs, {len(bad)} wrong')
for b in bad:
    print(' -', b)
sys.exit(1 if bad else 0)

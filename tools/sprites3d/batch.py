"""Render every NetHack monster: 4 directions x (2 idle + 4 walk + 3 attack) frames."""
import json, math, os, sys
from multiprocessing import Pool
import numpy as np
from PIL import Image
import rigs
from materials import mats as make_mats
from roster import parse_monsters, spec
from sdf import render

DIRS = [0.0, math.pi / 2, math.pi, -math.pi / 2]          # south, east, north, west
POSES = [{'breath': 0.0}, {'breath': 0.5, 'blink': 1.0},
         {'walk': 0.0}, {'walk': math.pi / 2}, {'walk': math.pi}, {'walk': 3 * math.pi / 2},
         {'attack': 0.25}, {'attack': 0.6}, {'attack': 0.92}]


def job(args):
    idx, mon, out = args
    rig, g, m = spec(mon, idx)
    fn = getattr(rigs, rig)
    mats = make_mats(**m)
    big = g.get('scale', 1.0) > 1.75 or rig in ('quadruped',) and g.get('scale', 1) > 1.9 or (mon['size'] in ('MZ_HUGE', 'MZ_GIGANTIC'))
    size = 64 if big else 48
    feet = (size // 2, size - 5)
    sheet = Image.new('RGBA', (size * len(POSES), size * len(DIRS)), (0, 0, 0, 0))
    for r, d in enumerate(DIRS):
        for c, pose in enumerate(POSES):
            if rig != 'floating_eye' and 'blink' in pose:
                pose = {'breath': 0.5}
            try:
                img = render(fn(g, pose), mats, size=size, feet=feet, facing=d)
            except Exception as e:  # keep going; report the monster
                print('fail', idx, mon['name'], e, flush=True)
                return idx, None
            sheet.alpha_composite(Image.fromarray(img, 'RGBA'), (c * size, r * size))
    sheet.save(os.path.join(out, f'{idx}.png'), optimize=True)
    return idx, {'size': size, 'feet': list(feet), 'rig': rig, 'name': mon['name']}


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    only = set(int(x) for x in sys.argv[3].split(',')) if len(sys.argv) > 3 else None
    os.makedirs(out, exist_ok=True)
    mons = parse_monsters(os.path.join(src, 'include', 'monsters.h'))
    work = [(i, m, out) for i, m in enumerate(mons) if only is None or i in only]
    manifest_path = os.path.join(out, 'manifest.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    with Pool(int(os.environ.get('JOBS', os.cpu_count()))) as pool:
        for n, (idx, meta) in enumerate(pool.imap_unordered(job, work)):
            if meta:
                manifest[str(idx)] = meta
            if n % 10 == 0:
                print(f'{n + 1}/{len(work)}', flush=True)
                json.dump(manifest, open(manifest_path, 'w'))
    json.dump({'dirs': ['S', 'E', 'N', 'W'], 'frames': ['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2'], **{'monsters': manifest}} if False else manifest, open(manifest_path, 'w'))
    print('done', len(manifest))

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


# Long-bodied rigs seen straight from the front/back foreshorten into a thin
# vertical stalk (and read upside-down in portraits), so their south and north
# rows are turned a little toward three-quarter view.
YAW = {'quadruped': 0.62, 'bird': 0.45, 'serpent': 0.5, 'centaur': 0.55, 'gorilla': 0.3, 'tentacled': 0.0}


def job(args):
    idx, mon, out = args
    rig, g, m = spec(mon, idx)
    fn = getattr(rigs, rig)
    mats = make_mats(**m)
    big = g['big'] if 'big' in g else g.get('scale', 1.0) > 1.75 or rig in ('quadruped',) and g.get('scale', 1) > 1.9 or (mon['size'] in ('MZ_HUGE', 'MZ_GIGANTIC'))
    size = 64 if big else 48
    feet = (size // 2, size - 5)
    sheet = Image.new('RGBA', (size * len(POSES), size * len(DIRS)), (0, 0, 0, 0))
    M = 10                      # render margin so each row can be re-centred if a pose spills out of the frame
    for r, d in enumerate(DIRS):
        row = []
        for c, pose in enumerate(POSES):
            if rig != 'floating_eye' and 'blink' in pose:
                pose = {'breath': 0.5}
            try:
                yaw = g.get('yaw', YAW.get(rig, 0.0)) if r in (0, 2) else 0.0
                img = render(fn(g, pose), mats, size=size + 2 * M, feet=(feet[0] + M, feet[1] + M), facing=d + yaw)
                if g.get('alpha'):            # ghosts, shades, stalkers: translucent
                    img = img.copy(); img[:, :, 3] = (img[:, :, 3] * g['alpha']).astype(np.uint8)
            except Exception as e:  # keep going; report the monster
                print('fail', idx, mon['name'], e, flush=True)
                return idx, None
            row.append(img)
        ys, xs = np.nonzero(np.max([im[:, :, 3] for im in row], axis=0))
        ox = oy = M
        if len(xs):
            x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
            if y1 - y0 >= size - 1:                     # taller than the frame: centre it
                oy = (y0 + y1 - size) // 2 + 1
            elif y1 > M + size - 2:                     # spills below: slide the window down (sprite moves up)
                oy = min(y1 - (size - 2), y0)
            elif y0 < M:                                # spills above: borrow a little of the margin under the feet
                oy = max(y0, M - 3, y1 - size + 2)
            if x1 - x0 >= size:                         # wider than the frame: centre it
                ox = (x0 + x1 + 1 - size) // 2
            else:                                       # smallest sideways nudge that fits it in
                ox = min(max(M, x1 - size + 1), x0)
            ox = int(min(max(ox, 0), 2 * M)); oy = int(min(max(oy, 0), 2 * M))
        for c, img in enumerate(row):
            sheet.alpha_composite(Image.fromarray(np.ascontiguousarray(img[oy:oy + size, ox:ox + size]), 'RGBA'), (c * size, r * size))
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

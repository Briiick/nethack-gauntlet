"""Render a corpse sprite for every NetHack monster into one atlas.

    python3 tools/sprites3d/corpses.py <nethack-src> public/assets [comma-separated mnums]

Each monster's rig is posed dead (humanoids on their backs with limbs flung out, beasts on
their side with stiff legs, bugs belly-up, bats and dragons slumped flat, blobs and vortices
collapsed into puddles), set on the floor under the game's pitched camera, drained of colour
with the glow gone from its eyes, and given a small pool of blood or ichor. Output:

    corpses.png   the atlas
    corpses.json  {"<mnum>": [x, y, w, h, anchorX, anchorY]}

The anchor is the pixel (inside the sprite) of the corpse's footprint centre on the floor;
public/js/corpses.js puts it at (12, 14) of a 24 px cell. With a list of mnums only those
are re-rendered and merged into the existing atlas.
"""
import colorsys
import copy
import json
import math
import os
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import rigs  # noqa: E402
from materials import mats as make_mats  # noqa: E402
from roster import parse_monsters, spec  # noqa: E402
from sdf import UP, Material, Prim, rot_x, rot_y, rot_z, scene_sdf, render  # noqa: E402
from rigs import FlatEllipse  # noqa: E402

CELL = 24
# Largest corpse (w, h) in pixels by NetHack size class; a big monster may spill out of its cell.
FIT = {'MZ_TINY': (16, 12), 'MZ_SMALL': (20, 15), 'MZ_MEDIUM': (23, 18), 'MZ_HUMAN': (23, 18),
       'MZ_LARGE': (30, 22), 'MZ_HUGE': (37, 25), 'MZ_GIGANTIC': (37, 25)}
CANVAS, FEET = 112, (56, 64)

# ------------------------------------------------------------------ geometry helpers


class Placed(Prim):
    """A rig primitive moved into the world by world = A @ model + t (A may scale)."""
    def __init__(self, inner, Ainv, t, k):
        self.inner, self.mat, self.blend, self.cut = inner, inner.mat, inner.blend, None
        self.Ainv, self.t, self.k = Ainv, np.asarray(t, float), k

    def dist(self, p):
        d = self.inner.dist((p - self.t) @ self.Ainv.T) * self.k
        return np.maximum(d, -p[:, 1] - 0.05)          # nothing sinks below the floor


def place(prims, A, t):
    A = np.asarray(A, float)
    k = float(np.linalg.svd(A, compute_uv=False).min())  # keeps the distance bound conservative
    Ainv = np.linalg.inv(A)
    return [Placed(p, Ainv, t, k) for p in prims]


def diag(x, y, z):
    return np.diag([x, y, z]).astype(float)


def inside_points(groups, step):
    """World-space sample points inside the posed body (before the final ground shift)."""
    pts = []
    for prims, A, t in groups:
        A = np.asarray(A, float)
        lo, hi = np.array([-36.0, -8.0, -36.0]), np.array([36.0, 60.0, 36.0])
        axes = [np.arange(lo[i], hi[i], step) for i in range(3)]
        G = np.stack(np.meshgrid(*axes, indexing='ij'), -1).reshape(-1, 3)
        d, _ = scene_sdf(prims, G)
        P = G[d < 0]
        if len(P):
            pts.append(P @ A.T + t)
    return np.concatenate(pts) if pts else np.zeros((0, 3))


# ------------------------------------------------------------------ dead poses
ON_BACK = rot_y(1.2) @ rot_x(-math.pi / 2) @ rot_y(0.25)          # head to the west, face up, a slight roll
ON_SIDE = rot_y(1.38) @ rot_z(-math.pi / 2 - 0.12)                 # head east, legs out toward the viewer


def dead_pose(rig, g, mon):
    """Return [(prims, A, t)] groups for the rig lying dead, in un-grounded world space."""
    g = dict(g)
    g.pop('alpha', None)
    still = {'breath': 0.0}
    if rig == 'humanoid':
        g['shield'] = None
        if g.get('no_legs') and g.get('smoke_tail'):              # djinn/elementals: the tail lies flat behind
            pass
        if g.get('wings') and g.get('wing_style') != 'insect':    # winged demons fall face down, wings spread
            A = rot_y(1.2) @ rot_x(math.pi / 2 - 0.15) @ rot_y(-0.2)
            return [(rigs.humanoid(g, {'dead': True, 'breath': 0.0}), A, np.zeros(3))]
        return [(rigs.humanoid(g, {'dead': True, 'breath': 0.0}), ON_BACK, np.zeros(3))]
    if rig == 'golem':
        return [(rigs.golem(g, still), ON_BACK, np.zeros(3))]
    if rig == 'gorilla':                                           # apes keel over on their side
        return [(rigs.gorilla(g, still), rot_y(0.25) @ rot_z(-math.pi / 2 + 0.25), np.zeros(3))]
    if rig in ('quadruped', 'centaur'):
        if g.get('wings'):                                         # dragons: slumped on the belly, wings draped
            g.update(head_up=0.6, neck=0.0, sprawl=1.2, hip_w=1.25)
            A = rot_y(1.3) @ rot_z(0.22) @ diag(1.0, 0.55, 1.0)
            return [(rigs.quadruped(g, {'walk': 0.4}), A, np.zeros(3))]
        fn = rigs.centaur if rig == 'centaur' else rigs.quadruped
        return [(fn(g, {'walk': 0.35}), ON_SIDE, np.zeros(3))]
    if rig == 'insect':                                            # belly up, legs curled in the air
        g['leg_r'] = 1.7
        return [(rigs.insect(g, {'walk': 0.5, 'dead': True}), rot_y(0.45) @ rot_z(math.pi - 0.35), np.zeros(3))]
    if rig == 'bird':
        return [(rigs.bird(g, still), rot_y(1.38) @ rot_z(-math.pi / 2 - 0.5), np.zeros(3))]
    if rig == 'winged':                                            # bats and birds: flat on the floor, wings spread
        if g.get('bat_wings'):                                     # bats: on the back, wings pinned out flat
            g['wing_tilt'] = 0.1
            return [(rigs.winged(g, {'breath': 0.0}), rot_y(0.2) @ rot_x(-math.pi / 2 + 0.8) @ rot_z(0.15), np.zeros(3))]
        return [(rigs.winged(g, {'breath': 0.0}), rot_y(0.2) @ rot_z(0.15) @ rot_x(0.55), np.zeros(3))]
    if rig == 'blob':
        if g.get('piercer') or g.get('mushroom'):                  # toppled over
            return [(rigs.blob(g, still), rot_y(0.3) @ rot_z(1.45), np.zeros(3))]
        return [(rigs.blob(g, still), diag(1.25, 0.42, 1.2), np.zeros(3))]
    if rig == 'floating_eye':                                      # fallen, staring up
        return [(rigs.floating_eye(g, still), rot_x(-1.0) @ diag(1.0, 0.9, 1.0), np.zeros(3))]
    if rig == 'vortex':                                            # dissipated swirl
        return [(rigs.vortex(g, still), diag(1.25, 0.22, 1.2), np.zeros(3))]
    if rig == 'tentacled':
        return [(rigs.tentacled(g, still), diag(1.1, 0.5, 1.1), np.zeros(3))]
    if rig == 'jellyfish':                                         # a collapsed bell with tentacles strewn about
        return [(rigs.jellyfish(g, still), rot_x(0.5) @ diag(1.15, 0.35, 1.15), np.zeros(3))]
    if rig == 'fish':
        return [(rigs.fish(g, still), ON_SIDE, np.zeros(3))]
    if rig == 'serpent':
        if g.get('naga'):
            return naga_corpse(g, mon)
        g.pop('hood', None)                                       # a dead cobra no longer rears
        g['rear'] = 0
        A = rot_y(1.1) @ (diag(1.0, 0.45, 1.0) if g.get('wings') else np.eye(3))   # couatl: wings flattened out
        return [(rigs.serpent(g, {'walk': 0.9}), A, np.zeros(3))]
    if rig == 'naga':
        return naga_corpse(g, mon)
    return [(getattr(rigs, rig)(g, still), ON_BACK, np.zeros(3))]


def naga_corpse(g, mon):
    """A snake body stretched out on the floor ending in the naga's head (or, for mariliths and
    Geryon, its humanoid upper body lying on its back)."""
    s = g.get('scale', 1.0)
    sg = dict(body=g['body'], bands=g.get('bands', g['body']), scale=s * 0.95, girth=g.get('girth', 1.0) * 1.1, naga=False, glow=False)
    body = rigs.serpent(sg, {'walk': 0.9})
    body = body[:9]                                                # beads only: drop the snake head and eyes
    yaw = rot_y(1.1)
    groups = [(body, yaw, np.zeros(3))]
    head = yaw @ np.array([0, 0, 4.6 * s * 0.95])
    if g.get('upper'):
        u = dict(g['upper']); u['shield'] = None
        A = rot_y(1.1) @ rot_x(-math.pi / 2) @ rot_y(0.2)
        up = rigs.humanoid(dict(u, no_legs=True, leg_len=0.0, hip_lift=0.0), {'dead': True, 'breath': 0.0})
        groups.append((up, A, head + yaw @ np.array([0, 0, 1.5 * s])))
        return groups
    from sdf import Ellipsoid, Sphere
    hr = 2.4 * s
    hc = np.array([0, 0, 0.0])
    P = [Ellipsoid(hc + [0, 0.4 * s, -1.6 * s], np.array([hr * 1.4, hr * 1.15, hr * 0.45]), g.get('crest', g['body']), blend=0.3),
         Sphere(hc, hr, g.get('face', 'skin'), blend=0.4),
         Sphere(hc + [0, 0.6 * s, -0.5 * s], hr * 1.02, g.get('hair', g.get('crest', g['body'])), blend=0.2, cut=([0, 1, -0.9], 0.9 * s)),
         Sphere(hc + [0, -0.7 * s, hr * 0.98], 0.32 * s, g.get('face', 'skin'))]
    for sgn in (1, -1):
        P.append(Sphere(hc + [0.95 * sgn * s, 0.1 * s, hr * 0.86], 0.45 * s, 'eye'))
    # the head lolls on its side at the front of the body, face toward the viewer
    A = rot_y(0.5) @ rot_x(-1.0) @ rot_z(0.35)
    groups.append((P, A, head + yaw @ np.array([0, 0, 1.6 * s])))
    return groups


# ------------------------------------------------------------------ materials and blood
DEAD_EYES = Material('#2a2024', detail=True)


def deaden(mats):
    """Drain colour and light: desaturate and darken every ramp, glowing eyes go dull."""
    out = {}
    for k, m in mats.items():
        if k in ('eye_glow', 'eye_white') or (m.glow and m.detail and k.startswith('eye')):
            out[k] = DEAD_EYES
            continue
        m2 = copy.copy(m)
        ramp = {}
        for lv, (r, gg, b) in m.ramp.items():
            h, l, s = colorsys.rgb_to_hls(r / 255, gg / 255, b / 255)
            l = l * 0.85 + 0.02
            s = s * (0.6 if not m.glow else 0.75)
            rr, g2, bb = colorsys.hls_to_rgb((h + ((0.08 - h + 0.5) % 1 - 0.5) * 0.12) % 1, l, s)   # a little toward sallow
            ramp[lv] = (int(rr * 255), int(g2 * 255), int(bb * 255))
        m2.ramp = ramp
        m2.glow = False
        out[k] = m2
    return out


def fluid(mon, rig, g, mats):
    """Colour of the pool the corpse lies in (None: no pool)."""
    c, n = mon['cls'], mon['name']
    if c in ('S_GOLEM', 'S_VORTEX', 'S_ELEMENTAL', 'S_LIGHT', 'S_FUNGUS', 'S_GHOST', 'S_WRAITH') or rig == 'vortex':
        return None
    if c in ('S_LICH',) or 'skeleton' in n or c == 'S_MUMMY':
        return '#4a4034'                                           # grave dust
    if c in ('S_ANT', 'S_SPIDER', 'S_XAN'):
        return '#7a8a1a'
    if c in ('S_BLOB', 'S_JELLY', 'S_PUDDING'):
        return None                                                 # the corpse is already a puddle
    if c == 'S_ZOMBIE':
        return '#3a2a1a'
    if n == 'jellyfish':
        return '#3a5aa0'
    if c in ('S_DEMON', 'S_IMP'):
        return '#3a0a0e'
    if n in ('green slime',) or 'acid' in n:
        return '#4a8a1a'
    return '#6a0e0e'


def pool(pts, color, size):
    """A few overlapping flat ellipses under and just in front of the body."""
    from sdf import Ellipsoid  # noqa: F401
    low = pts[pts[:, 1] < 2.0] if len(pts) else pts
    if not len(low):
        low = pts
    cx, cz = low[:, 0].mean(), low[:, 2].mean()
    ex = max(2.0, (low[:, 0].max() - low[:, 0].min()) * 0.33)
    ez = max(1.6, (low[:, 2].max() - low[:, 2].min()) * 0.33)
    k = {'MZ_TINY': 0.7, 'MZ_SMALL': 0.8}.get(size, 1.0)
    R = np.array([[1.0, 0, 0], [0, 0, 1.0], [0, -1.0, 0]])          # plate lying in the floor plane
    blobs = [((cx + ex * 0.2, cz + ez * 0.8), (ex * 0.95, ez * 0.85)), ((cx - ex * 0.7, cz + ez * 1.0), (ex * 0.5, ez * 0.45)),
             ((cx + ex * 1.05, cz + ez * 0.45), (ex * 0.45, ez * 0.55))]
    P = []
    for (x, z), (a, b) in blobs:
        P.append(FlatEllipse([x, 0.12, z], np.array([a * k, b * k, 0.12]), 'pool', R=R))
    return P, Material(color, step=0.05)


# ------------------------------------------------------------------ one corpse
def corpse(idx, mon):
    rig, g, m = spec(mon, idx)
    mats = deaden(make_mats(**m))
    groups = dead_pose(rig, g, mon)
    pts = inside_points(groups, 1.1)
    if not len(pts):
        raise ValueError('empty corpse')
    # rest on the floor, footprint centred on the origin
    shift = np.array([-(pts[:, 0].max() + pts[:, 0].min()) / 2, -pts[:, 1].min() - 0.15, -(pts[:, 2].max() + pts[:, 2].min()) / 2])
    pts = pts + shift
    # fit the size class
    W, H = FIT.get(mon['size'], (23, 18))
    sx = pts[:, 0]; sy = pts @ UP
    w = sx.max() - sx.min() + 3; h = sy.max() - sy.min() + 3
    scale = min(1.0, W / w, H / h)
    prims = []
    for P, A, t in groups:
        prims += place(P, A, np.asarray(t) + shift)
    col = fluid(mon, rig, g, mats)
    if col:
        pp, pm = pool(pts, col, mon['size'])
        prims = pp + prims
        mats['pool'] = pm
    img = render(prims, mats, size=CANVAS, feet=FEET, R=np.eye(3), scale=scale)
    a = img[:, :, 3]
    ys, xs = np.nonzero(a)
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    crop = np.ascontiguousarray(img[y0:y1, x0:x1])
    # anchor: footprint centre on the floor
    return crop, (FEET[0] - x0, FEET[1] - y0)


def job(args):
    idx, mon = args
    try:
        crop, anchor = corpse(idx, mon)
        return idx, crop, anchor
    except Exception as e:                       # keep going; report the monster
        import traceback
        traceback.print_exc()
        print('fail', idx, mon['name'], e, flush=True)
        return idx, None, None


def pack(items, width=512):
    """Shelf-pack (idx, image, anchor) tuples, tallest first. Returns atlas image and the map."""
    items = sorted(items, key=lambda t: (-t[1].shape[0], -t[1].shape[1]))
    x = y = shelf = 0
    pos = {}
    for idx, im, anc in items:
        h, w = im.shape[:2]
        if x + w > width:
            x, y, shelf = 0, y + shelf + 1, 0
        pos[idx] = (x, y, w, h, int(anc[0]), int(anc[1]))
        x += w + 1; shelf = max(shelf, h)
    atlas = Image.new('RGBA', (width, y + shelf), (0, 0, 0, 0))
    for idx, im, anc in items:
        X, Y = pos[idx][:2]
        atlas.alpha_composite(Image.fromarray(im, 'RGBA'), (X, Y))
    return atlas, pos


if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    only = set(int(v) for v in sys.argv[3].split(',')) if len(sys.argv) > 3 else None
    mons = parse_monsters(os.path.join(src, 'include', 'monsters.h'))
    work = [(i, m) for i, m in enumerate(mons) if only is None or i in only]
    items = []
    with Pool(int(os.environ.get('JOBS', os.cpu_count()))) as p:
        for n, (idx, im, anc) in enumerate(p.imap_unordered(job, work)):
            if im is not None:
                items.append((idx, im, anc))
            if n % 20 == 0:
                print(f'{n + 1}/{len(work)}', flush=True)
    jpath, ipath = os.path.join(out, 'corpses.json'), os.path.join(out, 'corpses.png')
    if only is not None and os.path.exists(jpath):        # merge into the existing atlas
        old = json.load(open(jpath)); oimg = np.array(Image.open(ipath).convert('RGBA'))
        have = {i for i, _, _ in items}
        for k, (x, y, w, h, ax, ay) in old.items():
            if int(k) not in have:
                items.append((int(k), np.ascontiguousarray(oimg[y:y + h, x:x + w]), (ax, ay)))
    atlas, pos = pack(items)
    atlas.save(ipath, optimize=True)
    json.dump({str(k): list(v) for k, v in sorted(pos.items())}, open(jpath, 'w'), separators=(',', ':'))
    print('done', len(pos), 'corpses, atlas', atlas.size)

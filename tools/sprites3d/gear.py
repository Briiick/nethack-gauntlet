"""Paper-doll equipment sprites for the hero.

    python3 gear.py ../../public/assets/gear [layer-or-role ...]

Renders, with the same humanoid rig, poses, camera and framing as the role sheets
in public/assets/actors (batch.py):

  base-<role>.png      the role's body in underclothes only (no armour, helmet,
                       shield, cloak or weapon), laid out exactly like the role's
                       actor sheet (9 frames x 4 directions, same size and feet)
  <layer>.png          one equipment piece rendered on its own on the same skeleton,
                       in frames of size+2*PAD (it may stick out of the role frame)
  *.aux.png            per pixel: R = depth (0 = empty, smaller = nearer the camera),
                       G = tint channel (0 fixed colour, 1 tint, 2 tint darkened),
                       B = shade code (0..4 light level, +5 depth-darkened, 15 outline)
  gear.json            roles, layers, item-name -> variant table (see public/js/gear.js)

Pieces are composited at runtime with a z-buffer against the base body and each
other, so a shield behind the body when facing away, a beard over a breastplate or
a robe over boots all come out right regardless of draw order. Layers whose colour
varies by item (cloaks, boots, gloves, dragon scales, plate metals...) are rendered
once with a grey key material and recoloured at runtime from the light level in the
aux image, using the same hue-shifted ramp as sdf.ramp (ported to gear.js).

Only imports the shared sprite modules; nothing in them is changed. Bases use the
role's roster.spec() look minus its gear (all roles share one skeleton, stocky=1, so
every layer fits every role) and are framed in batch.py's canonical window (M, M);
gear.json roles[*].shift holds a per-row (dx, dy) if a role sheet is ever re-framed.

    python3 gear.py OUT                 everything (~10 min on 3 cores)
    python3 gear.py OUT bases           just the 13 base bodies
    python3 gear.py OUT head main_axe   one slot's layers / single layers
    node ../gear-preview.mjs out.png    look at outfits composed by public/js/gear.js
"""
import json, math, os, sys
from multiprocessing import Pool

import numpy as np
from PIL import Image

import rigs
from materials import mats as make_mats
from roster import ROLES, SIZE, spec
from sdf import (FWD, HALF, LIGHT, RIGHT, UP, VIEW, Box, Capsule, Disc, Ellipsoid, Material, Sphere, Torus,
                 rot_x, rot_y, rot_z, scene_sdf)

DIRS = [0.0, math.pi / 2, math.pi, -math.pi / 2]          # south, east, north, west
POSES = [{'breath': 0.0}, {'breath': 0.5},
         {'walk': 0.0}, {'walk': math.pi / 2}, {'walk': math.pi}, {'walk': 3 * math.pi / 2},
         {'attack': 0.25}, {'attack': 0.6}, {'attack': 0.92}]
SIZE_PX = 48
FEET = (24, 43)
M = 10                     # render margin, as batch.py
PAD = 6                    # layer frames are SIZE_PX + 2*PAD so pieces may stick out of the body's frame
T0 = 20.0                  # depth quantisation: q = (t - T0) * 4, 1..255
OUTLINE = 15

# role -> actor sheet number (public/assets/actors/manifest.json) and NetHack monster name
ROLE_MNUM = {'archeologist': 331, 'barbarian': 332, 'caveman': 333, 'healer': 334, 'knight': 335, 'monk': 336, 'priest': 337,
             'ranger': 338, 'rogue': 339, 'samurai': 340, 'tourist': 341, 'valkyrie': 342, 'wizard': 343}


# ---------------------------------------------------------------- renderer
def _march(prims, origins, R, scale=1.0):
    n = len(origins)
    t = np.zeros(n); hit = np.zeros(n, bool); alive = np.ones(n, bool)
    for _ in range(90):
        idx = np.nonzero(alive)[0]
        if not len(idx):
            break
        p = (origins[idx] + np.outer(t[idx], FWD)) @ R.T / scale
        d, _ = scene_sdf(prims, p)
        d = d * scale
        t[idx] += d * 0.9
        h = d < 0.02
        hit[idx[h]] = True
        alive[idx[h | (t[idx] > 140)]] = False
    return t, hit


def render_px(prims, mats, size, feet, facing, ss=2, ao_prims=None, tint=None):
    """Vectorised sdf.render(): same shading, downsampling and outline, plus per-pixel
    depth and an aux image (tint channel and light level per pixel).

    prims are ray-marched; ao_prims (default: prims) only darken the ambient occlusion,
    so a piece of gear rendered on its own still picks up contact shadows from the body.
    tint maps material name -> tint channel (1, 2)."""
    S = size * ss
    us = (np.arange(S) + 0.5) / ss
    U, V = np.meshgrid(us, us)
    sx = U.ravel() - feet[0]
    sy = feet[1] - V.ravel()
    origins = np.outer(sx, RIGHT) + np.outer(sy, UP) - FWD * 60
    R = rot_y(-facing)
    t, hit = _march(prims, origins, R)
    rgba = np.zeros((S * S, 4), np.uint8)
    depth = np.full(S * S, np.inf)
    code = np.zeros(S * S, np.uint8)       # light level 0..4
    tch = np.zeros(S * S, np.uint8)        # tint channel
    det = np.zeros(S * S, bool)
    hi = np.nonzero(hit)[0]
    if len(hi):
        p = (origins[hi] + np.outer(t[hi], FWD)) @ R.T
        _, m = scene_sdf(prims, p)
        e = 0.15
        n = np.zeros_like(p)
        for ax in range(3):
            dv = np.zeros(3); dv[ax] = e
            n[:, ax] = scene_sdf(prims, p + dv)[0] - scene_sdf(prims, p - dv)[0]
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
        nw = n @ R
        aop = ao_prims if ao_prims is not None else prims
        ao = np.ones(len(p))
        for hstep, wgt in ((0.8, 0.5), (1.8, 0.3), (3.0, 0.2)):
            dd = scene_sdf(aop, p + n * hstep)[0]
            ao -= np.clip((hstep - dd) / hstep, 0, 1) * wgt * 0.55
        diff = np.clip(nw @ LIGHT, 0, 1)
        rim = np.clip(1 - (nw @ VIEW), 0, 1) ** 2.2 * np.clip(nw @ np.array([0.6, 0.3, -0.2]), 0, 1)
        inten = (0.28 + 0.82 * diff) * (0.55 + 0.45 * ao) + rim * 0.35
        lev = np.digitize(inten, [0.40, 0.60, 0.86, 1.10]) - 2
        spec_ = (nw @ HALF) > 0.965
        names = [pr.mat for pr in prims]
        ramps = np.array([[mats[k].ramp[l] for l in (-2, -1, 0, 1, 2)] for k in names], np.uint8)
        metal = np.array([mats[k].metal for k in names]); glow = np.array([mats[k].glow for k in names])
        detail = np.array([mats[k].detail for k in names])
        tid = np.array([(tint or {}).get(k, 0) for k in names], np.uint8)
        l = np.where(metal[m] & spec_, 2, lev)
        l = np.where(glow[m], np.maximum(l, 1), l)
        rgba[hi, :3] = ramps[m, l + 2]
        rgba[hi, 3] = 255
        code[hi] = l + 2
        tch[hi] = tid[m]
        det[hi] = detail[m]
        depth[hi] = t[hi]
    # ---- downsample: per ss x ss block keep the most common colour (details always win)
    k = ss * ss
    def blocks(a):
        sh = a.shape[2:]
        return a.reshape(size, ss, size, ss, *sh).swapaxes(1, 2).reshape(size, size, k, *sh)
    B = blocks(rgba.reshape(S, S, 4)); D = blocks(depth.reshape(S, S)); C = blocks(code.reshape(S, S))
    TT = blocks(tch.reshape(S, S)); DT = blocks(det.reshape(S, S))
    solid = B[..., 3] > 0
    keep = solid.sum(-1) * 2 >= k
    key = B[..., 0].astype(np.int64) << 16 | B[..., 1].astype(np.int64) << 8 | B[..., 2]
    same = (key[..., :, None] == key[..., None, :]) & solid[..., None, :]
    cnt = same.sum(-1)
    dd = np.where(solid, D, 1e9)
    score = np.where(solid, cnt * 1e4 - dd, -1e18)
    dsel = DT & solid
    score = np.where(dsel.any(-1, keepdims=True), np.where(dsel, 1e12 - np.arange(k), -1e18), score)
    pick = score.argmax(-1)[..., None]
    img = np.take_along_axis(B, pick[..., None], 2)[:, :, 0]
    img[~keep] = 0
    dep = np.where(keep, dd.min(-1), np.inf)
    cod = np.where(keep, np.take_along_axis(C, pick, 2)[..., 0], 0).astype(np.uint8)
    tc = np.where(keep, np.take_along_axis(TT, pick, 2)[..., 0], 0).astype(np.uint8)
    return finish(img, dep, cod, tc)


def _shift(a, dx, dy, fill):
    out = np.full_like(a, fill)
    H, W = a.shape[:2]
    ys, yd = (slice(0, H - dy), slice(dy, H)) if dy >= 0 else (slice(-dy, H), slice(0, H + dy))
    xs, xd = (slice(0, W - dx), slice(dx, W)) if dx >= 0 else (slice(-dx, W), slice(0, W + dx))
    out[yd, xd] = a[ys, xs]
    return out


def finish(img, depth, code, tch):
    """sdf.finish(), vectorised: dark outline around the silhouette (its depth is that of the
    nearest neighbour so it composites like the edge it belongs to) and interior lines where
    depth jumps."""
    solid = img[:, :, 3] > 0
    out = img.copy()
    nbrs = [(1, 0), (-1, 0), (0, 1), (0, -1)]
    dark = np.zeros(solid.shape, bool)
    for dx, dy in nbrs:     # neighbour at (x+dx, y+dy) shifted onto (x, y)
        ns = _shift(solid, -dx, -dy, False); nd = _shift(depth, -dx, -dy, np.inf)
        with np.errstate(invalid='ignore'):
            dark |= solid & ns & (depth - nd > 3.2)
    out[dark, :3] = (img[dark, :3] * 0.55).astype(np.uint8)
    code = code.copy(); code[dark] += 5
    acc = np.zeros(img.shape[:2] + (3,)); cnt = np.zeros(img.shape[:2]); dmin = np.full(img.shape[:2], np.inf)
    for dx, dy in nbrs:
        ns = _shift(solid, -dx, -dy, False)
        acc += _shift(img[:, :, :3].astype(float), -dx, -dy, 0) * ns[..., None]
        cnt += ns
        dmin = np.minimum(dmin, np.where(ns, _shift(depth, -dx, -dy, np.inf), np.inf))
    ol = ~solid & (cnt > 0)
    c = acc[ol] / cnt[ol][:, None]
    out[ol, :3] = (c * 0.18 + np.array([14, 9, 18]) * 0.82).astype(np.uint8)
    out[ol, 3] = 255
    depth = np.where(ol, dmin, depth)
    code[ol] = OUTLINE
    tch = np.where(ol, 0, tch).astype(np.uint8)
    H, W = tch.shape
    yy, xx = np.mgrid[0:H, 0:W]
    dith = (tch == 3) & ((xx + yy) % 2 == 0) & (code > 0) & (code < 5)
    code = np.where(dith, code - 1, code).astype(np.uint8)
    if dith.any():      # keep the colour image in step with the new level (it is re-tinted at runtime anyway)
        out[dith, :3] = (out[dith, :3] * 0.82).astype(np.uint8)
    tch = np.where(tch == 3, 1, tch).astype(np.uint8)
    return out, depth, code, tch


def quant(depth):
    q = np.clip(np.round((depth - T0) * 4), 1, 255)
    return np.where(np.isfinite(depth), q, 0).astype(np.uint8)


def row_offset(alphas, size=SIZE_PX):
    """batch.py's per-row re-centring window (ox, oy) inside the margin render."""
    ys, xs = np.nonzero(np.max(alphas, axis=0))
    ox = oy = M
    if len(xs):
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        if y1 - y0 >= size - 1:
            oy = (y0 + y1 - size) // 2 + 1
        elif y1 > M + size - 2:
            oy = min(y1 - (size - 2), y0)
        elif y0 < M:
            oy = max(y0, M - 3, y1 - size + 2)
        if x1 - x0 >= size:
            ox = (x0 + x1 + 1 - size) // 2
        else:
            ox = min(max(M, x1 - size + 1), x0)
        ox = int(min(max(ox, 0), 2 * M)); oy = int(min(max(oy, 0), 2 * M))
    return ox, oy


# ---------------------------------------------------------------- skeleton
def unit(v):
    v = np.asarray(v, float)
    return v / max(np.linalg.norm(v), 1e-9)


def frame(x, up=(0, 1, 0)):
    """Rotation whose columns are a local frame (x, y, z) with x along `x` and y near `up`
    (the convention of sdf.Ellipsoid/Box R: local = (p - c) @ R)."""
    x = unit(x)
    z = np.cross(x, up)
    if np.linalg.norm(z) < 1e-6:
        z = np.cross(x, (0, 0, 1))
    z = unit(z); y = np.cross(z, x)
    return np.stack([x, y, z], axis=1)


def along(a, b, up=(0, 0, 1)):
    """Frame whose local y runs from a to b (for tori around a limb)."""
    y = unit(np.asarray(b, float) - a)
    x = np.cross(y, up)
    if np.linalg.norm(x) < 1e-6:
        x = np.cross(y, (1, 0, 0))
    x = unit(x); z = np.cross(x, y)
    return np.stack([x, y, z], axis=1)


SKEL_G = dict(scale=1.5, skin='§skin', legs='§legs', torso='§torso', arms='§arms', boots='§boots', belt='§belt', hands='§hands',
              hair=None, eyes='eye', weapon='sword', grip='§grip', guard='§guard', blade='§blade')


def skeleton(pose, g=None):
    """Joint positions of the humanoid rig for one pose, read back from rigs.humanoid's own
    primitives (tagged with marker materials) so gear always follows the rig."""
    gg = dict(SKEL_G, **(g or {}))
    P = rigs.humanoid(gg, pose)
    by = {}
    for pr in P:
        by.setdefault(pr.mat, []).append(pr)
    caps = lambda k: [p for p in by[k] if isinstance(p, Capsule)]
    legs = caps('§legs'); arms = caps('§arms')
    pelvis = [p for p in by['§legs'] if isinstance(p, Ellipsoid)][0]
    feet_e = [p for p in by['§boots'] if isinstance(p, Ellipsoid)]
    boot_c = [p for p in by['§boots'] if isinstance(p, Capsule)]
    neck, head = by['§skin'][0], by['§skin'][1]
    blade = by['§blade'][0]
    sk = dict(s=gg['scale'], pose=pose)
    for i, side in enumerate('LR'):
        sk['hip' + side], sk['knee' + side] = legs[2 * i].a, legs[2 * i].b
        sk['foot' + side] = legs[2 * i + 1].b
        sk['footc' + side] = feet_e[i].c; sk['footr'] = feet_e[i].rad
        sk['ankle' + side], sk['boottop' + side] = boot_c[i].a, boot_c[i].b
        sk['sh' + side], sk['elbow' + side] = arms[2 * i].a, arms[2 * i].b
        sk['hand' + side] = arms[2 * i + 1].b
        sk['armr' + side] = (arms[2 * i].ra, arms[2 * i].rb, arms[2 * i + 1].rb)
        sk['legr' + side] = (legs[2 * i].ra, legs[2 * i].rb, legs[2 * i + 1].rb)
    sk['pelvis'], sk['pelvisr'] = pelvis.c, pelvis.rad
    sk['chest'], sk['chestr'] = by['§torso'][0].c, by['§torso'][0].rad
    sk['belt'], sk['beltr'] = by['§belt'][0].c, by['§belt'][0].rad
    sk['head'], sk['hr'] = head.c, head.r
    sk['neck'] = neck.a
    sk['bd'] = unit(blade.b - blade.a)
    sk['grip'] = sk['handR']
    w = pose.get('walk')
    sk['swing'] = math.sin(w) * 0.55 if w is not None else 0.0
    sk['body'] = [p for p in P if p.mat not in ('§blade', '§grip', '§guard')]
    return sk


# ---------------------------------------------------------------- base bodies
def role_mon(role):
    return dict(name=role, cls='S_HUMAN', color='#e8e8ec', size='MZ_HUMAN', flags=set(), names=[role])


# underclothes per role: material overrides, gear overrides, extras
BASE_LOOK = {
    'archeologist': dict(m=dict(torso='#a8885a', arms='#98784c', legs='#6a5a3a', boots='#4a3424', hair='#6a4426')),
    'barbarian': dict(m=dict(torso='#7a5236', legs='#5a3a24', boots='#4a3020'), g=dict(arms='skin', no_belt=False), fur=True),
    'caveman': dict(m=dict(torso='#8a6a3a', legs='#7a5a30', boots='#5a4024'), g=dict(arms='skin')),
    'healer': dict(m=dict(torso='#e6e2d4', arms='#d8d4c6', legs='#6a8a5a', boots='#4a3a2a', hair='#8a6a4a', coat='#e6e2d4'), coat=True),
    'knight': dict(m=dict(torso='#2a4a9a', arms='#26428a', legs='#4a4a58', boots='#3a2a1e', hair='#5a3a22')),
    'monk': dict(m=dict(torso='#c87a2a', arms='#c07428', legs='#c87a2a', boots='#6a4a2a', belt='#2a2420'), g=dict(belt='belt')),
    'priest': dict(m=dict(torso='#5a4a6a', arms='#4e4060', legs='#3a3044', boots='#2a2430', hair='#4a3a2a', coat='#5a4a6a'), coat=True),
    'ranger': dict(m=dict(torso='#4a6a3a', arms='#42603a', legs='#5a4a32', boots='#4a3424', hair='#7a5a32')),
    'rogue': dict(m=dict(torso='#3a3440', arms='#34303a', legs='#2a2a34', boots='#241e22', hair='#2a2024')),
    'samurai': dict(m=dict(torso='#9a2a22', arms='#8a2a22', legs='#2a2a34', boots='#3a3030', hair='#1a1418'), topknot=True),
    'tourist': dict(m=dict(torso='#ece8dc', legs='#5a8ad0', boots='#e8e0d0', hair='#c89a5a'), g=dict(arms='skin')),
    'valkyrie': dict(m=dict(torso='#2f4fb0', legs='#6a5038', boots='#5a3a24'), g=dict(arms='skin', skirt='skirt')),
    'wizard': dict(m=dict(torso='#3a3a9a', arms='#34348a', legs='#2e2e7a', boots='#2a2440', hair='#c8c8d0', coat='#3a3a9a'), coat=True),
}
STRIP = dict(helmet=None, shield=None, weapon=None, cape=None, pauldrons=None, robe=None, stocky=1.0)


def base_spec(role):
    _, g, m = spec(role_mon(role), ROLE_MNUM[role])
    look = BASE_LOOK[role]
    g = dict(g, **STRIP, **look.get('g', {}))
    for k in ('torso', 'legs', 'arms', 'boots'):
        g[k] = k
    m = dict(m, **look.get('m', {}))
    if 'arms' not in look.get('m', {}) and g['arms'] == 'arms':
        m['arms'] = m['torso']
    if role == 'valkyrie':
        m['skin'] = '#d9956c'; m['skirt'] = '#2f4fb0'
    return g, make_mats(**m), look


def base_prims(role, pose):
    g, mats, look = base_spec(role)
    P = rigs.humanoid(g, pose)
    sk = skeleton(pose)
    s = sk['s']
    if look.get('coat'):        # knee-length robe-coat: wizards, priests and healers keep their silhouette
        top = sk['belt'] + [0, 0.4 * s, 0]
        P.append(Capsule(top, [0, 6.2 * s, 0.15 * s], 3.75 * s, 4.25 * s, mat='coat', blend=0.6))
    if look.get('topknot'):
        P.append(Sphere(sk['head'] + [0, sk['hr'] * 0.95, -1.4 * s], 1.25 * s, 'hair'))
    if look.get('fur'):         # a fur collar over the barbarian's jerkin
        P.append(Ellipsoid(sk['chest'] + [0, 2.6 * s, -0.2 * s], np.array([4.2, 1.5, 3.0]) * s, 'fur', blend=0.6))
        mats['fur'] = Material('#8a6a4a')
    return P, mats


# ---------------------------------------------------------------- gear geometry
# Every builder takes the skeleton of one pose and returns a list of primitives in model
# space. Material names starting with 'k' are the recolourable key ('k' -> tint channel 1,
# 'kd' -> channel 2: the tint a shade darker); everything else keeps its own colour.
KEY = {'k': Material('#8e8e8e'), 'kd': Material('#6a6a6a'), 'km': Material('#a4a4a4', metal=True), 'kmd': Material('#767676', metal=True),
       'kc': Material('#a4a4a4', metal=True)}
TINT = {'k': 1, 'km': 1, 'kd': 2, 'kmd': 2, 'kc': 3}     # 3: tint channel 1, dithered one light level down (chain mail)
GM = {   # fixed gear materials
    'steel': Material('#aeb6c8', metal=True), 'iron': Material('#6e7482', metal=True), 'darkiron': Material('#4a4c56', metal=True),
    'gold': Material('#e0aa3a', metal=True), 'silver': Material('#dfe6f2', metal=True), 'bronze': Material('#c08a44', metal=True),
    'wood': Material('#7a5232'), 'darkwood': Material('#5a3a22'), 'leather': Material('#6a4428'), 'darkleather': Material('#3e2a1e'),
    'rope': Material('#b89a6a'), 'red': Material('#c0302a'), 'plume': Material('#d03a32'), 'white': Material('#ece8e0'),
    'black': Material('#26222c'), 'slit': Material('#14101a', detail=True), 'stud': Material('#e8e8f0', metal=True, detail=True),
    'glass': Material('#bfeeff', step=0.1), 'eye_red': Material('#ff3a20', glow=True), 'pupil': Material('#0a0812', detail=True),
    'green': Material('#3a8a4a'), 'blue': Material('#3a6ac0'), 'bone': Material('#ece2c8', step=0.09), 'linen': Material('#c8bc9a', step=0.09),
    'linen_dark': Material('#9a8e6e'), 'crimson': Material('#8a1a2a'), 'flower': Material('#f8e060', detail=True),
    'flower2': Material('#ffffff', detail=True), 'fur': Material('#e8e4dc', step=0.09), 'gem': Material('#60c0ff', glow=True),
    'cyan_glow': Material('#9ae8ff', glow=True), 'shaft': Material('#8a6038'), 'wrap': Material('#2a2430'), 'mud': Material('#7a6040'),
}


def _helm_cut(sk, front=1.4, back=-1.2):
    """Plane keeping the part of a cap above a brim line that runs from just over the eyes
    (front) to the nape (back)."""
    hc, hr = sk['head'], sk['hr']
    b = (front - back) / (2 * hr)
    a = (front + back) / 2
    return ([0, 1, -b], a + hc[1] - b * hc[2]), math.atan(-b), a


def dome(sk, mat, r=1.08, front=1.5, back=-1.8, rim=None, rim_r=0.42):
    """A cap over the skull, deep enough at the back to hide any hair."""
    hc, hr, s = sk['head'], sk['hr'], sk['s']
    cut, tilt, a = _helm_cut(sk, front, back)
    c = hc + [0, 0.25 * s, -0.3 * s]
    rad = np.array([hr * r, hr * r, hr * (r + 0.1)])
    P = [Ellipsoid(c, rad, mat, cut=cut)]
    if rim:
        P.append(Torus(c + [0, a - 0.25 * s, 0.0], hr * r * 0.99, rim_r * s, rim, R=rot_x(tilt), squash=(1.0, (r + 0.1) / r)))
    return P


def helmet(sk, kind):
    hc, hr, s = sk['head'], sk['hr'], sk['s']
    top = hc + [0, hr * 1.08 + 0.25 * s, -0.3 * s]
    if kind == 'plumed':
        P = dome(sk, 'km', rim='kmd')
        pts = [top + [0, -0.2 * s, 0.6 * s], top + [0, 1.0 * s, -0.8 * s], top + [0, 0.6 * s, -2.8 * s], top + [0, -1.4 * s, -4.2 * s]]
        for i in range(3):
            P.append(Capsule(pts[i], pts[i + 1], (1.15 - 0.2 * i) * s, (0.95 - 0.2 * i) * s, mat='plume', blend=0.4))
        return P
    if kind == 'etched':
        P = dome(sk, 'km', rim='gold')
        P.append(Torus(hc + [0, 0.35 * s, -0.1 * s], hr * 1.12, 0.3 * s, 'gold', R=rot_z(math.pi / 2), cut=([0, 1, 0], hc[1] + 0.6 * s)))
        for sgn in (1, -1):
            P.append(Sphere(hc + [2.4 * sgn * s, 2.3 * s, hr * 0.78], 0.45 * s, 'gold'))
        return P
    if kind == 'crested':
        P = dome(sk, 'km', rim='kmd')
        P.append(Ellipsoid(top + [0, -0.6 * s, -0.5 * s], np.array([0.42, 2.0, hr / s * 0.95]) * s, 'gold', cut=([0, 1, 0], hc[1] + 1.5 * s)))
        return P
    if kind == 'visored':
        P = dome(sk, 'km', rim='kmd', front=1.8)
        P.append(Sphere(hc + [0, 0.1 * s, 0.1 * s], hr * 1.15, 'km', cut=([0, 0, 1], hc[2] + hr * 0.45)))
        P.append(Box(hc + [0, 0.15 * s, hr * 1.1], np.array([hr * 0.62 / s, 0.28, 0.5]) * s, 'slit', round_=0.1))
        return P
    if kind == 'crystal':
        P = dome(sk, 'glass', rim='silver', r=1.14)
        P.append(Sphere(top + [0, -0.4 * s, 0.4 * s], 0.9 * s, 'cyan_glow'))
        return P
    if kind == 'kabuto':
        P = dome(sk, 'kd', rim='gold', front=1.6)
        P.append(Sphere(hc + [0, 0.0, -0.6 * s], hr * 1.3, 'k', cut=([0, -1, -0.15], -(hc[1] - 0.15 * hc[2] + 0.6 * s))))
        P[-1] = Ellipsoid(hc + [0, -0.4 * s, -0.8 * s], np.array([hr * 1.32, hr * 0.95, hr * 1.22]), 'k',
                          cut=([0, -1, 0.35], -(hc[1] + 0.35 * hc[2] + 0.6 * s)))
        for sgn in (1, -1):
            b = hc + [0.5 * sgn * s, 3.2 * s, hr * 0.78]
            P.append(Capsule(b, b + [2.0 * sgn * s, 3.4 * s, -0.4 * s], 0.5 * s, 0.22 * s, mat='gold'))
        P.append(Sphere(hc + [0, 3.0 * s, hr * 0.86], 0.75 * s, 'gold'))
        return P
    if kind == 'hardhat':    # dwarvish iron helm: deep dome and a wide brim
        P = dome(sk, 'km', front=1.9, back=0.4, r=1.14)
        P.append(Disc(hc + [0, 1.75 * s, -0.1 * s], [0, 1, -0.08], hr * 1.28, 0.3 * s, 'kmd'))
        P.append(Ellipsoid(top + [0, -0.5 * s, 0], np.array([0.5, 1.0, hr / s * 0.9]) * s, 'kmd', cut=([0, 1, 0], hc[1] + 2 * s)))
        return P
    if kind == 'leatherhat':
        P = dome(sk, 'k', front=1.8, back=-1.0, r=1.1)
        P.append(Torus(hc + [0, 1.2 * s, 0.1 * s], hr * 1.08, 0.55 * s, 'kd', R=rot_x(-0.12)))
        P.append(Capsule(top + [0, -0.6 * s, -0.4 * s], top + [0, 1.2 * s, -2.2 * s], 1.0 * s, 0.3 * s, mat='k', blend=0.6))
        return P
    if kind == 'skullcap':   # orcish helm: dark iron, a ridge and a spike
        P = dome(sk, 'darkiron', front=1.5, back=-0.4, rim='iron')
        P.append(Ellipsoid(top + [0, -0.4 * s, -0.3 * s], np.array([0.6, 0.9, hr / s * 1.0]) * s, 'iron', cut=([0, 1, 0], hc[1] + 1.6 * s)))
        P.append(Capsule(top + [0, -0.3 * s, 0], top + [0, 2.2 * s, -0.3 * s], 0.75 * s, 0.1 * s, mat='iron'))
        return P
    if kind == 'pot':
        ax = unit([0.18, 1, -0.12])
        c = hc + [0.3 * s, 2.1 * s, -0.2 * s]
        P = [Disc(c, ax, hr * 1.02, 2.1 * s, 'darkiron'), Torus(c - ax * 2.0 * s, hr * 1.02, 0.42 * s, 'iron', R=along(c, c + ax)),
             Capsule(c + [hr * 0.9, -1.2 * s, 0.2 * s], c + [hr * 0.9 + 3.6 * s, -1.6 * s, 0.6 * s], 0.5 * s, mat='iron')]
        P.append(Sphere(c + [-1.6 * s, 0.6 * s, hr * 0.94], 0.9 * s, 'iron'))
        return P
    if kind == 'cone':
        P = [Capsule(hc + [0, 1.2 * s, -0.25 * s], hc + [0.4 * s, 10.0 * s, -1.8 * s], hr * 1.04, 0.2 * s, mat='k', cut=([0, 1, 0], hc[1] + 0.5 * s)),
             Torus(hc + [0, 1.25 * s, -0.25 * s], hr * 1.02, 0.45 * s, 'kd')]
        for k, (u, v) in enumerate(((0.35, -0.6), (0.55, 0.7), (0.72, -0.2))):
            p0 = hc + [0, 1.2 * s, -0.25 * s]; p1 = hc + [0.4 * s, 10.0 * s, -1.8 * s]
            q = p0 + (p1 - p0) * u
            rr = hr * 1.04 * (1 - u) + 0.2 * s * u
            P.append(Sphere(q + [v * rr * 0.7, 0, rr * 0.75], 0.5 * s, 'gold'))
        return P
    if kind == 'fedora':
        return [Disc(hc + [0, 1.55 * s, 0], [0, 1, 0.05], hr * 1.5, 0.28 * s, 'k'),
                Capsule(hc + [0, 1.5 * s, -0.15 * s], hc + [0, 4.0 * s, -0.3 * s], hr * 0.9, hr * 0.8, mat='k', blend=0.3),
                Ellipsoid(hc + [0, 4.3 * s, -0.3 * s], np.array([hr * 0.6, 0.6 * s, hr * 0.4]), 'kd'),
                Torus(hc + [0, 2.1 * s, -0.15 * s], hr * 0.9, 0.42 * s, 'black')]
    # plain helmet
    return dome(sk, 'km', rim='kmd') + [Sphere(top + [0, -0.1 * s, 0], 0.55 * s, 'kmd')]


def torso_shell(sk, mat, grow=0.45, z_extra=0.15, lower=0.0):
    c, r = sk['chest'], sk['chestr']
    return Ellipsoid(c + [0, 0.2 - lower * 0.5, 0.05], r * [1.0, 1.0 + lower * 0.06, 1.04] + [grow, grow, grow + z_extra], mat)


def limb_shell(a, b, ra, rb, grow, mat, f0=0.0, f1=1.0):
    a, b = np.asarray(a), np.asarray(b)
    return Capsule(a + (b - a) * f0, a + (b - a) * f1, ra + grow, rb + grow, mat=mat)


def arm_shells(sk, side, mat, grow, lower=True, upper=True, f1=1.0, lmat=None):
    r = sk['armr' + side]
    P = []
    if upper:
        P.append(limb_shell(sk['sh' + side], sk['elbow' + side], r[0], r[1], grow, mat, 0.05, f1 if not lower else 1.0))
    if lower:
        P.append(limb_shell(sk['elbow' + side], sk['hand' + side], r[1], r[2], grow, lmat or mat, 0.0, 0.72))
    return P


def skirt(sk, mat, length=4.0, flare=1.0, grow=0.6):
    """A rigid skirt/hauberk/tasset from the waist down to `length` (units below the belt)."""
    b, pr = sk['belt'], sk['pelvisr']
    c = b + [0, -length * 0.42, 0.05]
    return Ellipsoid(c, np.array([pr[0] + grow + 0.4 * flare, length * 0.62 + 1.2, pr[2] + grow + 0.4 * flare]), mat,
                     cut=([0, -1, 0], -(b[1] + 0.8)))


def bands(sk, mat, ys, grow=0.75, r=0.32):
    """Horizontal ridges hugging the chest ellipsoid at heights ys (fractions of its y radius)."""
    c, cr = sk['chest'], sk['chestr']
    out = []
    for y in ys:
        k = math.sqrt(max(0.05, 1 - y * y))
        rx = cr[0] * k + grow; rz = cr[2] * 1.04 * k + grow
        out.append(Torus(c + [0, 0.2 + y * cr[1], 0.05], rx, r * sk['s'], mat, squash=(1.0, rz / rx)))
    return out


def body_armour(sk, kind):
    s = sk['s']
    P = []
    if kind in ('plate', 'splint'):
        P.append(torso_shell(sk, 'km', 0.6))
        P.append(Capsule(sk['neck'] + [0, 0.2 * s, 0], sk['neck'] + [0, 1.0 * s, 0], 1.55 * s, 1.75 * s, mat='kmd'))     # gorget
        for side, sgn in (('L', 1), ('R', -1)):
            sh = sk['sh' + side]
            P.append(Ellipsoid(sh + [0.45 * sgn * s, 0.7 * s, 0], np.array([1.95, 1.45, 2.0]) * s, 'km'))
            P.append(Ellipsoid(sh + [0.6 * sgn * s, -0.2 * s, 0], np.array([1.75, 1.15, 1.85]) * s, 'kmd'))
            P += arm_shells(sk, side, 'kmd', 0.45, lower=False)
            P += arm_shells(sk, side, 'km', 0.5, upper=False)
            r = sk['legr' + side]
            P.append(limb_shell(sk['hip' + side], sk['knee' + side], r[0], r[1], 0.4, 'km', 0.3, 1.0))
            P.append(Sphere(sk['knee' + side] + [0, 0.1, 0.9 * s], 1.25 * s, 'kmd'))
        P.append(skirt(sk, 'kmd' if kind == 'plate' else 'km', length=3.6, grow=0.75))
        P.append(Ellipsoid(sk['belt'], sk['beltr'] + [0.85, 0.15, 0.85], 'kmd'))
        if kind == 'plate':
            c, cr = sk['chest'], sk['chestr']
            P.append(Capsule(c + [0, 3.6 * s, cr[2] + 0.4], c + [0, -2.6 * s, cr[2] + 0.55], 0.55 * s, mat='km', blend=0.4))
        else:
            P += bands(sk, 'kmd', (-0.55, -0.2, 0.15), grow=0.62, r=0.3)
    elif kind in ('mail', 'scale', 'dragon'):
        P.append(torso_shell(sk, 'kc' if kind == 'mail' else 'k', 0.4))
        for side in 'LR':
            P += arm_shells(sk, side, 'kc' if kind == 'mail' else 'k', 0.35, lower=kind == 'dragon')
        P.append(skirt(sk, 'kc' if kind == 'mail' else 'k', length=5.6 if kind == 'mail' else 4.4, grow=0.55))
        P.append(Ellipsoid(sk['belt'], sk['beltr'] + [0.7, 0.1, 0.7], 'leather'))
        P.append(Sphere(sk['belt'] + [0, 0, sk['beltr'][2] + 0.65], 0.55 * s, 'gold'))
        if kind != 'mail':
            P += bands(sk, 'kd', (-0.6, -0.33, -0.06, 0.21, 0.48), grow=0.48, r=0.26)
        if kind == 'dragon':
            for side, sgn in (('L', 1), ('R', -1)):
                sh = sk['sh' + side]
                P.append(Ellipsoid(sh + [0.5 * sgn * s, 0.6 * s, 0], np.array([2.1, 1.5, 2.2]) * s, 'kd'))
                for k in range(3):
                    b = sh + [(0.4 + 0.7 * k) * sgn * s, 1.6 * s - 0.4 * k * s, (0.6 - 0.9 * k) * s]
                    P.append(Capsule(b, b + [0.7 * sgn * s, 1.6 * s, -0.6 * s], 0.5 * s, 0.08 * s, mat='bone'))
            c, cr = sk['chest'], sk['chestr']
            for k in range(4):
                b = c + [0, (2.6 - 1.6 * k) * s, -(cr[2] + 0.3)]
                P.append(Capsule(b, b + [0, 0.9 * s, -1.4 * s], 0.55 * s, 0.08 * s, mat='bone'))
    elif kind in ('leather', 'studded'):
        P.append(torso_shell(sk, 'k', 0.4))
        for side, sgn in (('L', 1), ('R', -1)):
            sh = sk['sh' + side]
            P.append(Ellipsoid(sh + [0.5 * sgn * s, 0.55 * s, 0], np.array([2.0, 1.1, 2.1]) * s, 'kd'))
        for k in range(-3, 4):          # strips of a leather skirt
            ang = k * 0.42
            b = sk['belt'] + [math.sin(ang) * 5.4, -0.6, math.cos(ang) * 4.3 + 0.1]
            P.append(Box(b + [math.sin(ang) * 0.3, -2.0 * s, math.cos(ang) * 0.3], np.array([0.85, 1.6, 0.25]) * s, 'kd', R=rot_y(ang), round_=0.2 * s))
        P.append(Ellipsoid(sk['belt'], sk['beltr'] + [0.65, 0.1, 0.65], 'darkleather'))
        if kind == 'studded':
            c, cr = sk['chest'], sk['chestr']
            for yy in (-0.45, -0.05, 0.35):
                for xx in (-0.55, -0.18, 0.18, 0.55):
                    for zs in (1, -1):
                        x = xx * cr[0]; y = yy * cr[1]
                        k = 1 - (x / (cr[0] + 0.4)) ** 2 - (y / (cr[1] + 0.4)) ** 2
                        z = zs * (cr[2] * 1.04 + 0.55) * math.sqrt(max(k, 0.0))
                        P.append(Sphere(c + [x, y + 0.2, z + 0.05], 0.42 * s, 'stud'))
    elif kind == 'jacket':
        P.append(torso_shell(sk, 'k', 0.4, lower=1.0))
        for side in 'LR':
            P += arm_shells(sk, side, 'k', 0.32)
        c, cr = sk['chest'], sk['chestr']
        P.append(Ellipsoid(c + [0, 0.6 * s, cr[2] * 0.9], np.array([1.0, 3.4, 0.9]) * s, 'white', cut=([0, 0, 1], c[2] + cr[2] * 0.8)))
        P.append(Torus(sk['neck'] + [0, 0.4 * s, -0.2 * s], 1.9 * s, 0.6 * s, 'kd', R=rot_x(-0.35)))
        P.append(Ellipsoid(sk['belt'] + [0, 0.3, 0], sk['beltr'] + [0.55, 0.3, 0.55], 'kd'))
    elif kind in ('shirt', 'hawaiian'):
        P.append(torso_shell(sk, 'k' if kind == 'shirt' else 'hawaii', 0.22, lower=0.6))
        for side in 'LR':
            P += arm_shells(sk, side, 'k' if kind == 'shirt' else 'hawaii', 0.25, lower=False, f1=0.55)
        if kind == 'hawaiian':
            c, cr = sk['chest'], sk['chestr']
            for i, (xx, yy) in enumerate(((-0.5, 0.35), (0.3, 0.5), (0.55, -0.1), (-0.2, -0.3), (0.1, 0.05), (-0.6, -0.35), (0.45, -0.55))):
                for zs in (1, -1):
                    x = xx * cr[0]; y = yy * cr[1]
                    z = zs * (cr[2] * 1.04 + 0.4) * math.sqrt(max(1 - (x / (cr[0] + 0.3)) ** 2 - (y / (cr[1] + 0.3)) ** 2, 0))
                    P.append(Sphere(c + [x, y + 0.2, z + 0.05], 0.55 * s, 'flower' if i % 2 else 'flower2'))
    return P


def cloak(sk, kind):
    s, c, cr = sk['s'], sk['chest'], sk['chestr']
    sway = sk['swing'] * 0.35
    shy = sk['shL'][1]
    P = []
    if kind == 'robe':
        P.append(torso_shell(sk, 'k', 0.85, z_extra=0.3))
        P.append(Capsule(sk['belt'] + [0, 0.6 * s, 0], [0, 1.0 * s, 0.1], 4.0 * s, 5.0 * s, mat='k', blend=0.6))
        for side in 'LR':
            r = sk['armr' + side]
            P.append(limb_shell(sk['sh' + side], sk['elbow' + side], r[0], r[1], 0.7, 'k'))
            e, h = sk['elbow' + side], sk['hand' + side]
            P.append(Capsule(e, e + (h - e) * 0.5, r[1] + 0.7, r[2] + 1.1, mat='k'))
        P.append(Ellipsoid(sk['belt'] + [0, 0.5, 0], sk['beltr'] + [1.3, 0.2, 1.3], 'kd'))
        P.append(Torus(sk['neck'] + [0, 0.3 * s, 0], 2.2 * s, 0.7 * s, 'kd', R=rot_x(-0.3)))
        return P
    if kind == 'apron':
        P.append(Ellipsoid(c + [0, 0.0, 0.05], cr * [0.92, 0.95, 1.04] + [0.6, 0.6, 0.9], 'k', cut=([0, 0, 1], c[2] + cr[2] * 0.25)))
        P.append(Box(sk['belt'] + [0, -3.6 * s, sk['pelvisr'][2] + 0.9], np.array([3.2, 3.6, 0.3]) * s, 'k', R=rot_x(-0.12), round_=0.25 * s))
        P.append(Torus(sk['neck'] + [0, 0.1, 0], 1.7 * s, 0.3 * s, 'kd', R=rot_x(0.5)))
        P.append(Ellipsoid(sk['belt'] + [0, 0.4, 0], sk['beltr'] + [0.9, -0.2, 0.9], 'kd'))
        return P
    if kind == 'wraps':
        for y in (-0.75, -0.45, -0.15, 0.15, 0.45):
            P += bands(sk, 'linen' if y != -0.15 else 'linen_dark', (y,), grow=0.55, r=0.55)
        P.append(torso_shell(sk, 'linen_dark', 0.3))
        for side in 'LR':
            for a, b, r in ((sk['sh' + side], sk['elbow' + side], sk['armr' + side][0]), (sk['elbow' + side], sk['hand' + side], sk['armr' + side][1]),
                            (sk['hip' + side], sk['knee' + side], sk['legr' + side][0]), (sk['knee' + side], sk['foot' + side], sk['legr' + side][1])):
                for f in (0.2, 0.5, 0.8):
                    q = a + (b - a) * f
                    P.append(Torus(q, r + 0.15, 0.45 * s, 'linen' if f != 0.5 else 'linen_dark', R=along(a, b) @ rot_x(0.25 if f != 0.5 else -0.2)))
        P.append(skirt(sk, 'linen', length=2.6, grow=0.45))
        return P
    # a cape hanging from the shoulders, clear of the bulkiest armour
    length = {'tattered': 15.5, 'short': 14.0}.get(kind, 19.0)
    top = np.array([0, shy + 1.2 * s, c[2] - cr[2] - 1.2 * s])
    half_w = 4.5 * s
    ctr = top + np.array([0, -length / 2, -0.9 * s - sway * 2])
    R = rot_x(0.13 + sway * 0.4)
    P.append(Box(ctr, np.array([half_w, length / 2, 0.38 * s]), 'k', R=R, round_=0.35 * s))
    P.append(Capsule(sk['shL'] + [0.6 * s, 1.0 * s, -0.4 * s], sk['shR'] + [-0.6 * s, 1.0 * s, -0.4 * s], 1.7 * s, mat='k', blend=0.5))
    P.append(Ellipsoid(np.array([0, shy + 0.6 * s, c[2] - cr[2] * 0.5]), np.array([5.4, 1.6, 3.6]) * s, 'k', blend=0.5))
    if kind == 'tattered':          # ragged hem
        for k, (x, ln) in enumerate(((-3.6, 2.6), (-1.8, 1.4), (0.0, 3.0), (1.8, 1.8), (3.6, 2.4))):
            b = ctr + (np.array([x * s, -length / 2 + 0.6, 0]) @ R.T)
            P.append(Capsule(b, b + (np.array([0.2 * s, -ln * s, -0.2 * s]) @ R.T), 0.75 * s, 0.25 * s, mat='k'))
        for x, y in ((-2.2, -2.5), (1.4, 1.0), (2.6, -4.6)):        # patches
            P.append(Sphere(ctr + (np.array([x * s, y * s, -0.38 * s]) @ R.T), 0.9 * s, 'kd'))
    if kind == 'hooded':            # hood lying back on the shoulders
        P.append(Ellipsoid(np.array([0, shy + 1.6 * s, c[2] - cr[2] - 0.6 * s]), np.array([3.3, 2.5, 2.4]) * s, 'kd', blend=0.6))
        P.append(Capsule(np.array([0, shy + 2.6 * s, c[2] - cr[2] - 1.6 * s]), np.array([0, shy - 1.6 * s, c[2] - cr[2] - 3.6 * s]), 1.0 * s, 0.2 * s, mat='kd'))
    if kind == 'opera':             # tall collar with a crimson lining
        P.append(Ellipsoid(np.array([0, shy + 3.0 * s, c[2] - cr[2] * 0.6]), np.array([4.4, 3.0, 1.0]) * s, 'crimson', R=rot_x(0.35),
                           cut=([0, 0, -1], -(c[2] - cr[2] * 0.6 + 0.2))))
        P.append(Ellipsoid(np.array([0, shy + 3.0 * s, c[2] - cr[2] * 0.6 - 0.5 * s]), np.array([4.6, 3.2, 1.0]) * s, 'k', R=rot_x(0.35),
                           cut=([0, 0, -1], -(c[2] - cr[2] * 0.6 - 0.2 * s))))
    if kind == 'cope':              # gold-trimmed hem and clasp
        P.append(Box(ctr + (np.array([0, -length / 2 + 0.4 * s, 0]) @ R.T), np.array([half_w + 0.2, 0.7 * s, 0.5 * s]), 'gold', R=R, round_=0.3 * s))
        for sgn in (1, -1):
            P.append(Box(ctr + (np.array([sgn * half_w, 0, 0]) @ R.T), np.array([0.6 * s, length / 2, 0.5 * s]), 'gold', R=R, round_=0.3 * s))
    P.append(Sphere(sk['neck'] + [0, 1.0 * s, 1.6 * s], 0.6 * s, 'gold' if kind not in ('short', 'tattered') else 'kd'))
    return P


def shield(sk, kind):
    s = sk['s']
    n = unit([0.8, 0, 0.6])
    c = sk['handL'] + np.array([1.4, 0.6, 0.4]) * s
    R = frame(n)
    P = []
    if kind == 'small':
        P += [Disc(c, n, 2.9 * s, 0.42 * s, 'iron'), Disc(c + n * 0.2, n, 2.45 * s, 0.42 * s, 'wood'), Sphere(c + n * 0.8 * s, 0.7 * s, 'iron')]
        for a in (-0.5, 0.5):
            P.append(Box(c + n * 0.35 + R[:, 1] * a * 1.8 * s, np.array([0.3, 0.12, 2.2]) * s, 'darkwood', R=R, round_=0.05))
    elif kind == 'elven':
        P += [Ellipsoid(c, np.array([0.5, 3.9, 2.5]) * s, 'gold', R=R), Ellipsoid(c + n * 0.25, np.array([0.5, 3.5, 2.15]) * s, 'green', R=R),
              Ellipsoid(c + n * 0.55, np.array([0.4, 2.4, 0.9]) * s, 'blue', R=R)]
    elif kind == 'urukhai':
        P += [Box(c + [0, -0.4 * s, 0], np.array([0.45, 3.8, 2.4]) * s, 'darkiron', R=R, round_=0.8 * s)]
        P.append(Sphere(c + n * 0.6 * s + R[:, 1] * -0.3 * s, 0.95 * s, 'white'))
        for k in range(4):
            b = c + n * 0.6 * s + R[:, 1] * 0.4 * s + R[:, 2] * (k - 1.5) * 0.55 * s
            P.append(Capsule(b, b + R[:, 1] * (1.4 + 0.3 * (k in (1, 2))) * s, 0.28 * s, mat='white'))
        P.append(Capsule(c + n * 0.6 * s + R[:, 2] * -0.8 * s, c + n * 0.6 * s + R[:, 2] * -1.6 * s + R[:, 1] * 0.6 * s, 0.28 * s, mat='white'))
    elif kind == 'orcish':
        P += [Disc(c, n, 3.1 * s, 0.42 * s, 'darkiron'), Ellipsoid(c + n * 0.5 * s, np.array([0.3, 1.0, 1.7]) * s, 'eye_red', R=R),
              Sphere(c + n * 0.75 * s, 0.5 * s, 'pupil')]
        for a in range(8):
            ang = a / 8 * 2 * math.pi
            P.append(Sphere(c + n * 0.3 * s + (R[:, 1] * math.cos(ang) + R[:, 2] * math.sin(ang)) * 2.6 * s, 0.32 * s, 'iron'))
    elif kind == 'large':
        P += [Box(c + [0, -0.8 * s, 0], np.array([0.5, 4.8, 3.1]) * s, 'iron', R=R, round_=0.6 * s),
              Box(c + [0, -0.8 * s, 0] + n * 0.3, np.array([0.5, 4.3, 2.6]) * s, 'steel', R=R, round_=0.5 * s),
              Box(c + [0, -0.8 * s, 0] + n * 0.55, np.array([0.3, 3.6, 0.5]) * s, 'iron', R=R, round_=0.2 * s),
              Box(c + [0, 0.4 * s, 0] + n * 0.55, np.array([0.3, 0.5, 2.2]) * s, 'iron', R=R, round_=0.2 * s)]
    elif kind == 'round':       # dwarvish roundshield
        P += [Disc(c, n, 3.9 * s, 0.45 * s, 'iron'), Disc(c + n * 0.25, n, 3.3 * s, 0.45 * s, 'steel'), Sphere(c + n * 0.8 * s, 1.1 * s, 'iron')]
        for a in range(10):
            ang = a / 10 * 2 * math.pi
            P.append(Sphere(c + n * 0.45 * s + (R[:, 1] * math.cos(ang) + R[:, 2] * math.sin(ang)) * 3.55 * s, 0.32 * s, 'gold'))
    elif kind == 'reflection':
        P += [Disc(c, n, 3.5 * s, 0.42 * s, 'silver'), Torus(c + n * 0.35 * s, 3.3 * s, 0.35 * s, 'gold', R=frame(n) @ rot_z(math.pi / 2)),
              Sphere(c + n * 0.6 * s + R[:, 1] * 1.4 * s + R[:, 2] * -1.0 * s, 0.6 * s, 'cyan_glow')]
    return P


def gloves(sk, kind):
    s = sk['s']
    P = []
    for side in 'LR':
        h, e = sk['hand' + side], sk['elbow' + side]
        d = unit(e - h)
        mat = 'km' if kind == 'metal' else 'k'
        P.append(Sphere(h, 1.2 * s + 0.4, mat))
        cuff = {'gloves': 1.4, 'gauntlets': 2.6, 'metal': 2.6}[kind]
        P.append(Capsule(h + d * 0.6 * s, h + d * cuff * s, 1.25 * s + 0.35, (1.45 if kind == 'gloves' else 1.75) * s, mat=mat if kind == 'gloves' else ('kmd' if kind == 'metal' else 'kd')))
        if kind == 'metal':
            P.append(Sphere(h - d * 0.5 * s, 0.9 * s, 'kmd'))
    return P


def boots(sk, kind):
    s = sk['s']
    P = []
    for side in 'LR':
        fc, fr = sk['footc' + side], sk['footr']
        ank, top, knee = sk['ankle' + side], sk['boottop' + side], sk['knee' + side]
        metal = kind == 'iron'
        m, md = ('km', 'kmd') if metal else ('k', 'kd')
        P.append(Ellipsoid(fc + [0, 0.05, 0.05], fr + [0.45, 0.4, 0.45], m))
        P.append(Ellipsoid(fc + [0, -0.55, 0.05], fr * [1.0, 0.45, 1.0] + [0.55, 0.0, 0.6], md))       # sole
        if kind in ('shoes', 'iron'):
            P.append(Capsule(ank, ank + (top - ank) * 0.5, 1.5 * s + 0.4, 1.5 * s + 0.35, mat=m))
            if kind == 'iron':
                P.append(Capsule(ank + (top - ank) * 0.3, knee + (ank - knee) * 0.12, 1.5 * s + 0.5, 1.5 * s + 0.4, mat=m))
                P.append(Sphere(knee + [0, 0.2, 0.9 * s], 1.15 * s, md))
        else:
            shaft_top = knee + (ank - knee) * 0.14
            P.append(Capsule(ank, shaft_top, 1.5 * s + 0.45, 1.5 * s + 0.6, mat=m))
            P.append(Capsule(shaft_top + (ank - shaft_top) * 0.08, shaft_top, 1.5 * s + 0.75, 1.5 * s + 0.85, mat=md if kind != 'fur' else 'fur'))
            if kind == 'buckled':
                for f in (0.35, 0.65):
                    q = ank + (shaft_top - ank) * f
                    P.append(Sphere(q + [0, 0, 1.5 * s + 0.5], 0.5 * s, 'gold'))
            if kind == 'fur':
                P.append(Torus(ank + (shaft_top - ank) * 0.55, 1.5 * s + 0.65, 0.5 * s, 'fur', R=along(ank, shaft_top)))
            if kind == 'laced':
                for f in (0.2, 0.45, 0.7):
                    q = ank + (shaft_top - ank) * f
                    P.append(Sphere(q + [0, 0, 1.5 * s + 0.55], 0.36 * s, 'white'))
    return P


def weapon(sk, kind):
    s = sk['s']
    g = sk['grip']
    bd = sk['bd']
    side = np.cross(bd, [0, 0, 1.0])
    side = unit(side) if np.linalg.norm(side) > 1e-3 else np.array([1.0, 0, 0])
    nrm = np.cross(bd, side)
    P = []

    def blade(length, w0, w1, hilt=1.6, guard=1.6, gmat='gold', bmat='steel', grip='leather', pommel=True):
        P.append(Capsule(g - bd * hilt * s, g + bd * 0.6 * s, 0.45 * s, mat=grip))
        if pommel:
            P.append(Sphere(g - bd * (hilt + 0.2) * s, 0.55 * s, gmat))
        if guard:
            P.append(Capsule(g + bd * 0.7 * s - side * guard * s, g + bd * 0.7 * s + side * guard * s, 0.42 * s, mat=gmat))
        P.append(Capsule(g + bd * 1.0 * s, g + bd * length * s, w0 * s, w1 * s, mat=bmat))

    if kind == 'dagger':
        blade(4.4, 0.5, 0.12, hilt=1.0, guard=0.9, gmat='iron')
    elif kind == 'short_sword':
        blade(6.8, 0.55, 0.18, hilt=1.2, guard=1.2, gmat='iron')
    elif kind == 'long_sword':
        blade(9.5, 0.62, 0.22)
    elif kind == 'two_handed':
        blade(13.0, 0.78, 0.25, hilt=3.0, guard=2.4, gmat='iron')
    elif kind == 'katana':
        P.append(Capsule(g - bd * 2.4 * s, g + bd * 0.6 * s, 0.45 * s, mat='wrap'))
        P.append(Disc(g + bd * 0.75 * s, bd, 1.0 * s, 0.18 * s, 'gold'))
        mid = g + bd * 5.5 * s + nrm * 0.25 * s
        P.append(Capsule(g + bd * 0.9 * s, mid, 0.45 * s, 0.4 * s, mat='silver'))
        P.append(Capsule(mid, g + bd * 10.0 * s + nrm * 0.9 * s, 0.4 * s, 0.12 * s, mat='silver'))
    elif kind == 'scimitar':
        P.append(Capsule(g - bd * 1.3 * s, g + bd * 0.6 * s, 0.45 * s, mat='leather'))
        P.append(Capsule(g + bd * 0.7 * s - side * 1.3 * s, g + bd * 0.7 * s + side * 1.3 * s, 0.4 * s, mat='gold'))
        mid = g + bd * 4.5 * s - side * 0.4 * s
        P.append(Capsule(g + bd * 1.0 * s, mid, 0.6 * s, 0.65 * s, mat='steel'))
        P.append(Capsule(mid, g + bd * 8.0 * s - side * 1.8 * s, 0.65 * s, 0.15 * s, mat='steel'))
    elif kind in ('axe', 'battle_axe'):
        L = 7.0 if kind == 'axe' else 9.0
        P.append(Capsule(g - bd * 1.6 * s, g + bd * L * s, 0.45 * s, mat='wood'))
        Rb = np.stack([side, bd, nrm], axis=1)
        for sg in ((1,) if kind == 'axe' else (1, -1)):
            P.append(Ellipsoid(g + bd * (L - 1.2) * s + side * 1.5 * sg * s, np.array([1.7, 2.0, 0.35]) * s, 'steel', R=Rb))
    elif kind == 'club':
        P.append(Capsule(g - bd * 1.4 * s, g + bd * 6.4 * s, 0.5 * s, 1.15 * s, mat='wood'))
        for k in range(3):
            P.append(Sphere(g + bd * (3.6 + k * 1.1) * s + side * (0.8 if k % 2 else -0.8) * s, 0.45 * s, 'darkwood'))
    elif kind in ('mace', 'morning_star'):
        P.append(Capsule(g - bd * 1.4 * s, g + bd * 5.0 * s, 0.42 * s, mat='darkwood' if kind == 'mace' else 'wood'))
        h = g + bd * 5.6 * s
        P.append(Sphere(h, 1.25 * s, 'iron'))
        dirs = [side, -side, nrm, -nrm, bd, unit(side + bd), unit(-side + bd)]
        for d in dirs:
            if kind == 'mace':
                P.append(Ellipsoid(h + d * 0.9 * s, np.array([0.35, 0.9, 0.9]) * s, 'steel', R=frame(d)))
            else:
                P.append(Capsule(h + d * 1.0 * s, h + d * 2.1 * s, 0.4 * s, 0.05 * s, mat='steel'))
    elif kind == 'flail':
        P.append(Capsule(g - bd * 1.4 * s, g + bd * 3.6 * s, 0.42 * s, mat='wood'))
        a = g + bd * 3.9 * s
        hang = unit(bd * 0.5 + np.array([0, -1.0, 0]) + side * 0.4)
        for k in range(3):
            P.append(Torus(a + hang * (0.6 + k * 0.8) * s, 0.4 * s, 0.13 * s, 'iron', R=frame(hang if k % 2 else side)))
        b = a + hang * 3.4 * s
        P.append(Sphere(b, 1.05 * s, 'iron'))
        for d in (side, -side, nrm, -nrm, hang):
            P.append(Capsule(b + d * 0.9 * s, b + d * 1.8 * s, 0.35 * s, 0.05 * s, mat='steel'))
    elif kind == 'hammer':
        P.append(Capsule(g - bd * 1.4 * s, g + bd * 6.0 * s, 0.42 * s, mat='wood'))
        h = g + bd * 5.6 * s
        P.append(Box(h, np.array([1.9, 0.9, 0.9]) * s, 'iron', R=np.stack([side, bd, nrm], axis=1), round_=0.25 * s))
        P.append(Capsule(h - side * 1.8 * s, h - side * 3.2 * s, 0.6 * s, 0.1 * s, mat='iron'))
    elif kind in ('spear', 'trident', 'polearm', 'lance'):
        if kind == 'lance':
            P.append(Disc(g + bd * 0.9 * s, bd, 1.6 * s, 0.3 * s, 'iron'))
            P.append(Capsule(g - bd * 2.5 * s, g + bd * 1.0 * s, 0.55 * s, mat='wood'))
            P.append(Capsule(g + bd * 1.0 * s, g + bd * 15.0 * s, 1.1 * s, 0.12 * s, mat='shaft'))
            return P
        L = {'spear': 8.0, 'trident': 8.0, 'polearm': 10.0}[kind]
        P.append(Capsule(g - bd * 5.0 * s, g + bd * L * s, 0.4 * s, mat='shaft'))
        if kind == 'spear':
            P.append(Capsule(g + bd * L * s, g + bd * (L + 3.0) * s, 0.75 * s, 0.1 * s, mat='steel'))
        elif kind == 'trident':
            P.append(Capsule(g + bd * L * s - side * 1.6 * s, g + bd * L * s + side * 1.6 * s, 0.35 * s, mat='steel'))
            for k in (-1, 0, 1):
                b = g + bd * L * s + side * 1.6 * k * s
                P.append(Capsule(b, b + bd * (2.6 + (k == 0)) * s, 0.35 * s, 0.08 * s, mat='steel'))
        else:
            P.append(Capsule(g + bd * L * s, g + bd * (L + 2.6) * s, 0.5 * s, 0.08 * s, mat='steel'))
            P.append(Ellipsoid(g + bd * (L - 0.6) * s + side * 1.5 * s, np.array([1.6, 1.9, 0.3]) * s, 'steel', R=np.stack([side, bd, nrm], axis=1)))
            P.append(Capsule(g + bd * (L - 0.4) * s - side * 0.3 * s, g + bd * (L - 0.8) * s - side * 1.8 * s, 0.4 * s, 0.08 * s, mat='steel'))
    elif kind == 'staff':
        P.append(Capsule(g - bd * 6.5 * s, g + bd * 8.0 * s, 0.5 * s, mat='wood'))
        P.append(Sphere(g + bd * 8.0 * s, 0.7 * s, 'darkwood'))
        P.append(Sphere(g - bd * 6.5 * s, 0.6 * s, 'darkwood'))
    elif kind == 'bow':
        up = np.array([0, 1.0, 0]); fw = unit(bd * [1, 0, 1] + [0, 0, 0.01])     # bow held upright, bellied forward
        pts = [g + up * 5.0 * s - fw * 0.6 * s, g + up * 2.4 * s + fw * 0.5 * s, g, g - up * 2.4 * s + fw * 0.5 * s, g - up * 5.0 * s - fw * 0.6 * s]
        for i in range(4):
            P.append(Capsule(pts[i], pts[i + 1], 0.42 * s if i in (1, 2) else 0.32 * s, 0.42 * s if i in (1, 2) else 0.3 * s, mat='wood'))
        P.append(Capsule(pts[0], pts[4], 0.1 * s, mat='white'))
        P.append(Capsule(g - up * 0.7 * s, g + up * 0.7 * s, 0.55 * s, mat='leather'))
    elif kind == 'crossbow':
        P.append(Capsule(g - bd * 1.5 * s, g + bd * 4.5 * s, 0.55 * s, mat='wood'))
        a = g + bd * 3.8 * s
        P.append(Capsule(a - side * 3.0 * s - bd * 0.7 * s, a, 0.32 * s, mat='iron'))
        P.append(Capsule(a, a + side * 3.0 * s - bd * 0.7 * s, 0.32 * s, mat='iron'))
        P.append(Capsule(a - side * 3.0 * s - bd * 0.7 * s, a + side * 3.0 * s - bd * 0.7 * s - bd * 0.8 * s, 0.08 * s, mat='white'))
    elif kind == 'whip':
        P.append(Capsule(g - bd * 1.2 * s, g + bd * 1.6 * s, 0.45 * s, mat='darkleather'))
        a = g + bd * 1.6 * s
        pts = [a, a + side * 1.4 * s + [0, -1.6 * s, 0.6 * s], a + side * 0.4 * s + [0, -4.0 * s, 1.4 * s], a - side * 1.6 * s + [0, -5.2 * s, 1.0 * s],
               a - side * 3.2 * s + [0, -5.6 * s, 0.4 * s]]
        for i in range(4):
            P.append(Capsule(pts[i], pts[i + 1], (0.4 - 0.07 * i) * s, (0.33 - 0.07 * i) * s, mat='leather'))
    elif kind in ('pick', 'mattock'):
        L = 6.0 if kind == 'pick' else 8.0
        P.append(Capsule(g - bd * 1.5 * s, g + bd * L * s, 0.42 * s if kind == 'pick' else 0.5 * s, mat='wood'))
        h = g + bd * L * s
        P.append(Capsule(h - side * 2.8 * s, h, 0.35 * s, 0.55 * s, mat='iron'))
        if kind == 'pick':
            P.append(Capsule(h, h + side * 2.8 * s, 0.55 * s, 0.15 * s, mat='iron'))
        else:
            P.append(Ellipsoid(h + side * 1.9 * s - bd * 0.3 * s, np.array([1.8, 1.5, 0.35]) * s, 'iron', R=np.stack([side, bd, nrm], axis=1)))
    elif kind == 'unicorn_horn':
        P.append(Capsule(g - bd * 1.0 * s, g + bd * 8.5 * s, 0.75 * s, 0.08 * s, mat='bone'))
        for k in range(5):
            f = 0.6 + k * 1.5
            r = 0.75 * s * (1 - (f + 1.0) / 9.5) + 0.05
            P.append(Torus(g + bd * f * s, r, 0.16 * s, 'linen', R=along(g, g + bd) @ rot_x(0.4)))
    return P


# ---------------------------------------------------------------- catalogue
ORDER = ['shirt', 'body', 'feet', 'hands', 'cloak', 'head', 'off', 'main']     # tie-break when depths are equal
GM['hawaii'] = Material('#d0408a')

# layer id -> (slot, builder, kind)
LAYERS = {}
for k in ('helmet', 'plumed', 'etched', 'crested', 'visored', 'crystal', 'kabuto', 'hardhat', 'leatherhat', 'skullcap', 'pot', 'cone', 'fedora'):
    LAYERS['head_' + k] = ('head', helmet, k)
for k in ('plate', 'splint', 'mail', 'scale', 'dragon', 'leather', 'studded', 'jacket'):
    LAYERS['body_' + k] = ('body', body_armour, k)
for k in ('shirt', 'hawaiian'):
    LAYERS['shirt_' + k] = ('shirt', body_armour, k)
for k in ('cloak', 'tattered', 'short', 'hooded', 'opera', 'cope', 'robe', 'apron', 'wraps'):
    LAYERS['cloak_' + k] = ('cloak', cloak, k)
for k in ('small', 'elven', 'urukhai', 'orcish', 'large', 'round', 'reflection'):
    LAYERS['shield_' + k] = ('off', shield, k)
for k in ('gloves', 'gauntlets', 'metal'):
    LAYERS['hands_' + k] = ('hands', gloves, k)
for k in ('shoes', 'boots', 'buckled', 'fur', 'laced', 'iron'):
    LAYERS['feet_' + k] = ('feet', boots, k)
for k in ('dagger', 'short_sword', 'long_sword', 'two_handed', 'katana', 'scimitar', 'axe', 'battle_axe', 'club', 'mace', 'morning_star',
          'flail', 'hammer', 'spear', 'trident', 'polearm', 'lance', 'staff', 'bow', 'crossbow', 'whip', 'pick', 'mattock', 'unicorn_horn'):
    LAYERS['main_' + k] = ('main', weapon, k)


def layer_prims(lid, pose):
    slot, fn, kind = LAYERS[lid]
    sk = skeleton(pose)
    return fn(sk, kind), sk


# ---------------------------------------------------------------- rendering jobs
GEAR_MATS = dict(make_mats(), **KEY, **GM)
FR = SIZE_PX + 2 * PAD


def render_frames(kind, name):
    """36 frames (4 dirs x 9 poses) of a base body or a layer: list of rows of (rgba, depth, code, tch)."""
    rows = []
    for d in DIRS:
        row = []
        for pose in POSES:
            if kind == 'base':
                P, mats = base_prims(name, pose)
                row.append(render_px(P, mats, SIZE_PX + 2 * M, (FEET[0] + M, FEET[1] + M), d))
            else:
                P, sk = layer_prims(name, pose)
                row.append(render_px(P, GEAR_MATS, SIZE_PX + 2 * M, (FEET[0] + M, FEET[1] + M), d, ao_prims=P + sk['body'], tint=TINT))
        rows.append(row)
    return rows


def sheets(rows, win, fs):
    """Crop each frame to the window (x0, y0, fs) and lay out colour + aux sheets."""
    col = np.zeros((fs * 4, fs * 9, 4), np.uint8); aux = np.zeros((fs * 4, fs * 9, 3), np.uint8)
    x0, y0 = win
    for r, row in enumerate(rows):
        for c, (img, dep, code, tch) in enumerate(row):
            sl = (slice(y0, y0 + fs), slice(x0, x0 + fs))
            col[r * fs:(r + 1) * fs, c * fs:(c + 1) * fs] = img[sl]
            a = aux[r * fs:(r + 1) * fs, c * fs:(c + 1) * fs]
            a[..., 0] = quant(dep[sl]); a[..., 1] = tch[sl]; a[..., 2] = code[sl]
    return col, aux


def job(args):
    kind, name, out = args
    rows = render_frames(kind, name)
    if kind == 'base':
        col, aux = sheets(rows, (M, M), SIZE_PX)
        fn = 'base-' + name
    else:
        col, aux = sheets(rows, (M - PAD, M - PAD), FR)
        fn = name
    Image.fromarray(col, 'RGBA').save(os.path.join(out, fn + '.png'), optimize=True)
    Image.fromarray(aux, 'RGB').save(os.path.join(out, fn + '.aux.png'), optimize=True)
    return kind, name




# ---------------------------------------------------------------- item names -> variants
STEEL, IRON_C = '#7a8296', '#6a7080'
# variant id -> (layer, tint or None, metal ramp)
VARIANTS = {
    # head
    'helmet': ('head_helmet', STEEL, True), 'helmet_plumed': ('head_plumed', STEEL, True), 'helmet_etched': ('head_etched', STEEL, True),
    'helmet_crested': ('head_crested', STEEL, True), 'helmet_visored': ('head_visored', STEEL, True), 'helmet_crystal': ('head_crystal', None, False),
    'kabuto': ('head_kabuto', '#9a2a22', False), 'hard_hat': ('head_hardhat', '#7e8698', True), 'leather_hat': ('head_leatherhat', '#7a5a34', False),
    'iron_skull_cap': ('head_skullcap', None, False), 'dented_pot': ('head_pot', None, False), 'conical_hat': ('head_cone', '#3a4ab8', False),
    'fedora': ('head_fedora', '#7a5a32', False),
    # body
    'plate_mail': ('body_plate', STEEL, True), 'crystal_plate_mail': ('body_plate', '#bfe8f4', False), 'bronze_plate_mail': ('body_plate', '#b0702c', True),
    'splint_mail': ('body_splint', STEEL, True), 'banded_mail': ('body_splint', '#6e7484', True),
    'chain_mail': ('body_mail', '#7a8294', True), 'ring_mail': ('body_mail', '#6e6e7a', True), 'orcish_chain_mail': ('body_mail', '#5a5048', True),
    'orcish_ring_mail': ('body_mail', '#4e463e', True), 'dwarvish_mithril_coat': ('body_mail', '#a8b2c4', True), 'elven_mithril_coat': ('body_mail', '#c4d0e0', True),
    'scale_mail': ('body_scale', '#7e8494', True), 'studded_leather_armor': ('body_studded', '#6a4428', False), 'leather_armor': ('body_leather', '#7a5232', False),
    'leather_jacket': ('body_jacket', '#2e2a30', False),
    'T_shirt': ('shirt_shirt', '#ece8e0', False), 'Hawaiian_shirt': ('shirt_hawaiian', None, False),
    # cloaks
    'tattered_cape': ('cloak_tattered', '#7a5a34', False), 'opera_cloak': ('cloak_opera', '#2a2430', False), 'ornamental_cope': ('cloak_cope', '#ece8e0', False),
    'piece_of_cloth': ('cloak_short', '#9a7a4a', False), 'faded_pall': ('cloak_cloak', '#56665a', False), 'coarse_mantelet': ('cloak_cloak', '#4a4636', False),
    'hooded_cloak': ('cloak_hooded', '#7a5a34', False), 'slippery_cloak': ('cloak_cloak', '#5a6a3a', True), 'robe': ('cloak_robe', '#b8342c', False),
    'apron': ('cloak_apron', '#ece8e0', False), 'leather_cloak': ('cloak_cloak', '#6a4428', False), 'mummy_wrapping': ('cloak_wraps', None, False),
    'cloak': ('cloak_cloak', '#6a4a7a', False),
    # shields
    'wooden_shield': ('shield_small', None, False), 'elven_shield': ('shield_elven', None, False), 'white_handed_shield': ('shield_urukhai', None, False),
    'red_eyed_shield': ('shield_orcish', None, False), 'large_shield': ('shield_large', None, False), 'large_round_shield': ('shield_round', None, False),
    'polished_silver_shield': ('shield_reflection', None, False),
    # gloves
    'old_gloves': ('hands_gloves', '#6a4428', False), 'padded_gloves': ('hands_gauntlets', '#b8a07a', False), 'riding_gloves': ('hands_gauntlets', '#4a3020', False),
    'fencing_gloves': ('hands_gauntlets', '#e0dcd0', False), 'gauntlets_of_power': ('hands_metal', IRON_C, True),
    # boots
    'walking_shoes': ('feet_shoes', '#5a3a24', False), 'hard_shoes': ('feet_iron', IRON_C, True), 'jackboots': ('feet_boots', '#2e2a30', False),
    'combat_boots': ('feet_laced', '#4a4a32', False), 'jungle_boots': ('feet_laced', '#3a5a2a', False), 'hiking_boots': ('feet_laced', '#7a5232', False),
    'mud_boots': ('feet_boots', '#5a4a32', False), 'buckled_boots': ('feet_buckled', '#4a3020', False), 'riding_boots': ('feet_boots', '#3a2418', False),
    'snow_boots': ('feet_fur', '#6a5a4a', False),
    **{'dsm_' + c: ('body_dragon', h, False) for c, h in (('gray', '#8a8a96'), ('gold', '#e0b040'), ('silver', '#d4dce8'), ('red', '#c03a2a'),
                                                          ('white', '#eeeeee'), ('orange', '#e07a2a'), ('black', '#3a3444'), ('blue', '#3a5ac8'),
                                                          ('green', '#3f9a3c'), ('yellow', '#e8d040'))},
    **{w: ('main_' + w, None, False) for w in ('dagger', 'short_sword', 'long_sword', 'two_handed', 'katana', 'scimitar', 'axe', 'battle_axe', 'club',
                                               'mace', 'morning_star', 'flail', 'hammer', 'spear', 'trident', 'polearm', 'lance', 'staff', 'bow',
                                               'crossbow', 'whip', 'pick', 'mattock', 'unicorn_horn')},
}

# armour: appearance (as NetHack shows it unidentified) and object name -> variant
ARMOUR = {
    'helmet': 'helmet_plumed', 'plumed helmet': 'helmet_plumed', 'helm of caution': 'helmet_etched', 'etched helmet': 'helmet_etched',
    'helm of opposite alignment': 'helmet_crested', 'crested helmet': 'helmet_crested', 'helm of telepathy': 'helmet_visored', 'visored helmet': 'helmet_visored',
    'helm of brilliance': 'helmet_crystal', 'crystal helmet': 'helmet_crystal', 'kabuto': 'kabuto',
    'dwarvish iron helm': 'hard_hat', 'hard hat': 'hard_hat', 'elven leather helm': 'leather_hat', 'leather hat': 'leather_hat',
    'orcish helm': 'iron_skull_cap', 'iron skull cap': 'iron_skull_cap', 'dented pot': 'dented_pot', 'cornuthaum': 'conical_hat',
    'dunce cap': 'conical_hat', 'conical hat': 'conical_hat', 'fedora': 'fedora',
    'plate mail': 'plate_mail', 'tanko': 'plate_mail', 'crystal plate mail': 'crystal_plate_mail', 'bronze plate mail': 'bronze_plate_mail',
    'splint mail': 'splint_mail', 'banded mail': 'banded_mail', 'chain mail': 'chain_mail', 'orcish chain mail': 'orcish_chain_mail',
    'crude chain mail': 'orcish_chain_mail', 'ring mail': 'ring_mail', 'orcish ring mail': 'orcish_ring_mail', 'crude ring mail': 'orcish_ring_mail',
    'scale mail': 'scale_mail', 'dwarvish mithril-coat': 'dwarvish_mithril_coat', 'elven mithril-coat': 'elven_mithril_coat',
    'studded leather armor': 'studded_leather_armor', 'leather armor': 'leather_armor', 'leather jacket': 'leather_jacket',
    't-shirt': 'T_shirt', 'hawaiian shirt': 'Hawaiian_shirt',
    'cloak of protection': 'tattered_cape', 'tattered cape': 'tattered_cape', 'cloak of invisibility': 'opera_cloak', 'opera cloak': 'opera_cloak',
    'cloak of magic resistance': 'ornamental_cope', 'ornamental cope': 'ornamental_cope', 'cloak of displacement': 'piece_of_cloth',
    'piece of cloth': 'piece_of_cloth', 'elven cloak': 'faded_pall', 'faded pall': 'faded_pall', 'orcish cloak': 'coarse_mantelet',
    'coarse mantelet': 'coarse_mantelet', 'dwarvish cloak': 'hooded_cloak', 'hooded cloak': 'hooded_cloak', 'oilskin cloak': 'slippery_cloak',
    'slippery cloak': 'slippery_cloak', 'robe': 'robe', 'alchemy smock': 'apron', 'apron': 'apron', 'leather cloak': 'leather_cloak',
    'mummy wrapping': 'mummy_wrapping',
    'small shield': 'wooden_shield', 'shield of drain resistance': 'wooden_shield', 'shield of shock resistance': 'wooden_shield', 'wooden shield': 'wooden_shield',
    'elven shield': 'elven_shield', 'blue and green shield': 'elven_shield', 'uruk-hai shield': 'white_handed_shield', 'white-handed shield': 'white_handed_shield',
    'orcish shield': 'red_eyed_shield', 'red-eyed shield': 'red_eyed_shield', 'large shield': 'large_shield', 'dwarvish roundshield': 'large_round_shield',
    'large round shield': 'large_round_shield', 'shield of reflection': 'polished_silver_shield', 'polished silver shield': 'polished_silver_shield',
    'leather gloves': 'old_gloves', 'yugake': 'old_gloves', 'old gloves': 'old_gloves', 'gauntlets of fumbling': 'padded_gloves', 'padded gloves': 'padded_gloves',
    'gauntlets of power': 'gauntlets_of_power', 'riding gloves': 'riding_gloves', 'gauntlets of dexterity': 'fencing_gloves', 'fencing gloves': 'fencing_gloves',
    'low boots': 'walking_shoes', 'walking shoes': 'walking_shoes', 'iron shoes': 'hard_shoes', 'hard shoes': 'hard_shoes', 'high boots': 'jackboots',
    'jackboots': 'jackboots', 'speed boots': 'combat_boots', 'combat boots': 'combat_boots', 'water walking boots': 'jungle_boots',
    'jungle boots': 'jungle_boots', 'jumping boots': 'hiking_boots', 'hiking boots': 'hiking_boots', 'elven boots': 'mud_boots', 'mud boots': 'mud_boots',
    'kicking boots': 'buckled_boots', 'buckled boots': 'buckled_boots', 'fumble boots': 'riding_boots', 'riding boots': 'riding_boots',
    'levitation boots': 'snow_boots', 'snow boots': 'snow_boots',
}
for c in ('gray', 'gold', 'silver', 'red', 'white', 'orange', 'black', 'blue', 'green', 'yellow'):
    ARMOUR[c + ' dragon scale mail'] = ARMOUR[c + ' dragon scales'] = 'dsm_' + c

WEAPON_KIND = {   # weapon (or weapon-tool) object name or appearance -> layer kind; None = draw nothing
    'dagger': 'dagger', 'elven dagger': 'dagger', 'runed dagger': 'dagger', 'orcish dagger': 'dagger', 'crude dagger': 'dagger', 'silver dagger': 'dagger',
    'athame': 'dagger', 'scalpel': 'dagger', 'knife': 'dagger', 'shito': 'dagger', 'stiletto': 'dagger', 'worm tooth': 'dagger', 'crysknife': 'dagger',
    'short sword': 'short_sword', 'wakizashi': 'short_sword', 'elven short sword': 'short_sword', 'runed short sword': 'short_sword',
    'orcish short sword': 'short_sword', 'crude short sword': 'short_sword', 'dwarvish short sword': 'short_sword', 'broad short sword': 'short_sword',
    'scimitar': 'scimitar', 'curved sword': 'scimitar', 'silver saber': 'scimitar',
    'broadsword': 'long_sword', 'ninja-to': 'long_sword', 'elven broadsword': 'long_sword', 'runed broadsword': 'long_sword', 'long sword': 'long_sword',
    'runesword': 'long_sword', 'two-handed sword': 'two_handed', 'tsurugi': 'katana', 'long samurai sword': 'katana', 'katana': 'katana', 'samurai sword': 'katana',
    'axe': 'axe', 'battle-axe': 'battle_axe', 'double-headed axe': 'battle_axe',
    'club': 'club', 'aklys': 'club', 'thonged club': 'club', 'rubber hose': 'club', 'mace': 'mace', 'silver mace': 'mace', 'morning star': 'morning_star',
    'war hammer': 'hammer', 'flail': 'flail', 'nunchaku': 'flail', 'quarterstaff': 'staff', 'staff': 'staff', 'bullwhip': 'whip',
    'spear': 'spear', 'elven spear': 'spear', 'runed spear': 'spear', 'orcish spear': 'spear', 'crude spear': 'spear', 'dwarvish spear': 'spear',
    'stout spear': 'spear', 'silver spear': 'spear', 'javelin': 'spear', 'throwing spear': 'spear', 'trident': 'trident', 'lance': 'lance',
    'bow': 'bow', 'elven bow': 'bow', 'runed bow': 'bow', 'orcish bow': 'bow', 'crude bow': 'bow', 'yumi': 'bow', 'long bow': 'bow', 'crossbow': 'crossbow',
    'pick-axe': 'pick', 'dwarvish mattock': 'mattock', 'broad pick': 'mattock', 'unicorn horn': 'unicorn_horn',
    'sling': None, 'arrow': None, 'elven arrow': None, 'orcish arrow': None, 'silver arrow': None, 'ya': None, 'crossbow bolt': None, 'dart': None,
    'shuriken': None, 'throwing star': None, 'boomerang': None, 'runed arrow': None, 'crude arrow': None, 'bamboo arrow': None,
}
for k in ('partisan', 'ranseur', 'spetum', 'glaive', 'naginata', 'halberd', 'bardiche', 'voulge', 'fauchard', 'guisarme', 'bill-guisarme', 'lucern hammer',
          'bec de corbin', 'vulgar polearm', 'hilted polearm', 'forked polearm', 'single-edged polearm', 'angled poleaxe', 'long poleaxe', 'pole cleaver',
          'pole sickle', 'pruning hook', 'hooked polearm', 'pronged polearm', 'beaked polearm'):
    WEAPON_KIND[k] = 'polearm'

ARTIFACTS = {   # artifact name (as shown once known) -> base object name
    'excalibur': 'long sword', 'stormbringer': 'runesword', 'mjollnir': 'war hammer', 'cleaver': 'battle-axe', 'grimtooth': 'orcish dagger',
    'orcrist': 'elven broadsword', 'sting': 'elven dagger', 'magicbane': 'athame', 'frost brand': 'long sword', 'fire brand': 'long sword',
    'dragonbane': 'broadsword', 'demonbane': 'mace', 'werebane': 'silver saber', 'grayswandir': 'silver saber', 'giantslayer': 'long sword',
    'ogresmasher': 'war hammer', 'trollsbane': 'morning star', 'vorpal blade': 'long sword', 'snickersnee': 'katana', 'sunsword': 'long sword',
    'the staff of aesculapius': 'quarterstaff', 'the longbow of diana': 'bow', 'the tsurugi of muramasa': 'tsurugi', 'the sceptre of might': 'mace',
    'the mitre of holiness': 'helm of brilliance', 'the orb of fate': None, 'the heart of ahriman': None,
}

# unknown names: first keyword found picks the variant; otherwise the slot fallback
KEYWORDS = {
    'head': [['pot', 'dented_pot'], ['hat', 'fedora'], ['cap', 'iron_skull_cap'], ['cone', 'conical_hat'], ['helm', 'helmet']],
    'body': [['dragon', 'dsm_gray'], ['plate', 'plate_mail'], ['mithril', 'elven_mithril_coat'], ['chain', 'chain_mail'], ['ring', 'ring_mail'],
             ['scale', 'scale_mail'], ['splint', 'splint_mail'], ['band', 'banded_mail'], ['studded', 'studded_leather_armor'], ['jacket', 'leather_jacket'],
             ['leather', 'leather_armor'], ['mail', 'chain_mail']],
    'shirt': [['hawaiian', 'Hawaiian_shirt']],
    'cloak': [['robe', 'robe'], ['smock', 'apron'], ['apron', 'apron'], ['wrap', 'mummy_wrapping'], ['hood', 'hooded_cloak'], ['cape', 'tattered_cape'],
              ['leather', 'leather_cloak']],
    'off': [['round', 'large_round_shield'], ['silver', 'polished_silver_shield'], ['large', 'large_shield'], ['elven', 'elven_shield'],
            ['orc', 'red_eyed_shield'], ['uruk', 'white_handed_shield']],
    'hands': [['gauntlet', 'riding_gloves']],
    'feet': [['shoe', 'walking_shoes'], ['iron', 'hard_shoes'], ['buckle', 'buckled_boots'], ['snow', 'snow_boots']],
    'main': [['two-handed', 'two_handed'], ['dagger', 'dagger'], ['knife', 'dagger'], ['short sword', 'short_sword'], ['saber', 'scimitar'],
             ['katana', 'katana'], ['sword', 'long_sword'], ['blade', 'long_sword'], ['battle', 'battle_axe'], ['axe', 'axe'], ['hammer', 'hammer'],
             ['mace', 'mace'], ['star', 'morning_star'], ['flail', 'flail'], ['club', 'club'], ['spear', 'spear'], ['lance', 'lance'], ['pole', 'polearm'],
             ['halberd', 'polearm'], ['trident', 'trident'], ['crossbow', 'crossbow'], ['bow', 'bow'], ['staff', 'staff'], ['whip', 'whip'], ['pick', 'pick'],
             ['mattock', 'mattock'], ['horn', 'unicorn_horn']],
}
FALLBACK = {'head': 'helmet', 'body': 'chain_mail', 'shirt': 'T_shirt', 'cloak': 'cloak', 'off': 'wooden_shield', 'hands': 'old_gloves',
            'feet': 'jackboots', 'main': 'short_sword'}
FALLBACK_NONWEAPON = None      # wielding a tool, food, a corpse...: nothing drawn unless a keyword matches


def check_objects(path='objects.json'):
    """Every armour / weapon name and appearance in objects.json resolves."""
    miss = []
    for o in json.load(open(path)):
        for n in (o['name'], o['descr']):
            if not n or n.startswith('generic'):
                continue
            n = n.lower()
            if o['cls'] == 3 and n not in ARMOUR:
                miss.append(n)
            if o['cls'] == 2 and n not in WEAPON_KIND:
                miss.append(n)
    return miss


def write_catalog(out):
    roles = {}
    for r, mnum in ROLE_MNUM.items():
        roles[r] = dict(mnum=mnum, base=f'base-{r}.png', aux=f'base-{r}.aux.png', size=SIZE_PX, feet=list(FEET), shift=[[0, 0]] * 4)
    layers = {}
    for lid, (slot, _, kind) in LAYERS.items():
        layers[lid] = dict(file=f'{lid}.png', aux=f'{lid}.aux.png', slot=slot, order=ORDER.index(slot))
    items = {}
    for n, v in ARMOUR.items():
        items[n] = v
    for n, k in WEAPON_KIND.items():
        items[n] = k
    variants = {}
    for vid, (lid, tint, metal) in VARIANTS.items():
        variants[vid] = dict(layer=lid, slot=LAYERS[lid][0], **({'tint': tint, 'metal': metal} if tint else {}))
    doc = dict(
        version=1, size=SIZE_PX, pad=PAD, frame=FR, cols=len(POSES), rows=len(DIRS), dirs=['S', 'E', 'N', 'W'],
        frames=['idle0', 'idle1', 'walk0', 'walk1', 'walk2', 'walk3', 'atk0', 'atk1', 'atk2'],
        aux=dict(depth='R: 0 empty, else (t - %g) * 4, smaller is nearer' % T0, tint='G: 0 fixed, 1 tint, 2 tint * %g' % 0.66,
                 shade='B: 0..4 light level (sdf.ramp -2..2), +5 depth-darkened (x0.55), 15 outline'),
        darkTint=0.66, order=ORDER, slots=['shirt', 'body', 'cloak', 'feet', 'hands', 'head', 'off', 'main'],
        roles=roles, roleAliases={'cavewoman': 'caveman', 'priestess': 'priest', 'caveperson': 'caveman', 'cleric': 'priest'},
        layers=layers, variants=variants, items=items, artifacts=ARTIFACTS, keywords=KEYWORDS, fallback=FALLBACK)
    json.dump(doc, open(os.path.join(out, 'gear.json'), 'w'), indent=1, sort_keys=False)


if __name__ == '__main__':
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    only = set(sys.argv[2:])
    work = [('base', r, out) for r in ROLE_MNUM] + [('layer', l, out) for l in LAYERS]
    if only:
        work = [w for w in work if w[1] in only or (w[0] == 'base' and 'bases' in only) or (w[0] == 'layer' and ('layers' in only or LAYERS[w[1]][0] in only))]
    with Pool(int(os.environ.get('JOBS', 3))) as pool:
        for n, (kind, name) in enumerate(pool.imap_unordered(job, work)):
            print(f'{n + 1}/{len(work)} {kind} {name}', flush=True)
    write_catalog(out)

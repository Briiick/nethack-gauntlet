"""Tiny vectorised signed-distance renderer that turns 3D rigs into shaded pixel art.

Units are output pixels. Model space: x right, y up, z toward the viewer when the
model faces south. The camera is orthographic, pitched down like a Gauntlet view.
"""
import colorsys
import math

import numpy as np

PITCH = math.radians(38)
FWD = np.array([0.0, -math.sin(PITCH), -math.cos(PITCH)])
UP = np.array([0.0, math.cos(PITCH), -math.sin(PITCH)])
RIGHT = np.array([1.0, 0.0, 0.0])
LIGHT = np.array([-0.5, 0.62, 0.78]); LIGHT /= np.linalg.norm(LIGHT)
VIEW = -FWD
HALF = LIGHT + VIEW; HALF /= np.linalg.norm(HALF)


def rot_y(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_x(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def rot_z(a):
    c, s = math.cos(a), math.sin(a)
    return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])


# ---------------------------------------------------------------- primitives
class Prim:
    def __init__(self, mat, blend=0.0, cut=None):
        self.mat, self.blend, self.cut = mat, blend, cut  # cut: (axis_vec, offset) keeps dot(p,axis) >= offset

    def dist(self, p):
        d = self._d(p)
        if self.cut is not None:
            axis, off = self.cut
            d = np.maximum(d, off - p @ np.asarray(axis, float))
        return d


class Sphere(Prim):
    def __init__(self, c, r, mat, **k):
        super().__init__(mat, **k); self.c, self.r = np.asarray(c, float), r

    def _d(self, p):
        return np.linalg.norm(p - self.c, axis=1) - self.r


class Ellipsoid(Prim):
    def __init__(self, c, radii, mat, R=None, **k):
        super().__init__(mat, **k); self.c, self.rad = np.asarray(c, float), np.asarray(radii, float)
        self.R = R

    def _d(self, p):
        q = p - self.c
        if self.R is not None:
            q = q @ self.R
        k0 = np.linalg.norm(q / self.rad, axis=1)
        k1 = np.linalg.norm(q / (self.rad * self.rad), axis=1)
        return k0 * (k0 - 1.0) / np.maximum(k1, 1e-6)


class Capsule(Prim):
    """Segment a->b with radius interpolated ra->rb (a tapered limb)."""
    def __init__(self, a, b, ra, rb=None, mat=None, **k):
        super().__init__(mat, **k); self.a, self.b = np.asarray(a, float), np.asarray(b, float)
        self.ra, self.rb = ra, ra if rb is None else rb

    def _d(self, p):
        pa = p - self.a; ba = self.b - self.a
        h = np.clip((pa @ ba) / max(ba @ ba, 1e-6), 0, 1)
        return np.linalg.norm(pa - np.outer(h, ba), axis=1) - (self.ra + (self.rb - self.ra) * h)


class Box(Prim):
    def __init__(self, c, half, mat, R=None, round_=0.3, **k):
        super().__init__(mat, **k); self.c, self.h, self.R, self.rr = np.asarray(c, float), np.asarray(half, float), R, round_

    def _d(self, p):
        q = p - self.c
        if self.R is not None:
            q = q @ self.R
        q = np.abs(q) - (self.h - self.rr)
        return np.linalg.norm(np.maximum(q, 0), axis=1) + np.minimum(np.max(q, axis=1), 0) - self.rr


class Disc(Prim):
    """Flat cylinder (shields, coins): radius r, half-thickness t, axis = normal."""
    def __init__(self, c, normal, r, t, mat, **k):
        super().__init__(mat, **k); self.c = np.asarray(c, float)
        n = np.asarray(normal, float); self.n = n / np.linalg.norm(n); self.r, self.t = r, t

    def _d(self, p):
        q = p - self.c
        y = q @ self.n
        x = np.linalg.norm(q - np.outer(y, self.n), axis=1)
        dx, dy = x - self.r, np.abs(y) - self.t
        return np.minimum(np.maximum(dx, dy), 0) + np.hypot(np.maximum(dx, 0), np.maximum(dy, 0))


class Octahedron(Prim):
    """Faceted gem: |x|/a + |y|/b + |z|/c = 1 (approximate distance)."""
    def __init__(self, c, radii, mat, R=None, **k):
        super().__init__(mat, **k); self.c, self.rad, self.R = np.asarray(c, float), np.asarray(radii, float), R

    def _d(self, p):
        q = p - self.c
        if self.R is not None:
            q = q @ self.R
        return (np.abs(q / self.rad).sum(axis=1) - 1) * self.rad.min() * 0.57735


class Torus(Prim):
    """Ring of major radius R0 and tube radius r around `axis` (rings, chain links, handles)."""
    def __init__(self, c, R0, r, mat, R=None, squash=(1, 1), **k):
        super().__init__(mat, **k); self.c, self.R0, self.r, self.Rm, self.sq = np.asarray(c, float), R0, r, R, squash

    def _d(self, p):
        q = p - self.c
        if self.Rm is not None:
            q = q @ self.Rm
        x, y, z = q[:, 0] / self.sq[0], q[:, 1], q[:, 2] / self.sq[1]
        return np.hypot(np.hypot(x, z) - self.R0, y) - self.r


def smin(a, b, k):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b + (a - b) * h - k * h * (1 - h)


def scene_sdf(prims, p):
    d = np.full(len(p), 1e9); m = np.full(len(p), -1, int)
    for i, pr in enumerate(prims):
        di = pr.dist(p)
        closer = di < d
        m = np.where(closer, i, m)
        d = smin(d, di, pr.blend) if pr.blend > 0 else np.minimum(d, di)
    return d, m


# ---------------------------------------------------------------- materials
def ramp(hex_color, metal=False, steps=(-2, -1, 0, 1, 2), step=None, hue=1.0):
    """Hue-shifted shading ramp: shadows drift toward violet, highlights toward warm."""
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    out = {}
    for k in steps:
        hh = h
        if k < 0:
            target = 0.72
            hh = h + ((target - h + 0.5) % 1 - 0.5) * (0.10 * -k * hue)
        elif k > 0:
            target = 0.13
            hh = h + ((target - h + 0.5) % 1 - 0.5) * (0.08 * k * hue)
        st = step if step is not None else (0.13 if not metal else 0.15)
        ll = min(0.95, max(0.04, l + k * st))
        ss = min(1, max(0, s * (1 + 0.12 * -k * hue) if k < 0 else s * (1 - 0.1 * k)))
        rr, gg, bb = colorsys.hls_to_rgb(hh % 1, ll, ss)
        out[k] = (int(rr * 255), int(gg * 255), int(bb * 255))
    return out


class Material:
    def __init__(self, color, metal=False, glow=False, detail=False, step=None, hue=1.0):
        self.color, self.metal, self.glow, self.detail = color, metal, glow, detail or glow
        self.ramp = ramp(color, metal, step=step, hue=hue)


# ---------------------------------------------------------------- render
def render(prims, mats, size=32, feet=(16, 28), facing=0.0, ss=2, R=None, scale=1.0, outline=True):
    """Render a rig (list of Prim) facing `facing` radians (0 = south/toward viewer).

    R overrides the world->model rotation (item icons face the camera); `scale` is
    pixels per model unit."""
    S = size * ss
    us = (np.arange(S) + 0.5) / ss
    U, V = np.meshgrid(us, us)
    sx = U.ravel() - feet[0]
    sy = feet[1] - V.ravel()
    origins = np.outer(sx, RIGHT) + np.outer(sy, UP) - FWD * 60
    if R is None:
        R = rot_y(-facing)                   # world -> model
    t = np.zeros(len(origins)); hit = np.zeros(len(origins), bool); alive = np.ones(len(origins), bool)
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
    img = np.zeros((S * S, 4), np.uint8)
    depth = np.full(S * S, np.inf)
    level = np.full(S * S, 0, int)
    detail = np.zeros(S * S, bool)
    hi = np.nonzero(hit)[0]
    if len(hi):
        p = (origins[hi] + np.outer(t[hi], FWD)) @ R.T / scale
        _, m = scene_sdf(prims, p)
        e = 0.15
        n = np.zeros_like(p)
        for ax in range(3):
            dv = np.zeros(3); dv[ax] = e
            n[:, ax] = scene_sdf(prims, p + dv)[0] - scene_sdf(prims, p - dv)[0]
        n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-6)
        nw = n @ R                            # model normal -> world normal
        ao = np.ones(len(p))
        for hstep, wgt in ((0.8, 0.5), (1.8, 0.3), (3.0, 0.2)):
            dd = scene_sdf(prims, p + n * hstep)[0]
            ao -= np.clip((hstep - dd) / hstep, 0, 1) * wgt * 0.55
        diff = np.clip(nw @ LIGHT, 0, 1)
        rim = np.clip(1 - (nw @ VIEW), 0, 1) ** 2.2 * np.clip(nw @ np.array([0.6, 0.3, -0.2]), 0, 1)
        inten = (0.28 + 0.82 * diff) * (0.55 + 0.45 * ao) + rim * 0.35
        lev = np.digitize(inten, [0.40, 0.60, 0.86, 1.10]) - 2
        spec = (nw @ HALF) > 0.965
        for i, pi in enumerate(hi):
            mat = mats[prims[m[i]].mat]
            l = int(lev[i])
            if mat.metal and spec[i]:
                l = 2
            if mat.glow:
                l = max(l, 1)
            col = mat.ramp[l]
            img[pi] = (*col, 255)
            level[pi] = l
            detail[pi] = mat.detail
        depth[hi] = t[hi]
    img = img.reshape(S, S, 4); depth = depth.reshape(S, S); detail = detail.reshape(S, S)
    if ss > 1:
        img, depth = downsample(img, depth, ss, detail)
    return finish(img, depth) if outline else img


def downsample(img, depth, ss, detail):
    S = img.shape[0] // ss
    out = np.zeros((S, S, 4), np.uint8); dout = np.full((S, S), np.inf)
    for y in range(S):
        for x in range(S):
            block = img[y * ss:(y + 1) * ss, x * ss:(x + 1) * ss].reshape(-1, 4)
            dblock = depth[y * ss:(y + 1) * ss, x * ss:(x + 1) * ss].ravel()
            solid = block[:, 3] > 0
            if solid.sum() * 2 < len(block):
                continue
            dmask = detail[y * ss:(y + 1) * ss, x * ss:(x + 1) * ss].ravel()
            if (dmask & solid).any():          # tiny features (eyes, glints) always survive
                k = np.nonzero(dmask & solid)[0][0]
                out[y, x] = block[k]; dout[y, x] = dblock[solid].min()
                continue
            cols = [tuple(c) for c in block[solid]]
            # the most common colour keeps shading bands crisp; ties go to the nearest sample
            best = max(set(cols), key=lambda c: (cols.count(c), -dblock[solid][cols.index(c)]))
            out[y, x] = best
            dout[y, x] = dblock[solid].min()
    return out, dout


def finish(img, depth):
    """Outline (dark, slightly tinted) plus interior lines where depth jumps."""
    H, W = depth.shape
    out = img.copy()
    solid = img[:, :, 3] > 0
    for y in range(H):
        for x in range(W):
            if solid[y, x]:
                # interior separation: darken a pixel that sits well behind a neighbour
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = x + dx, y + dy
                    if 0 <= nx < W and 0 <= ny < H and solid[ny, nx] and depth[y, x] - depth[ny, nx] > 3.2:
                        out[y, x, :3] = (img[y, x, :3] * 0.55).astype(np.uint8)
                        break
                continue
            nb = [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                  if 0 <= x + dx < W and 0 <= y + dy < H and solid[y + dy, x + dx]]
            if nb:
                c = np.mean([img[ny, nx, :3] for nx, ny in nb], axis=0)
                out[y, x] = (*(c * 0.18 + np.array([14, 9, 18]) * 0.82).astype(np.uint8), 255)
    return out

"""Item icons for every NetHack object, rendered with the same SDF pipeline as the actors.

Each object is modelled from its class and name, and coloured by its *appearance*
("milky" potion, "ebony" wand, "hexagonal" amulet). The game shuffles appearances per
game, so the client draws the icon of objects[otyp].oc_descr_idx (see nhg_obj_descr).

Usage: python3 items.py objects.json out_dir [size ...]
Writes items<size>.png (atlas, 32 per row) and items.json ({size: cols, objects: n}).
"""
import colorsys
import hashlib
import json
import math
import os
import sys
from multiprocessing import Pool

import numpy as np
from PIL import Image

from sdf import (PITCH, Box, Capsule, Disc, Ellipsoid, Material, Octahedron, Prim, Sphere, Torus,
                 render, rot_x, rot_y, rot_z)

FLAT = rot_x(PITCH - 0.18)             # model XY plane faces the camera, a little top showing
U = np.array([1, 1, 0]) / math.sqrt(2)  # diagonal for long things (hilt bottom-left, tip top-right)
V = np.array([-1, 1, 0]) / math.sqrt(2)
D45 = rot_z(math.radians(45))


def P(t, o=0.0, z=0.0):
    return U * t + V * o + np.array([0, 0, z])


def h(s, n):
    return int(hashlib.md5(s.encode()).hexdigest(), 16) % n


def shade(hex_color, f):
    """Lighten (f > 1) or darken (f < 1) a #rrggbb colour."""
    r, g, b = (int(hex_color[i:i + 2], 16) / 255 for i in (1, 3, 5))
    hh, l, ss = colorsys.rgb_to_hls(r, g, b)
    r, g, b = colorsys.hls_to_rgb(hh, min(0.95, max(0.03, l * f)), ss)
    return '#%02x%02x%02x' % (int(r * 255), int(g * 255), int(b * 255))


def chain(pts, r0, r1, mat):
    """Capsules along a polyline, radius tapering r0 -> r1 (bow limbs, hooks, curls)."""
    n = len(pts) - 1
    return [Capsule(pts[i], pts[i + 1], r0 + (r1 - r0) * i / n, r0 + (r1 - r0) * (i + 1) / n, mat=mat) for i in range(n)]


class Prism(Prim):
    """Regular n-sided plate (apothem r, half-thickness t) around the model z axis: hexagons, octagons."""
    def __init__(self, c, n, r, t, mat, phase=0.0, **k):
        super().__init__(mat, **k)
        self.c, self.n, self.r, self.t, self.ph = np.asarray(c, float), n, r, t, phase

    def _d(self, p):
        q = p - self.c
        sec = 2 * math.pi / self.n
        a = (np.arctan2(q[:, 1], q[:, 0]) - self.ph + sec / 2) % sec - sec / 2
        dx = np.hypot(q[:, 0], q[:, 1]) * np.cos(a) - self.r
        dz = np.abs(q[:, 2]) - self.t
        return np.minimum(np.maximum(dx, dz), 0) + np.hypot(np.maximum(dx, 0), np.maximum(dz, 0))


# ------------------------------------------------------------------ palette
COL = {
    'red': '#c0242a', 'ruby': '#c8102e', 'pink': '#f08ab0', 'orange': '#f07a1a', 'yellow': '#f0d020',
    'emerald': '#10a050', 'dark green': '#1e5a2a', 'cyan': '#2ad0d0', 'sky blue': '#6ab8f0', 'brilliant blue': '#2a5aff',
    'magenta': '#d02ad0', 'purple-red': '#a0204a', 'puce': '#a05a6a', 'milky': '#f0ece0', 'swirly': '#8a5ad0',
    'bubbly': '#5ad08a', 'smoky': '#7a7a80', 'cloudy': '#b8bcc8', 'effervescent': '#c8f05a', 'black': '#26222a',
    'golden': '#e8b030', 'brown': '#7a4a22', 'fizzy': '#e0e060', 'dark': '#3a2a4a', 'white': '#eeeeee', 'murky': '#4a5030',
    'clear': '#cfe6ff', 'green': '#2a9a3a', 'blue': '#2a4ad0', 'violet': '#8a3ad0', 'yellowish brown': '#b88a2a',
    'gray': '#8a8a90', 'light green': '#8ae07a', 'turquoise': '#2ac0b0', 'light blue': '#8ac0f0', 'dark blue': '#1a2a80',
    'indigo': '#3a2a90', 'purple': '#7a2aa0', 'tan': '#c8a070', 'light brown': '#a8784a', 'dark brown': '#4a2a14',
    'plaid': '#b03a2a', 'checkered': '#e0e0e0', 'parchment': '#e0c890', 'vellum': '#ece0c0', 'ragged': '#8a6a4a',
    'dog eared': '#c0a070', 'mottled': '#6a7a4a', 'stained': '#9a7a5a', 'cloth': '#6a5a8a', 'leathery': '#6a4428',
    'velvet': '#7a1430', 'glittering': '#e0d0ff', 'shining': '#f0f0ff', 'dull': '#6a6a6a', 'thin': '#b07a4a',
    'thick': '#5a3a2a', 'dusty': '#9a8a70', 'wrinkled': '#a89070', 'papyrus': '#d8c088', 'paperback': '#e04a3a',
    'plain': '#d8c8a8',
}
METAL = {
    'iron': '#6e727c', 'steel': '#98a0b2', 'silver': '#c4c8d6', 'gold': '#e8b83a', 'brass': '#c8a040', 'copper': '#c8703a',
    'bronze': '#b07a3a', 'tin': '#b0b4b8', 'platinum': '#e0e4f0', 'iridium': '#9aa0c0', 'zinc': '#a0a8b0', 'aluminum': '#c8d0d8',
    'uranium': '#7ab04a', 'mithril': '#e8f0ff',
}
WOOD = {'balsa': '#e0c890', 'maple': '#c08a4a', 'pine': '#d0a060', 'oak': '#8a5a2a', 'ebony': '#2a1a14', 'redwood': '#8a2a1a',
        'wooden': '#8a5a2a', 'wood': '#7a5232'}
STONE = {'marble': '#e8e4e0', 'granite': '#8a8480', 'opal': '#d8e8f0', 'clay': '#b0603a', 'coral': '#f07a6a', 'black onyx': '#1a1a20',
         'moonstone': '#c8d8f0', 'tiger eye': '#b0782a', 'jade': '#3aa070', 'agate': '#c8602a', 'topaz': '#e0a030',
         'sapphire': '#2a4ae0', 'ruby': '#d0102a', 'diamond': '#f0f8ff', 'pearl': '#f0ece8', 'ivory': '#f0e8d0',
         'emerald': '#10b050', 'glass': '#cfe6ff', 'crystal': '#e8f4ff'}


class Kit:
    """Collects materials while a model is built; keys are generated per colour."""
    def __init__(self):
        self.m = {}

    def c(self, color, metal=False, glow=False, step=None, hue=1.0, detail=False):
        key = f'{color}{"M" if metal else ""}{"G" if glow else ""}{step}{detail}'
        if key not in self.m:
            self.m[key] = Material(color, metal=metal, glow=glow, step=step, hue=hue, detail=detail)
        return key

    def metal(self, name):
        return self.c(METAL.get(name, METAL['steel']), metal=True, step=0.115)

    def look(self, name, default='#8a8a90'):
        """Material for an appearance word: metal, wood, stone or colour."""
        n = (name or '').lower()
        if n in METAL:
            return self.c(METAL[n], metal=True)
        if n in WOOD:
            return self.c(WOOD[n])
        if n in STONE:
            return self.c(STONE[n], metal=n in ('glass', 'crystal', 'diamond', 'sapphire', 'ruby', 'emerald', 'topaz', 'opal'),
                          glow=n in ('crystal',))
        if n in COL:
            return self.c(COL[n])
        return self.c(default)


# ------------------------------------------------------------------ weapon parts
def hilt(k, base, guard=3.6, grip=3.6, gm='gold', lm='#4a2a18', pommel=True):
    """Crossguard, wrapped grip and pommel below `base` along the diagonal."""
    out = [Capsule(P(base, -guard), P(base, guard), 0.85, mat=k.metal(gm) if gm in METAL else k.c(gm)),
           Capsule(P(base - 0.6), P(base - grip), 0.95, mat=k.c(lm))]
    if pommel:
        out.append(Sphere(P(base - grip - 0.8), 1.25, k.metal(gm) if gm in METAL else k.c(gm)))
    return out


def blade(k, a, b, w0, w1, mat, curve=0.0):
    """Tapered blade from t=a to t=b; `curve` bows it sideways."""
    n = 6 if curve else 1
    out = []
    for i in range(n):
        t0, t1 = a + (b - a) * i / n, a + (b - a) * (i + 1) / n
        o0 = curve * math.sin(math.pi * (i / n) * 0.9)
        o1 = curve * math.sin(math.pi * ((i + 1) / n) * 0.9)
        r0 = w0 + (w1 - w0) * i / n
        r1 = w0 + (w1 - w0) * (i + 1) / n
        out.append(Capsule(P(t0, o0), P(t1, o1), r0, r1, mat=mat))
    return out


def sword(k, name, d):
    steel = k.metal('silver' if 'silver' in name else 'steel')
    if 'orcish' in name or 'crude' in d:
        steel = k.c('#6a6460', metal=True)
    gm = 'gold' if any(w in name for w in ('long', 'broad', 'rune', 'saber', 'katana', 'tsurugi')) else 'iron'
    if 'two-handed' in name or 'tsurugi' in name:
        return blade(k, -2, 13.5, 1.7, 0.45, steel) + hilt(k, -2, 4.2, 5.5, gm)
    if 'scimitar' in name or 'curved' in d or 'saber' in name:
        return blade(k, -4, 11.5, 1.5, 0.4, steel, curve=2.6) + hilt(k, -4, 3.2, 4, gm)
    if 'katana' in name or 'samurai' in d:
        return blade(k, -4, 12, 1.25, 0.4, steel, curve=1.4) + [Disc(P(-4), U, 2.2, 0.5, k.metal('gold'))] + \
            [Capsule(P(-4.6), P(-10), 0.95, mat=k.c('#1a1a2a'))]
    if 'short' in name:
        return blade(k, -5, 8, 1.55, 0.5, steel) + hilt(k, -5, 3.2, 3.4, gm)
    if 'broad' in name or 'rune' in name:
        out = blade(k, -4, 11.5, 2.0, 0.6, steel) + hilt(k, -4, 4.2, 4, gm)
        if 'rune' in name or 'runed' in d:
            out += [Sphere(P(t, 0, 1.6), 0.5, k.c('#7ad0ff', glow=True, detail=True)) for t in (0, 3, 6)]
        return out
    return blade(k, -4, 12, 1.6, 0.45, steel) + hilt(k, -4, 3.8, 4.4, gm)


def dagger(k, name, d):
    if 'worm tooth' in name or 'crysknife' in name:
        return blade(k, -7, 7, 1.8, 0.4, k.c('#ece4d0', step=0.09), curve=1.8) + [Capsule(P(-7), P(-10), 1.2, mat=k.c('#a89880'))]
    steel = k.metal('silver' if 'silver' in name else 'steel')
    if 'orcish' in name or 'crude' in d:
        steel = k.c('#6a6460', metal=True)
    if 'athame' in name:
        return blade(k, -3, 7.5, 1.7, 0.5, steel) + hilt(k, -3, 2.6, 3.4, '#1a1418')
    if 'scalpel' in name:
        return blade(k, 3, 7, 0.9, 0.3, steel) + [Capsule(P(-8), P(3), 0.7, mat=steel)]
    if 'knife' in name:
        return blade(k, -1, 7, 1.4, 0.4, steel) + [Capsule(P(-1), P(-7), 1.1, mat=k.c('#6a4428'))]
    if 'stiletto' in name:
        return blade(k, -3, 9, 0.9, 0.25, steel) + hilt(k, -3, 2.4, 3.4, 'iron')
    gm = 'gold' if 'elven' in name or 'runed' in d else 'iron'
    return blade(k, -3, 7.5, 1.5, 0.4, steel) + hilt(k, -3, 2.8, 3.4, gm)


def haft(k, a, b, r=0.85, mat=None):
    return Capsule(P(a), P(b), r, mat=mat or k.c(WOOD['wood']))


def bit(k, c, side, st, edge, reach=5.2, spread=0.62, n=6):
    """Axe bit: thin plates fanned out from the haft at c toward side*V, closed by a bright
    crescent cutting edge, so it reads as a flaring blade rather than a block."""
    out = []
    for a in np.linspace(-spread, spread, n):
        dv = V * side * math.cos(a) + U * math.sin(a)
        out.append(Ellipsoid(c + dv * reach * 0.5, (reach * 0.55, 0.95, 0.45), st, R=rot_z(math.atan2(dv[1], dv[0]))))
    arc = [c + (V * side * math.cos(a) + U * math.sin(a) * 1.15) * reach for a in np.linspace(-spread - 0.12, spread + 0.12, 7)]
    return out + chain(arc, 0.75, 0.75, edge)


def axe(k, name, d):
    st, edge = k.metal('steel'), k.c('#e4e8f0', metal=True, step=0.09)
    out = [haft(k, -12, 10.5)]
    if 'battle' in name or 'double' in d:   # two crescent bits either side of a socket
        return out + bit(k, P(6.5), 1, st, edge, 5.6, 0.7) + bit(k, P(6.5), -1, st, edge, 5.6, 0.7) + \
            [Box(P(6.5), (2.0, 1.1, 1.1), k.metal('iron'), R=D45, round_=0.4), Capsule(P(8.2), P(11), 0.6, 0.15, mat=st)]
    return out + bit(k, P(7), 1, st, edge, 4.8, 0.62) + [Box(P(7, -0.4), (1.8, 1.4, 1.1), k.metal('iron'), R=D45, round_=0.4)]


def spear(k, name, d, length=12, head=3.6):
    st = k.metal('silver' if 'silver' in name else 'steel')
    if 'orcish' in name or 'crude' in d:
        st = k.c('#6a6460', metal=True)
    out = [haft(k, -13, length - head + 0.5, 0.7)]
    if 'trident' in name:
        out += [Capsule(P(length - head, -2.4), P(length - head, 2.4), 0.6, mat=st)]
        out += [Capsule(P(length - head, o), P(length + 0.5, o), 0.55, 0.25, mat=st) for o in (-2.2, 0, 2.2)]
        return out
    out.append(Ellipsoid(P(length - head * 0.45), (head * 0.75, 1.3, 0.55), st, R=D45))
    if 'dwarvish' in name or 'stout' in d:
        out.append(Ellipsoid(P(length - head * 0.45), (head * 0.7, 1.7, 0.6), st, R=D45))
    if 'elven' in name or 'runed' in d:
        out.append(Capsule(P(length - head - 0.5, -1.4), P(length - head - 0.5, 1.4), 0.5, mat=k.metal('gold')))
    return out


def polearm(k, name, d):
    st = k.metal('steel')
    out = [haft(k, -14, 9, 0.7)]
    v = h(name, 4)
    if 'voulge' in name or 'cleaver' in d:     # long shaft, tall cleaver blade lashed on, spike on top
        return [haft(k, -17, 12, 0.6), Box(P(8.6, 2.0), (4.6, 1.9, 0.4), st, R=D45, round_=0.35),
                Capsule(P(4.2, 3.4), P(13.0, 3.6), 0.55, mat=k.c('#e4e8f0', metal=True, step=0.09)),
                Capsule(P(12.6, 0.3), P(15.8, 0.3), 0.8, 0.1, mat=st),
                Capsule(P(5.0, -0.8), P(5.0, 0.8), 0.75, mat=k.c('#3a2414')), Capsule(P(11.0, -0.8), P(11.0, 0.8), 0.75, mat=k.c('#3a2414'))]
    if 'fauchard' in name or 'sickle' in d:      # long shaft ending in a sickle blade that hooks back
        hook = [P(8.5, 0), P(11.2, 0.4), P(13.4, 1.6), P(14.6, 3.6), P(14.0, 5.6), P(12.2, 6.8), P(10.2, 6.6)]
        return [haft(k, -16, 9.5, 0.6)] + chain(hook, 1.8, 0.45, st) + \
            [Capsule(P(8.0, -0.8), P(8.0, 0.8), 0.75, mat=k.metal('iron'))]
    if 'halberd' in name or 'poleaxe' in d or 'bardiche' in name:
        out += [Ellipsoid(P(8, 3), (2.8, 3.0, 0.7), st, R=D45), Capsule(P(9), P(13), 0.6, 0.2, mat=st)]
    elif 'glaive' in name or 'single-edged' in d or 'fauchard' in name or 'sickle' in d:
        out += blade(k, 8, 14, 1.9, 0.4, st, curve=1.3)
    elif 'guisarme' in name or 'hook' in d:
        out += [Capsule(P(9), P(13.5), 0.7, 0.3, mat=st), Torus(P(10.5, 2), 2, 0.55, st, R=rot_x(math.pi / 2))]
    elif 'lucern' in name or 'pronged' in d or 'corbin' in name or 'beaked' in d:
        out += [Box(P(9.5, -1), (1.4, 1.4, 1.2), st, R=D45), Capsule(P(9.5, 0.5), P(9.5, 4.5), 0.8, 0.2, mat=st), Capsule(P(10.5), P(13), 0.5, 0.2, mat=st)]
    else:   # partisan, ranseur, spetum
        out += [Ellipsoid(P(11.5), (3, 1.2, 0.5), st, R=D45)]
        if v % 2 or 'forked' in d or 'hilted' in d:
            out += [Capsule(P(9, -1), P(10.8, -3.0), 0.45, 0.2, mat=st), Capsule(P(9, 1), P(10.8, 3.0), 0.45, 0.2, mat=st)]
    return out


def blunt(k, name, d):
    st = k.metal('silver' if 'silver' in name else 'iron')
    if 'club' in name or 'aklys' in name:
        out = [Capsule(P(-11), P(9), 1.0, 2.6, mat=k.c('#6a4228'))]
        if 'aklys' in name or 'thonged' in d:
            out.append(Torus(P(-10, 0, 0), 2.0, 0.35, k.c('#a07a4a'), R=rot_x(1.2)))
        return out
    if 'quarterstaff' in name or 'staff' in d:
        return [Capsule(P(-14), P(14), 1.05, mat=k.c('#8a5a2a')), Capsule(P(-1.5), P(1.5), 1.25, mat=k.c('#4a2a14'))]
    out = [haft(k, -12, 6, 0.85, k.c('#5a3a22'))]
    if 'morning' in name:
        out += [Sphere(P(8), 3.2, st)] + [Capsule(P(8) + np.array([math.cos(a), math.sin(a), 0]) * 2.8,
                                                  P(8) + np.array([math.cos(a), math.sin(a), 0]) * 4.6, 0.55, 0.15, mat=k.metal('steel'))
                                          for a in np.linspace(0, 2 * math.pi, 9)[:-1]]
    elif 'hammer' in name:
        out += [Box(P(7.5), (1.8, 4.4, 1.8), st, R=D45, round_=0.5)]
    elif 'flail' in name:
        out = [haft(k, -12, 2, 0.85)] + [Torus(P(3.5 + i * 1.7), 0.8, 0.3, st, R=rot_x(i * 1.5)) for i in range(3)] + [Sphere(P(10), 2.6, st)]
    else:   # mace: short handle, flanged head with spikes
        st = k.metal('silver' if 'silver' in name else 'steel')
        out = [haft(k, -9, 3.5, 0.85, k.c('#5a3a22')), Capsule(P(-9), P(-5.5), 1.05, mat=k.c('#2a1a10'))]
        out += [Ellipsoid(P(6), (3.4, 1.7, 1.7), st, R=D45)]
        out += [Box(P(6, o * 1.9), (2.8, 1.1, 0.45), st, R=D45, round_=0.35) for o in (-1, 1)]
        out += [Capsule(P(6, o * 2.6), P(6, o * 4.2), 0.55, 0.1, mat=st) for o in (-1, 1)]
        out += [Capsule(P(8.6), P(11.2), 0.75, 0.1, mat=st), Capsule(P(3.0), P(3.0, 0, 0.1), 1.3, mat=k.metal('iron'))]
    return out


def missile(k, name, d):
    st = k.metal('silver' if 'silver' in name else 'steel')
    if 'shuriken' in name or 'star' in d:
        return [Box((0, 0, 0), (6, 1.1, 0.3), st, R=rot_z(a), round_=0.2) for a in (0.3, 1.1, 1.87, 2.66)] + [Torus((0, 0, 0), 1.3, 0.5, k.metal('iron'), R=rot_x(math.pi / 2))]
    if 'boomerang' in name:
        w = k.c('#a0703a')
        return [Capsule((-9, -4, 0), (0, 4, 0), 1.6, 1.8, mat=w), Capsule((0, 4, 0), (9, -4, 0), 1.8, 1.6, mat=w)]
    shaft = k.c('#b08a5a')
    fl = k.c(['#e0e0e0', '#c02a2a', '#2a4ac0', '#2a8a3a'][h(name, 4)])
    if 'bolt' in name:      # one short, thick quarrel: square head, two stiff vanes
        return [Capsule(P(-5.5), P(4), 0.85, mat=shaft), Octahedron(P(5.4), (2.4, 1.35, 1.35), st, R=D45),
                Capsule(P(3.6), P(4.2), 1.05, mat=k.metal('iron'))] + \
               [Ellipsoid(P(-4.2, o * 1.1), (2.2, 0.95, 0.22), fl, R=D45) for o in (-1, 1)]
    if 'dart' in name:
        return [Capsule(P(-5), P(4), 0.6, mat=st), Ellipsoid(P(5.5), (1.6, 0.6, 0.6), st, R=D45),
                Ellipsoid(P(-5, 1), (2.4, 1.2, 0.2), fl, R=D45), Ellipsoid(P(-5, -1), (2.4, 1.2, 0.2), fl, R=D45)]
    if 'ya' == name or 'bamboo' in d:
        shaft = k.c('#c8b070')
    if 'elven' in name or 'runed' in d:
        shaft = k.c('#e0c890')
    if 'orcish' in name or 'crude' in d:
        shaft, st = k.c('#5a4a3a'), k.c('#5a5450', metal=True)
    out = []
    for o in (-2.0, 0.4, 2.8):   # a small bundle reads as "ammunition"
        out += [Capsule(P(-11, o), P(9, o), 0.42, mat=shaft), Ellipsoid(P(10.5, o), (1.9, 0.9, 0.5), st, R=D45),
                Ellipsoid(P(-10, o + 0.55), (2.4, 0.7, 0.2), fl, R=D45), Ellipsoid(P(-10, o - 0.55), (2.4, 0.7, 0.2), fl, R=D45)]
    return out


def launcher(k, name, d):
    w = k.c('#8a5a2a' if 'elven' not in name else '#c8a060')
    if 'orcish' in name or 'crude' in d:
        w = k.c('#4a3a2a')
    if 'crossbow' in name:
        return [Capsule((0, -11, 0), (0, 7, 0), 1.3, mat=w), Box((0, -9, 0), (1.6, 2.4, 1.2), w),
                *[Capsule((x0, y0, 0), (x1, y1, 0), 0.8, mat=k.metal('iron')) for x0, y0, x1, y1 in ((-9, 2, -4, 5), (-4, 5, 0, 5.5), (0, 5.5, 4, 5), (4, 5, 9, 2))],
                Capsule((-9, 2, 0), (0, -2, 0), 0.2, mat=k.c('#e0e0d0')), Capsule((9, 2, 0), (0, -2, 0), 0.2, mat=k.c('#e0e0d0'))]
    if 'sling' in name:
        lm = k.c('#6a4428')
        return [Ellipsoid((0, -4, 0), (3, 2, 1.2), lm), Capsule((-2.5, -3.5, 0), (-6, 9, 0), 0.35, mat=lm), Capsule((2.5, -3.5, 0), (6, 9, 0), 0.35, mat=lm)]
    # a bow: curved limb on the diagonal bulging up-left, straight string, wrapped grip
    long = name == 'yumi' or 'long' in d
    L, bulge, g = (14, 5.0, -0.3) if long else (11.5, 4.6, 0.0)     # the yumi is long and gripped low
    if long:
        w = k.c('#c89a50')
    pts = []
    for s in np.linspace(-1, 1, 13):
        u = (s - g) / ((1 - g) if s > g else (1 + g))
        o = bulge * (1 - u * u) - (0.9 * (abs(u) - 0.8) / 0.2 if abs(u) > 0.8 else 0)   # tips recurve
        pts.append(P(s * L, o))
    out = [Capsule(pts[i], pts[i + 1], 1.0 - 0.45 * abs(i - 6 - g * 6) / 7, 1.0 - 0.45 * abs(i - 5 - g * 6) / 7, mat=w) for i in range(12)]
    out += [Capsule(pts[0], pts[-1], 0.38, mat=k.c('#f4f0e4', glow=True))]
    gi = int(round((g + 1) * 6))
    out += [Capsule(P(g * L - 1.6, bulge), P(g * L + 1.6, bulge), 1.25, mat=k.c('#3a2014' if 'elven' not in name else '#2a6a4a'))]
    if 'elven' in name or 'runed' in d:
        out += [Sphere(pts[i], 0.9, k.metal('gold')) for i in (0, 12)]
    if long:
        out += [Capsule(pts[i], pts[i + 1], 1.05, mat=k.c('#2a1a14')) for i in (2, 9)]
    return out


def lance(k, name, d):
    st = k.metal('steel')
    return [Capsule(P(-12), P(12), 2.2, 0.3, mat=st), Disc(P(-7), U, 3.2, 0.5, st), Capsule(P(-8), P(-13), 0.9, mat=k.c('#4a2a18'))]


def pick(k, name, d):
    st = k.metal('iron')
    out = [haft(k, -12, 8, 0.85)]
    out += [Capsule(P(7.5, -6), P(7.5, 0), 0.9, 0.35, mat=st), Capsule(P(7.5, 0), P(7.5, 6), 0.9, 0.35, mat=st),
            Box(P(7.5), (1.5, 1.5, 1.4), st, R=D45)]
    if 'mattock' in name or 'broad' in d:
        out[-3] = Ellipsoid(P(7.5, -4), (1.6, 3.6, 0.8), st, R=D45)
    return out


def whip(k, name, d):
    lm = k.c('#5a3a22' if 'hose' not in name else '#3a3a3a')
    pts = [(-10 + i * 2.6, 6 * math.sin(i * 0.9) - 2 + i * 0.6, 0) for i in range(9)]
    out = [Capsule(pts[i], pts[i + 1], 0.9 - i * 0.07, 0.83 - i * 0.07, mat=lm) for i in range(8)]
    if 'hose' not in name:
        out.append(Capsule((-12, -6, 0), (-9.5, -2.5, 0), 1.2, mat=k.c('#2a1a10')))
    return out


def weapon(k, name, d):
    if any(w in name for w in ('arrow', 'bolt', 'dart', 'shuriken', 'boomerang')) or name == 'ya':
        return missile(k, name, d), FLAT
    if 'bow' in name or 'bow' in d or 'sling' in name:
        return launcher(k, name, d), FLAT
    if 'axe' in name and 'pick' not in name:
        return axe(k, name, d), FLAT
    if 'pick' in name or 'mattock' in name:
        return pick(k, name, d), FLAT
    if 'lance' in name:
        return lance(k, name, d), FLAT
    if any(w in name for w in ('spear', 'javelin', 'trident')):
        return spear(k, name, d, length=10 if 'javelin' in name else 12), FLAT
    if any(w in name for w in ('partisan', 'ranseur', 'spetum', 'glaive', 'halberd', 'bardiche', 'voulge', 'fauchard',
                               'guisarme', 'lucern', 'corbin')):
        return polearm(k, name, d), FLAT
    if any(w in name for w in ('dagger', 'athame', 'scalpel', 'knife', 'stiletto', 'worm tooth', 'crysknife')):
        return dagger(k, name, d), FLAT
    if any(w in name for w in ('sword', 'saber', 'scimitar', 'katana', 'tsurugi', 'runesword', 'broadsword')):
        return sword(k, name, d), FLAT
    if any(w in name for w in ('mace', 'morning', 'hammer', 'flail', 'club', 'aklys', 'staff')):
        return blunt(k, name, d), FLAT
    if 'whip' in name or 'hose' in name:
        return whip(k, name, d), FLAT
    if 'unicorn horn' in name:
        return horn_unicorn(k), FLAT
    return sword(k, name, d), FLAT


def horn_unicorn(k):
    iv = k.c('#f2ead8', step=0.09)
    out = [Capsule(P(-11), P(11), 2.4, 0.3, mat=iv)]
    out += [Torus(P(t), 2.2 - (t + 11) * 0.09, 0.35, k.c('#c8bca0'), R=D45 @ rot_z(math.pi / 2) @ rot_x(0.5)) for t in (-8, -4, 0, 4)]
    return out


# ------------------------------------------------------------------ armour
DRAGON = {'gray': '#8a8a90', 'gold': '#e8b83a', 'silver': '#d8dce8', 'red': '#c02a2a', 'white': '#f0f0f0', 'orange': '#f07a1a',
          'black': '#2a2630', 'blue': '#2a5ad0', 'green': '#2a9a3a', 'yellow': '#f0d020', 'shimmering': '#a0e0f0'}


def torso(k, mat, trim=None, sleeves=True, studs=None, bands=None, pauld=None):
    out = [Ellipsoid((0, 0, 0), (6.4, 7.6, 3.6), mat, cut=((0, -1, 0), -6.0)),
           Ellipsoid((0, 6.2, 0), (2.6, 1.4, 2.2), k.c('#120c10'))]   # neck hole
    if sleeves:
        out += [Capsule((-6.5, 4, 0), (-9, -2, 0), 2.3, 1.8, mat=mat), Capsule((6.5, 4, 0), (9, -2, 0), 2.3, 1.8, mat=mat)]
    if pauld:
        out += [Sphere((-6.4, 4.6, 0), 3.0, pauld, cut=((0, 1, 0), 3.4)), Sphere((6.4, 4.6, 0), 3.0, pauld, cut=((0, 1, 0), 3.4))]
    if trim:
        out.append(Capsule((-5.6, -5.4, 2.0), (5.6, -5.4, 2.0), 0.9, mat=trim))
    if studs:
        out += [Sphere((x, y, 3.3 - abs(x) * 0.12), 0.55, studs) for x in (-3, 0, 3) for y in (-2, 1.5, 4.5) if not (x == 0 and y == 4.5)]
    if bands:
        out += [Ellipsoid((0, y, 0), (6.6, 0.6, 3.75), bands) for y in (-3.5, -1, 1.5)]
    return out


def helmet(k, name, d):
    st = k.metal('steel')
    if 'leather' in d or 'elven' in name:
        m = k.c('#7a4a2a')
        return [Sphere((0, 4, 0), 6, m, cut=((0, 1, 0), 3.4)), Torus((0, 3.6, 0), 6.0, 0.9, m)]
    if 'fedora' in name:
        m = k.c('#5a4a3a')
        return [Ellipsoid((0, 5, 0), (5, 5.2, 4.4), m, cut=((0, 1, 0), 3.4)), Torus((0, 3.4, 0), 7.2, 0.7, m, squash=(1, 0.8)),
                Torus((0, 4.4, 0), 5.0, 0.6, k.c('#1a1418'))]
    if 'conical' in d or 'cornuthaum' in name or 'dunce' in name:
        m = k.c('#2a3a9a' if 'cornuthaum' in name else '#e0d8c8')
        out = [Capsule((0, 2, 0), (0.6, 15, -0.5), 5.0, 0.3, mat=m), Torus((0, 2, 0), 6.0, 1.0, m)]
        if 'cornuthaum' in name:
            out += [Sphere((x, y, 4.0 - y * 0.2), 0.6, k.c('#ffe070', glow=True, detail=True)) for x, y in ((-1.5, 5), (1.8, 8), (0, 11))]
        return out
    if 'pot' in name:
        m = k.c('#5a5a60', metal=True)
        return [Sphere((0, 5, 0), 6, m, cut=((0, 1, 0), 2.6)), Torus((0, 3, 0), 6.0, 0.7, m), Capsule((6, 3.6, 0), (10, 4, 0), 0.8, mat=m),
                Sphere((-2, 8, 4.5), 1.4, k.c('#3a3a40'))]
    if 'iron skull cap' in d or 'orcish' in name:
        m = k.c('#6a6460', metal=True)
        return [Sphere((0, 3, 0), 6, m, cut=((0, 1, 0), 3.0)), Torus((0, 3.0, 0), 6.0, 0.8, m)] + \
            [Sphere((x, 3, 5.6), 0.5, k.metal('iron')) for x in (-3, 0, 3)]
    if 'hard hat' in d or 'dwarvish' in name:
        m = k.metal('iron')
        return [Sphere((0, 3, 0), 6.2, m, cut=((0, 1, 0), 3.0)), Torus((0, 3.0, 0), 7.2, 0.9, m, squash=(1, 0.9)),
                Capsule((0, 9.2, -4), (0, 9.2, 4), 0.9, mat=k.metal('bronze'))]
    if 'crystal' in d:
        st = k.c('#7ab0e0', metal=True, step=0.11)
    out = [Sphere((0, 4, 0), 6.2, st, cut=((0, 1, 0), 1.0)), Torus((0, 1.0, 0), 6.0, 0.9, st)]
    if 'plumed' in d:
        out += [Capsule((0, 10, -1), (0, 13, -6), 1.6, 1.0, mat=k.c('#c02a2a')), Capsule((0, 13, -6), (0, 9, -9), 1.0, 0.6, mat=k.c('#c02a2a'))]
    if 'etched' in d:
        out += [Torus((0, 5.4, 0), 5.7, 0.4, k.metal('gold'), R=rot_x(0.15))]
    if 'crested' in d:
        out += [Capsule((0, 10.4, 4), (0, 10.6, -5), 1.0, mat=k.metal('gold'))]
    if 'visored' in d:
        out += [Box((0, 3.6, 5.2), (4.6, 2.2, 0.7), k.metal('steel'), R=rot_x(-0.25)), Box((0, 3.8, 5.9), (3.4, 0.35, 0.3), k.c('#0a0a10'))]
    if 'helm of brilliance' in name or 'crystal' in d:
        out += [Sphere((0, 7.5, 5.2), 1.1, k.c('#ff60a0', glow=True, detail=True))]
    return out


def body_armor(k, name, d):
    if 'dragon scales' in name:     # a shield-shaped patch of hide: rows of overlapping scales, each edged darker
        col = DRAGON.get(name.split(' dragon')[0], '#8a8a90')
        dark = col == DRAGON['black']
        m, m2 = k.c(col, metal=True, step=0.1), k.c(shade(col, 1.12 if not dark else 1.5), metal=True, step=0.1)
        rim = k.c(shade(col, 0.55) if not dark else '#5a5068')
        out = []
        rows = ((6.4, (-3.4, 0, 3.4)), (3.4, (-5.1, -1.7, 1.7, 5.1)), (0.4, (-6.8, -3.4, 0, 3.4, 6.8)), (-2.6, (-5.1, -1.7, 1.7, 5.1)),
                (-5.6, (-3.4, 0, 3.4)), (-8.2, (-1.7, 1.7)))
        for r, (y, xs) in enumerate(rows):
            z = -r * 0.7                       # each row overlaps the one below it, like roof tiles
            for x in xs:
                out.append(Ellipsoid((x, y, z), (1.8, 2.1, 0.6), m if (r + int(x)) % 2 == 0 else m2))
                arc = [(x + math.sin(a) * 1.75, y - math.cos(a) * 2.0, z + 0.45) for a in np.linspace(-1.35, 1.35, 6)]
                out += chain(arc, 0.38, 0.38, rim)
        return out
    if 'dragon scale mail' in name:
        col = DRAGON.get(name.split(' dragon')[0], '#8a8a90')
        m = k.c(col, metal=True)
        return torso(k, m, pauld=k.c(col), trim=k.metal('gold'), bands=k.c(col))
    if 'shirt' in name:
        col = '#e0e8f0' if 't-shirt' in name.lower() else ['#e05a3a', '#2a9ad0', '#f0c030'][h(name, 3)]
        out = torso(k, k.c(col))
        if 'hawaiian' in name.lower():
            out += [Sphere((x, y, 3.2), 0.9, k.c('#f0f060', detail=True)) for x, y in ((-3, 2), (2.5, -1), (0, -4), (3, 3.5), (-3.5, -3))]
        return out
    if 'mummy' in name:
        m = k.c('#d8ccaa')
        return torso(k, m, bands=k.c('#a89a78'))
    if 'jacket' in name:
        return torso(k, k.c('#3a2a22'), trim=k.metal('steel'))
    if 'leather' in name:
        return torso(k, k.c('#7a4a2a'), sleeves=False, pauld=k.c('#6a3a1e'), studs=k.metal('steel') if 'studded' in name else None)
    if 'crystal' in name:
        return torso(k, k.c('#7ab0e0', metal=True, step=0.11), sleeves=False, pauld=k.c('#a8d0f0', metal=True, step=0.1))
    if 'mithril' in name:
        return torso(k, k.c('#a8b8d8', metal=True, step=0.11), sleeves=True)
    if 'bronze' in name:
        return torso(k, k.metal('bronze'), sleeves=False, pauld=k.metal('bronze'), trim=k.metal('gold'))
    if 'plate' in name:
        return torso(k, k.metal('steel'), sleeves=False, pauld=k.metal('steel'), trim=k.metal('gold'))
    if 'splint' in name or 'banded' in name:
        return torso(k, k.metal('iron'), sleeves=False, pauld=k.metal('steel'), bands=k.metal('steel'))
    if 'scale' in name:
        return torso(k, k.c('#8a8a70', metal=True), bands=k.c('#6a6a58', metal=True))
    if 'orcish' in name or 'crude' in d:
        return torso(k, k.c('#5a5650', metal=True), sleeves=True, trim=k.c('#5a3a22'))
    return torso(k, k.c('#7a8088', metal=True), sleeves=True)   # chain, ring


CLOAK = {'faded pall': '#6a7a6a', 'coarse mantelet': '#6a4a2a', 'hooded cloak': '#3a3a4a', 'slippery cloak': '#2a4a3a',
         'robe': '#a02a2a', 'apron': '#e0d8c8', 'leather cloak': '#6a4428', 'tattered cape': '#4a3a5a', 'opera cloak': '#1a1418',
         'ornamental cope': '#7a2a8a', 'piece of cloth': '#5a6a9a'}


def cloak(k, name, d):
    col = CLOAK.get(d or name, CLOAK.get(name, '#3a4a6a'))
    m = k.c(col, metal='slippery' in d)
    dark = k.c(col, step=0.1)
    out = []
    if 'hood' in d or 'robe' in name or 'pall' in d:
        out.append(Ellipsoid((0, 9.6, -1.6), (4.2, 3.8, 2.6), dark))
    # shoulders, then folds fanning out to a ragged hem
    out.append(Capsule((-5.2, 7.2, 0), (5.2, 7.2, 0), 2.2, mat=m))
    for i, x in enumerate((-4.4, -2.2, 0, 2.2, 4.4)):
        out.append(Capsule((x * 1.0, 7, 0), (x * 1.9, -9 + (i % 2) * 1.2, 0.4 * (i % 2)), 2.0, 2.4, mat=m if i % 2 == 0 else dark))
    out.append(Box((0, -1, 2.6), (0.35, 8, 0.3), k.c('#0c080c')))       # the opening down the front
    if 'opera' in d:
        out.append(Capsule((-0.6, 6, 1.5), (-1.6, -8, 2.4), 1.0, mat=k.c('#a01a2a')))
    if 'apron' in d:
        out = [Box((0, -1, 0), (5.4, 8, 0.7), m, round_=1.4), Capsule((-4, 7, 0), (4, 7, 0), 0.6, mat=k.c('#8a6a4a')),
               Box((0, -2, 0.8), (3.2, 2.4, 0.3), k.c('#c8bca8'), round_=0.5)]
        return out
    out.append(Sphere((0, 7.4, 2.2), 1.2, k.metal('gold')))
    return out


SHIELD = {'small shield': ('#8a5a2a', 'iron'), 'elven shield': ('#2a7a5a', 'silver'), 'Uruk-hai shield': ('#2a2420', 'iron'),
          'orcish shield': ('#7a1a14', 'iron'), 'large shield': ('#5a5a64', 'steel'), 'dwarvish roundshield': ('#6a6a72', 'bronze'),
          'shield of reflection': ('#b8c4dc', 'silver')}


def shield(k, name, d):
    face, rim = SHIELD.get(name, ('#6a4a2a', 'iron'))
    fm = k.c(face, metal='reflection' in name or 'large' in name or 'dwarvish' in name)
    out = []
    if 'large' in name:
        out += [Box((0, 0, 0), (7.6, 10, 1.0), fm, round_=1.5), Box((0, 0, 0.4), (8.4, 10.8, 0.7), k.metal(rim), round_=1.5),
                Capsule((0, -8, 1.2), (0, 8, 1.2), 0.8, mat=k.metal('gold')), Capsule((-6, 2, 1.2), (6, 2, 1.2), 0.8, mat=k.metal('gold'))]
        return out
    out += [Disc((0, 0, 0), (0, 0, 1), 9.6, 1.1, k.metal(rim)), Disc((0, 0, 0.5), (0, 0, 1), 8.6, 0.9, fm),
            Sphere((0, 0, 1.0), 2.2, k.metal(rim))]
    if 'Uruk' in name:
        out += [Ellipsoid((0, 3.5, 1.3), (2.0, 2.6, 0.3), k.c('#e8e8e0'))]
    if 'orcish' in name:
        out += [Ellipsoid((0, 3.5, 1.3), (2.6, 1.6, 0.3), k.c('#f0d020', glow=True)), Sphere((0, 3.5, 1.4), 0.8, k.c('#1a0a0a', detail=True))]
    if 'elven' in name:
        out += [Capsule((0, -7, 1.4), (0, 7, 1.4), 0.6, mat=k.metal('silver')), Capsule((-7, 0, 1.4), (7, 0, 1.4), 0.6, mat=k.metal('silver'))]
    if 'small' in name:
        out += [Capsule((-7, y, 1.2), (7, y, 1.2), 0.35, mat=k.c('#5a3a1a')) for y in (-4, 0, 4)]
    return out


GLOVES = {'old gloves': '#7a5a3a', 'padded gloves': '#c8b088', 'riding gloves': '#5a3a22', 'fencing gloves': '#e8e0d0'}


def gloves(k, name, d):
    m = k.c(GLOVES.get(d, '#6a4428'))
    out = []
    for sx, ox in ((-1, -5), (1, 5)):
        out += [Box((ox, -2, 0), (2.8, 3.2, 1.3), m, round_=1.0), Box((ox, -6, 0), (3.0, 1.6, 1.6), k.c('#4a2a14'), round_=0.8)]
        out += [Capsule((ox + fx, 1, 0), (ox + fx * 1.2, 5.5 - abs(fx) * 0.6, 0), 0.75, mat=m) for fx in (-2, -0.7, 0.7, 2)]
        out.append(Capsule((ox - sx * 2.8, -1, 0), (ox - sx * 5, 2.5, 0), 0.8, mat=m))
    return out


BOOTS = {'combat boots': '#3a3a30', 'jungle boots': '#4a5a2a', 'hiking boots': '#7a4a22', 'mud boots': '#4a3a2a',
         'buckled boots': '#5a3a22', 'riding boots': '#1a1418', 'snow boots': '#d8d8e0', 'walking shoes': '#6a4428',
         'jackboots': '#22181a', 'hard shoes': '#7a7e88'}


def boots(k, name, d):
    col = BOOTS.get(d, BOOTS.get(name, '#5a3a22'))
    m = k.c(col, metal='hard' in d)
    tall = 7 if any(w in d for w in ('riding', 'jackboots', 'jungle', 'snow', 'buckled')) else (2.5 if 'shoes' in d else 5)
    out = []
    for ox, oz in ((-3.6, -2), (3.6, 1)):
        out += [Capsule((ox, -3, oz), (ox, -3 + tall, oz), 2.2, 2.4, mat=m), Ellipsoid((ox + 0.6, -4.6, oz + 2.2), (2.3, 1.6, 3.6), m),
                Box((ox + 0.6, -6.0, oz + 2.0), (2.4, 0.5, 3.8), k.c('#1a1210'), round_=0.4)]
        if 'snow' in d:
            out.append(Torus((ox, -3 + tall, oz), 2.4, 1.0, k.c('#f4f4f8')))
        if 'buckled' in d:
            out.append(Box((ox, 0, oz + 2.4), (1.0, 0.8, 0.3), k.metal('gold')))
    return out


def armor(k, name, d):
    n = name.lower()
    if any(w in n for w in ('helm', 'hat', 'cap', 'fedora', 'cornuthaum', 'dented pot', 'kabuto')) or 'helmet' in d:
        return helmet(k, n, d), None
    if 'shield' in n:
        return shield(k, name, d), FLAT
    if 'glove' in n or 'gauntlet' in n:
        return gloves(k, n, d), FLAT
    if 'boot' in n or 'shoes' in n or 'boot' in d:
        return boots(k, n, d), None
    if any(w in n for w in ('cloak', 'robe', 'smock', 'mantle', 'cape', 'cope', 'apron')) or 'cloak' in d:
        return cloak(k, n, d), FLAT
    return body_armor(k, name, d), FLAT


# ------------------------------------------------------------------ jewellery
def ring(k, name, d):
    n = (d or name).lower()
    band = k.metal(n) if n in METAL else k.c(WOOD['wooden']) if n == 'wooden' else k.metal('gold')
    out = [Torus((0, 3, 0), 5.2, 1.3, band, R=rot_x(0.35))]
    if n == 'twisted':     # two iron strands wound round each other, one light, one dark
        Rt = rot_x(0.35)
        out = []
        for ph, mat in ((0, k.c('#b4bac8', metal=True, step=0.1)), (math.pi, k.c('#6a6e7a', metal=True, step=0.1))):
            pts = []
            for th in np.linspace(0, 2 * math.pi, 41):
                w = 5 * th + ph
                rr = 5.2 + 0.75 * math.cos(w)
                pts.append(Rt @ np.array([rr * math.cos(th), 0.75 * math.sin(w), rr * math.sin(th)]) + np.array([0, 3, 0]))
            out += chain(pts, 0.85, 0.85, mat)
    if n == 'wire':
        out = [Torus((0, 3, 0), 5.2, 0.6, k.metal('copper'), R=rot_x(0.35))]
    gem = None
    if n in STONE and n not in ('glass', 'crystal'):
        gem = k.c(STONE[n], metal=True, glow=n in ('opal', 'moonstone', 'diamond', 'sapphire', 'ruby', 'emerald'), hue=0.25)   # keep blue blue
    if n == 'engagement':
        gem = k.c(STONE['diamond'], metal=True, glow=True)
    if n == 'shiny':
        out = [Torus((0, 3, 0), 5.2, 1.3, k.c('#f4f4ff', metal=True, glow=True), R=rot_x(0.35))]
    if gem:
        out += [Box((0, 8.4, 0), (1.8, 1.2, 1.8), band, round_=0.5), Octahedron((0, 10.4, 0), (2.6, 2.4, 2.6), gem)]
    return out, None


AMU = {'circular', 'spherical', 'oval', 'triangular', 'pyramidal', 'square', 'concave', 'hexagonal', 'octagonal', 'perforated', 'cubical'}


def amulet(k, name, d):
    """A short chain loop and a big pendant whose outline follows the appearance word."""
    ch = k.metal('gold')
    out = [Torus((0, 4.6, -0.5), 4.4, 0.6, ch, R=rot_x(1.2), squash=(1, 1.4))]
    pm = k.c('#e8b83a', metal=True)
    dk = k.c('#b07e22', metal=True)
    gm = k.c(['#2a8ad0', '#c02a4a', '#2ac07a', '#a02ad0'][h(d, 4)], metal=True, glow=True, hue=0.25)
    cy = -4.6
    c = (0, cy, 1)
    g = Sphere((0, cy, 2.2), 1.7, gm)
    hole = k.c('#140c10', step=0.02)
    if 'Yendor' in d:
        return out + [Ellipsoid(c, (4.6, 5.6, 1.6), pm), Sphere((0, cy, 2.2), 2.0, k.c('#ff2a3a', glow=True, metal=True))], FLAT
    shape = {
        'circular': [Disc(c, (0, 0, 1), 5.4, 0.9, pm), Torus((0, cy, 1.8), 4.3, 0.4, dk, R=rot_x(math.pi / 2)), g],
        'spherical': [Sphere((0, cy - 0.4, 1), 4.6, k.c(['#2a8ad0', '#c02a4a', '#2ac07a', '#a02ad0'][h(d, 4)], metal=True, hue=0.25)),
                      Torus((0, cy + 3.8, 1), 1.6, 0.5, pm)],
        'oval': [Ellipsoid(c, (3.8, 6.0, 1.2), pm), Ellipsoid((0, cy, 1.7), (2.0, 3.6, 0.9), gm)],
        'triangular': [Prism(c, 3, 3.4, 0.9, pm, phase=math.pi / 2), Prism((0, cy, 1.4), 3, 1.8, 0.7, gm, phase=math.pi / 2)],
        'pyramidal': [Octahedron((0, cy - 5.0, 1), (6.4, 7.0, 6.4), pm, R=rot_y(math.pi / 4), cut=((0, 1, 0), cy - 5.0)),
                      Box((0, cy - 5.3, 1), (4.8, 0.4, 4.8), dk, R=rot_y(math.pi / 4), round_=0.2)],
        'square': [Box(c, (4.4, 4.4, 0.9), pm, round_=0.3), Box((0, cy, 1.7), (2.3, 2.3, 0.5), gm, round_=0.3)],
        'concave': [Disc(c, (0, 0, 1), 5.4, 0.9, pm), Disc((0, cy, 1.25), (0, 0, 1), 4.0, 0.7, dk),
                    Sphere((1.4, cy - 1.6, 0.4), 2.6, k.c('#f8e0a0', metal=True), cut=((0, 0, 1), 1.6))],
        'hexagonal': [Prism(c, 6, 4.8, 0.9, pm, phase=math.pi / 6), Prism((0, cy, 1.3), 6, 3.0, 0.6, dk, phase=math.pi / 6), g],
        'octagonal': [Prism(c, 8, 5.0, 0.9, pm, phase=math.pi / 8), Prism((0, cy, 1.3), 8, 3.2, 0.6, dk, phase=math.pi / 8), g],
        'perforated': [Disc(c, (0, 0, 1), 5.4, 0.9, pm)] + [Sphere((x * 2.6, cy + y * 2.6, 1.6), 0.85, hole)
                                                            for x, y in ((-1, -1), (-1, 1), (1, -1), (1, 1), (0, 0))],
        'cubical': [Box((0, cy - 0.4, 1), (3.4, 3.4, 3.4), pm, R=rot_y(0.65) @ rot_x(0.45), round_=0.25)],
    }.get(d, [Disc(c, (0, 0, 1), 5, 1, pm), g])
    return out + shape, FLAT


# ------------------------------------------------------------------ potions, scrolls, books, wands
def potion(k, name, d):
    col = COL.get(d, '#8a5ad0')
    liquid = k.c(col, metal=True, step=0.15)
    glass = k.c('#cfe6ff', metal=True, glow=True)
    cork = k.c('#9a6a3a')
    shape = h(d or name, 3)
    if d == 'clear':
        liquid = k.c('#a8c8e8', metal=True, step=0.15)
    if shape == 0:      # round flask
        out = [Sphere((0, 5, 0), 5.6, liquid), Capsule((0, 9, 0), (0, 13, 0), 1.8, mat=glass), Torus((0, 13, 0), 1.9, 0.6, glass),
               Capsule((0, 13.5, 0), (0, 15.5, 0), 1.5, mat=cork)]
    elif shape == 1:    # tall vial
        out = [Capsule((0, 2, 0), (0, 10, 0), 3.4, mat=liquid), Box((0, 0.6, 0), (3.4, 1.4, 3.4), liquid, round_=1.4),
               Capsule((0, 12, 0), (0, 14, 0), 1.6, mat=glass), Capsule((0, 14.5, 0), (0, 16.5, 0), 1.6, mat=cork)]
    else:               # conical flask
        out = [Capsule((0, 2.5, 0), (0, 9, 0), 5.6, 1.6, mat=liquid, cut=((0, 1, 0), -0.2)), Capsule((0, 9, 0), (0, 13, 0), 1.6, mat=glass),
               Capsule((0, 13.5, 0), (0, 15.5, 0), 1.6, mat=cork)]
    if d in ('swirly',):
        out.insert(0, Sphere((1.5, 5.5, 2.2), 3.0, k.c('#e0a0f0', metal=True)))
    if d in ('bubbly', 'effervescent', 'fizzy'):
        out = [Sphere((x, y, 3.6), r, k.c('#ffffff', glow=True, detail=True)) for x, y, r in ((-1.6, 4, 0.7), (1.2, 6.5, 0.55), (0.2, 3, 0.45))] + out
    if d == 'smoky':
        out += [Sphere((1.5, 18, 0), 1.6, k.c('#8a8a90')), Sphere((-0.5, 20, 0), 1.2, k.c('#a0a0a8'))]
    if d == 'milky':
        out = [Ellipsoid((-2, 9, 3.4), (0.8, 2.2, 0.5), k.c('#ffffff', glow=True))] + out
    return out, None


SEAL = ['#c02a2a', '#2a4ac0', '#2a8a3a', '#7a2aa0', '#c08a2a', '#2a2a2a', '#c04a8a', '#2aa0a0']


def scroll(k, name, d):
    pm = k.c('#e8d8a8', step=0.07)
    rod = k.c('#c8b080', step=0.08)
    if d == 'stamped':     # mail
        return [Box((0, 0, 0), (9, 6, 0.6), k.c('#f0ead8'), round_=0.4), Capsule((-9, 6, 0.8), (0, -1, 0.8), 0.3, mat=k.c('#b0a888')),
                Capsule((9, 6, 0.8), (0, -1, 0.8), 0.3, mat=k.c('#b0a888')), Box((6, 3, 0.9), (1.8, 2, 0.2), k.c('#c02a2a'))], FLAT
    out = [Box((0, -0.5, 0), (7.4, 8.5, 0.35), pm, round_=0.3),
           Capsule((-8.5, 8.5, 0.8), (8.5, 8.5, 0.8), 1.9, mat=rod), Capsule((-8.5, -9.4, 0.8), (8.5, -9.4, 0.8), 1.9, mat=rod)]
    out += [Capsule((-5, y, 0.5), (5 - (y % 3), y, 0.5), 0.3, mat=k.c('#8a6a4a')) for y in (4.5, 2.0, -0.5, -3)]
    if d and d != 'unlabeled':
        out += [Disc((3.5, -6, 0.7), (0, 0, 1), 2.0, 0.6, k.c(SEAL[h(d, len(SEAL))])),
                Capsule((3.5, -7, 0.6), (2.5, -11, 0.6), 0.5, mat=k.c(SEAL[h(d, len(SEAL))]))]
    return out, FLAT


def spellbook(k, name, d):
    n = (d or name).lower()
    metal = n in ('bronze', 'copper', 'silver', 'gold')
    col = METAL[n] if metal else COL.get(n, '#6a2a2a')
    cover = k.c(col, metal=metal or n == 'shining', glow=n == 'glittering')
    th = 1.4 if n in ('thin', 'paperback') else 3.6 if n == 'thick' else 2.4
    out = [Box((0, 0, 0), (7.4, 9.6, th), cover, round_=0.6),
           Box((0.6, 0, 0), (6.9, 9.0, th - 0.5), k.c('#efe6cc', step=0.06), round_=0.2, cut=((1, 0, 0), -6.4)),
           Box((-7.0, 0, 0), (0.9, 9.8, th + 0.25), cover, round_=0.6)]
    if n not in ('paperback', 'plain', 'papyrus'):
        out += [Disc((0.5, 1, th + 0.1), (0, 0, 1), 2.4, 0.3, k.metal('gold')),
                Capsule((-6.6, 7.5, th), (-6.6, 7.5, -th), 0.5, mat=k.metal('gold')), Capsule((-6.6, -7.5, th), (-6.6, -7.5, -th), 0.5, mat=k.metal('gold'))]
    if n in ('plaid', 'checkered'):
        stripe = k.c('#1a2a6a' if n == 'plaid' else '#1a1a1a')
        out += [Box((x, 0, th - 0.05), (0.7, 9.4, 0.15), stripe) for x in (-3, 1, 5)] + [Box((0.5, y, th - 0.05), (6.6, 0.7, 0.15), stripe) for y in (-5, 0, 5)]
    if n == 'novel' or 'paperback' in n:
        out += [Box((0.5, 3, th), (4.5, 1.2, 0.15), k.c('#f0e070'))]
    if n == 'papyrus':
        out = scroll(k, name, 'unlabeled')[0]
    return out, rot_y(-0.35) @ rot_x(PITCH - 0.35)


WAND_SHAPES = {'hexagonal', 'short', 'runed', 'long', 'curved', 'forked', 'spiked', 'jeweled'}
# wands are thin, so each appearance gets a flat, fairly light tone that still reads at 18px
WAND_LOOK = {'oak': '#a87038', 'ebony': '#3e2a22', 'balsa': '#ecd8a0', 'maple': '#cc9858', 'pine': '#e0b070', 'redwood': '#a83a24',
             'marble': '#ece8e2', 'bone': '#ece2c8', 'glass': '#cfe6ff', 'crystal': '#e8f4ff', 'platinum': '#eef0f8', 'iridium': '#b0b8dc',
             'uranium': '#8ac050', 'iron': '#8a8e98', 'steel': '#aab2c4', 'tin': '#c4c8cc', 'zinc': '#b4bcc4', 'aluminum': '#d4dce4',
             # shape-only appearances: their material (iron or wood) in NetHack's object table
             'hexagonal': '#8a8e98', 'short': '#8a8e98', 'runed': '#7a5a3a', 'long': '#8a8e98', 'curved': '#8a8e98', 'forked': '#8a5a2a',
             'spiked': '#8a8e98'}
WAND_WOOD = {'oak', 'ebony', 'balsa', 'maple', 'pine', 'redwood', 'runed', 'forked', 'bone'}


def wand(k, name, d):
    n = (d or name).lower()
    if n in WAND_LOOK:
        metal = n not in WAND_WOOD and n != 'marble'
        m = k.c(WAND_LOOK[n], metal=metal, step=0.075, glow=n in ('glass', 'crystal'))
    elif n in METAL:
        m = k.c(METAL[n], metal=True, step=0.075)
    else:
        m = k.look(n, '#9a9aa4')
    tip = k.c('#f0f0ff', glow=True, detail=True)
    length = 9 if n == 'short' else 13 if n == 'long' else 11
    out = []
    if n == 'curved':
        out += blade(k, -length, length, 1.2, 1.0, m, curve=2.6)
    elif n == 'hexagonal':
        out += [Box(P(0), (length, 1.2, 1.2), m, R=D45 @ rot_x(math.pi / 4), round_=0.15)]
    else:
        out += [Capsule(P(-length), P(length - 3 if n == 'forked' else length), 1.25, 1.1, mat=m)]
    if n == 'marble':
        out += [Capsule(P(t, -0.6, 1.0), P(t + 2.5, 0.5, 1.0), 0.22, mat=k.c('#8a8a98', detail=True)) for t in (-6, 0, 5)]
    out += [Capsule(P(-length), P(-length + 4), 1.45, mat=k.c('#2a1a14' if n in WAND_WOOD or n not in METAL else '#6a5a4a'))]
    if n == 'forked':
        out += [Capsule(P(length - 3), P(length + 2.5, 2.2), 0.8, 0.55, mat=m), Capsule(P(length - 3), P(length + 2.5, -2.2), 0.8, 0.55, mat=m)]
    elif n == 'spiked':
        out += [Capsule(P(t, 0), P(t + 1.2, o), 0.75, 0.15, mat=k.c('#d0d6e2', metal=True, step=0.08)) for t, o in ((-5, 3), (-1, -3), (3, 3), (7, -3))]
    elif n == 'jeweled':
        out = [Capsule(P(-length), P(length), 1.0, mat=k.metal('gold'))] + [Octahedron(P(length + 1.4), (1.8, 1.8, 1.8), k.c('#ff3a6a', metal=True, glow=True))]
    elif n == 'runed':
        out += [Sphere(P(t, 0, 0.8), 0.45, k.c('#7ad0ff', glow=True, detail=True)) for t in (-4, -1, 2, 5)]
    if n == 'forked':
        out += [Sphere(P(length + 2.9, o), 0.9, tip) for o in (2.4, -2.4)]
    elif n != 'jeweled':
        out.append(Sphere(P(length + 0.6), 1.1, tip))
    return out, FLAT


# ------------------------------------------------------------------ gems, coins, rocks, heavy things
def gem(k, name, d):
    n = (d or name).lower()
    if n == 'gray' or 'luckstone' in name or 'touchstone' in name or 'flint' in name or 'loadstone' in name:
        g = k.c('#6a6a72' if 'flint' not in name else '#3a3a42')
        return [Ellipsoid((0, 3.4, 0), (5, 3.6, 4.4), g), Sphere((1.5, 5, 2), 1.4, g)], None
    if name == 'rock':
        g = k.c('#7a7470')
        return [Ellipsoid((-2, 3, 0), (4, 3, 3.4), g), Ellipsoid((3, 2.4, 1.5), (3, 2.4, 2.6), g), Sphere((0.5, 2, 4), 1.6, g)], None
    col = COL.get(n, '#e0e0f0')
    if n == 'white':
        col = '#eef4ff'
    g = k.c(col, metal=True, glow=n in ('white', 'violet', 'red', 'blue', 'green'), hue=0.25)
    return [Octahedron((0, 6, 0), (5, 6.4, 5), g, R=rot_y(0.4)), Box((0, 6, 0), (3.6, 1.0, 3.6), g, R=rot_y(1.2), round_=0.2)], None


def coins(k, name, d):
    g = k.c(METAL['gold'], metal=True, step=0.12)
    edge = k.c('#9a6a1a', metal=True, step=0.1)
    out = []
    for (x, z, n) in ((-4.2, -1.5, 4), (3.6, -2.4, 6), (0.2, 3.2, 2)):
        for j in range(n):
            out += [Disc((x + (j % 2) * 0.3, 0.9 + j * 1.45, z), (0, 1, 0), 3.3, 0.5, g),
                    Torus((x + (j % 2) * 0.3, 0.9 + j * 1.45, z), 3.25, 0.32, edge)]
    out.append(Disc((5.6, 3.6, 4.2), (0.15, 0.25, 1), 3.3, 0.5, g))     # one coin propped up, face on
    out.append(Torus((5.6, 3.6, 4.2), 2.2, 0.3, edge, R=rot_x(math.pi / 2)))
    return out, None


def heavy(k, name, d):
    if 'boulder' in name or 'large rock' in name or 'large rock' in d:
        g = k.c('#7a7470')
        return [Sphere((0, 8, 0), 8, g), Sphere((4, 9, 3), 4, g), Sphere((-3, 12, 1), 4, g)], None
    if 'statue' in name:
        g = k.c('#9a9690')
        return [Box((0, 1, 0), (5, 1, 4), g), Capsule((0, 2, 0), (0, 10, 0), 2.6, 1.8, mat=g), Sphere((0, 12.5, 0), 2.2, g)], None
    if 'ball' in name:
        im = k.c('#3a3a42', metal=True)
        return [Sphere((0, 6, 0), 6, im), Torus((5, 10.5, 0), 1.6, 0.6, im, R=rot_z(0.8))], None
    if 'chain' in name or 'chain' in d:     # three fat links in a slight sag, alternately face-on and turned
        im, im2 = k.c('#8a8e98', metal=True, step=0.11), k.c('#6a6e78', metal=True, step=0.11)
        out = []
        for i, t in enumerate((-5.5, 0, 5.5)):
            R = D45 @ rot_x(math.pi / 2 + (0 if i % 2 == 0 else 1.15))
            out.append(Torus(P(t, 0.8 * (1 - abs(t) / 5.5)), 2.2, 1.0, im if i % 2 == 0 else im2, R=R, squash=(1.45, 1)))
        return out, FLAT
    if 'venom' in name or 'venom' in d:     # a splash: puddle, a crown of spikes, flying drops
        col = '#a0e040' if 'acid' in name else '#e0e0a0' if 'blinding' in name else '#c8e050'
        v = k.c(col, glow=True)
        out = [Ellipsoid((0, 0.8, 0), (5.6, 0.9, 4.4), v)]
        for j, a in enumerate(np.linspace(0, 2 * math.pi, 8)[:-1]):
            c, s_ = math.cos(a), math.sin(a)
            out.append(Capsule((c * 3.0, 1.0, s_ * 2.4), (c * (5.0 + j % 2), 3.6 + (j % 3), s_ * 4.0), 0.9, 0.35, mat=v))
        out += [Sphere(p, r, v) for p, r in (((-2.6, 8.4, 1), 0.9), ((2.4, 9.6, 0), 0.8), ((0.2, 7.0, 2), 1.1), ((4.6, 6.4, 1), 0.7))]
        return out, None
    return [Box((0, 4, 0), (4, 4, 4), k.c('#8a8a90'))], None


# ------------------------------------------------------------------ food
def food(k, name, d):
    n = name.lower()
    if 'egg' == n:
        return [Ellipsoid((0, 5, 0), (3.8, 5, 3.8), k.c('#f0ead8', step=0.08))], None
    if 'apple' == n:
        return [Sphere((0, 5.2, 0), 5.2, k.c('#c8202a')), Capsule((0, 9.5, 0), (0.8, 12, 0), 0.5, mat=k.c('#4a2a14')),
                Ellipsoid((2.4, 11, 0), (2.0, 0.8, 1.0), k.c('#3a9a2a'), R=rot_z(0.4))], None
    if 'orange' == n:
        return [Sphere((0, 5.2, 0), 5.2, k.c('#f08a1a')), Sphere((0, 10.2, 0.6), 0.8, k.c('#4a6a2a'))], None
    if 'pear' == n:
        m = k.c('#b8c83a')
        return [Sphere((0, 4.4, 0), 4.6, m), Sphere((0, 8.8, 0), 3.0, m, blend=2), Capsule((0, 11, 0), (0.6, 13, 0), 0.45, mat=k.c('#4a2a14'))], None
    if 'melon' == n:
        return [Ellipsoid((0, 5.4, 0), (8, 5.4, 6), k.c('#4a8a2a'))] + [Torus((0, 5.4, 0), 6.1, 0.35, k.c('#2a5a1a'), R=rot_y(a) @ rot_x(math.pi / 2), squash=(1.3, 1)) for a in (0, 1.0, 2.1)], None
    if 'banana' == n:
        return blade(k, -8, 8, 1.8, 1.3, k.c('#f0d030'), curve=-3.5) + [Capsule(P(8, 0), P(9.6, 0), 0.6, mat=k.c('#5a3a1a'))], FLAT
    if 'carrot' == n:
        return [Capsule(P(-9), P(5), 0.4, 2.4, mat=k.c('#f07a1a'))] + [Capsule(P(5), P(10, o), 0.6, 0.3, mat=k.c('#3a9a2a')) for o in (-2, 0, 2)], FLAT
    if 'garlic' in n:
        w = k.c('#ece4d8')
        return [Sphere((0, 4, 0), 4.5, w), Sphere((2, 4.2, 2), 2.6, w), Sphere((-2, 4.2, 2), 2.6, w), Capsule((0, 8, 0), (0.4, 11, 0), 0.8, 0.3, mat=w)], None
    if 'wolfsbane' in n:
        st = k.c('#3a7a2a')
        return [Capsule((0, 0, 0), (0, 11, 0), 0.5, mat=st)] + [Sphere((x, y, 0.6), 1.5, k.c('#6a3ad0')) for x, y in ((-1.5, 9), (1.5, 10.5), (-1, 12.5), (1, 7.5))], FLAT
    if 'kelp' in n:
        st = k.c('#3a6a2a')
        return [Capsule((math.sin(y * 0.6) * 2, y - 8, 0), (math.sin((y + 3) * 0.6) * 2, y - 5, 0), 1.4, mat=st) for y in range(0, 16, 3)], FLAT
    if 'eucalyptus' in n:
        return [Ellipsoid((0, 0, 0), (3.6, 9, 0.6), k.c('#5a9a6a'), R=rot_z(-0.5)), Capsule((4, -7.5, 0.5), (-4, 7.5, 0.5), 0.3, mat=k.c('#3a6a4a'))], FLAT
    if 'meatball' in n:
        r = 7 if 'enormous' in n else 4.4
        return [Sphere((0, r, 0), r, k.c('#7a3a1a')), Sphere((r * 0.3, r * 1.3, r * 0.6), r * 0.3, k.c('#8a4a2a'))], None
    if 'meat stick' in n:
        return [Capsule(P(-9), P(9), 1.8, mat=k.c('#8a3a2a'))], FLAT
    if 'meat ring' in n:
        return [Torus((0, 2, 0), 4.6, 1.8, k.c('#8a3a2a'))], None
    if 'glob' in n:
        col = {'gray': '#8a8a90', 'brown': '#6a4a2a', 'green': '#5ac03a', 'black': '#2a2430'}.get(n.split(' ')[2], '#8a8a90')
        g = k.c(col, metal=True)
        return [Ellipsoid((0, 2.6, 0), (6, 2.8, 5), g), Sphere((1.5, 4.4, 1), 2.4, g, blend=1.5)], None
    if 'slime mold' in n:
        return [Ellipsoid((0, 3, 0), (5, 3.2, 4.4), k.c('#8ac03a')), Sphere((-2, 5, 2), 1.4, k.c('#aae05a'))], None
    if 'jelly' in n:
        return [Ellipsoid((0, 3, 0), (5, 3.2, 4.4), k.c('#f0c030', metal=True, glow=True))], None
    if 'cream pie' in n:
        return [Disc((0, 1.5, 0), (0, 1, 0), 7, 1.5, k.c('#c08a4a')), Ellipsoid((0, 3.4, 0), (5.8, 2.0, 5.8), k.c('#f8f4ec', step=0.06)),
                Sphere((0, 5.4, 0), 1.2, k.c('#c02a2a'))], None
    if 'candy' in n:
        return [Box((0, 0, 0), (9, 3.2, 1.6), k.c('#c02a2a'), R=rot_z(0.3), round_=0.8), Box((-1, 0.3, 1.0), (4, 2.6, 1.2), k.c('#f0f0e0'), R=rot_z(0.3), round_=0.4)], FLAT
    if 'fortune' in n:
        return [Torus((0, 3, 0), 3.2, 2.0, k.c('#d8a050'), R=rot_z(0.4), squash=(1.4, 0.8), cut=((0, 1, 0), 2.0))], None
    if 'pancake' in n:      # two wide, thin discs: golden-brown top, pale edge, a pat of butter
        top, edge = k.c('#c88a3a', step=0.09), k.c('#ecd09a', step=0.08)
        out = []
        for i, (x, z) in enumerate(((0, 0), (0.6, -0.4))):
            y = 0.6 + i * 1.15
            out += [Disc((x, y, z), (0, 1, 0), 7.2 - i * 0.3, 0.5, edge), Disc((x, y + 0.42, z), (0, 1, 0), 6.7 - i * 0.3, 0.14, top)]
        return out + [Box((0.9, 2.65, -0.2), (1.5, 0.4, 1.5), k.c('#f8e070'), R=rot_y(0.5), round_=0.25)], None
    if 'lembas' in n:
        return [Box((0, 2, 0), (5.5, 1.4, 4.0), k.c('#f0e0b0'), round_=0.8), Ellipsoid((0, 2.6, 0), (6.6, 1.0, 4.8), k.c('#5a9a4a'), cut=((1, 0, 0), 0.5))], None
    if 'tin' == n:
        t = k.c('#b0b4b8', metal=True)
        return [Disc((0, 3.2, 0), (0, 1, 0), 4.4, 3.2, t), Torus((0, 6.4, 0), 4.2, 0.4, t), Box((0, 3.2, 4.3), (3, 2, 0.3), k.c('#c02a2a'), round_=0.2)], None
    if 'tripe' in n:
        m = k.c('#d89a8a')
        return [Ellipsoid((0, 2.6, 0), (6, 2.6, 4.6), m), Torus((0, 4, 0), 3, 1.2, m)], None
    if 'corpse' in n:
        return [Capsule((-6, 2, 0), (6, 2, 0), 2.6, 2.0, mat=k.c('#8a3a2a')), Capsule((-7, 2, 0), (-11, 3, 0), 1.0, mat=k.c('#e6dcc4'))], None
    # ration boxes and packages
    col = {'food ration': '#a88a5a', 'cram ration': '#c8a870', 'K-ration': '#5a6a3a', 'C-ration': '#4a5a3a'}.get(name, '#a88a5a')
    out = [Box((0, 3.2, 0), (6.6, 3.2, 4.6), k.c(col), round_=0.8),
           Box((0, 3.2, 0), (0.5, 3.35, 4.75), k.c('#e8dcc0'), round_=0.2), Box((0, 3.2, 0), (6.75, 3.35, 0.5), k.c('#e8dcc0'), round_=0.2)]
    return out, None


# ------------------------------------------------------------------ tools
def tool(k, name, d):
    n = name.lower()
    wood, iron, brass = k.c('#7a4a26'), k.metal('iron'), k.metal('brass')
    if n in ('large box', 'chest', 'ice box'):
        body = k.c('#e8ecf0') if 'ice' in n else wood
        out = [Box((0, 4, 0), (8, 4, 5.4), body, round_=0.5)]
        if n == 'chest':
            out += [Capsule((-8, 8, 0), (8, 8, 0), 5.2, mat=body, cut=((0, 1, 0), 8)), Box((0, 8.2, 5.5), (1.4, 1.8, 0.4), k.metal('gold'))]
            out += [Box((x, 6, 0), (0.7, 6.4, 5.8), k.metal('gold'), round_=0.2) for x in (-5.5, 5.5)]
        else:
            out += [Box((0, 8.6, 0), (8.2, 0.9, 5.6), k.c('#8a5a30') if 'ice' not in n else k.c('#f4f6f8'), round_=0.4),
                    Box((0, 7.6, 5.5), (8.3, 0.4, 0.3), iron if 'ice' not in n else k.c('#a0b0c0'), round_=0.1)]
            if 'ice' not in n:
                out += [Box((x, 4, 0), (0.6, 4.1, 5.6), iron, round_=0.2) for x in (-5.5, 5.5)]
        return out, None
    if 'bag' in d or 'sack' in n:
        col = '#2a4a3a' if 'oilskin' in n else '#8a6a42'
        m = k.c(col, metal='oilskin' in n)
        return [Ellipsoid((0, 5, 0), (6, 5.6, 5), m), Capsule((0, 9, 0), (0, 12.5, 0), 1.6, 2.4, mat=m),
                Torus((0, 10.2, 0), 1.9, 0.6, k.c('#c8a060'))], None
    if 'key' in n:
        return [Torus(P(-6), 2.6, 0.8, brass, R=rot_x(math.pi / 2)), Capsule(P(-3.4), P(9), 0.8, mat=brass),
                Box(P(7.5, -1.6), (1.6, 1.2, 0.6), brass, R=D45), Box(P(4.8, -1.4), (0.8, 1.0, 0.6), brass, R=D45)], FLAT
    if 'lock pick' in n:
        return [Capsule(P(-8), P(8), 0.45, mat=k.metal('steel')), Capsule(P(8), P(9, 1.4), 0.45, mat=k.metal('steel')),
                Box(P(-7), (2.6, 1.4, 0.8), k.c('#4a2a14'), R=D45)], FLAT
    if 'credit card' in n:
        return [Box((0, 0, 0), (8, 5, 0.3), k.c('#2a5ad0'), round_=0.8, R=rot_z(0.2)), Box((-3, 0.4, 0.3), (2, 1.6, 0.15), k.metal('gold'), R=rot_z(0.2))], FLAT
    if 'candle' in n:
        wax = k.c('#f0e8d0' if 'wax' in n else '#e0c890', step=0.07)
        return [Capsule((0, 0, 0), (0, 9, 0), 2.2, mat=wax), Capsule((0, 9.5, 0), (0, 11, 0), 0.3, mat=k.c('#2a2020')),
                Ellipsoid((0, 12.6, 0), (1.1, 2.0, 1.1), k.c('#ffd060', glow=True)), Disc((0, 0.4, 0), (0, 1, 0), 3.8, 0.4, brass)], None
    if 'lantern' in n:      # brass frame (base, corner posts, roof), glowing glass pane, wire bail on top
        glass = k.c('#ffe080', glow=True)
        out = [Box((0, 5.4, 0), (2.7, 3.5, 2.7), glass, round_=0.3), Disc((0, 1.0, 0), (0, 1, 0), 4.0, 0.9, brass),
               Capsule((0, 9.4, 0), (0, 11.4, 0), 4.0, 1.2, mat=brass), Sphere((0, 12.4, 0), 1.0, brass),
               Capsule((-2.9, 5.4, 2.9), (2.9, 5.4, 2.9), 0.4, mat=brass)]
        out += [Capsule((x, 1.4, z), (x, 9.4, z), 0.55, mat=brass) for x in (-3, 3) for z in (-3, 3)]
        out += [Torus((0, 12.0, 0), 3.0, 0.5, brass, R=rot_x(math.pi / 2), cut=((0, 1, 0), 12.0))]
        return out, FLAT
    if 'lamp' in d or 'lamp' in n:
        return [Ellipsoid((0, 3, 0), (6, 2.8, 3.6), brass), Capsule((5, 3.4, 0), (10, 5.6, 0), 1.4, 0.7, mat=brass),
                Torus((-6.4, 3.4, 0), 2.0, 0.6, brass), Sphere((0, 6.2, 0), 1.4, brass), Ellipsoid((10.4, 7.2, 0), (0.8, 1.4, 0.8), k.c('#ffd060', glow=True))], None
    if 'camera' in n:
        return [Box((0, 4, 0), (7, 4, 3), k.c('#2a2a30'), round_=0.8), Disc((0, 4, 3), (0, 0, 1), 2.8, 1.2, k.c('#5a5a68', metal=True)),
                Disc((0, 4, 4.1), (0, 0, 1), 1.8, 0.2, k.c('#6ab0ff', glow=True)), Box((-4.4, 8.6, 0), (1.5, 0.7, 1.2), k.metal('steel'))], None
    if 'looking glass' in d or 'mirror' in n:
        return [Ellipsoid((0, 3, 0), (5, 6, 0.8), k.c('#c8e4ff', metal=True, glow=True)), Torus((0, 3, 0), 5.4, 0.8, brass, R=rot_x(math.pi / 2), squash=(0.85, 1)),
                Capsule((0, -3, 0), (0, -10, 0), 1.0, mat=brass)], FLAT
    if 'orb' in d or 'crystal ball' in n:
        return [Sphere((0, 7, 0), 6, k.c('#9ad0ff', metal=True, glow=True)), Disc((0, 1, 0), (0, 1, 0), 4.6, 1.0, brass)], None
    if 'lenses' in n:
        return [Torus((x, 0, 0), 3.0, 0.6, k.metal('steel'), R=rot_x(math.pi / 2)) for x in (-4, 4)] + \
               [Disc((x, 0, 0), (0, 0, 1), 2.6, 0.2, k.c('#a0d0ff', metal=True, glow=True)) for x in (-4, 4)] + \
               [Capsule((-1.2, 0.6, 0), (1.2, 0.6, 0), 0.5, mat=k.metal('steel'))], FLAT
    if 'blindfold' in n:    # a dark cloth band, gently curved, knotted at one end with two trailing ties
        cl, tie = k.c('#4a4462', step=0.1), k.c('#383248', step=0.1)
        out = [Box((x, 3.0 - 0.06 * x * x, 0), (2.3, 2.0, 0.5), cl, R=rot_z(-0.12 * x), round_=0.45) for x in (-6, -3, 0, 3, 6)]
        out += [Box((x, 3.2 - 0.06 * x * x, 0.5), (1.2, 0.18, 0.12), k.c('#6a6080'), R=rot_z(-0.12 * x), round_=0.1) for x in (-4.5, 0, 4.5)]
        out += [Sphere((8.6, -0.6, 0.4), 1.6, tie)]
        out += chain([(8.6, -0.6, 0.6), (9.8, -4, 0.8), (9.0, -7.6, 0.8)], 0.95, 0.7, tie)
        out += chain([(8.6, -0.6, 0.6), (11.6, -2.6, 0.2), (13.0, -5.8, 0)], 0.95, 0.7, tie)
        return out, FLAT
    if 'towel' in n:        # folded in thirds: thin layers, a rounded fold on the right, a white stripe across
        tm, fold = k.c('#c8508c', step=0.1), k.c('#a83e74', step=0.1)
        out = [Box((-0.4 - i * 0.9, 0.5 + i * 0.95, 0), (7.0 - i * 0.4, 0.42, 5.0), tm if i % 2 == 0 else fold, round_=0.4) for i in range(3)]
        out += [Capsule((6.6 - i * 1.3, 0.97 + i * 0.95, -4.9), (6.6 - i * 1.3, 0.97 + i * 0.95, 4.9), 0.5, mat=fold) for i in range(2)]
        out += [Box((x, 2.75, 0), (0.75, 0.2, 5.02), k.c('#f8f4f4'), round_=0.1) for x in (-4.6, -1.6)]
        out += [Capsule((-8.7, 2.4, z), (-9.8, 2.2, z), 0.3, mat=tm) for z in (-4, -2, 0, 2, 4)]
        return out, None
    if 'saddle' in n:
        lm = k.c('#6a3a1e')
        return [Ellipsoid((0, 4, 0), (8, 3, 5), lm, cut=((0, 1, 0), 3)), Capsule((-6, 6.5, 0), (-7.4, 9, 0), 1.6, mat=lm),
                Capsule((7, 5.5, 0), (8, 7, 0), 1.3, mat=lm), Capsule((0, 1, 5), (0, -5, 5.4), 0.6, mat=k.c('#3a2010'))], None
    if 'leash' in n:
        lm = k.c('#8a4a2a')
        return [Torus((0, 1 + i * 1.3, 0), 5 - i * 0.6, 0.7, lm) for i in range(3)] + [Torus((5, 2, 3), 1.6, 0.5, k.metal('steel'), R=rot_x(1.3))], None
    if 'stethoscope' in n:
        return [Torus((0, 2, 0), 6, 0.6, k.c('#2a2a30'), R=rot_x(math.pi / 2)), Disc((0, -5, 1), (0, 0, 1), 2.6, 0.7, k.metal('steel')),
                Capsule((-4, 6, 0), (-5, 9, 0), 0.5, mat=k.metal('steel')), Capsule((4, 6, 0), (5, 9, 0), 0.5, mat=k.metal('steel'))], FLAT
    if 'tinning kit' in n:
        return [Box((0, 3, 0), (7, 3, 4.6), k.c('#3a4a6a', metal=True), round_=0.6), Capsule((-3, 6.6, 0), (3, 6.6, 0), 0.6, mat=k.metal('steel'))], None
    if 'tin opener' in n:
        return [Capsule(P(-8), P(4), 1.0, mat=k.c('#6a4428')), Capsule(P(4), P(8, 1.4), 0.7, 0.3, mat=k.metal('steel'))], FLAT
    if 'grease' in n:
        t = k.c('#8a8a92', metal=True)
        return [Disc((0, 4.4, 0), (0, 1, 0), 3.8, 4.4, t), Capsule((2, 9, 0), (4, 12, 0), 0.7, mat=t), Box((0, 4.4, 3.8), (2.4, 2, 0.2), k.c('#f0d020'))], None
    if 'figurine' in n:
        g = k.c('#c8b898')
        return [Disc((0, 0.8, 0), (0, 1, 0), 3.6, 0.8, g), Capsule((0, 2, 0), (0, 8, 0), 2.2, 1.4, mat=g), Sphere((0, 10, 0), 1.8, g)], None
    if 'marker' in n:
        return [Capsule(P(-9), P(6), 1.3, mat=k.c('#e0e0e0')), Capsule(P(6), P(9.5), 1.2, 0.4, mat=k.c('#c02a2a')),
                Capsule(P(-9), P(-5), 1.45, mat=k.c('#c02a2a'))], FLAT
    if 'land mine' in n:
        return [Disc((0, 1.6, 0), (0, 1, 0), 6, 1.6, k.c('#4a5a3a', metal=True)), Sphere((0, 3.4, 0), 1.4, k.c('#c02a2a', glow=True))], None
    if 'beartrap' in n:
        st = k.metal('iron')
        return [Torus((0, 1.2, 0), 6, 0.7, st), Torus((0, 1.2, 0), 6, 0.6, st, R=rot_z(1.1))] + \
               [Capsule((math.cos(a) * 6, 1.2, math.sin(a) * 6), (math.cos(a) * 4.6, 3.6, math.sin(a) * 4.6), 0.4, 0.1, mat=k.metal('steel'))
                for a in np.linspace(0, 2 * math.pi, 11)[:-1]], None
    if 'whistle' in d or 'whistle' in n:
        return [Capsule((-6, 4, 0), (3, 4, 0), 1.6, mat=k.metal('tin')), Sphere((4, 3.4, 0), 2.6, k.metal('tin')), Torus((-6, 6, 0), 1.2, 0.4, k.metal('tin'))], None
    if 'flute' in d:       # thin, pale wood, banded ends, a row of finger holes
        w, band, hole = k.c('#e4c890', step=0.07, hue=0.3), k.c('#7a4a22', hue=0.5), k.c('#1a1418', detail=True, step=0.02)
        return [Capsule(P(-10), P(10), 1.0, mat=w), Capsule(P(-10.4), P(-8.6), 1.15, mat=band), Capsule(P(8.6), P(10.4), 1.15, mat=band),
                Sphere(P(-6.4, 0, 0.85), 0.42, hole)] + [Sphere(P(t, 0, 0.88), 0.38, hole) for t in (-1.2, 2.2, 5.6)], FLAT
    if 'horn' in d or 'horn of plenty' in n:
        iv = k.c('#e8dcc0', step=0.09)
        pts = [(-9 + i * 3, 2 + 4 * math.sin(i * 0.5), 0) for i in range(7)]
        out = [Capsule(pts[i], pts[i + 1], 0.6 + i * 0.5, 1.1 + i * 0.5, mat=iv) for i in range(6)]
        return out + [Torus(pts[-1], 3.6, 0.6, k.metal('brass'), R=rot_z(math.pi / 2))], FLAT
    if 'harp' in d:
        g = k.metal('gold')
        out = [Capsule((-6, -8, 0), (-6, 8, 0), 1.2, mat=g), Capsule((-6, 8, 0), (6, 4, 0), 1.0, mat=g), Capsule((6, 4, 0), (-5, -8, 0), 1.1, mat=g)]
        return out + [Capsule((-5 + i * 1.8, -7 + i * 1.0, 0.3), (-5 + i * 1.8, 7.5 - i * 0.6, 0.3), 0.2, mat=k.c('#f0f0f0')) for i in range(6)], FLAT
    if 'bell' in n or 'bell' in d:
        m = k.metal('silver' if 'silver' in d else 'brass')
        prof = lambda y: 2.5 + 4.3 * (max(0.0, 8.6 - y) / 7.4) ** 2.4     # waist narrow, mouth flared wide
        out = [Disc((0, y, 0), (0, 1, 0), prof(y), 0.42, m) for y in np.arange(1.4, 8.7, 0.6)]
        out += [Sphere((0, 8.6, 0), 2.5, m, cut=((0, 1, 0), 8.5)), Torus((0, 1.3, 0), prof(1.3), 0.65, m),
                Torus((0, 11.4, 0), 1.6, 0.6, m, R=rot_x(math.pi / 2)), Sphere((0, 0.2, 0), 1.2, k.metal('iron'))]
        return out, FLAT
    if 'bugle' in n:
        b = k.metal('brass')
        return [Capsule((-8, 3, 0), (6, 3, 0), 0.8, mat=b), Capsule((-8, 3, 0), (-4, 8, 0), 0.8, mat=b), Capsule((-4, 8, 0), (8, 8, 0), 0.8, mat=b),
                Capsule((6, 3, 0), (10, 3, 0), 0.9, 3.0, mat=b)], FLAT
    if 'drum' in d:
        return [Disc((0, 4, 0), (0, 1, 0), 6, 3.6, k.c('#8a2a1a')), Disc((0, 7.7, 0), (0, 1, 0), 6.2, 0.3, k.c('#e8dcc0')),
                Torus((0, 7.6, 0), 6.1, 0.6, k.c('#c8a060')), Torus((0, 0.6, 0), 6.1, 0.6, k.c('#c8a060'))], None
    if 'pick-axe' in n:
        return pick(k, n, d), FLAT
    if 'grappling' in n:
        st = k.metal('iron')
        return [Capsule((0, -8, 0), (0, 6, 0), 0.8, mat=st)] + [Torus((x, -6, 0), 3.0, 0.7, st, R=rot_y(a), cut=((0, -1, 0), 0.5)) for x, a in ((-3, 0), (3, 0))] + \
               [Torus((0, 8, 0), 1.5, 0.5, st, R=rot_x(math.pi / 2))], FLAT
    if 'unicorn horn' in n:
        return horn_unicorn(k), FLAT
    if 'candelabrum' in d or 'candelabrum' in n:
        g = k.metal('gold')
        out = [Disc((0, 0.8, 0), (0, 1, 0), 4, 0.8, g), Capsule((0, 0, 0), (0, 8, 0), 1.0, mat=g), Capsule((-7, 8, 0), (7, 8, 0), 0.8, mat=g)]
        for x in (-7, -3.5, 0, 3.5, 7):
            out += [Capsule((x, 8, 0), (x, 11, 0), 0.9, mat=k.c('#f0e8d0')), Ellipsoid((x, 12.4, 0), (0.7, 1.2, 0.7), k.c('#ffd060', glow=True))]
        return out, None
    return [Box((0, 4, 0), (5, 4, 4), wood, round_=1)], None


# ------------------------------------------------------------------ class glyphs
def question(k):
    """Strange object: a chunky glowing question mark."""
    m = k.c('#f0c838', step=0.1)
    hook = [(-4.2, 7.4, 0), (-3.6, 10.2, 0), (-1.4, 12.0, 0), (1.6, 12.0, 0), (3.8, 10.2, 0), (3.8, 7.6, 0), (1.8, 5.6, 0), (0, 4.4, 0), (0, 1.6, 0)]
    return chain(hook, 1.5, 1.5, m) + [Sphere((0, -2.4, 0), 1.75, m)], FLAT


def rolled_scroll(k):
    """A rolled-up scroll tied with a red ribbon and seal."""
    pm, end = k.c('#e8d8a8', step=0.07), k.c('#c8b080', step=0.07)
    rib = k.c('#c02a2a')
    out = [Capsule(P(-8), P(8), 2.6, mat=pm), Disc(P(8.3), U, 2.3, 0.35, end), Disc(P(-8.3), U, 2.3, 0.35, end),
           Disc(P(8.6), U, 0.9, 0.3, k.c('#8a6a3a')),
           Box(P(4, -2.2, 0.4), (4.4, 1.1, 0.2), pm, R=D45, round_=0.15),                # loose end of the sheet
           Torus(P(0), 2.75, 0.55, rib, R=rot_z(-math.pi / 4)),
           Disc(P(0, 0, 2.9), (0, 0, 1), 1.3, 0.45, k.c('#a01a1a'))]
    return out + [Capsule(P(0, -2.6, 1.6), P(-2.2, -5.4, 1.6), 0.5, mat=rib), Capsule(P(0, -2.6, 1.6), P(1.4, -5.8, 1.6), 0.5, mat=rib)], FLAT


def generic(k, c):
    """'generic <class>' glyphs (objects known only by class): a plain representative of the class."""
    if c == 'weapon':
        return sword(k, 'long sword', ''), FLAT
    if c == 'armor':     # a plain cuirass
        st = k.metal('steel')
        return [Ellipsoid((0, 0, 0), (6.0, 7.6, 3.6), st, cut=((0, -1, 0), -6.0)), Ellipsoid((0, 6.2, 0), (2.6, 1.4, 2.2), k.c('#120c10')),
                Capsule((-5.4, -5.4, 2.0), (5.4, -5.4, 2.0), 0.8, mat=k.metal('gold')), Capsule((0, 4.5, 3.4), (0, -4.6, 3.4), 0.45, mat=k.c('#c8d0e0', metal=True)),
                Sphere((-5.8, 4.8, 0), 2.2, k.metal('iron'), cut=((0, 1, 0), 3.6)), Sphere((5.8, 4.8, 0), 2.2, k.metal('iron'), cut=((0, 1, 0), 3.6))], FLAT
    if c == 'ring':
        return ring(k, '', 'ruby')
    if c == 'amulet':
        return amulet(k, '', 'circular')
    if c == 'tool':
        return tool(k, 'sack', 'bag')
    if c == 'food':
        return food(k, 'apple', '')
    if c == 'potion':
        return potion(k, 'potion', 'swirly')
    if c == 'scroll':
        return rolled_scroll(k)
    if c == 'spellbook':
        return spellbook(k, 'spellbook', 'generic')
    if c == 'wand':
        return wand(k, 'wand', 'oak')
    if c == 'coin':
        return coins(k, '', '')
    if c == 'gem':
        return gem(k, '', 'white')
    return heavy(k, {'rock': 'boulder', 'ball': 'heavy iron ball', 'chain': 'iron chain', 'venom': 'splash of venom'}.get(c, c), '')


# ------------------------------------------------------------------ dispatch
CLS = {1: 'strange', 2: 'weapon', 3: 'armor', 4: 'ring', 5: 'amulet', 6: 'tool', 7: 'food', 8: 'potion', 9: 'scroll',
       10: 'spellbook', 11: 'wand', 12: 'coin', 13: 'gem', 14: 'rock', 15: 'ball', 16: 'chain', 17: 'venom'}


def model(o):
    k = Kit()
    name, d, cls = o['name'] or '', (o['descr'] or '').strip(), o['cls']
    c = CLS.get(cls, 'strange')
    if c == 'strange':
        prims, R = question(k)
    elif name.startswith('generic '):
        prims, R = generic(k, c)
    elif c == 'weapon':
        prims, R = weapon(k, name, d)
    elif c == 'armor':
        prims, R = armor(k, name, d)
    elif c == 'ring':
        prims, R = ring(k, name, d)
    elif c == 'amulet':
        prims, R = amulet(k, name, d)
    elif c == 'tool':
        prims, R = tool(k, name, d)
    elif c == 'food':
        prims, R = food(k, name, d)
    elif c == 'potion':
        prims, R = potion(k, name, d)
    elif c == 'scroll':
        prims, R = scroll(k, name, d)
    elif c == 'spellbook':
        prims, R = spellbook(k, name, d)
    elif c == 'wand':
        prims, R = wand(k, name, d)
    elif c == 'coin':
        prims, R = coins(k, name, d)
    elif c == 'gem':
        prims, R = gem(k, name, d)
    else:
        prims, R = heavy(k, name, d)
    return prims, k.m, R


def fit(prims, mats, R, size):
    """Render once at a probe scale, then rescale and recentre so the item fills its cell."""
    probe = render(prims, mats, size=64, feet=(32, 40) if R is None else (32, 32), R=R, scale=1.6, ss=1, outline=False)
    a = probe[:, :, 3] > 0
    if not a.any():
        return np.zeros((size, size, 4), np.uint8)
    ys, xs = np.nonzero(a)
    w, hgt = (xs.max() - xs.min() + 1) / 1.6, (ys.max() - ys.min() + 1) / 1.6
    cx, cy = ((xs.max() + xs.min() + 1) / 2 - 32) / 1.6, ((ys.max() + ys.min() + 1) / 2 - (40 if R is None else 32)) / 1.6
    room = size - 3
    s = min(room / w, room / hgt, size / 21)    # small things stay small-ish, big things fit
    feet = (size / 2 - cx * s, size / 2 - cy * s)
    return render(prims, mats, size=size, feet=feet, R=R, scale=s, ss=3)


def job(args):
    o, sizes = args
    prims, mats, R = model(o)
    return o['i'], {sz: fit(prims, mats, R, sz) for sz in sizes}


if __name__ == '__main__':
    objs = json.load(open(sys.argv[1]))
    out = sys.argv[2]
    sizes = [int(s) for s in sys.argv[3:]] or [32, 24]
    only = os.environ.get('ONLY')
    if only:
        objs = [o for o in objs if any(w in (o['name'] or '') + '/' + (o['descr'] or '') for w in only.split(','))]
    cols = 32
    n = max(o['i'] for o in json.load(open(sys.argv[1]))) + 1
    rows = (n + cols - 1) // cols
    sheets = {sz: Image.new('RGBA', (cols * sz, rows * sz), (0, 0, 0, 0)) for sz in sizes}
    with Pool(int(os.environ.get('JOBS', os.cpu_count()))) as pool:
        for done, (i, imgs) in enumerate(pool.imap_unordered(job, [(o, sizes) for o in objs])):
            for sz, img in imgs.items():
                sheets[sz].alpha_composite(Image.fromarray(img, 'RGBA'), ((i % cols) * sz, (i // cols) * sz))
            if done % 50 == 0:
                print(f'{done + 1}/{len(objs)}', flush=True)
    for sz, im in sheets.items():
        im.save(os.path.join(out, f'items{sz}.png'), optimize=True)
    json.dump({'cols': cols, 'sizes': sizes, 'count': n}, open(os.path.join(out, 'items.json'), 'w'))
    print('done', len(objs))

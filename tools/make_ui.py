"""Procedural UI textures: tileable mossy slate for the inventory screen.

Rendered at half resolution with a small palette, then doubled with nearest
neighbour so it sits beside the pixel-art sprites.
"""
import sys
import numpy as np
from PIL import Image

rng = np.random.default_rng(7)


def tile_noise(n, cells):
    """Tileable value noise: random grid of `cells`, wrapped, bicubic-ish smoothing."""
    g = rng.random((cells, cells))
    xs = np.arange(n) * cells / n
    i0 = np.floor(xs).astype(int); f = xs - i0
    f = f * f * (3 - 2 * f)
    i1 = (i0 + 1) % cells
    a = g[np.ix_(i0, i0)]; b = g[np.ix_(i0, i1)]; c = g[np.ix_(i1, i0)]; d = g[np.ix_(i1, i1)]
    fx = f[None, :]; fy = f[:, None]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(n, octaves=((4, .5), (8, .25), (16, .15), (32, .1))):
    return sum(tile_noise(n, c) * w for c, w in octaves)


def cracks(n, count, length):
    m = np.zeros((n, n), bool)
    for _ in range(count):
        x, y = rng.integers(0, n, 2).astype(float)
        a = rng.uniform(0, 2 * np.pi)
        for _ in range(length):
            a += rng.normal(0, .35)
            x = (x + np.cos(a)) % n; y = (y + np.sin(a)) % n
            m[int(y), int(x)] = True
            if rng.random() < .02:   # branch
                a += rng.choice([-1, 1]) * 1.1
    return m


def stone(n=160):
    base = fbm(n)
    moss = fbm(n, ((3, .6), (6, .3), (24, .1)))
    slabs = tile_noise(n, 5)                       # large tonal blotches
    grain = rng.random((n, n))
    v = base * .55 + slabs * .2 + grain * .25
    v = (v - v.min()) / (v.max() - v.min())
    cr = cracks(n, 16, 70)
    # crack shading: dark line, lit lip below-right
    lip = np.roll(np.roll(cr, 1, 0), 1, 1) & ~cr
    pal_stone = np.array([[20, 26, 24], [29, 37, 34], [38, 47, 43], [48, 58, 52], [60, 71, 63], [74, 86, 76]])
    pal_moss = np.array([[22, 30, 24], [31, 41, 32], [41, 53, 40], [52, 65, 49], [64, 77, 58], [77, 90, 68]])
    lvl = np.clip((v * 6.4 - .2).astype(int), 0, 5)
    m = moss > np.quantile(moss, .62)
    img = np.where(m[..., None], pal_moss[lvl], pal_stone[lvl])
    img[lip] = np.minimum(img[lip] + 16, 255)
    img[cr] = [12, 15, 14]
    # pits
    pits = rng.random((n, n)) < .006
    img[pits] = [16, 20, 18]
    img[np.roll(pits, 1, 0) & ~pits] = np.minimum(img[np.roll(pits, 1, 0) & ~pits] + 12, 255)
    im = Image.fromarray(img.astype(np.uint8), 'RGB')
    return im.resize((n * 2, n * 2), Image.NEAREST)


if __name__ == '__main__':
    out = sys.argv[1] if len(sys.argv) > 1 else 'public/assets/ui'
    stone().save(f'{out}/stone.png', optimize=True)
    print('ok')

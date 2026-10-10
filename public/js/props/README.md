# Map props

Hand-drawn pixel art for dungeon features, traps and terrain details, drawn in code on the game's
24×24 cell grid (the same way walls and floors are drawn in `render.js`).

Each module default-exports an object keyed by the NetHack glyph name (as in `tiles.json`'s
`gname`, without the `cmap A ` prefix), for example:

```js
export default {
  'tree': {
    kind: 'tall',          // 'ground': flat on the floor, drawn once into the terrain layer
                           // 'tall':   stands up; drawn every frame before monsters, may reach
                           //           up to 24px above its cell and 4px to each side
    animated: false,       // true: drawn every frame with o.t changing (ground props too)
    draw(ctx, ox, oy, o) { ... },
  },
};
```

`draw` paints into a 2D canvas context at 1 game pixel per canvas pixel, with `(ox, oy)` the
top-left of the cell. The floor is already drawn underneath. `o` has:

- `t`: time in ms (only meaningful for animated props; 0 otherwise)
- `seed`: a per-cell integer, for variety between neighbouring copies
- `n`: terrain class of the 4 neighbours, `{ N, S, E, W }` (`'wall'`, `'floor'`, `'corr'`, …)
- `theme`: the level's palette (`floor`, `seam`, `cap`, `capHi`, `face`, `faceHi`, `mortar`)

Style: chunky top-down 3/4 pixel art with a 1px dark outline (`#120e0c`-ish) on standing objects,
light from the upper left, 3–4 tone shading, no anti-aliasing (whole pixels only:
`fillRect` with integers), muted dungeon palette with saturated accents only where NetHack's
colour matters (lava, magic, altar alignment).

Preview: `node tools/props-preview.mjs http://127.0.0.1:8080/ out.png` (needs `npm start`).

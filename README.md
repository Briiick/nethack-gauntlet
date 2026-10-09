# NetHack Gauntlet

Real NetHack 5.0, unmodified rules, with an overhead, torchlit pixel-art interface in the spirit of
newer *Gauntlet* games and *Nuclear Throne*. Everything runs locally in your browser and works
fully offline: the engine, art and fonts are all in this folder, and nothing is sent anywhere.

- **The real game.** NetHack 5.0.0 compiled to WebAssembly, driven through its own window-port API.
  Saves persist in your browser (IndexedDB).
- **Hand-lit 3D-to-pixel sprites.** All 383 monsters and every player role are modelled in 3D and
  rendered to shaded pixel art, facing 4 directions with idle, walk and attack frames. Statues show
  the actual monster in stone; corpses show the actual monster lying down.
- **An icon for every item appearance.** 481 objects, each rendered from a model and coloured by its
  appearance ("milky" potion, "ebony" wand, "hexagonal" amulet). NetHack shuffles appearances each
  game, and the icons follow that shuffle, so they never spoil an identification.
- **Lighting and feel.** Per-cell lighting, wall torches, glowing fountains
  and lava, hit flashes, blood, hit-stop on kills and subtle screen shake (adjustable).
- **A Baldur's Gate-style inventory.** A carved-stone page with your character in the middle (turn
  them, or point at a weapon to watch them swing it), equipment slots around them, a quick-weapons
  panel, the backpack along the bottom and your pets' portraits down the side.

## Play

Needs [Node.js](https://nodejs.org) 18 or newer. There are no dependencies to install.

```sh
cd nethack-gauntlet
npm start            # serves on http://127.0.0.1:8080 and opens your browser
```

`npm start -- 9000` (or `PORT=9000 npm start`) picks another port, and `NO_OPEN=1` skips opening
the browser. The page must be served over http: opening `index.html` as a file won't load the
WebAssembly. Without Node, any static server works, e.g. `python3 -m http.server -d public 8080`.

No internet connection is needed at any point, including the first launch.

### Controls

| | |
|---|---|
| Move | arrow keys, `hjklyubn`, or the numpad. Shift runs |
| Attack | move into a monster |
| Travel | click a spot on the map |
| Inventory | `i`. Letters choose items, `Tab` switches category, `Esc` closes |
| Everything else | standard NetHack keys (`,` pick up, `d` drop, `q` quaff, `#` extended commands…) |
| Settings | the gear button, `F1`, or *Settings & controls* on the start screen |

When a command asks you to pick a spot (travel, farlook `;`, throwing at a target…), a gold
cursor appears: move it with the direction keys, then press `.` or `,` or click.

### Settings

- **Display**: zoom, brightness, animation speed, screen shake, missile speed, message lines,
  blood, hero/pet rings, reduce motion.
- **Gameplay**: autopickup, click to travel, safe pets, confirm peacefuls, auto-open doors,
  auto-quiver, push weapon, space rests, verbose messages, turn counter, experience points, tutorial.
- **Controls**: how to move and fight, and every command in the game with its key, read from
  NetHack's own command table. It's searchable, and clicking a command runs it.
- **Saves**: export a save to a file, import one, or delete it.

Add `#wizard` to the URL to start in NetHack's debug mode.

## Layout

```
server.mjs              zero-dependency static server
public/
  index.html, css/      HUD, panels, inventory screen
  js/engine.js          loads the WebAssembly engine, bridges its callbacks, IndexedDB saves
  js/game.js            the window port: map, messages, menus, prompts, status
  js/render.js          terrain, lighting, actors, combat effects
  js/ui.js              HUD, message feed, menus and prompts
  js/inventory.js       the inventory screen
  nethack/              the compiled engine (nethack.js + nethack.wasm)
  assets/               tile map, monster sprite sheets, item icon atlases, UI textures
engine/                 the patch on top of NetHack 5.0.0 and the script that builds it
tools/
  make_atlas.py         glyph → tile/monster/object tables (tiles.json) and the fallback atlas
  make_ui.py            procedural stone texture for the inventory
  sprites3d/            the 3D-to-pixel renderer: SDF primitives, rigs, materials,
                        monster roster (batch.py) and item models (items.py)
test/                   smoke test and screenshot scripts (Playwright)
```

## Rebuilding

The engine and all art are committed, so you only need these to change them.

```sh
npm run build:engine        # clone NetHack 5.0.0, apply engine/nethack-gauntlet.patch, build with Emscripten
npm run build:art           # tile tables, fallback atlas, item icons (python3 + numpy + pillow)
npm run build:art -- --actors   # also re-render every monster sprite sheet (about an hour on 4 cores)
```

To preview the sprite renderer, run `python3 tools/sprites3d/preview.py out.png` (monster rigs) or
`python3 tools/sprites3d/preview_items.py tools/sprites3d/objects.json public/assets/items/items32.png out.png`
(item icons).

## Tests

```sh
cd test && npm install && cd ..
CHROME=/path/to/chrome npm test
```

- `test/smoke.mjs` serves the app with the network blocked, starts a game, checks the inventory,
  the map and the fonts, and fails on any console error or outside request.
- `test/commands.mjs <url> <out>` runs every command in NetHack's command table through the UI
  (138 in a debug-mode game), answers whatever each one asks, and finishes by really quitting and
  by saving, reloading and resuming a game.
- `test/playtest.mjs <url> <out> <Role> [actions] [--save-restore]` autoplays a real game:
  it explores, fights, eats, prays, takes the stairs down and tours the inventory, look, attributes and
  settings screens, reporting hangs, console errors and unknown keys.
- `test/keys.mjs` checks every way to move (arrows, `hjklyubn`, numpad, Home/PgUp/End/PgDn,
  Shift-run, wait); `test/engulf.mjs` gets swallowed by a fog cloud and fights out;
  `test/death.mjs` and `test/epitaph.test.mjs` check the game-over screen names the cause of death.
- `test/settings.mjs` and `test/showcase.mjs` take screenshots of every settings tab and of a
  fully kitted-out debug-mode character.

## License

NetHack is copyright © Stichting Mathematisch Centrum and M. Stephenson and the NetHack DevTeam,
and is distributed under the [NetHack General Public License](https://github.com/NetHack/NetHack/blob/NetHack-5.0.0_Released/dat/license).
The engine in `public/nethack/` is built from the unmodified NetHack 5.0.0 source plus
`engine/nethack-gauntlet.patch`, and `engine/build-engine.sh` rebuilds it. This interface and its
art are distributed under the same license.

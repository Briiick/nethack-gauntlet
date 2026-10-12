# NetHack Gauntlet

Real NetHack 5.0, unmodified rules, with an overhead, torchlit pixel-art interface in the spirit of
newer *Gauntlet* games and *Nuclear Throne*. Everything runs locally, as a desktop app or in your
browser, and works fully offline: the engine, art and fonts are all in this folder, and nothing is sent anywhere.

- **It's NetHack, not a new game.** Every rule, level, monster, item and message comes from the
  unmodified NetHack 5.0.0 engine, and new games use NetHack's own option defaults and character
  questions. The interface only changes how things look: torchlit walls, lighting, blood and
  animation are cosmetic and don't affect play. Prefer the classic look? Settings → Graphics →
  *Official NetHack tiles*.
- **The real game.** NetHack 5.0.0 compiled to WebAssembly, driven through its own window-port API.
  Runs as a desktop app (saves are files on disk, and closing the window saves) or in a browser.
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
- **Chests in one screen.** Open a chest or bag (`E` or `Space` with modern controls, `#loot`, or
  tap yourself on a phone) and its contents sit beside your pack. Mark what to take out and what to
  put in, then press one button; *Take all* empties it. Underneath, NetHack still asks all of its
  loot questions, and the interface answers them with what you marked. If a chest turns out to be
  locked, pressing `E` again forces the lock (NetHack asks first). Picking up or dropping several
  things also skips the "what type of objects?" step. Settings → Gameplay → *Quick looting* turns
  this off and shows NetHack's own menus.

## Play

### As a desktop app (recommended)

Needs [Node.js](https://nodejs.org) 18 or newer, once, to set it up.

```sh
cd nethack-gauntlet
npm install          # one time: fetches Electron (the app shell) for your computer
npm run app          # opens NetHack Gauntlet in its own window
```

To get a real app you can keep in your Applications folder / Start menu, build an installer:

```sh
npm run dist         # macOS: dist/*.dmg   Windows: dist/*Setup*.exe   Linux: dist/*.AppImage
```

The Mac app isn't signed with an Apple developer account, so the first time you open it macOS
will say it can't verify the developer: **right-click the app → Open → Open** (only needed once).
Each push to `main` also builds the installers for all three systems on GitHub Actions; download
them from the run's *Artifacts* section (pushing a `v*` tag attaches them to a release).

**Saving.** Closing the window saves your game, exactly as NetHack's own save command does. The
start screen shows each saved game as a card under *Continue*, with the hero's portrait, role,
level, depth, turn and when it was saved; **Resume** carries straight on, with no name to retype.
Saves are ordinary files in the app's data folder: Settings → Saves shows where, with a button to
open it. NetHack is a roguelike, so each character has one save, replaced every time you save,
and dying ends that character for good.

**Hall of Fame.** Every game that ends (died, quit, escaped, ascended) is kept: the start screen,
the game-over screen and Settings → Saves open the Hall of Fame, with your best scores and most
recent games. Each row shows the score, how and where the game ended, role, level and turns; tap
or click one for more (deepest level, achievements, conducts kept). The scores are NetHack's own,
copied from the line it writes to its `xlogfile` when a game ends. The desktop app, a browser and a
phone each keep their own list.

### In a browser

```sh
npm start            # serves on http://127.0.0.1:8080 and opens your browser
```

`npm start -- 9000` (or `PORT=9000 npm start`) picks another port, and `NO_OPEN=1` skips opening
the browser. The page must be served over http: opening `index.html` as a file won't load the
WebAssembly. Without Node, any static server works, e.g. `python3 -m http.server -d public 8080`.
In the browser, saves live in the browser's storage; save with `Ctrl+S` (or `S` with classic
controls) before closing the tab.

No internet connection is needed at any point, including the first launch.

### On your phone

`mobile/` is the same game with a touch interface in the spirit of *Pixel Dungeon*, built for one
thumb, portrait or landscape. It uses the same engine, art and renderer as the desktop version.

- **Tap** to walk, travel or fight: tap far away to travel there, and tap next to you to step,
  attack, open a door or kick a locked one. Tap **yourself** to take the stairs, pick up, loot,
  drink from a fountain or rest. These are NetHack's own mouse actions.
- Standing on a chest or bag, the context button says **Open** (or **Force lock** once you've found
  it locked), and the same two-sided loot screen opens.
- **Hold** a spot to see what's there, with buttons to *Look*, *Travel*, *Fire this way* and, next to
  you, NetHack's own "What do you want to do?" menu.
- **Drag** to look around and **pinch** to zoom.
- The bottom toolbar has Search (hold it to rest), Look, quick slots, the Bag and **Actions**, which
  lists every NetHack command as a button (pray, kick, #enhance, …). It also has *Keyboard…* for
  typing raw keys.
- The bag is a backpack grid: tap an item to see it and use it, or put it on a quick slot. When the
  game asks for an item, a tap answers. Questions have Yes/No buttons, and a direction is a tap on the
  map or the arrow pad.
- Leaving the app saves the game, exactly like `S`, and coming back resumes it. Saved games show as
  cards on the start screen (tap **Resume**), and finished ones go to the **Hall of Fame** (also in
  the ☰ menu). Phones close
  background apps without asking, so this setting is on by default (Actions → *Save automatically*).
  Saves stay on the phone.

There are two ways to get it onto your phone:

- **Same Wi-Fi as your computer:** run `npm run mobile` and open the address it prints
  (`http://<your computer>:8080/m/`) on the phone.
- **Anywhere, installable and offline:** turn on GitHub Pages once (repository Settings → Pages →
  Source: *GitHub Actions*). The *Website* workflow then publishes the game on every push, to
  `https://<user>.github.io/<repo>/m/`. Open that on the phone and choose *Add to Home Screen*. It
  runs full screen and plays with no connection, because the whole game (about 16 MB) is cached on
  first launch.

A phone or tablet without a mouse that opens the desktop page is sent to the touch version
automatically; add `?desktop` to the address to stay on the desktop page.

### As an iPhone / iPad app (TestFlight)

`ios-app/` wraps the phone version in a native app with [Capacitor](https://capacitorjs.com). It
plays offline, keeps saves as real files (visible in the Files app, backed up by iCloud), and saves
when you leave. With an Apple Developer account and four repository secrets, pushing a tag such as
`ios-v0.1.0` builds it on GitHub and uploads it to TestFlight. Setup steps: [ios-app/README.md](ios-app/README.md).

### Controls

There are two control schemes; pick one on the start screen or in Settings → Controls, and switch
any time. Both send NetHack's own commands, so the game plays the same either way.

**Modern** (the default) works like most PC games:

| | |
|---|---|
| Move | `W` `A` `S` `D` or the arrow keys. Hold two for a diagonal (`W`+`D` = up-right). Hold to keep walking at a steady pace (it stops when something happens); Shift runs |
| Action | `Space`: attack the monster next to you (the one you're facing first); with none, take the stairs or pick up what's here; otherwise wait a turn and search |
| Attack | `Space`, or walk into a monster |
| Interact | `E` or `Enter`: take the stairs you're standing on, otherwise pick up what's here |
| Inventory | `I` opens and closes it. Click an item to see everything you can do with it, or drag it onto your character to wield, wear or put it on (drag worn things back to the pack to take them off); the inventory stays up so you see the result |
| Wait / rest | `.` waits a turn (and searches), `R` rests 20 turns |
| Examine | `X` then pick a spot, or right-click anything on the map |
| Fire / throw / cast | `F` / `T` / `Z` |
| Character / dungeon map | `C` / `M` |
| Quickbar | `1`–`9`: in the inventory, point at an item (or at a spell card) and press a number; the number then drinks, reads, zaps, eats, wears, wields or casts it |
| Every other action | `Tab` opens a searchable list (pray, eat, wear, read, kick, loot…) |
| Save and quit | `Ctrl+S` (`Cmd+S` on a Mac); works with classic controls too |
| Travel | click a spot on the map |
| Cancel | `Esc` always backs out without doing anything |

The same actions are on the bar down the right edge of the screen.

**Classic** is NetHack's own keyboard: `hjklyubn`/arrows/numpad to move, `,` pick up, `d` drop,
`q` quaff, `#` extended commands, `S` save, and so on. Settings → Controls lists every command
with its key, read from NetHack's own command table; click one to run it.

When the game asks you to pick a spot (travel, examine, throwing at a target…), a gold cursor
appears: move it, then press `E`/`Space`/`Enter` (modern) or `.`/`,` (classic), or click.

**Finding your way out of a room.** Doorways and open doors glow and show a pulsing arrow, so the
exits from a room are easy to spot (Settings → Display → *Exit markers*). Many rooms have exits
you haven't found yet: NetHack hides some doors and corridors, and searching (`Space` or `.`)
next to a wall reveals them.

**Corridors.** Rock you have seen is drawn as solid stone with a lit edge, so a corridor's walls
are visible and you can tell a turn from a dead end. Where a corridor runs on into the unexplored,
blue chevrons point the way. A corridor that ends in rock you've already seen gets a small
magnifier: it's a dead end, but NetHack often hides the rest of the passage there, so search.

**The tutorial.** NetHack's tutorial level puts your own equipment away while you practise with
the items it hands you; you get it all back when you leave through a magic portal. With modern
controls, the tutorial's engraved instructions are reworded for these keys (NetHack writes them
for its classic keys, e.g. `M-u` means Alt+U).

**No letters to type.** When NetHack asks which item to use ("What do you want to eat?"), the
item picker opens straight away with the items that fit; click one (or press its letter). You
can still choose something it didn't suggest: type its letter or press *Any item…*. In the
inventory, double-click an item to use it the natural way (drink, wear, zap…), click for every
action, drag it onto your character to equip it. Pick-up lists have *Take all*. Casting (`Z`)
shows your spells as cards with their failure chance.

**You see what you do.** Your character is drawn in the armour and weapons they actually wear
and wield. Swords swing at what you hit, spears thrust, wands charge up and fire, spells draw a
circle in their school's colour, arrows and daggers fly, potions shatter. All of these are
switchable in Settings.

**Menus say what they're for.** When a command asks you to choose an item ("What do you want to
drop?"), the inventory opens with that verb in its title and an orange banner saying what a click
will do. `Esc` closes it without doing anything.

### Settings

- **Display**: graphics (the redrawn animated sprites, or NetHack's official 16×16 tileset drawn
  exactly as NetHack's own tile interfaces draw it), zoom, brightness, animation speed, screen shake, missile speed, message lines,
  blood, hero/pet rings, reduce motion.
- **Gameplay** (these start at NetHack's own defaults, and only options you change are passed
  to the game): autopickup, click to travel, safe pets, confirm peacefuls, auto-open doors,
  auto-quiver, push weapon, space rests, verbose messages, turn counter, experience points, tutorial.
- **Controls**: how to move and fight, and every command in the game with its key, read from
  NetHack's own command table. It's searchable, and clicking a command runs it.
- **Saves**: export a save to a file, import one, or delete it. In the desktop app it also shows
  the saves folder and opens it.

Add `#wizard` to the URL to start in NetHack's debug mode.

## Layout

```
server.mjs              zero-dependency static server (desktop page at /, phone version at /m/; --lan for phones)
desktop/                the desktop app: Electron main process, preload bridge, icon, mac signing hook
public/
  index.html, css/      HUD, panels, inventory screen
  js/engine.js          loads the WebAssembly engine, bridges its callbacks, IndexedDB saves
  js/game.js            the window port: map, messages, menus, prompts, status
  js/render.js          terrain, lighting, actors, combat effects
  js/ui.js              HUD, message feed, menus and prompts
  js/inventory.js       the inventory screen
  nethack/              the compiled engine (nethack.js + nethack.wasm)
  assets/               tile map, monster sprite sheets, item icon atlases, UI textures
mobile/                 the phone version, served at /m/ (it loads everything else from public/)
  js/touch.js           taps, long presses, drag and pinch, as NetHack's own mouse actions
  js/hud.js             toolbar, context button, action sheets
  js/bag.js             the backpack
  js/mobileui.js        the desktop UI with phone-shaped menus, questions and targeting
  sw.js, manifest       offline play and Add to Home Screen
ios-app/                the iPhone/iPad app: Capacitor project (ios/ is the Xcode project); see its README
engine/                 the patch on top of NetHack 5.0.0 and the script that builds it
tools/
  make_atlas.py         glyph → tile/monster/object tables (tiles.json) and the fallback atlas
  make_ui.py            procedural stone texture for the inventory
  make_icon.py          the app icon (desktop/resources/icon.png)
  build-web.mjs         assembles the website (desktop page + phone version + offline file list) into _site/
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
- `test/official.mjs` plays with the official tileset: map, inventory, targeting, the appearance
  shuffle, and switching back.
- `test/hotkeys.test.mjs` (part of `npm test`) audits the modern key map: no key does two things,
  the action bar and help show the real bindings, NetHack's movement keys are never rebound.
- `test/modern.mjs` checks the modern controls (WASD and diagonals, Space attacks, interact, wait,
  Tab list, action bar, right-click, Ctrl+S) and switching to classic; `test/drag-equip.mjs` wields,
  wears, takes off and puts on rings by dragging in the inventory; `test/inventory-actions.mjs` checks
  the inventory names the action and `Esc` cancels.
- `test/desktop.mjs` (`npm run test:desktop`; on Linux without a display, `xvfb-run -a npm run test:desktop`)
  launches the desktop app, plays, closes the window with the inventory open, checks the save file
  landed on disk, then relaunches and resumes the game.
- `test/mobile.mjs` (`npm run test:mobile`) plays the phone version on an emulated iPhone with
  touch only: tap to step, travel and rest, long press, direction and pick-a-spot taps, word buttons,
  the backpack and quick slots, the action sheet, drag and pinch, and saving on leaving the app and
  resuming on return.
- `test/mobile-fuzz.mjs <url> [steps] [Role] [seed]` plays the phone version with random touches
  (taps, holds, pans, toolbar, action sheets, prompts, menus, backpack, loot) and fails on page errors
  or on any moment the game waits with nothing on screen to answer.
- `test/records.mjs` (desktop and phone) ends a game and finds it in the Hall of Fame, saves one and
  finds its card on the start screen, resumes it with one press and deletes it.
- `test/ios-routing.mjs` builds the iPhone app's bundle and serves it the way Capacitor does (paths
  without a file extension get the front page), checking the game loads without a reload loop.
- `test/ios-bridge.mjs` runs the phone version against a stand-in for the iPhone app's native side:
  saves as files in Documents, saving when the app is paused and resuming after, the save cards, the
  records backup and haptics.
- `test/loot.mjs` opens a chest with `E` on the desktop and from the context button on a phone,
  puts in and takes out in one press, reopens it, cancels, takes everything, forces a locked box, and
  picks up several kinds of things without the "what type" menu.
- `test/settings.mjs` and `test/showcase.mjs` take screenshots of every settings tab and of a
  fully kitted-out debug-mode character.

## License

NetHack is copyright © Stichting Mathematisch Centrum and M. Stephenson and the NetHack DevTeam,
and is distributed under the [NetHack General Public License](https://github.com/NetHack/NetHack/blob/NetHack-5.0.0_Released/dat/license).
The engine in `public/nethack/` is built from the unmodified NetHack 5.0.0 source plus
`engine/nethack-gauntlet.patch`, and `engine/build-engine.sh` rebuilds it. This interface and its
art are distributed under the same license.

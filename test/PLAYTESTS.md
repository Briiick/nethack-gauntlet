# Playtest record

## The 10 playtests

Each run is a real (non-debug) game played through the browser UI by `test/playtest.mjs`: exploring,
fighting, eating, praying, taking the stairs down, and touring the inventory, look, attributes and
settings screens throughout. A "UI check" opens one of those screens and confirms it appeared.

| # | Role | Outcome | Turns | Deepest level | XL | UI checks passed | Problems |
|---|------|---------|------:|------:|---:|---:|---:|
| 1 | Valkyrie | Died on level 6 (a dwarf with a mattock) | 274 | 6 | 2 | 12/12 | 0 |
| 2 | Samurai | Alive (Gnomish Mines) | 426 | 4 | 4 | 34/34 | 0 |
| 3 | Barbarian | Alive (Gnomish Mines) | 573 | 5 | 4 | 34/34 | 0 |
| 4 | Knight | Alive | 1632 | 3 | 3 | 34/34 | 0 |
| 5 | Priest | Died on level 2 (sewer rats) | 428 | 2 | 1 | 10/10 | 0 |
| 6 | Wizard | Alive | 741 | 2 | 1 | 34/34 | 0 |
| 7 | Ranger | Died on level 3 | 719 | 3 | 2 | 33/33 | 0 |
| 8 | Caveman | Alive | 681 | 4 | 2 | 34/34 | 0 |
| 9 | Healer | Alive | 953 | 1 | 1 | 34/34 | 0 |
| 10 | Archeologist | Alive, then **saved, reloaded and resumed** (turn 2194 → 2194) | 2194 | 4 | 2 | 34/34 | 0 |

No console errors in any run. Before these ten, earlier runs (Valkyrie, Samurai and three Knights)
shook out the bugs listed below. The Archeologist was first run while the engulfing bug was still
open, and was rerun after the fix.

## Command coverage

`test/commands.mjs` runs every command in NetHack 5.0's own command table (138 in a debug-mode
game) through the UI: key-bound commands by their key, the rest through the `#` prompt. It
answers whatever each one asks: menus, yes/no, directions, text, positions on the map.

Final run: **138/138 commands OK, 0 problems**. That includes quitting for real and saving for
real, then reloading and resuming. `panic` reports "Unavailable command" because NetHack itself
doesn't offer it in this build. `test/keys.mjs` additionally checks all 30 ways to move and wait
(arrows, `hjklyubn`, numpad, Home/PgUp/End/PgDn, Shift-run, `.`, `s`).

## Bugs found by playtesting, and fixed

1. **Picking a spot on the map was invisible.** Travel, farlook, naming a monster and similar
   prompts showed no cursor. Now there's a gold targeting cursor that the camera follows, and a
   hint bar.
2. **Quitting froze the screen.** NetHack can exit without closing its windows, so the game-over
   screen never appeared. The engine's exit is now hooked directly.
3. **Ctrl+symbol commands couldn't be typed** (for example `^_` retravel). Fixed in the key
   mapping, and Alt keys now go by physical key.
4. **Controls listed `Alt+X` where NetHack means Alt+Shift+X.** Labels now show Alt+Shift.
5. **The game-over screen didn't say how you died.** It now reads NetHack's tombstone and score
   line, falling back to the last attacker, plus the level and turn.
6. **The HUD portrait blanked during fights.** It now keeps the last portrait and crops to the
   sprite.
7. **The banner said "Dungeons of Doom" in the Gnomish Mines.** It now names the branch.
8. **The "remembered unseen monster" marker was an off-style stock tile.** It's now a shadowy
   presence with dim eyes.
9. **Being engulfed broke the UI.** It showed a false "choose a spot" hint and stock tiles. The
   engine now reports the hero's real position, and engulfing draws as a churning wall.
10. **The targeting hint covered the status plate.** It moved to the top of the screen.

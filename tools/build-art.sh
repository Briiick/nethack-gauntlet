#!/usr/bin/env bash
# Regenerate the art: tile map + fallback atlas, item icons and (optionally) monster sprites.
#
#   tools/build-art.sh            # tiles.json, atlas.png, item icons
#   tools/build-art.sh --actors   # ...and re-render all 383 monster sprite sheets (slow: ~1h on 4 cores)
#
# Needs: python3 with numpy and pillow, a C compiler, and a NetHack source tree
# (engine/build-engine.sh clones one to build/NetHack).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=${NETHACK_SRC:-$ROOT/build/NetHack}
[ -d "$SRC" ] || { echo "no NetHack source at $SRC (run engine/build-engine.sh first or set NETHACK_SRC)" >&2; exit 1; }

# glyph -> tile table (src/tile.c) from NetHack's own tilemap tool, built natively
(cd "$SRC/util" && make tilemap && ./tilemap)
python3 "$ROOT/tools/make_atlas.py" "$SRC" "$ROOT/public/assets"

# object table (names, appearances, classes) for the item modeller
cc -I"$SRC/include" -DDLB -DSYSCF -DSECURE "$ROOT/tools/dumpobjs.c" "$SRC/src/objects.o" "$SRC/src/hacklib.a" -o "$ROOT/build/dumpobjs" \
  && "$ROOT/build/dumpobjs" > "$ROOT/tools/sprites3d/objects.json" \
  || echo "could not rebuild objects.json; using the committed copy"

cd "$ROOT/tools/sprites3d"
mkdir -p "$ROOT/public/assets/items"
python3 items.py objects.json "$ROOT/public/assets/items" 48 32 24 18
if [ "${1:-}" = "--actors" ]; then
  python3 batch.py "$SRC" "$ROOT/public/assets/actors"
fi

#!/usr/bin/env bash
# Rebuild the NetHack 5.0 engine as WebAssembly and copy it into public/nethack/.
#
# Needs: git, make, a C compiler and Emscripten (emcc on PATH, e.g. `source emsdk_env.sh`).
# The result is already committed, so you only need this to change the engine.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
SRC=${NETHACK_SRC:-$ROOT/build/NetHack}
TAG=NetHack-5.0.0_Released

command -v emcc >/dev/null || { echo "emcc not found: install Emscripten and source emsdk_env.sh" >&2; exit 1; }
mkdir -p "$(dirname "$SRC")"
[ -d "$SRC/.git" ] || git clone --depth 1 --branch "$TAG" https://github.com/NetHack/NetHack.git "$SRC"
cd "$SRC"
# the patch: browser stubs, an appearance-lookup export for item icons, and wasm link flags
if git apply --check "$ROOT/engine/nethack-gauntlet.patch" 2>/dev/null; then
  git apply "$ROOT/engine/nethack-gauntlet.patch"
fi
(cd sys/unix && sh setup.sh hints/linux.500)
make fetch-lua
make CROSS_TO_WASM=1 -j"$(nproc 2>/dev/null || echo 4)"
cp targets/wasm/nethack.js targets/wasm/nethack.wasm "$ROOT/public/nethack/"
echo "engine copied to public/nethack/"

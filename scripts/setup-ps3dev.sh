#!/usr/bin/env bash
# Prepara $PS3DEV con todo lo que necesita el juego:
#   toolchain PPU/SPU + PSL1GHT + zlib + libpng + jpeg + SDL2 + SDL2_image
# Sigue los mismos pasos que el CI oficial de ps3dev/ps3libraries.
# (QuickJS se compila aparte en scripts/build-quickjs.sh)
set -euo pipefail

: "${PS3DEV:?Defini PS3DEV}"
: "${PSL1GHT:?Defini PSL1GHT}"
PSL1GHT_REF="${PSL1GHT_REF:-master}"
PS3LIBRARIES_REF="${PS3LIBRARIES_REF:-master}"
SDL2_IMAGE_VERSION="${SDL2_IMAGE_VERSION:-2.8.2}"

WORK="${WORK:-$PWD/.ps3work}"
JOBS="$(nproc 2>/dev/null || echo 2)"
mkdir -p "$PS3DEV" "$WORK"
export NO_SAVANNAH=1
export PATH="$PATH:$PS3DEV/bin:$PS3DEV/ppu/bin:$PS3DEV/spu/bin"

log() { printf '\n==== %s ====\n' "$*"; }

# ---------------------------------------------------------------- toolchain
download_toolchain() {
  local url
  if command -v gh >/dev/null 2>&1; then
    url="$(gh api repos/ps3dev/ps3toolchain/releases --jq '
      map(select(.prerelease and (.draft | not)))
      | sort_by(.published_at) | reverse | .[0].assets[]
      | select(.name == "ps3dev-linux-X64.tar.gz")
      | .browser_download_url')" || return 1
  else
    return 1
  fi
  [ -n "$url" ] || return 1
  echo "Bajando toolchain: $url"
  curl -fsSL "$url" -o "$WORK/ps3dev-toolchain.tar.gz" || return 1
  # el tarball trae una carpeta ps3dev/ en la raiz
  tar -xzf "$WORK/ps3dev-toolchain.tar.gz" --strip-components=1 -C "$PS3DEV" || return 1
}

build_toolchain_from_source() {
  echo "No pude bajar el toolchain precompilado: lo compilo desde el codigo (tarda ~1 h)."
  rm -rf "$WORK/ps3toolchain"
  git clone --depth 1 https://github.com/ps3dev/ps3toolchain.git "$WORK/ps3toolchain"
  # BUILD_PS3TOOLCHAIN_ONLY=1: solo compiladores; PSL1GHT y libs van abajo.
  ( cd "$WORK/ps3toolchain" && BUILD_PS3TOOLCHAIN_ONLY=1 ./toolchain.sh )
}

if [ ! -x "$PS3DEV/ppu/bin/powerpc64-ps3-elf-gcc" ]; then
  log "Toolchain PS3"
  download_toolchain || build_toolchain_from_source
fi
command -v powerpc64-ps3-elf-gcc >/dev/null || { echo "ERROR: no encuentro powerpc64-ps3-elf-gcc"; exit 1; }
powerpc64-ps3-elf-gcc --version | head -1

# ----------------------------------------------------------------- PSL1GHT
log "PSL1GHT ($PSL1GHT_REF)"
rm -rf "$WORK/PSL1GHT"
git clone https://github.com/ps3dev/PSL1GHT.git "$WORK/PSL1GHT"
git -C "$WORK/PSL1GHT" checkout --quiet "$PSL1GHT_REF"
( cd "$WORK/PSL1GHT" \
  && make -j"$JOBS" install-ctrl \
  && make -j"$JOBS" \
  && make -j"$JOBS" install )

# ------------------------------------------------------------ ps3libraries
log "ps3libraries ($PS3LIBRARIES_REF): zlib, libpng, jpeg, SDL2"
rm -rf "$WORK/ps3libraries"
git clone https://github.com/ps3dev/ps3libraries.git "$WORK/ps3libraries"
git -C "$WORK/ps3libraries" checkout --quiet "$PS3LIBRARIES_REF"
( cd "$WORK/ps3libraries" && ./libraries.sh 001 002 003 014 )   # zlib libpng jpeg sdl2_psl1ght

# --------------------------------------------------------------- SDL2_image
# Mismo procedimiento que el paso 006 de humbertodias/SDL2_PSL1GHT_Libs
# (lo que corre ps3libraries en su script 040), pero solo SDL2_image.
log "SDL2_image $SDL2_IMAGE_VERSION"
PORTLIBS="$PS3DEV/portlibs/ppu"
IMG="$WORK/SDL2_image"
rm -rf "$IMG" && mkdir -p "$IMG"
curl -fsSL "https://github.com/libsdl-org/SDL_image/releases/download/release-$SDL2_IMAGE_VERSION/SDL2_image-$SDL2_IMAGE_VERSION.tar.gz" \
  | tar -xz --strip-components=1 -C "$IMG"
cp "$WORK/ps3libraries/config/config.guess" "$WORK/ps3libraries/config/config.sub" "$IMG/"
(
  cd "$IMG"
  export PKG_CONFIG_LIBDIR="$PORTLIBS/lib/pkgconfig"
  export PKG_CONFIG_PATH="$PORTLIBS/lib/pkgconfig"
  export CFLAGS="-I$PORTLIBS/include -I$PORTLIBS/include/SDL2"
  export LDFLAGS="-L$PS3DEV/ppu/lib -L$PORTLIBS/lib -lrt -llv2"
  ./configure --prefix="$PORTLIBS" --host=powerpc64-ps3-elf \
    --disable-sdltest \
    --with-sdl-exec-prefix="$PORTLIBS" \
    --disable-shared --enable-static \
    --disable-tif --disable-webp \
    SDL_CFLAGS="$("$PORTLIBS/bin/sdl2-config" --cflags)" \
    LIBPNG_CFLAGS="$("$PORTLIBS/bin/libpng-config" --cflags)" \
    LIBPNG_LIBS="$("$PORTLIBS/bin/libpng-config" --libs)"
  make -j"$JOBS"
  make install
)

# ------------------------------------------------------------ verificacion
log "Verificando"
missing=0
for f in \
  "$PS3DEV/ppu_rules" "$PS3DEV/base_rules" "$PS3DEV/bin/sfo.xml" \
  "$PS3DEV/bin/make_self_npdrm" "$PS3DEV/bin/package_finalize" \
  "$PORTLIBS/lib/libSDL2.a" "$PORTLIBS/lib/libSDL2_image.a" \
  "$PORTLIBS/lib/libpng.a" "$PORTLIBS/lib/libjpeg.a" "$PORTLIBS/lib/libz.a" \
  "$PORTLIBS/include/SDL2/SDL.h" "$PORTLIBS/include/SDL2/SDL_image.h"
do
  if [ -e "$f" ]; then echo "ok      $f"; else echo "FALTA   $f"; missing=1; fi
done
for t in pkg sfo fself make_self sprxlinker; do
  command -v "$t" >/dev/null && echo "ok      herramienta $t" || { echo "FALTA   herramienta $t"; missing=1; }
done
[ "$missing" -eq 0 ] || { echo "ERROR: faltan archivos del SDK (ver arriba)"; exit 1; }
echo "ps3dev listo en $PS3DEV"

#!/usr/bin/env bash
# Compila QuickJS (motor JavaScript de Fabrice Bellard) para PS3 (PPU) e instala
#   $PS3DEV/portlibs/ppu/lib/libquickjs.a
#   $PS3DEV/portlibs/ppu/include/quickjs/quickjs.h
# ps3libraries no trae QuickJS, asi que se compila a mano. Solo el motor:
# main.c no usa quickjs-libc.
set -euo pipefail

: "${PS3DEV:?Defini PS3DEV}"
: "${PSL1GHT:?Defini PSL1GHT}"
QUICKJS_REF="${QUICKJS_REF:-3d5e064e9dd67c70f7962836505a7fa067bf0a4e}"   # release 2026-06-04

WORK="${WORK:-$PWD/.ps3work}"
PORTLIBS="$PS3DEV/portlibs/ppu"
export PATH="$PATH:$PS3DEV/bin:$PS3DEV/ppu/bin"

CC=powerpc64-ps3-elf-gcc
AR=powerpc64-ps3-elf-ar
RANLIB=powerpc64-ps3-elf-ranlib

rm -rf "$WORK/quickjs"
mkdir -p "$WORK"
git clone https://github.com/bellard/quickjs.git "$WORK/quickjs"
cd "$WORK/quickjs"
git checkout --quiet "$QUICKJS_REF"
VERSION="$(cat VERSION)"
echo "QuickJS $VERSION"

# Parches a quickjs.c (cada uno verifica que el bloque exista exactamente una vez):
#  1) Atomics usa pthreads y se activa en todo lo que no sea emscripten:
#     en PS3 lo apagamos con -DQJS_NO_ATOMICS.
#  2) newlib no tiene malloc_usable_size; QuickJS lo usa solo para estadisticas
#     de memoria y su propio comentario dice de cambiarlo por "return 0;".
python3 - <<'PY'
import sys
p = "quickjs.c"
s = open(p, encoding="utf-8").read()
patches = [
    ("#if !defined(__EMSCRIPTEN__)\n#define CONFIG_ATOMICS\n#endif",
     "#if !defined(__EMSCRIPTEN__) && !defined(QJS_NO_ATOMICS)\n#define CONFIG_ATOMICS\n#endif"),
    ("#else\n    /* change this to `return 0;` if compilation fails */\n    return malloc_usable_size((void *)ptr);\n#endif",
     "#else\n    return 0;\n#endif"),
]
for old, new in patches:
    if s.count(old) != 1:
        sys.exit("ERROR: no encontre un bloque a parchear en quickjs.c (cambio la version?):\n" + old)
    s = s.replace(old, new)
open(p, "w", encoding="utf-8").write(s)
PY
grep -q QJS_NO_ATOMICS quickjs.c

CFLAGS=(-O2 -mcpu=cell -mhard-float -fmodulo-sched -ffunction-sections -fdata-sections
        -Wall -Wno-array-bounds -Wno-format-truncation -fwrapv
        -D_GNU_SOURCE "-DCONFIG_VERSION=\"$VERSION\""
        -DQJS_NO_ATOMICS
        -I"$PSL1GHT/ppu/include")

# fenv.h solo se incluye (no se usa nada de el); si newlib no lo trae, dejo uno vacio.
if ! echo '#include <fenv.h>' | $CC -E -x c - >/dev/null 2>&1; then
  echo "newlib sin fenv.h: uso uno vacio"
  mkdir -p "$WORK/compat"
  printf '#ifndef QJS_COMPAT_FENV_H\n#define QJS_COMPAT_FENV_H\n#endif\n' > "$WORK/compat/fenv.h"
  CFLAGS+=(-I"$WORK/compat")
fi

OBJS=()
for f in quickjs dtoa libregexp libunicode cutils; do
  echo "CC $f.c"
  $CC "${CFLAGS[@]}" -c "$f.c" -o "$f.o"
  OBJS+=("$f.o")
done

rm -f libquickjs.a
$AR rcs libquickjs.a "${OBJS[@]}"
$RANLIB libquickjs.a

mkdir -p "$PORTLIBS/lib" "$PORTLIBS/include/quickjs"
cp libquickjs.a "$PORTLIBS/lib/"
cp quickjs.h "$PORTLIBS/include/quickjs/"
echo "QuickJS $VERSION instalado en $PORTLIBS"

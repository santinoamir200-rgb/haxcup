# HaxCup para PS3

HaxCup (juego HTML de torneos de futbol de discos) corriendo en PS3 con un runtime
propio: **QuickJS** ejecuta el JS, **SDL2** dibuja a 1280x720 y el mando se lee con
`libio`. Este repo compila todo en GitHub Actions y deja el `.pkg` listo.

## Como obtener el .pkg

1. Subi este repo a GitHub (rama `main`). Si es **publico**, las Actions son gratis e ilimitadas.
2. Ve a la pestana **Actions** → workflow **Build PS3 PKG**. Corre solo con cada push;
   tambien podes lanzarlo a mano con **Run workflow**.
3. Cuando termina, el `.pkg` aparece en **Releases** (a la derecha del repo) y como
   artefacto del workflow.

> La **primera corrida tarda 30-60 min** (compila SDL2 y QuickJS para PS3). Se guarda en
> cache y las siguientes tardan unos minutos.

## Que archivo instalar

- `subasta-cuartos-v5.gnpdrm.pkg`: el finalizado. Probalo primero.
- `subasta-cuartos-v5.pkg`: sin finalizar. Si la consola no acepta el anterior.

Se instalan como cualquier PKG (copiarlo por USB e **Install Package Files**), en una PS3
con CFW/HEN. Queda como "HaxCup" (`APPID SUBA00001`) y lee sus archivos de
`/dev_hdd0/game/SUBA00001/USRDIR/`.

## Estructura

| Ruta | Que es |
|---|---|
| `source/main.c` | Runtime: QuickJS + SDL2 + mando (sin cambios respecto al zip original) |
| `assets/` | `game.js` (HaxCup), `shim.js` (simula navegador), `meta.json`, `controls.json` |
| `ICON0.PNG` | Icono del menu de la PS3 |
| `Makefile` | Usa las reglas estandar de PSL1GHT (`make`, `make pkg`) |
| `scripts/setup-ps3dev.sh` | Toolchain, PSL1GHT, zlib, libpng, jpeg, SDL2, SDL2_image |
| `scripts/build-quickjs.sh` | Compila QuickJS 2026-06-04 para PS3 (con 2 parches chicos, ver el script) |
| `.github/workflows/build-pkg.yml` | El workflow |

## Cambiar controles

Editar `assets/controls.json` (boton de PS3 → tecla del juego) y hacer push.

## Compilar en tu maquina (opcional)

Con ps3toolchain + PSL1GHT + SDL2 instalados y `PS3DEV`/`PSL1GHT` definidos:
`bash scripts/build-quickjs.sh && make pkg`.

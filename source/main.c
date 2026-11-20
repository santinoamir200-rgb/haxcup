/* Runtime html2ps3: QuickJS + SDL2 + libio (pad). v3: log a USRDIR/log.txt, pantalla de carga, menos memoria al cargar. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdarg.h>
#include <SDL2/SDL.h>
#include <SDL2/SDL_image.h>
#include <sysutil/sysutil.h>
#include <io/pad.h>
#include "quickjs.h"

#ifndef APPID
#define APPID "HOMEBREW1"
#endif
#ifndef BASEDIR
#define BASEDIR "/dev_hdd0/game/" APPID "/USRDIR/"
#endif

static SDL_Window *W;
static SDL_Renderer *R;
static SDL_Texture *TX[4096];
static int NT = 0;
static int running = 1;
static FILE *logf_ = NULL;

/* imprime en consola y en USRDIR/log.txt (se reescribe en cada arranque); fflush siempre
   para que, si la consola se cuelga, el log tenga hasta el ultimo paso */
static void lg(const char *fmt, ...) {
    char buf[1024];
    va_list ap; va_start(ap, fmt);
    vsnprintf(buf, sizeof buf, fmt, ap);
    va_end(ap);
    printf("%s\n", buf); fflush(stdout);
    if (logf_) { fprintf(logf_, "%s\n", buf); fflush(logf_); }
}

static double D(JSContext *c, JSValueConst v) { double d = 0; JS_ToFloat64(c, &d, v); return d; }

static char *fullpath(const char *p, char *buf, size_t n) {
    if (!p || strstr(p, "..")) return NULL;
    snprintf(buf, n, "%s%s", BASEDIR, p);
    return buf;
}

static unsigned char *slurp(const char *rel, size_t *len) {
    char path[512];
    if (!fullpath(rel, path, sizeof path)) return NULL;
    FILE *f = fopen(path, "rb");
    if (!f) return NULL;
    fseek(f, 0, SEEK_END); long n = ftell(f); fseek(f, 0, SEEK_SET);
    unsigned char *b = malloc(n > 0 ? (size_t)n + 1 : 1);
    if (!b) { fclose(f); return NULL; }
    *len = fread(b, 1, n, f);
    b[*len] = 0;
    fclose(f);
    return b;
}

static JSValue n_log(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    const char *s = JS_ToCString(c, argv[0]);
    if (s) { lg("[js] %s", s); JS_FreeCString(c, s); }
    return JS_UNDEFINED;
}

static JSValue n_readFile(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    const char *p = JS_ToCString(c, argv[0]);
    size_t n = 0; unsigned char *b = p ? slurp(p, &n) : NULL;
    if (p) JS_FreeCString(c, p);
    if (!b) return JS_NULL;
    JSValue v = JS_NewStringLen(c, (const char *)b, n);
    free(b);
    return v;
}

static JSValue n_readFileBytes(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    const char *p = JS_ToCString(c, argv[0]);
    size_t n = 0; unsigned char *b = p ? slurp(p, &n) : NULL;
    if (p) JS_FreeCString(c, p);
    if (!b) return JS_NULL;
    JSValue v = JS_NewArrayBufferCopy(c, b, n);
    free(b);
    return v;
}

static JSValue n_writeFile(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    const char *p = JS_ToCString(c, argv[0]);
    const char *s = JS_ToCString(c, argv[1]);
    char path[512];
    if (p && s && fullpath(p, path, sizeof path)) {
        FILE *f = fopen(path, "wb");
        if (f) { fwrite(s, 1, strlen(s), f); fclose(f); }
    }
    if (p) JS_FreeCString(c, p);
    if (s) JS_FreeCString(c, s);
    return JS_UNDEFINED;
}

static JSValue n_setSize(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    SDL_RenderSetLogicalSize(R, (int)D(c, argv[0]), (int)D(c, argv[1]));
    return JS_UNDEFINED;
}

static SDL_Rect mkrect(double x, double y, double w, double h) {
    if (w < 0) { x += w; w = -w; }
    if (h < 0) { y += h; h = -h; }
    SDL_Rect r = { (int)(x + 0.5), (int)(y + 0.5), (int)(w + 0.5), (int)(h + 0.5) };
    if (r.w < 1 && w > 0) r.w = 1;
    if (r.h < 1 && h > 0) r.h = 1;
    return r;
}

/* fillRect(r,g,b,a, x,y,w,h) */
static JSValue n_fillRect(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    double a = D(c, argv[3]);
    SDL_SetRenderDrawBlendMode(R, SDL_BLENDMODE_BLEND);
    SDL_SetRenderDrawColor(R, (Uint8)D(c, argv[0]), (Uint8)D(c, argv[1]), (Uint8)D(c, argv[2]),
                           (Uint8)(a < 0 ? 0 : a > 1 ? 255 : a * 255));
    SDL_Rect r = mkrect(D(c, argv[4]), D(c, argv[5]), D(c, argv[6]), D(c, argv[7]));
    SDL_RenderFillRect(R, &r);
    return JS_UNDEFINED;
}

/* clearRect(x,y,w,h): pinta negro opaco */
static JSValue n_clearRect(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    SDL_SetRenderDrawBlendMode(R, SDL_BLENDMODE_NONE);
    SDL_SetRenderDrawColor(R, 0, 0, 0, 255);
    SDL_Rect r = mkrect(D(c, argv[0]), D(c, argv[1]), D(c, argv[2]), D(c, argv[3]));
    SDL_RenderFillRect(R, &r);
    return JS_UNDEFINED;
}

/* loadImage(ArrayBuffer) -> [id,w,h] | null */
static JSValue n_loadImage(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    size_t sz; uint8_t *p = JS_GetArrayBuffer(c, &sz, argv[0]);
    if (!p || NT >= 4096) return JS_NULL;
    SDL_Texture *tx = IMG_LoadTexture_RW(R, SDL_RWFromConstMem(p, (int)sz), 1);
    if (!tx) return JS_NULL;
    SDL_SetTextureBlendMode(tx, SDL_BLENDMODE_BLEND);
    int w, h; SDL_QueryTexture(tx, NULL, NULL, &w, &h);
    TX[NT] = tx;
    JSValue arr = JS_NewArray(c);
    JS_SetPropertyUint32(c, arr, 0, JS_NewInt32(c, NT));
    JS_SetPropertyUint32(c, arr, 1, JS_NewInt32(c, w));
    JS_SetPropertyUint32(c, arr, 2, JS_NewInt32(c, h));
    NT++;
    return arr;
}

/* drawImage(id, sx,sy,sw,sh, dx,dy,dw,dh, alpha) */
static JSValue n_drawImage(JSContext *c, JSValueConst t, int argc, JSValueConst *argv) {
    int id = (int)D(c, argv[0]);
    if (id < 0 || id >= NT) return JS_UNDEFINED;
    SDL_Rect s = { (int)D(c, argv[1]), (int)D(c, argv[2]), (int)D(c, argv[3]), (int)D(c, argv[4]) };
    double dw = D(c, argv[7]), dh = D(c, argv[8]);
    int flip = SDL_FLIP_NONE;
    SDL_Rect d = mkrect(D(c, argv[5]), D(c, argv[6]), dw, dh);
    if (dw < 0) flip |= SDL_FLIP_HORIZONTAL;
    if (dh < 0) flip |= SDL_FLIP_VERTICAL;
    double a = D(c, argv[9]);
    SDL_SetTextureAlphaMod(TX[id], (Uint8)(a < 0 ? 0 : a > 1 ? 255 : a * 255));
    SDL_RenderCopyEx(R, TX[id], &s, &d, 0, NULL, (SDL_RendererFlip)flip);
    return JS_UNDEFINED;
}

static void sysutil_cb(u64 status, u64 param, void *user) {
    (void)param; (void)user;
    if (status == SYSUTIL_EXIT_GAME) running = 0;
}

/* bits: up0 down1 left2 right3 cross4 circle5 square6 triangle7 l1 8 r1 9 l2 10 r2 11 l3 12 r3 13 start14 select15 */
static int pad_mask(void) {
    padInfo pi; padData pd; int m = 0;
    ioPadGetInfo(&pi);
    if (!pi.status[0]) return 0;
    ioPadGetData(0, &pd);
    if (pd.BTN_UP) m |= 1;       if (pd.BTN_DOWN) m |= 2;
    if (pd.BTN_LEFT) m |= 4;     if (pd.BTN_RIGHT) m |= 8;
    if (pd.BTN_CROSS) m |= 16;   if (pd.BTN_CIRCLE) m |= 32;
    if (pd.BTN_SQUARE) m |= 64;  if (pd.BTN_TRIANGLE) m |= 128;
    if (pd.BTN_L1) m |= 256;     if (pd.BTN_R1) m |= 512;
    if (pd.BTN_L2) m |= 1024;    if (pd.BTN_R2) m |= 2048;
    if (pd.BTN_L3) m |= 4096;    if (pd.BTN_R3) m |= 8192;
    if (pd.BTN_START) m |= 16384; if (pd.BTN_SELECT) m |= 32768;
    if (pd.ANA_L_H < 64) m |= 4;  if (pd.ANA_L_H > 192) m |= 8;
    if (pd.ANA_L_V < 64) m |= 1;  if (pd.ANA_L_V > 192) m |= 2;
    return m;
}

static void dump_exc(JSContext *c) {
    JSValue ex = JS_GetException(c);
    const char *s = JS_ToCString(c, ex);
    lg("[js] EXCEPCION: %s", s ? s : "?");
    if (s) JS_FreeCString(c, s);
    JSValue st = JS_GetPropertyStr(c, ex, "stack");
    if (!JS_IsUndefined(st)) {
        const char *ss = JS_ToCString(c, st);
        if (ss) { lg("%s", ss); JS_FreeCString(c, ss); }
    }
    JS_FreeValue(c, st); JS_FreeValue(c, ex);
}

/* pantalla de carga: se presenta dos veces porque SDL usa doble buffer.
   Mientras se parsea game.js (3,4 MB) la consola no puede dibujar, asi que se ve esto */
static void splash(int pct) {
    int i;
    if (!R) return;
    for (i = 0; i < 2; i++) {
        SDL_SetRenderDrawBlendMode(R, SDL_BLENDMODE_NONE);
        SDL_SetRenderDrawColor(R, 10, 25, 21, 255);
        SDL_RenderClear(R);
        SDL_SetRenderDrawColor(R, 0, 179, 107, 255);
        SDL_Rect top = { 0, 0, 1280, 8 };
        SDL_RenderFillRect(R, &top);
        SDL_SetRenderDrawColor(R, 34, 46, 42, 255);
        SDL_Rect bar = { 340, 340, 600, 24 };
        SDL_RenderFillRect(R, &bar);
        SDL_SetRenderDrawColor(R, 0, 179, 107, 255);
        SDL_Rect fill = { 344, 344, (592 * pct) / 100, 16 };
        SDL_RenderFillRect(R, &fill);
        SDL_RenderPresent(R);
    }
    sysUtilCheckCallback();
}

static int run_file(JSContext *c, const char *rel) {
    size_t n = 0; unsigned char *src = slurp(rel, &n);
    if (!src) { lg("[js] no encuentro %s", rel); return -1; }
    lg("[js] cargando %s (%lu bytes)", rel, (unsigned long)n);
    JSValue v = JS_Eval(c, (const char *)src, n, rel, JS_EVAL_TYPE_GLOBAL);
    free(src);
    int bad = JS_IsException(v);
    if (bad) dump_exc(c);
    JS_FreeValue(c, v);
    lg("[js] %s listo (%s)", rel, bad ? "CON ERROR" : "ok");
    return bad ? -1 : 0;
}

#define REG(name, fn, nargs) JS_SetPropertyStr(ctx, nat, name, JS_NewCFunction(ctx, fn, name, nargs))

int main(void) {
    char lp[512];
    if (fullpath("log.txt", lp, sizeof lp)) logf_ = fopen(lp, "w");
    lg("[boot] HaxCup runtime v3");
    if (SDL_Init(SDL_INIT_VIDEO | SDL_INIT_TIMER) < 0) { lg("[boot] SDL_Init fallo"); return 1; }
    lg("[boot] SDL_Init ok");
    IMG_Init(IMG_INIT_PNG | IMG_INIT_JPG);
    W = SDL_CreateWindow("game", 0, 0, 1280, 720, 0);
    if (!W) lg("[boot] SDL_CreateWindow fallo");
    R = SDL_CreateRenderer(W, -1, SDL_RENDERER_PRESENTVSYNC);
    if (!R) { lg("[boot] renderer con vsync fallo, pruebo sin flags"); R = SDL_CreateRenderer(W, -1, 0); }
    if (!R) { lg("[boot] no hay renderer, salgo"); return 1; }
    SDL_RenderSetLogicalSize(R, 1280, 720);
    sysUtilRegisterCallback(0, sysutil_cb, NULL);
    ioPadInit(7);
    lg("[boot] video y pad ok");
    splash(10);

    JSRuntime *rt = JS_NewRuntime();
    JSContext *ctx = JS_NewContext(rt);
    JSValue global = JS_GetGlobalObject(ctx);
    JSValue nat = JS_NewObject(ctx);
    REG("log", n_log, 1);           REG("readFile", n_readFile, 1);
    REG("readFileBytes", n_readFileBytes, 1); REG("writeFile", n_writeFile, 2);
    REG("setSize", n_setSize, 2);   REG("fillRect", n_fillRect, 8);
    REG("clearRect", n_clearRect, 4); REG("loadImage", n_loadImage, 1);
    REG("drawImage", n_drawImage, 10);
    JS_SetPropertyStr(ctx, global, "__native", nat);
    lg("[boot] quickjs ok");
    splash(25);

    int shim_ok = (run_file(ctx, "shim.js") == 0);
    splash(40);
    if (shim_ok) {
        splash(50);   /* lo ultimo que se ve mientras se parsea game.js: puede tardar varios segundos */
        run_file(ctx, "game.js");
        splash(90);
        JSValue boot = JS_GetPropertyStr(ctx, global, "__boot");
        lg("[boot] llamando __boot");
        JSValue r = JS_Call(ctx, boot, JS_UNDEFINED, 0, NULL);
        if (JS_IsException(r)) dump_exc(ctx);
        JS_FreeValue(ctx, r); JS_FreeValue(ctx, boot);
        { JSContext *c1; while (JS_ExecutePendingJob(rt, &c1) > 0) {} }
        lg("[boot] __boot listo");
    }
    JSValue frame = JS_GetPropertyStr(ctx, global, "__frame");
    int have_frame = JS_IsFunction(ctx, frame);
    if (!have_frame) lg("[boot] no hay __frame: el shim no cargo bien (mira el error de arriba)");
    lg("[boot] entrando al bucle");
    unsigned long nf = 0, acc = 0;
    while (running) {
        sysUtilCheckCallback();
        if (have_frame) {
            Uint32 t0 = SDL_GetTicks();
            JSValue args[2] = { JS_NewFloat64(ctx, (double)t0), JS_NewInt32(ctx, pad_mask()) };
            JSValue r = JS_Call(ctx, frame, JS_UNDEFINED, 2, args);
            if (JS_IsException(r)) dump_exc(ctx);
            JS_FreeValue(ctx, r);
            JSContext *c1;
            int guard = 0;
            while (JS_ExecutePendingJob(rt, &c1) > 0 && ++guard < 10000) {}
            acc += SDL_GetTicks() - t0;
            nf++;
            if (nf <= 3 || nf % 300 == 0) { lg("[frame] #%lu, %lu ms de JS promedio", nf, acc / nf); }
        } else {
            SDL_SetRenderDrawColor(R, 120, 20, 20, 255);
            SDL_RenderClear(R);
        }
        SDL_RenderPresent(R);
        SDL_Delay(1);
    }
    lg("[boot] saliendo");
    if (logf_) fclose(logf_);
    JS_FreeValue(ctx, frame); JS_FreeValue(ctx, global);
    SDL_Quit();
    return 0;
}

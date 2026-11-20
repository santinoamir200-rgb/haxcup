(function (g) {
'use strict';
var N = g.__native;
var BTN = ['up','down','left','right','cross','circle','square','triangle','l1','r1','l2','r2','l3','r3','start','select'];
var DEFAULT_MAP = {up:'ArrowUp',down:'ArrowDown',left:'ArrowLeft',right:'ArrowRight',cross:'z',circle:'x',square:'c',triangle:'v',l1:'a',r1:'s',l2:'q',r2:'w',start:'Enter',select:'Escape'};
function J(p) { var s = N.readFile(p); if (!s) return null; try { return JSON.parse(s); } catch (e) { return null; } }
var META = { canvasId: '', width: 1280, height: 720, title: '' };
var mj = J('meta.json'); if (mj) for (var mk in mj) META[mk] = mj[mk];
var cj = J('controls.json');
var MAP = (cj && cj.map) ? cj.map : DEFAULT_MAP;

var now = 0;
g.window = g; g.self = g;
g.console = { log: function () { N.log(Array.prototype.join.call(arguments, ' ')); } };
g.console.warn = g.console.error = g.console.info = g.console.debug = g.console.log;
g.performance = { now: function () { return now; } };
var warned = {};
function unsup(n) { if (!warned[n]) { warned[n] = 1; g.console.log('[ps3html] no soportado todavia: ' + n); } }

/* ---------- eventos ---------- */
function Target() {
  var L = {};
  this.addEventListener = function (t, f) { (L[t] = L[t] || []).push(f); };
  this.removeEventListener = function (t, f) { var a = L[t]; if (a) { var i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } };
  this.dispatchEvent = function (ev) { this.__fire(ev.type, ev); return true; };
  this.__fire = function (t, ev) {
    var self = this, a = L[t];
    if (a) a.slice().forEach(function (f) { try { f.call(self, ev); } catch (e) { g.console.log('ERR ' + t + ': ' + (e && e.stack || e)); } });
    var h = self['on' + t];
    if (typeof h === 'function') { try { h.call(self, ev); } catch (e) { g.console.log('ERR on' + t + ': ' + (e && e.stack || e)); } }
  };
}
Target.call(g);

/* ---------- elementos ---------- */
var mainCanvas = null;
function Stub(tag) {
  Target.call(this);
  this.tagName = String(tag || 'div').toUpperCase();
  this.style = {}; this.children = []; this.dataset = {};
  this.innerHTML = ''; this.textContent = ''; this.className = '';
  this.classList = { add: function () {}, remove: function () {}, toggle: function () {}, contains: function () { return false; } };
}
Stub.prototype.appendChild = function (c) {
  this.children.push(c);
  if (c && c.__isCanvas && !mainCanvas) setMain(c);
  return c;
};
Stub.prototype.removeChild = Stub.prototype.setAttribute = Stub.prototype.focus = Stub.prototype.blur = Stub.prototype.remove = function () {};
Stub.prototype.getAttribute = function () { return null; };
Stub.prototype.querySelector = function () { return null; };
Stub.prototype.querySelectorAll = function () { return []; };
Stub.prototype.requestFullscreen = function () { return Promise.resolve(); };

function setMain(c) { mainCanvas = c; c.__main = true; N.setSize(c.__w, c.__h); }

function Canvas() { Stub.call(this, 'canvas'); this.__isCanvas = true; this.__w = 300; this.__h = 150; this.__ctx = null; }
Canvas.prototype = Object.create(Stub.prototype);
['width', 'clientWidth', 'offsetWidth'].forEach(function (p) {
  Object.defineProperty(Canvas.prototype, p, {
    get: function () { return this.__w; },
    set: function (v) { if (p === 'width') { this.__w = v | 0; if (this.__main) N.setSize(this.__w, this.__h); } }
  });
});
['height', 'clientHeight', 'offsetHeight'].forEach(function (p) {
  Object.defineProperty(Canvas.prototype, p, {
    get: function () { return this.__h; },
    set: function (v) { if (p === 'height') { this.__h = v | 0; if (this.__main) N.setSize(this.__w, this.__h); } }
  });
});
Canvas.prototype.getContext = function (t) {
  if (t === '2d') return this.__ctx || (this.__ctx = new Ctx(this));
  unsup('getContext(' + t + ')'); return null;
};
Canvas.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, x: 0, y: 0, width: this.__w, height: this.__h, right: this.__w, bottom: this.__h }; };
Canvas.prototype.toDataURL = function () { return ''; };

/* ---------- imagenes ---------- */
var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', BM = {};
for (var bi = 0; bi < 64; bi++) BM[B64.charAt(bi)] = bi;
function b64dec(s) {
  s = s.replace(/[^A-Za-z0-9+\/]/g, '');
  var n = Math.floor(s.length * 3 / 4), u = new Uint8Array(n), p = 0;
  for (var i = 0; i < s.length; i += 4) {
    var a = BM[s[i]] || 0, b = BM[s[i + 1]] || 0;
    var c = i + 2 < s.length ? BM[s[i + 2]] : -1, d = i + 3 < s.length ? BM[s[i + 3]] : -1;
    u[p++] = (a << 2) | (b >> 4);
    if (c >= 0) u[p++] = ((b & 15) << 4) | (c >> 2);
    if (d >= 0) u[p++] = ((c & 3) << 6) | d;
  }
  return u.buffer.slice(0, p);
}
function Img() { Target.call(this); this.width = 0; this.height = 0; this.complete = false; this.__id = -1; this.__src = ''; }
Object.defineProperty(Img.prototype, 'src', {
  get: function () { return this.__src; },
  set: function (v) { var self = this; this.__src = String(v); g.setTimeout(function () { loadImg(self, self.__src); }, 0); }
});
Img.prototype.decode = function () { return Promise.resolve(); };
function loadImg(img, v) {
  var buf = null;
  if (v.indexOf('data:') === 0) {
    var ix = v.indexOf(',');
    if (ix > 0 && v.slice(5, ix).indexOf('base64') >= 0) buf = b64dec(v.slice(ix + 1));
  } else if (v) {
    buf = N.readFileBytes(v.replace(/^\.?\//, ''));
  }
  var r = buf ? N.loadImage(buf) : null;
  if (r) { img.__id = r[0]; img.width = r[1]; img.height = r[2]; img.naturalWidth = r[1]; img.naturalHeight = r[2]; img.complete = true; img.__fire('load', { target: img, type: 'load' }); }
  else { g.console.log('[ps3html] no pude cargar imagen: ' + (v.length > 60 ? v.slice(0, 60) + '...' : v)); img.__fire('error', { target: img, type: 'error' }); }
}
g.Image = Img;

/* ---------- contexto 2D ---------- */
var NAMED = { black:[0,0,0], white:[255,255,255], red:[255,0,0], green:[0,128,0], blue:[0,0,255], yellow:[255,255,0], gray:[128,128,128], grey:[128,128,128], orange:[255,165,0], purple:[128,0,128], cyan:[0,255,255], magenta:[255,0,255], lime:[0,255,0], pink:[255,192,203], brown:[165,42,42] };
function parseColor(s) {
  if (typeof s !== 'string') return null;
  s = s.trim().toLowerCase();
  var m;
  if (s.charAt(0) === '#') {
    if (s.length === 4) return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16), 1];
    if (s.length >= 7) return [parseInt(s.substr(1, 2), 16), parseInt(s.substr(3, 2), 16), parseInt(s.substr(5, 2), 16), s.length === 9 ? parseInt(s.substr(7, 2), 16) / 255 : 1];
  }
  m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) { var p = m[1].split(',').map(parseFloat); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
  if (s === 'transparent') return [0, 0, 0, 0];
  if (NAMED[s]) return NAMED[s].concat(1);
  return null;
}
function Ctx(cv) {
  this.canvas = cv;
  this.__s = { tx: 0, ty: 0, sx: 1, sy: 1, a: 1, fill: [0, 0, 0, 1], stroke: [0, 0, 0, 1], fs: '#000000', ss: '#000000' };
  this.__st = []; this.__rects = []; this.lineWidth = 1;
}
var CP = Ctx.prototype;
Object.defineProperty(CP, 'fillStyle', { get: function () { return this.__s.fs; }, set: function (v) { var c = parseColor(v); if (c) { this.__s.fill = c; this.__s.fs = v; } else unsup('fillStyle no-color'); } });
Object.defineProperty(CP, 'strokeStyle', { get: function () { return this.__s.ss; }, set: function (v) { var c = parseColor(v); if (c) { this.__s.stroke = c; this.__s.ss = v; } else unsup('strokeStyle no-color'); } });
Object.defineProperty(CP, 'globalAlpha', { get: function () { return this.__s.a; }, set: function (v) { this.__s.a = +v; } });
CP.save = function () { this.__st.push(JSON.parse(JSON.stringify(this.__s))); };
CP.restore = function () { var s = this.__st.pop(); if (s) this.__s = s; };
CP.translate = function (x, y) { var s = this.__s; s.tx += x * s.sx; s.ty += y * s.sy; };
CP.scale = function (x, y) { var s = this.__s; s.sx *= x; s.sy *= y; };
CP.setTransform = function (a, b, c, d, e, f) { var s = this.__s; s.sx = a; s.sy = d; s.tx = e; s.ty = f; };
CP.resetTransform = function () { var s = this.__s; s.sx = 1; s.sy = 1; s.tx = 0; s.ty = 0; };
CP.transform = function (a, b, c, d, e, f) { var s = this.__s; s.tx += e * s.sx; s.ty += f * s.sy; s.sx *= a; s.sy *= d; };
CP.rotate = function () { unsup('rotate'); };
CP.__ok = function () { if (!this.canvas.__main) { unsup('canvas fuera de pantalla'); return false; } return true; };
CP.__fr = function (col, x, y, w, h) {
  var s = this.__s;
  N.fillRect(col[0], col[1], col[2], col[3] * s.a, s.tx + x * s.sx, s.ty + y * s.sy, w * s.sx, h * s.sy);
};
CP.fillRect = function (x, y, w, h) { if (this.__ok()) this.__fr(this.__s.fill, x, y, w, h); };
CP.strokeRect = function (x, y, w, h) {
  if (!this.__ok()) return;
  var c = this.__s.stroke, t = this.lineWidth || 1;
  this.__fr(c, x, y, w, t); this.__fr(c, x, y + h - t, w, t); this.__fr(c, x, y, t, h); this.__fr(c, x + w - t, y, t, h);
};
CP.clearRect = function (x, y, w, h) {
  if (!this.__ok()) return;
  var s = this.__s; N.clearRect(s.tx + x * s.sx, s.ty + y * s.sy, w * s.sx, h * s.sy);
};
CP.drawImage = function (im) {
  if (!this.__ok()) return;
  if (!im || im.__id === undefined || im.__id < 0) { if (im && im.__isCanvas) unsup('drawImage(canvas)'); return; }
  var a = arguments, s = this.__s, sx, sy, sw, sh, dx, dy, dw, dh;
  if (a.length >= 9) { sx = a[1]; sy = a[2]; sw = a[3]; sh = a[4]; dx = a[5]; dy = a[6]; dw = a[7]; dh = a[8]; }
  else { sx = 0; sy = 0; sw = im.width; sh = im.height; dx = a[1]; dy = a[2]; dw = a.length >= 5 ? a[3] : im.width; dh = a.length >= 5 ? a[4] : im.height; }
  N.drawImage(im.__id, sx, sy, sw, sh, s.tx + dx * s.sx, s.ty + dy * s.sy, dw * s.sx, dh * s.sy, s.a);
};
CP.beginPath = function () { this.__rects = []; };
CP.rect = function (x, y, w, h) { this.__rects.push([x, y, w, h]); };
CP.fill = function () { var self = this; if (this.__ok()) this.__rects.forEach(function (r) { self.__fr(self.__s.fill, r[0], r[1], r[2], r[3]); }); };
CP.stroke = function () {
  var self = this; if (!this.__ok()) return;
  this.__rects.forEach(function (r) { var o = self.lineWidth; self.strokeRect(r[0], r[1], r[2], r[3]); });
};
['closePath','moveTo','lineTo','arc','arcTo','ellipse','quadraticCurveTo','bezierCurveTo','clip','fillText','strokeText','setLineDash','putImageData'].forEach(function (n) {
  CP[n] = function () { unsup(n); };
});
CP.measureText = function (t) { return { width: String(t).length * 8 }; };
CP.createLinearGradient = CP.createRadialGradient = function () { unsup('gradiente'); return { addColorStop: function () {} }; };
CP.createPattern = function () { unsup('createPattern'); return null; };
CP.getImageData = function (x, y, w, h) { unsup('getImageData'); return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; };

/* ---------- document / navigator / storage ---------- */
var document = new Target(); g.document = document;
var stubs = {};
document.readyState = 'loading'; document.title = META.title || '';
document.body = new Stub('body'); document.head = new Stub('head'); document.documentElement = new Stub('html');
document.createElement = function (t) {
  t = String(t).toLowerCase();
  if (t === 'canvas') return new Canvas();
  if (t === 'img') return new Img();
  return new Stub(t);
};
document.getElementById = function (id) {
  if (META.canvasId && id === META.canvasId && mainCanvas) return mainCanvas;
  return stubs[id] || (stubs[id] = new Stub('div'));
};
document.querySelector = function (sel) { if (/canvas/i.test(sel) && mainCanvas) return mainCanvas; return new Stub('div'); };
document.querySelectorAll = function () { return []; };
document.getElementsByTagName = function (t) { return (/canvas/i.test(t) && mainCanvas) ? [mainCanvas] : []; };
document.hasFocus = function () { return true; };

if (META.canvasId || META.hasCanvas) {
  var mc = new Canvas(); mc.__w = META.width; mc.__h = META.height; setMain(mc);
}

g.innerWidth = 1280; g.innerHeight = 720; g.devicePixelRatio = 1;
g.screen = { width: 1280, height: 720 };
g.navigator = { userAgent: 'PLAYSTATION 3', platform: 'PS3', language: 'es', getGamepads: function () { return []; } };
g.location = { href: 'file:///game', search: '', hash: '', hostname: 'localhost', protocol: 'file:' };
g.getComputedStyle = function () { return {}; };
g.matchMedia = function () { return { matches: false, addListener: function () {}, addEventListener: function () {} }; };
g.alert = function (m) { g.console.log('alert: ' + m); };
g.focus = g.blur = function () {};
g.Audio = function () { unsup('Audio'); return { play: function () { return Promise.resolve(); }, pause: function () {}, load: function () {}, addEventListener: function () {}, volume: 1, currentTime: 0 }; };

var LS = J('save.json') || {};
function persist() { N.writeFile('save.json', JSON.stringify(LS)); }
var has = Object.prototype.hasOwnProperty;
g.localStorage = {
  getItem: function (k) { return has.call(LS, k) ? String(LS[k]) : null; },
  setItem: function (k, v) { LS[k] = String(v); persist(); },
  removeItem: function (k) { delete LS[k]; persist(); },
  clear: function () { LS = {}; persist(); },
  key: function (i) { return Object.keys(LS)[i] || null; }
};
Object.defineProperty(g.localStorage, 'length', { get: function () { return Object.keys(LS).length; } });
g.sessionStorage = g.localStorage;

/* ---------- timers y rAF ---------- */
var timers = [], raf = [], tid = 1;
g.setTimeout = function (f, d) { var id = tid++; timers.push({ id: id, t: now + (d || 0), f: f, iv: 0, a: Array.prototype.slice.call(arguments, 2) }); return id; };
g.setInterval = function (f, d) { var id = tid++; timers.push({ id: id, t: now + (d || 1), f: f, iv: Math.max(d || 1, 1), a: Array.prototype.slice.call(arguments, 2) }); return id; };
g.clearTimeout = g.clearInterval = function (id) { timers = timers.filter(function (t) { return t.id !== id; }); };
g.requestAnimationFrame = function (f) { var id = tid++; raf.push({ id: id, f: f }); return id; };
g.cancelAnimationFrame = function (id) { raf = raf.filter(function (r) { return r.id !== id; }); };
g.queueMicrotask = function (f) { Promise.resolve().then(f); };

/* ---------- teclado desde el pad ---------- */
var KC = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Enter: 13, Escape: 27, ' ': 32, Shift: 16, Control: 17, Tab: 9, Backspace: 8 };
var KCODE = { ' ': 'Space', Shift: 'ShiftLeft', Control: 'ControlLeft' };
function keyEvent(type, k) {
  var code, kc;
  if (KC[k] !== undefined) { kc = KC[k]; code = KCODE[k] || k; }
  else if (/^[a-z]$/i.test(k)) { kc = k.toUpperCase().charCodeAt(0); code = 'Key' + k.toUpperCase(); }
  else if (/^[0-9]$/.test(k)) { kc = k.charCodeAt(0); code = 'Digit' + k; }
  else { kc = 0; code = k; }
  return { type: type, key: k, code: code, keyCode: kc, which: kc, repeat: false, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, target: document, preventDefault: function () {}, stopPropagation: function () {} };
}
var prev = 0;
g.__boot = function () {
  document.readyState = 'complete';
  document.__fire('DOMContentLoaded', { type: 'DOMContentLoaded' });
  g.__fire('DOMContentLoaded', { type: 'DOMContentLoaded' });
  g.__fire('load', { type: 'load' });
};
g.__frame = function (t, mask) {
  now = t;
  var diff = mask ^ prev;
  for (var i = 0; i < 16; i++) {
    var b = 1 << i;
    if (diff & b) {
      var k = MAP[BTN[i]];
      if (k) {
        var type = (mask & b) ? 'keydown' : 'keyup';
        document.__fire(type, keyEvent(type, k));
        g.__fire(type, keyEvent(type, k));
      }
    }
  }
  prev = mask;
  var due = timers.filter(function (x) { return x.t <= now; }).sort(function (a, b) { return a.t - b.t; });
  due.forEach(function (x) {
    if (x.iv) x.t = now + x.iv; else timers = timers.filter(function (y) { return y !== x; });
    try { x.f.apply(null, x.a); } catch (e) { g.console.log('ERR timer: ' + (e && e.stack || e)); }
  });
  var cbs = raf; raf = [];
  cbs.forEach(function (r) { try { r.f(t); } catch (e) { g.console.log('ERR raf: ' + (e && e.stack || e)); } });
};
})(globalThis);

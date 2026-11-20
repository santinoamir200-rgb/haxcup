(function (g) {
'use strict';
/* shim.js v2.2 - HaxCup PS3. Solo usa fillRect/clearRect/drawImage/loadImage nativos. Fix: addEventListener global sin this + repintado por frame (doble buffer). */
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
function unsup(n) { if (!warned[n]) { warned[n] = 1; g.console.log('[ps3html] aproximado/no soportado: ' + n); } }
var uiDirty = true;
function markDirty() { uiDirty = true; }

/* contador de dibujo para saber si el juego pinto en este frame */
var drawCount = 0;
var NF = N.fillRect, ND = N.drawImage, NC = N.clearRect;
/* El runtime nativo NO limpia ni conserva el framebuffer: SDL_RenderPresent con doble buffer
   alterna dos buffers, y si un frame no dibuja nada el que se muestra es el otro (negro).
   Por eso grabamos todo lo dibujado en el frame y, si un frame no dibuja, lo repetimos. */
var cur = [], last = null, REC_MAX = 400000, idleFrames = 0;
/* REPLAY_SETTLE: 0 = repetir el ultimo frame SIEMPRE (lo mas seguro). Si el menu va lento en la consola, probar 6:
   solo se repite durante 6 frames despues del ultimo cambio (alcanza para los dos buffers de SDL). */
var REPLAY_SETTLE = 0;
function nFill(r, gg, b, a, x, y, w, h) { drawCount++; NF(r, gg, b, a, x, y, w, h); if (cur.length < REC_MAX) cur.push(0, r, gg, b, a, x, y, w, h); }
function nImg(id, sx, sy, sw, sh, dx, dy, dw, dh, a) { drawCount++; ND(id, sx, sy, sw, sh, dx, dy, dw, dh, a); if (cur.length < REC_MAX) cur.push(1, id, sx, sy, sw, sh, dx, dy, dw, dh, a); }
function nClear(x, y, w, h) { drawCount++; NC(x, y, w, h); if (cur.length < REC_MAX) cur.push(2, x, y, w, h); }
function replay(L) {
  for (var i = 0, n = L.length; i < n;) {
    var k = L[i];
    if (k === 0) { NF(L[i + 1], L[i + 2], L[i + 3], L[i + 4], L[i + 5], L[i + 6], L[i + 7], L[i + 8]); i += 9; }
    else if (k === 1) { ND(L[i + 1], L[i + 2], L[i + 3], L[i + 4], L[i + 5], L[i + 6], L[i + 7], L[i + 8], L[i + 9], L[i + 10]); i += 11; }
    else { NC(L[i + 1], L[i + 2], L[i + 3], L[i + 4]); i += 5; }
  }
}

/* ---------- eventos ---------- */
function Target() {
  this.__L = {};
}
Target.prototype.addEventListener = function (t, f) { if (!this.__L) this.__L = {}; (this.__L[t] = this.__L[t] || []).push(f); };
Target.prototype.removeEventListener = function (t, f) { var a = this.__L && this.__L[t]; if (a) { var i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } };
Target.prototype.__fire = function (t, ev) {
  var self = this, a = this.__L && this.__L[t];
  ev.currentTarget = self;
  if (a) a.slice().forEach(function (f) { try { f.call(self, ev); } catch (e) { g.console.log('ERR ' + t + ': ' + (e && e.stack || e)); } });
  var h = self['on' + t];
  if (typeof h === 'function') { try { h.call(self, ev); } catch (e) { g.console.log('ERR on' + t + ': ' + (e && e.stack || e)); } }
};
Target.prototype.dispatchEvent = function (ev) { if (!ev.target) ev.target = this; this.__fire(ev.type, ev); return true; };
Target.call(g);
g.__L = {}; g.addEventListener = Target.prototype.addEventListener; g.removeEventListener = Target.prototype.removeEventListener;
g.__fire = function (t, ev) { return Target.prototype.__fire.call(g, t, ev); };
g.addEventListener = function (t, f) { return Target.prototype.addEventListener.call(g, t, f); };
g.removeEventListener = function (t, f) { return Target.prototype.removeEventListener.call(g, t, f); };
g.dispatchEvent = function (ev) { return Target.prototype.dispatchEvent.call(g, ev); };
function mkEv(type, target, extra) {
  var ev = { type: type, target: target, bubbles: true, defaultPrevented: false, __stop: false,
    preventDefault: function () { ev.defaultPrevented = true; }, stopPropagation: function () { ev.__stop = true; }, stopImmediatePropagation: function () { ev.__stop = true; } };
  if (extra) for (var k in extra) ev[k] = extra[k];
  return ev;
}
g.Event = g.CustomEvent = function (type, o) { var e = mkEv(type, null, o); if (o && o.detail !== undefined) e.detail = o.detail; return e; };

/* ---------- DOM liviano ---------- */
var byId = {};      /* id -> elemento */
var roots = [];     /* raices creadas al pedir un id inexistente */
function Style() {}
Style.prototype.setProperty = function (k, v) { this[k] = v; markDirty(); };
Style.prototype.removeProperty = function (k) { var o = this[k]; delete this[k]; markDirty(); return o || ''; };
Style.prototype.getPropertyValue = function (k) { return this[k] || ''; };
function camel(s) { return s.replace(/-([a-z])/g, function (m, c) { return c.toUpperCase(); }); }

var VOID = { br:1, hr:1, img:1, input:1, meta:1, link:1, area:1, base:1, col:1, embed:1, source:1, wbr:1, track:1 };

function El(tag) {
  Target.call(this);
  tag = String(tag || 'div');
  this.tagName = tag.charAt(0) === '#' ? tag : tag.toUpperCase();
  this.nodeName = this.tagName;
  this.nodeType = tag.charAt(0) === '#' ? 3 : 1;
  this.childNodes = []; this.parentNode = null;
  this.__a = {}; this.__t = ''; this.__hidden = undefined;
  this.style = new Style(); this.dataset = {};
  this.scrollTop = 0; this.scrollLeft = 0;
}
El.prototype = Object.create(Target.prototype);
El.prototype.constructor = El;
function lc(el) { return el.nodeType === 1 ? el.tagName.toLowerCase() : ''; }
Object.defineProperty(El.prototype, 'children', { get: function () { return this.childNodes.filter(function (n) { return n.nodeType === 1; }); } });
Object.defineProperty(El.prototype, 'firstChild', { get: function () { return this.childNodes[0] || null; } });
Object.defineProperty(El.prototype, 'lastChild', { get: function () { return this.childNodes[this.childNodes.length - 1] || null; } });
Object.defineProperty(El.prototype, 'firstElementChild', { get: function () { return this.children[0] || null; } });
Object.defineProperty(El.prototype, 'parentElement', { get: function () { return this.parentNode; } });
Object.defineProperty(El.prototype, 'nextSibling', { get: function () { var p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) + 1] || null; } });
Object.defineProperty(El.prototype, 'previousSibling', { get: function () { var p = this.parentNode; if (!p) return null; return p.childNodes[p.childNodes.indexOf(this) - 1] || null; } });
Object.defineProperty(El.prototype, 'id', {
  get: function () { return this.__a.id || ''; },
  set: function (v) { this.setAttribute('id', v); }
});
Object.defineProperty(El.prototype, 'className', {
  get: function () { return this.__a['class'] || ''; },
  set: function (v) { this.__a['class'] = String(v); markDirty(); }
});
Object.defineProperty(El.prototype, 'classList', { get: function () {
  var el = this;
  function arr() { return (el.__a['class'] || '').split(/\s+/).filter(Boolean); }
  function put(a) { el.__a['class'] = a.join(' '); markDirty(); }
  return {
    add: function () { var a = arr(); for (var i = 0; i < arguments.length; i++) if (a.indexOf(arguments[i]) < 0) a.push(arguments[i]); put(a); },
    remove: function () { var a = arr(); for (var i = 0; i < arguments.length; i++) { var j = a.indexOf(arguments[i]); if (j >= 0) a.splice(j, 1); } put(a); },
    toggle: function (c, f) { var a = arr(), has = a.indexOf(c) >= 0, want = f === undefined ? !has : !!f; if (want && !has) a.push(c); if (!want && has) a.splice(a.indexOf(c), 1); put(a); return want; },
    contains: function (c) { return arr().indexOf(c) >= 0; }
  };
} });
Object.defineProperty(El.prototype, 'hidden', {
  get: function () { return this.__hidden; },
  set: function (v) { this.__hidden = !!v; markDirty(); }
});
function txt(n) {
  if (n.nodeType === 3) return n.__t;
  var s = ''; n.childNodes.forEach(function (c) { s += txt(c); }); return s;
}
Object.defineProperty(El.prototype, 'textContent', {
  get: function () { return txt(this); },
  set: function (v) { if (this.nodeType === 3) { this.__t = String(v); } else { this.__setKids(); v = String(v == null ? '' : v); if (v) this.appendChild(mkText(v)); } markDirty(); }
});
Object.defineProperty(El.prototype, 'innerText', { get: function () { return txt(this); }, set: function (v) { this.textContent = v; } });
Object.defineProperty(El.prototype, 'data', { get: function () { return this.__t; }, set: function (v) { this.__t = String(v); markDirty(); } });
Object.defineProperty(El.prototype, 'nodeValue', { get: function () { return this.__t; }, set: function (v) { this.__t = String(v); markDirty(); } });
El.prototype.__setKids = function (list) {
  var self = this;
  this.childNodes.forEach(function (c) { unreg(c); c.parentNode = null; });
  this.childNodes = [];
  (list || []).forEach(function (c) { c.parentNode = self; self.childNodes.push(c); reg(c); });
};
function reg(n) { if (n.nodeType === 1) { if (n.__a.id) byId[n.__a.id] = n; n.childNodes.forEach(reg); } }
function unreg(n) { if (n.nodeType === 1) { if (n.__a.id && byId[n.__a.id] === n && !n.__root) delete byId[n.__a.id]; n.childNodes.forEach(unreg); } }
Object.defineProperty(El.prototype, 'innerHTML', {
  get: function () { var s = ''; this.childNodes.forEach(function (c) { s += ser(c); }); return s; },
  set: function (v) { this.__setKids(parseHTML(String(v == null ? '' : v))); markDirty(); }
});
Object.defineProperty(El.prototype, 'outerHTML', { get: function () { return ser(this); } });
function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function ser(n) {
  if (n.nodeType === 3) return esc(n.__t);
  var t = lc(n), s = '<' + t;
  for (var k in n.__a) s += ' ' + k + '="' + String(n.__a[k]).replace(/"/g, '&quot;') + '"';
  s += '>'; if (VOID[t]) return s;
  n.childNodes.forEach(function (c) { s += ser(c); });
  return s + '</' + t + '>';
}
function mkText(s) { var n = new El('#text'); n.__t = s; return n; }
El.prototype.appendChild = function (c) {
  if (!c) return c;
  if (c.nodeType === 11) { var k = c.childNodes.slice(); c.__setKids(); var s = this; k.forEach(function (x) { s.appendChild(x); }); return c; }
  if (c.parentNode) c.parentNode.removeChild(c);
  c.parentNode = this; this.childNodes.push(c); reg(c);
  if (c.__isCanvas && !mainCanvas) setMain(c);
  markDirty(); return c;
};
El.prototype.removeChild = function (c) { var i = this.childNodes.indexOf(c); if (i >= 0) { this.childNodes.splice(i, 1); c.parentNode = null; unreg(c); markDirty(); } return c; };
El.prototype.insertBefore = function (c, ref) {
  if (!ref) return this.appendChild(c);
  if (c.parentNode) c.parentNode.removeChild(c);
  var i = this.childNodes.indexOf(ref); if (i < 0) i = this.childNodes.length;
  this.childNodes.splice(i, 0, c); c.parentNode = this; reg(c); markDirty(); return c;
};
El.prototype.replaceChild = function (n, o) { this.insertBefore(n, o); this.removeChild(o); return o; };
El.prototype.append = function () { for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; this.appendChild(typeof a === 'string' ? mkText(a) : a); } };
El.prototype.prepend = function () { var f = this.childNodes[0]; for (var i = 0; i < arguments.length; i++) { var a = arguments[i]; this.insertBefore(typeof a === 'string' ? mkText(a) : a, f); } };
El.prototype.replaceChildren = function () { this.__setKids(); this.append.apply(this, arguments); markDirty(); };
El.prototype.remove = function () { if (this.parentNode) this.parentNode.removeChild(this); };
El.prototype.before = function (n) { if (this.parentNode) this.parentNode.insertBefore(typeof n === 'string' ? mkText(n) : n, this); };
El.prototype.after = function (n) { if (this.parentNode) this.parentNode.insertBefore(typeof n === 'string' ? mkText(n) : n, this.nextSibling); };
El.prototype.replaceWith = function (n) { if (this.parentNode) { this.before(n); this.remove(); } };
El.prototype.insertAdjacentHTML = function (pos, h) {
  var k = parseHTML(String(h)), s = this;
  if (pos === 'beforeend') k.forEach(function (x) { s.appendChild(x); });
  else if (pos === 'afterbegin') { var f = this.childNodes[0]; k.forEach(function (x) { s.insertBefore(x, f); }); }
  else if (this.parentNode) { var p = this.parentNode, ref = pos === 'beforebegin' ? this : this.nextSibling; k.forEach(function (x) { p.insertBefore(x, ref); }); }
};
El.prototype.insertAdjacentElement = function (pos, e) { if (pos === 'beforeend') this.appendChild(e); else if (pos === 'afterbegin') this.prepend(e); else if (pos === 'beforebegin') this.before(e); else this.after(e); return e; };
El.prototype.cloneNode = function (deep) {
  var c = this.nodeType === 3 ? mkText(this.__t) : new El(lc(this));
  for (var k in this.__a) c.setAttribute(k, this.__a[k]);
  if (deep) this.childNodes.forEach(function (x) { c.appendChild(x.cloneNode(true)); });
  return c;
};
El.prototype.contains = function (n) { while (n) { if (n === this) return true; n = n.parentNode; } return false; };
El.prototype.getAttribute = function (k) { return this.__a.hasOwnProperty(k) ? this.__a[k] : null; };
El.prototype.hasAttribute = function (k) { return this.__a.hasOwnProperty(k); };
El.prototype.removeAttribute = function (k) {
  if (k === 'id' && this.__a.id && byId[this.__a.id] === this) delete byId[this.__a.id];
  delete this.__a[k]; if (k.indexOf('data-') === 0) delete this.dataset[camel(k.slice(5))]; if (k === 'hidden') this.__hidden = false; markDirty();
};
El.prototype.setAttribute = function (k, v) {
  k = String(k).toLowerCase(); v = String(v);
  if (k === 'id') { if (this.__a.id && byId[this.__a.id] === this) delete byId[this.__a.id]; byId[v] = this; }
  this.__a[k] = v;
  if (k.indexOf('data-') === 0) this.dataset[camel(k.slice(5))] = v;
  if (k === 'hidden') this.__hidden = true;
  if (k === 'style') { var self = this; v.split(';').forEach(function (p) { var i = p.indexOf(':'); if (i > 0) { var n = p.slice(0, i).trim(), val = p.slice(i + 1).trim(); self.style[n] = val; self.style[camel(n)] = val; } }); }
  markDirty();
};
El.prototype.focus = function () { focusEl = this; markDirty(); };
El.prototype.blur = function () { if (focusEl === this) focusEl = null; };
El.prototype.click = function () { this.dispatchEvent(mkEv('click', this)); };
El.prototype.dispatchEvent = function (ev) {
  if (!ev.target) ev.target = this;
  if (ev.bubbles === undefined) ev.bubbles = true;
  var n = this;
  while (n && !ev.__stop) { n.__fire(ev.type, ev); n = n.parentNode; if (!ev.bubbles) break; }
  if (!ev.__stop && ev.bubbles !== false) { document.__fire(ev.type, ev); if (!ev.__stop) g.__fire(ev.type, ev); }
  markDirty();
  return !ev.defaultPrevented;
};
El.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, x: 0, y: 0, width: 0, height: 0, right: 0, bottom: 0 }; };
['scrollIntoView', 'scrollTo', 'scrollBy', 'select', 'showModal', 'close', 'requestFullscreen', 'setSelectionRange', 'setPointerCapture', 'releasePointerCapture'].forEach(function (n) { El.prototype[n] = function () { return Promise.resolve(); }; });
El.prototype.animate = function () { return { cancel: function () {}, finished: Promise.resolve() }; };
El.prototype.attachShadow = function () { return this; };
Object.defineProperty(El.prototype, 'offsetWidth', { get: function () { return 0; } });
Object.defineProperty(El.prototype, 'offsetHeight', { get: function () { return 0; } });
Object.defineProperty(El.prototype, 'clientWidth', { get: function () { return 0; } });
Object.defineProperty(El.prototype, 'clientHeight', { get: function () { return 0; } });
/* formularios */
function optsOf(el) { var o = []; (function w(n) { n.childNodes.forEach(function (c) { if (lc(c) === 'option') o.push(c); else w(c); }); })(el); return o; }
Object.defineProperty(El.prototype, 'options', { get: function () { return optsOf(this); } });
function optVal(o) { return o.__a.hasOwnProperty('value') ? o.__a.value : txt(o).trim(); }
function selIdx(el) {
  var o = optsOf(el); if (el.__si !== undefined) return Math.min(el.__si, o.length - 1);
  for (var i = 0; i < o.length; i++) if (o[i].__a.hasOwnProperty('selected')) return i;
  return o.length ? 0 : -1;
}
Object.defineProperty(El.prototype, 'selectedIndex', { get: function () { return selIdx(this); }, set: function (v) { this.__si = v | 0; markDirty(); } });
Object.defineProperty(El.prototype, 'value', {
  get: function () {
    var t = lc(this);
    if (t === 'select') { var o = optsOf(this), i = selIdx(this); return i >= 0 ? optVal(o[i]) : ''; }
    if (t === 'option') return optVal(this);
    if (t === 'textarea') return this.__v !== undefined ? this.__v : txt(this);
    return this.__v !== undefined ? this.__v : (this.__a.hasOwnProperty('value') ? this.__a.value : '');
  },
  set: function (v) {
    v = String(v);
    if (lc(this) === 'select') { var o = optsOf(this); for (var i = 0; i < o.length; i++) if (optVal(o[i]) === v) { this.__si = i; break; } }
    else this.__v = v;
    markDirty();
  }
});
Object.defineProperty(El.prototype, 'checked', {
  get: function () { return this.__c !== undefined ? this.__c : this.__a.hasOwnProperty('checked'); },
  set: function (v) { this.__c = !!v; markDirty(); }
});
Object.defineProperty(El.prototype, 'disabled', { get: function () { return this.__a.hasOwnProperty('disabled'); }, set: function (v) { if (v) this.__a.disabled = ''; else delete this.__a.disabled; markDirty(); } });
Object.defineProperty(El.prototype, 'selected', { get: function () { return this.__a.hasOwnProperty('selected'); }, set: function (v) { if (v) this.__a.selected = ''; else delete this.__a.selected; } });
Object.defineProperty(El.prototype, 'open', { get: function () { return this.__a.hasOwnProperty('open'); }, set: function (v) { if (v) this.__a.open = ''; else delete this.__a.open; markDirty(); } });
['type', 'name', 'placeholder', 'min', 'max', 'step', 'href', 'src', 'title'].forEach(function (p) {
  Object.defineProperty(El.prototype, p, { get: function () { return this.__a[p] || ''; }, set: function (v) { this.__a[p] = String(v); markDirty(); } });
});
Object.defineProperty(El.prototype, 'valueAsNumber', { get: function () { return parseFloat(this.value); } });

/* ---------- parser HTML ---------- */
var ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', hellip: '…', laquo: '«', raquo: '»' };
function unent(s) {
  if (s.indexOf('&') < 0) return s;
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, function (m, e) {
    if (e.charAt(0) === '#') { var c = e.charAt(1).toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return c > 0xffff ? String.fromCharCode(0xd800 + ((c - 0x10000) >> 10), 0xdc00 + ((c - 0x10000) & 1023)) : String.fromCharCode(c); }
    return ENT.hasOwnProperty(e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
  });
}
var AUTOCLOSE = { li: ['li'], option: ['option'], td: ['td', 'th'], th: ['td', 'th'], tr: ['tr', 'td', 'th'], p: ['p'], dt: ['dt', 'dd'], dd: ['dt', 'dd'] };
function parseHTML(h) {
  var root = new El('#frag'), stack = [root], i = 0, n = h.length;
  function top() { return stack[stack.length - 1]; }
  function addText(s) { if (s) { var t = top(); var last = t.childNodes[t.childNodes.length - 1]; var nt = mkText(unent(s)); nt.parentNode = t; t.childNodes.push(nt); } }
  while (i < n) {
    var lt = h.indexOf('<', i);
    if (lt < 0) { addText(h.slice(i)); break; }
    if (lt > i) addText(h.slice(i, lt));
    i = lt;
    if (h.substr(i, 4) === '<!--') { var ce = h.indexOf('-->', i + 4); i = ce < 0 ? n : ce + 3; continue; }
    if (h.charAt(i + 1) === '!' || h.charAt(i + 1) === '?') { var de = h.indexOf('>', i); i = de < 0 ? n : de + 1; continue; }
    if (h.charAt(i + 1) === '/') {
      var ge = h.indexOf('>', i), name = h.slice(i + 2, ge < 0 ? n : ge).trim().toLowerCase(); i = ge < 0 ? n : ge + 1;
      for (var k = stack.length - 1; k > 0; k--) if (lc(stack[k]) === name) { stack.length = k; break; }
      continue;
    }
    var m = /^<([a-zA-Z][a-zA-Z0-9:-]*)/.exec(h.slice(i, i + 40));
    if (!m) { addText('<'); i++; continue; }
    var tag = m[1].toLowerCase(); i += m[0].length;
    var attrs = {}, self = false;
    while (i < n) {
      while (i < n && /\s/.test(h.charAt(i))) i++;
      var ch = h.charAt(i);
      if (ch === '>') { i++; break; }
      if (ch === '/') { self = true; i++; continue; }
      var an = /^[^\s=>\/]+/.exec(h.slice(i, i + 80));
      if (!an) { i++; continue; }
      i += an[0].length; var av = '';
      while (i < n && /\s/.test(h.charAt(i))) i++;
      if (h.charAt(i) === '=') {
        i++; while (i < n && /\s/.test(h.charAt(i))) i++;
        var q = h.charAt(i);
        if (q === '"' || q === "'") { var qe = h.indexOf(q, i + 1); if (qe < 0) qe = n; av = h.slice(i + 1, qe); i = qe + 1; }
        else { var s0 = i; while (i < n && !/[\s>]/.test(h.charAt(i))) i++; av = h.slice(s0, i); if (av.charAt(av.length - 1) === '/' && h.charAt(i) === '>') av = av.slice(0, -1); }
      }
      attrs[an[0].toLowerCase()] = unent(av);
    }
    if (tag === 'script' || tag === 'style') { var re = h.toLowerCase().indexOf('</' + tag, i); if (re < 0) re = n; var ge2 = h.indexOf('>', re); i = ge2 < 0 ? n : ge2 + 1; continue; }
    var ac = AUTOCLOSE[tag];
    if (ac) { var t0 = lc(top()); if (ac.indexOf(t0) >= 0) stack.pop(); }
    var el = new El(tag);
    for (var a in attrs) el.setAttribute(a, attrs[a]);
    el.parentNode = top(); top().childNodes.push(el);
    if (!VOID[tag] && !self) stack.push(el);
  }
  var out = root.childNodes; root.childNodes = []; out.forEach(function (c) { c.parentNode = null; });
  return out;
}

/* ---------- selectores ---------- */
function parseSel(sel) {
  var out = [];
  String(sel).split(',').forEach(function (part) {
    part = part.trim(); if (!part) return;
    var chain = [], i = 0, comb = ' ', cur = null;
    function push() { if (cur) { cur.comb = comb; chain.push(cur); cur = null; } }
    while (i < part.length) {
      var c = part.charAt(i);
      if (c === ' ' || c === '>' || c === '+' || c === '~') {
        push(); var cc = ' ';
        while (i < part.length && /[\s>+~]/.test(part.charAt(i))) { if (part.charAt(i) === '>') cc = '>'; i++; }
        comb = cc; continue;
      }
      if (!cur) cur = { tag: '', id: '', cls: [], attrs: [] };
      if (c === '#') { var m = /^[^\s.#\[:>+~]+/.exec(part.slice(i + 1)); cur.id = m ? m[0] : ''; i += 1 + (m ? m[0].length : 0); }
      else if (c === '.') { var m2 = /^[^\s.#\[:>+~]+/.exec(part.slice(i + 1)); if (m2) cur.cls.push(m2[0]); i += 1 + (m2 ? m2[0].length : 0); }
      else if (c === '[') {
        var e = part.indexOf(']', i), body = part.slice(i + 1, e < 0 ? part.length : e); i = e < 0 ? part.length : e + 1;
        var am = /^([^~|^$*=\s]+)\s*(?:([~|^$*]?=)\s*["']?(.*?)["']?)?$/.exec(body.trim());
        if (am) cur.attrs.push({ n: am[1].toLowerCase(), op: am[2] || '', v: am[3] || '' });
      }
      else if (c === ':') { var pm = /^:[a-z-]+(\([^)]*\))?/.exec(part.slice(i)); i += pm ? pm[0].length : 1; }
      else if (c === '*') i++;
      else { var tm = /^[a-zA-Z0-9_-]+/.exec(part.slice(i)); if (tm) { cur.tag = tm[0].toLowerCase(); i += tm[0].length; } else i++; }
    }
    push(); if (chain.length) out.push(chain);
  });
  return out;
}
var selCache = {};
function cmpOk(el, c) {
  if (el.nodeType !== 1) return false;
  if (c.tag && lc(el) !== c.tag) return false;
  if (c.id && el.__a.id !== c.id) return false;
  if (c.cls.length) { var cl = (el.__a['class'] || '').split(/\s+/); for (var i = 0; i < c.cls.length; i++) if (cl.indexOf(c.cls[i]) < 0) return false; }
  for (var j = 0; j < c.attrs.length; j++) {
    var a = c.attrs[j], v = el.__a[a.n];
    if (v === undefined) return false;
    if (a.op === '=' && v !== a.v) return false;
    if (a.op === '^=' && v.indexOf(a.v) !== 0) return false;
    if (a.op === '$=' && v.slice(-a.v.length) !== a.v) return false;
    if (a.op === '*=' && v.indexOf(a.v) < 0) return false;
    if (a.op === '~=' && v.split(/\s+/).indexOf(a.v) < 0) return false;
  }
  return true;
}
function chainOk(el, chain, i) {
  var c = chain[i]; if (!cmpOk(el, c)) return false;
  if (i === 0) return true;
  var p = el.parentNode;
  if (c.comb === '>') return !!p && chainOk(p, chain, i - 1);
  while (p && p.nodeType === 1) { if (chainOk(p, chain, i - 1)) return true; p = p.parentNode; }
  return false;
}
function selOk(el, sel) {
  var alts = selCache[sel] || (selCache[sel] = parseSel(sel));
  for (var i = 0; i < alts.length; i++) if (chainOk(el, alts[i], alts[i].length - 1)) return true;
  return false;
}
function qAll(root, sel, first) {
  var out = [];
  (function w(n) {
    for (var i = 0; i < n.childNodes.length; i++) {
      var c = n.childNodes[i];
      if (c.nodeType !== 1) continue;
      if (selOk(c, sel)) { out.push(c); if (first) return true; }
      if (w(c)) return true;
    }
    return false;
  })(root);
  return out;
}
El.prototype.matches = function (s) { return selOk(this, s); };
El.prototype.closest = function (s) { var n = this; while (n && n.nodeType === 1) { if (selOk(n, s)) return n; n = n.parentNode; } return null; };
El.prototype.querySelector = function (s) { return qAll(this, s, true)[0] || null; };
El.prototype.querySelectorAll = function (s) { return qAll(this, s, false); };
El.prototype.getElementsByTagName = function (t) { return qAll(this, t, false); };
El.prototype.getElementsByClassName = function (c) { return qAll(this, '.' + c.split(/\s+/).join('.'), false); };

/* ---------- colores ---------- */
var NAMED = { black:[0,0,0], white:[255,255,255], red:[255,0,0], green:[0,128,0], blue:[0,0,255], yellow:[255,255,0], gray:[128,128,128], grey:[128,128,128], orange:[255,165,0], purple:[128,0,128], cyan:[0,255,255], magenta:[255,0,255], lime:[0,255,0], pink:[255,192,203], brown:[165,42,42], gold:[255,215,0], silver:[192,192,192], navy:[0,0,128], teal:[0,128,128], maroon:[128,0,0], olive:[128,128,0], crimson:[220,20,60], aqua:[0,255,255], fuchsia:[255,0,255], darkgreen:[0,100,0], darkred:[139,0,0], darkblue:[0,0,139], lightgray:[211,211,211], lightgrey:[211,211,211], darkgray:[169,169,169], darkgrey:[169,169,169], skyblue:[135,206,235], tomato:[255,99,71], coral:[255,127,80], violet:[238,130,238], indigo:[75,0,130], beige:[245,245,220], ivory:[255,255,240] };
var colCache = {};
function hsl2rgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  function f(p, q, t) { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
  if (s === 0) return [l * 255, l * 255, l * 255];
  var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  return [f(p, q, h + 1 / 3) * 255, f(p, q, h) * 255, f(p, q, h - 1 / 3) * 255];
}
function hx(s, a, n) { return parseInt(n === 1 ? s.substr(a, 1) + s.substr(a, 1) : s.substr(a, 2), 16); }
function parseColor(s) {
  if (typeof s !== 'string') return null;
  if (colCache.hasOwnProperty(s)) return colCache[s];
  var t = s.trim().toLowerCase(), r = null, m;
  if (t.charAt(0) === '#') {
    var L = t.length - 1;
    if (L === 3 || L === 4) r = [hx(t, 1, 1), hx(t, 2, 1), hx(t, 3, 1), L === 4 ? hx(t, 4, 1) / 255 : 1];
    else if (L === 6 || L === 8) r = [hx(t, 1, 2), hx(t, 3, 2), hx(t, 5, 2), L === 8 ? hx(t, 7, 2) / 255 : 1];
  } else if ((m = /^(rgba?|hsla?)\(([^)]*)\)$/.exec(t))) {
    var p = m[2].split(/[\s,\/]+/).filter(Boolean), v = p.map(function (x) { return x.charAt(x.length - 1) === '%' ? parseFloat(x) / 100 : parseFloat(x); });
    var al = p.length > 3 ? (p[3].charAt(p[3].length - 1) === '%' ? parseFloat(p[3]) / 100 : parseFloat(p[3])) : 1;
    if (m[1].charAt(0) === 'r') { var k = function (i) { return p[i].charAt(p[i].length - 1) === '%' ? v[i] * 255 : v[i]; }; r = [k(0), k(1), k(2), al]; }
    else { var c3 = hsl2rgb(parseFloat(p[0]), v[1], v[2]); r = [c3[0], c3[1], c3[2], al]; }
    for (var i = 0; i < 3; i++) if (!(r[i] >= 0)) r[i] = 0;
  } else if (t === 'transparent') r = [0, 0, 0, 0];
  else if (NAMED.hasOwnProperty(t)) r = NAMED[t].concat(1);
  colCache[s] = r; return r;
}

/* ---------- PNG sin compresion (para subir canvas auxiliares como textura) ---------- */
var CRCT = null;
function crc32(u, s, e) {
  if (!CRCT) { CRCT = []; for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); CRCT[n] = c >>> 0; } }
  var crc = 0xFFFFFFFF; for (var i = s; i < e; i++) crc = CRCT[(crc ^ u[i]) & 255] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function be32(u, p, v) { u[p] = (v >>> 24) & 255; u[p + 1] = (v >>> 16) & 255; u[p + 2] = (v >>> 8) & 255; u[p + 3] = v & 255; }
function encodePNG(buf, w, h) {
  var rl = w * 4 + 1, raw = new Uint8Array(rl * h), y;
  for (y = 0; y < h; y++) { raw[y * rl] = 0; raw.set(buf.subarray(y * w * 4, (y + 1) * w * 4), y * rl + 1); }
  var nb = Math.max(1, Math.ceil(raw.length / 65535)), zl = new Uint8Array(2 + raw.length + nb * 5 + 4), p = 2, o = 0, a = 1, b = 0;
  zl[0] = 0x78; zl[1] = 0x01;
  for (var bi = 0; bi < nb; bi++) {
    var len = Math.min(65535, raw.length - o);
    zl[p++] = bi === nb - 1 ? 1 : 0; zl[p++] = len & 255; zl[p++] = len >> 8; zl[p++] = (~len) & 255; zl[p++] = ((~len) >> 8) & 255;
    zl.set(raw.subarray(o, o + len), p); p += len; o += len;
  }
  for (var i = 0; i < raw.length; i++) { a = (a + raw[i]) % 65521; b = (b + a) % 65521; }
  be32(zl, p, ((b << 16) | a) >>> 0);
  var out = new Uint8Array(8 + 25 + 12 + zl.length + 12), q = 0;
  var sig = [137, 80, 78, 71, 13, 10, 26, 10]; for (i = 0; i < 8; i++) out[q++] = sig[i];
  function chunk(type, data, dl) {
    be32(out, q, dl); q += 4; var s = q;
    for (var i2 = 0; i2 < 4; i2++) out[q++] = type.charCodeAt(i2);
    if (dl) { out.set(data.subarray(0, dl), q); q += dl; }
    be32(out, q, crc32(out, s, q)); q += 4;
  }
  var ih = new Uint8Array(13); be32(ih, 0, w); be32(ih, 4, h); ih[8] = 8; ih[9] = 6;
  chunk('IHDR', ih, 13); chunk('IDAT', zl, zl.length); chunk('IEND', null, 0);
  return out.buffer.slice(0, q);
}

/* ---------- buffers y canvas ---------- */
var mainCanvas = null, focusEl = null;
var bufBytes = 0;
var BUF_LIMIT = 1400000;      /* pixeles maximos de un canvas auxiliar (se reduce la resolucion si lo pasa) */
function setMain(c) { mainCanvas = c; c.__main = true; c.__f = 1; N.setSize(c.__w, c.__h); markDirty(); }

function Canvas() { El.call(this, 'canvas'); this.__isCanvas = true; this.__w = 300; this.__h = 150; this.__ctx = null; this.__buf = null; this.__f = 1; this.__ver = 0; }
Canvas.prototype = Object.create(El.prototype);
Canvas.prototype.__prep = function () {
  if (this.__buf || this.__main) return !!this.__buf || this.__main;
  var w = Math.max(0, this.__w), h = Math.max(0, this.__h);
  if (!w || !h) return false;
  var f = Math.min(1, Math.sqrt(BUF_LIMIT / (w * h)));
  if (bufBytes > 80 * 1024 * 1024) f = Math.min(f, 0.25);   /* mucha memoria en buffers: bajar resolucion */
  this.__f = f; this.__bw = Math.max(1, Math.round(w * f)); this.__bh = Math.max(1, Math.round(h * f));
  this.__buf = new Uint8Array(this.__bw * this.__bh * 4); bufBytes += this.__bw * this.__bh * 4;
  return true;
};
Canvas.prototype.__resized = function () {
  if (this.__buf) bufBytes -= this.__buf.length;
  this.__buf = null; this.__ver++; this.__tex = null;
  if (this.__ctx) this.__ctx.__reset();
  if (this.__main) { N.setSize(this.__w, this.__h); markDirty(); }
};
Object.defineProperty(Canvas.prototype, 'width', { get: function () { return this.__w; }, set: function (v) { this.__w = Math.max(0, v | 0); this.__resized(); } });
Object.defineProperty(Canvas.prototype, 'height', { get: function () { return this.__h; }, set: function (v) { this.__h = Math.max(0, v | 0); this.__resized(); } });
Object.defineProperty(Canvas.prototype, 'clientWidth', { get: function () { return this.__w; } });
Object.defineProperty(Canvas.prototype, 'clientHeight', { get: function () { return this.__h; } });
Object.defineProperty(Canvas.prototype, 'offsetWidth', { get: function () { return this.__w; } });
Object.defineProperty(Canvas.prototype, 'offsetHeight', { get: function () { return this.__h; } });
Canvas.prototype.getContext = function (t) {
  if (t === '2d') return this.__ctx || (this.__ctx = new Ctx(this));
  unsup('getContext(' + t + ')'); return null;
};
Canvas.prototype.getBoundingClientRect = function () { return { left: 0, top: 0, x: 0, y: 0, width: this.__w, height: this.__h, right: this.__w, bottom: this.__h }; };
Canvas.prototype.toDataURL = function () { return ''; };
Canvas.prototype.toBlob = function (cb) { if (cb) cb(null); };
var upCount = 0, upBytes = 0, TEX_MAX = 100 * 1024 * 1024, texWarned = false;
function texOf(cv) {
  if (cv.__tex && cv.__texVer === cv.__ver) return cv.__tex;
  if (upCount > 3000) return null;
  /* tope de memoria: main.c no libera texturas, asi que sin tope un canvas que cambia seguido llena la RAM y cuelga la PS3 */
  if (upBytes + cv.__bw * cv.__bh * 4 > TEX_MAX) { if (!texWarned) { texWarned = true; g.console.log('[ps3html] tope de texturas alcanzado (' + upCount + ' subidas): no se dibujan mas canvas nuevos'); } return cv.__tex || null; }
  var r = N.loadImage(encodePNG(cv.__buf, cv.__bw, cv.__bh));
  if (!r) return null;
  upCount++; upBytes += cv.__bw * cv.__bh * 4; cv.__tex = { id: r[0] }; cv.__texVer = cv.__ver; return cv.__tex;
}

/* getContext sobre elementos que no son canvas (ej. el fondo decorativo): canvas auxiliar descartable */
El.prototype.getContext = function (t) { return (this.__cv || (this.__cv = new Canvas())).getContext(t); };

/* ---------- fuente bitmap ---------- */
var GL = {"0":[9,0,0,124,126,198,198,198,198,198,198,198,126,60,0,0,0],"1":[9,0,0,56,62,54,48,48,48,48,48,48,254,510,0,0,0],"2":[9,0,0,124,254,198,192,224,112,56,28,14,254,255,0,0,0],"3":[9,0,0,124,254,198,192,112,120,224,192,199,254,124,0,0,0],"4":[9,0,0,112,112,120,104,108,102,102,511,511,96,96,0,0,0],"5":[9,0,0,254,254,6,6,126,254,192,192,198,254,124,0,0,0],"6":[9,0,0,124,254,70,6,126,254,198,198,198,254,124,0,0,0],"7":[9,0,0,254,254,192,96,112,48,56,24,24,28,28,0,0,0],"8":[9,0,0,124,238,198,198,124,124,230,198,198,254,124,0,0,0],"9":[9,0,0,124,126,198,198,198,254,252,192,198,126,60,0,0,0]," ":[4,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],"!":[5,0,0,14,12,12,12,12,12,12,4,0,14,14,0,0,0],"\"":[8,0,0,118,118,54,38,0,0,0,0,0,0,0,0,0,0],"#":[9,0,0,136,200,200,510,76,68,100,255,38,34,34,0,0,0],"$":[9,0,16,124,254,214,22,30,252,240,464,471,254,124,16,0,0],"%":[14,0,0,1054,1590,819,307,8114,7894,13148,13152,13104,12816,7704,0,0,0],"&":[12,0,0,240,216,408,216,120,828,830,998,454,2030,1916,0,0,0],"'":[4,0,0,6,6,6,6,0,0,0,0,0,0,0,0,0,0],"(":[5,0,24,28,12,14,6,6,6,6,6,6,6,14,12,12,24],")":[5,0,2,6,6,12,12,12,28,28,28,12,12,12,14,6,7],"*":[6,0,0,12,44,63,28,30,18,0,0,0,0,0,0,0,0],"+":[9,0,0,0,16,48,48,48,510,254,48,48,16,0,0,0,0],",":[4,0,0,0,0,0,0,0,0,0,0,6,6,6,4,4,0],"-":[5,0,0,0,0,0,0,0,0,30,30,0,0,0,0,0,0],".":[4,0,0,0,0,0,0,0,0,0,0,0,6,6,0,0,0],"/":[4,0,8,12,12,12,12,6,6,6,6,6,3,3,0,0,0],":":[5,0,0,0,0,0,14,14,0,0,0,0,14,14,0,0,0],";":[5,0,0,0,0,0,14,14,0,0,0,0,14,14,12,12,4],"<":[9,0,0,0,0,448,248,62,6,14,124,480,384,0,0,0,0],"=":[9,0,0,0,0,0,510,254,0,0,510,510,0,0,0,0,0],">":[9,0,0,0,0,14,62,240,448,480,252,30,2,0,0,0,0],"?":[10,0,0,124,254,454,448,192,112,48,48,0,56,56,0,0,0],"@":[16,0,0,4064,6160,12296,12228,26150,25654,26162,9746,14130,7654,68,2060,4088,384],"A":[12,0,0,112,240,248,216,408,412,1020,1020,782,1798,1542,0,0,0],"B":[12,0,0,510,1022,774,774,510,510,1934,1798,1798,1022,510,0,0,0],"C":[12,0,0,504,1020,1806,6,6,6,6,518,1806,1020,504,0,0,0],"D":[12,0,0,254,510,902,1798,1798,1798,1798,1798,902,510,254,0,0,0],"E":[11,0,0,1022,1022,6,6,510,510,14,6,6,1022,1022,0,0,0],"F":[10,0,0,510,510,6,6,6,510,510,6,6,6,6,0,0,0],"G":[12,0,0,1016,2044,1806,14,6,1926,3974,3590,3598,2044,1016,0,0,0],"H":[12,0,0,1798,1798,1798,1798,2046,2046,1806,1798,1798,1798,1798,0,0,0],"I":[4,0,0,6,6,6,6,6,6,6,6,6,6,6,0,0,0],"J":[9,0,0,248,248,224,224,224,224,224,224,231,126,124,0,0,0],"K":[12,0,0,1798,902,454,230,126,126,238,454,390,902,1798,0,0,0],"L":[10,0,0,6,6,6,6,6,6,6,6,6,510,510,0,0,0],"M":[13,0,0,3598,3614,3870,3870,3894,3510,3510,3558,3302,3302,3270,0,0,0],"N":[12,0,0,1806,1822,1822,1854,1846,1894,1894,1990,1990,1926,1926,0,0,0],"O":[12,0,0,504,1020,1806,3598,3590,3590,3590,1550,1806,1020,504,0,0,0],"P":[11,0,0,254,1022,902,774,902,1022,510,14,6,6,6,0,0,0],"Q":[12,0,0,504,1020,1806,3598,3590,3590,3590,3598,1806,1020,504,224,1984,1920],"R":[12,0,0,510,1022,1798,1798,774,1022,510,454,902,774,1798,0,0,0],"S":[11,0,0,252,510,390,14,62,504,960,768,902,1022,252,0,0,0],"T":[10,0,0,1023,1023,48,48,48,48,48,48,48,48,48,0,0,0],"U":[12,0,0,1798,1798,1798,1798,1798,1798,1798,774,782,1020,248,0,0,0],"V":[11,0,0,775,774,902,398,396,460,220,216,120,112,112,0,0,0],"W":[15,0,0,25031,29127,29638,13286,13158,15214,7020,7740,7740,7740,3640,0,0,0],"X":[11,0,0,902,398,460,248,120,112,248,220,396,910,775,0,0,0],"Y":[11,0,0,774,910,396,220,248,112,112,112,112,112,112,0,0,0],"Z":[10,0,0,510,510,192,224,112,56,24,12,14,511,511,0,0,0],"[":[5,0,30,30,6,6,6,6,6,6,6,6,6,6,6,6,30],"\\":[4,0,2,3,3,6,6,6,6,6,12,12,12,12,0,0,0],"]":[5,0,14,31,28,28,28,28,28,28,28,28,28,28,28,28,31],"^":[9,0,0,56,120,108,204,198,134,386,0,0,0,0,0,0,0],"_":[9,0,0,0,0,0,0,0,0,0,0,0,0,0,0,511,0],"`":[5,0,6,12,8,0,0,0,0,0,0,0,0,0,0,0,0],"a":[9,0,0,0,0,16,126,230,192,254,198,231,254,478,0,0,0],"b":[10,0,6,6,6,6,254,462,398,390,390,462,478,254,0,0,0],"c":[9,0,0,0,0,16,124,206,6,6,6,198,238,124,0,0,0],"d":[10,0,128,448,448,456,508,462,454,454,454,454,494,508,0,0,0],"e":[9,0,0,0,0,16,124,198,198,254,6,6,238,124,0,0,0],"f":[5,0,16,28,14,30,31,14,14,14,14,14,14,14,0,0,0],"g":[10,0,0,0,0,136,508,462,454,454,454,454,510,508,448,206,252],"h":[10,0,6,6,6,6,254,462,462,390,390,390,390,390,0,0,0],"i":[4,0,6,6,0,6,6,6,6,6,6,6,6,6,0,0,0],"j":[4,0,6,6,0,6,6,6,6,6,6,6,6,6,6,6,7],"k":[9,0,6,6,6,198,230,102,62,62,126,102,198,454,0,0,0],"l":[4,0,6,6,6,6,6,6,6,6,6,6,6,6,0,0,0],"m":[14,0,0,0,0,1062,8190,7662,6350,6342,6342,6342,6342,6342,0,0,0],"n":[10,0,0,0,0,6,254,462,462,390,390,390,390,390,0,0,0],"o":[10,0,0,0,0,16,252,462,390,390,390,454,238,124,0,0,0],"p":[10,0,0,0,0,102,254,462,462,390,390,462,478,254,6,6,6],"q":[10,0,0,0,0,136,508,462,454,454,454,454,494,508,448,448,448],"r":[6,0,0,0,0,38,62,30,14,6,6,6,6,6,0,0,0],"s":[9,0,0,0,0,16,126,198,14,126,240,192,198,124,0,0,0],"t":[5,0,0,4,12,30,31,14,14,14,14,14,14,28,0,0,0],"u":[10,0,0,0,0,134,454,454,454,454,454,462,510,444,0,0,0],"v":[9,0,0,0,0,130,455,198,230,110,108,124,60,56,0,0,0],"w":[12,0,0,0,0,2147,3299,3319,3318,3254,1942,1950,1948,796,0,0,0],"x":[9,0,0,0,0,194,198,108,60,56,56,108,238,199,0,0,0],"y":[9,0,0,0,0,130,455,198,206,108,108,124,56,56,56,28,14],"z":[8,0,0,0,0,126,126,112,48,24,28,14,126,126,0,0,0],"{":[6,0,48,60,12,12,12,12,12,7,15,12,12,12,12,28,60],"|":[4,0,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6],"}":[6,0,2,15,12,12,12,12,28,56,56,12,12,12,12,12,15],"~":[9,0,0,0,0,0,0,4,510,240,0,0,0,0,0,0,0],"á":[9,0,96,48,24,16,126,230,224,254,230,231,246,478,0,0,0],"é":[9,0,96,48,16,16,124,198,198,254,6,6,238,124,0,0,0],"í":[4,0,8,12,6,4,6,6,6,6,6,6,6,6,0,0,0],"ó":[10,0,96,112,16,16,252,462,390,390,390,454,238,124,0,0,0],"ú":[10,0,96,112,16,134,454,454,454,454,454,462,510,444,0,0,0],"ñ":[10,0,128,252,100,6,254,462,462,390,390,390,390,390,0,0,0],"Á":[12,96,0,112,240,248,216,408,412,1020,1020,782,1798,1542,0,0,0],"É":[11,48,0,1022,1022,6,6,510,510,14,6,6,1022,1022,0,0,0],"Í":[4,6,0,6,6,6,6,6,6,6,6,6,6,6,0,0,0],"Ó":[12,96,0,504,1020,1806,3598,3590,3590,3590,1550,1806,1020,504,0,0,0],"Ú":[12,96,0,1798,1798,1798,1798,1798,1798,1798,774,782,1020,248,0,0,0],"Ñ":[12,232,0,1806,1822,1822,1854,1846,1894,1894,1990,1990,1926,1926,0,0,0],"ü":[10,0,0,76,76,134,454,454,454,454,454,462,510,444,0,0,0],"Ü":[12,152,0,1798,1798,1798,1798,1798,1798,1798,774,782,1020,248,0,0,0],"À":[12,96,0,112,240,248,216,408,412,1020,1020,782,1798,1542,0,0,0],"È":[11,96,0,1022,1022,6,6,510,510,14,6,6,1022,1022,0,0,0],"Ì":[4,6,0,6,6,6,6,6,6,6,6,6,6,6,0,0,0],"Ò":[12,192,0,504,1020,1806,3598,3590,3590,3590,1550,1806,1020,504,0,0,0],"Ù":[12,96,0,1798,1798,1798,1798,1798,1798,1798,774,782,1020,248,0,0,0],"â":[9,0,56,124,68,16,126,230,224,254,230,231,246,478,0,0,0],"ê":[9,0,56,124,68,16,124,198,198,254,6,6,238,124,0,0,0],"î":[4,0,14,15,1,4,6,6,6,6,6,6,6,6,0,0,0],"ô":[10,0,48,120,204,16,252,462,390,390,390,454,238,124,0,0,0],"û":[10,0,48,120,204,134,454,454,454,454,454,462,510,444,0,0,0],"ã":[9,0,0,126,98,16,126,230,224,254,230,231,246,478,0,0,0],"õ":[10,0,128,252,100,16,252,462,390,390,390,454,238,124,0,0,0],"ç":[9,0,0,0,0,16,124,206,6,6,6,198,238,124,16,48,56],"Ç":[12,0,0,504,1020,1806,6,6,6,6,518,1806,1020,504,96,192,224],"ä":[9,0,0,108,100,16,126,230,224,254,230,231,246,478,0,0,0],"ë":[9,0,0,108,76,16,124,198,198,254,6,6,238,124,0,0,0],"ï":[4,0,0,9,9,4,6,6,6,6,6,6,6,6,0,0,0],"ö":[10,0,0,204,76,16,252,462,390,390,390,454,238,124,0,0,0],"Ä":[12,152,0,112,240,248,216,408,412,1020,1020,782,1798,1542,0,0,0],"Ö":[12,400,0,504,1020,1806,3598,3590,3590,3590,1550,1806,1020,504,0,0,0],"¿":[10,0,0,0,0,48,48,48,0,48,56,28,14,390,462,252,56],"¡":[5,0,0,0,0,4,14,12,0,12,12,12,12,12,12,14,4],"·":[5,0,0,0,0,0,0,6,6,6,0,0,0,0,0,0,0],"•":[6,0,0,0,0,0,0,30,30,30,14,0,0,0,0,0,0],"…":[16,0,0,0,0,0,0,0,0,0,0,12684,12684,12684,0,0,0],"–":[9,0,0,0,0,0,0,0,0,255,254,0,0,0,0,0,0],"—":[16,0,0,0,0,0,0,0,0,65535,65535,0,0,0,0,0,0],"‹":[5,0,0,0,0,0,0,12,14,6,6,12,12,0,0,0,0],"›":[5,0,0,0,0,0,0,6,12,28,12,12,6,0,0,0,0],"«":[9,0,0,0,0,0,0,204,110,54,102,108,204,0,0,0,0],"»":[9,0,0,0,0,0,0,102,236,220,204,108,118,0,0,0,0],"°":[6,0,0,28,50,50,22,12,0,0,0,0,0,0,0,0,0],"←":[16,0,0,0,0,0,0,0,0,0,16,8184,32,0,0,0,0],"→":[16,0,0,0,0,0,0,0,0,0,2048,8184,1024,0,0,0,0],"↑":[8,0,0,0,0,24,24,36,0,0,0,0,0,0,0,0,0],"↓":[8,0,0,0,0,0,0,0,0,0,0,0,60,24,0,0,0],"▶":[15,6,30,126,254,1022,4094,8190,16382,4094,2046,510,126,62,14,2,0],"◀":[15,14336,15360,16128,16320,16352,16376,16382,16382,16380,16368,16320,16256,15872,14336,0,0],"✓":[14,0,0,0,0,7168,3584,1792,908,476,248,112,32,0,0,0,0],"✕":[13,0,0,1032,3612,1852,1016,496,480,1008,1976,3868,1548,0,0,0,0],"★":[17,256,384,896,896,960,32766,16376,4080,2016,4064,4064,3184,6192,0,0,0],"☆":[17,256,384,896,896,960,32766,15992,3696,1888,4064,4064,3184,6192,0,0,0],"×":[9,0,0,0,0,134,206,124,56,120,236,198,128,0,0,0,0],"÷":[9,0,0,0,0,24,16,0,255,254,0,24,16,0,0,0,0],"±":[9,0,0,0,24,24,56,255,254,24,24,0,255,255,0,0,0],"€":[9,0,0,120,252,206,14,63,14,63,14,206,252,120,0,0,0],"£":[9,0,0,120,252,12,14,14,63,14,12,390,255,127,0,0,0],"¥":[9,0,0,455,198,238,108,124,254,254,56,254,56,56,0,0,0],"©":[12,0,0,504,516,1122,1178,1033,2057,1033,1178,1650,780,496,0,0,0],"®":[12,0,0,504,516,1138,1242,1433,2297,1113,1242,1682,780,496,0,0,0],"™":[16,0,0,12734,15240,15240,11912,9352,0,0,0,0,0,0,0,0,0],"º":[6,0,0,30,18,51,19,30,0,0,0,0,0,0,0,0,0],"¬":[9,0,0,0,0,0,0,0,510,510,384,384,384,0,0,0,0],"½":[13,0,0,1550,524,780,396,140,1758,3936,2080,3632,792,7944,0,0,0],"¼":[13,0,0,1550,524,780,396,140,222,96,6240,7216,5648,7960,4096,4096,0],"¾":[13,0,0,1566,530,792,408,158,204,96,6240,7216,5648,7960,4096,4096,0]};
var gcache = {};
function glyphOf(ch, px) {
  var d = GL[ch]; if (!d) d = GL['?'] ? null : null;
  var adv = d ? d[0] : 9, k = px / 16;
  var tw = Math.max(1, Math.round(adv * k)), th = Math.max(1, Math.round(16 * k));
  var key = ch + '|' + tw + 'x' + th; var c = gcache[key]; if (c) return c;
  var rows = [], y, x;
  if (d && ch !== ' ') {
    for (y = 0; y < th; y++) {
      var y0 = y * 16 / th, y1 = (y + 1) * 16 / th, runs = [], st = -1;
      for (x = 0; x < tw; x++) {
        var x0 = x * adv / tw, x1 = (x + 1) * adv / tw, on = 0, tot = 0;
        for (var sy = Math.floor(y0); sy < Math.ceil(y1) && sy < 16; sy++) {
          var wy = Math.min(sy + 1, y1) - Math.max(sy, y0);
          for (var sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
            var wx = Math.min(sx + 1, x1) - Math.max(sx, x0), ar = wx * wy;
            tot += ar; if (d[1 + sy] & (1 << sx)) on += ar;
          }
        }
        var lit = tot > 0 && on / tot >= 0.4;
        if (lit && st < 0) st = x;
        if (!lit && st >= 0) { runs.push(st, x); st = -1; }
      }
      if (st >= 0) runs.push(st, tw);
      rows.push(runs);
    }
  }
  c = { w: adv * k, tw: tw, th: th, rows: rows };
  gcache[key] = c; return c;
}
function fontPx(f) { var m = /(\d+(?:\.\d+)?)px/.exec(f || ''); return m ? Math.max(4, parseFloat(m[1])) : 10; }
function normCh(ch) { return ch === ' ' ? ' ' : ch; }

/* ---------- contexto 2D ---------- */
function newState(cv) {
  cv.__prep();
  var f = cv.__f || 1;
  return { m: [f, 0, 0, f, 0, 0], clip: null, fill: [0, 0, 0, 1], stroke: [0, 0, 0, 1], fg: null, sg: null, fs: '#000000', ss: '#000000', a: 1, lw: 1, cap: 'butt', join: 'miter', font: '10px sans-serif', ta: 'start', tb: 'alphabetic', gco: 'source-over', dash: [] };
}
function cloneState(s) { var c = {}; for (var k in s) c[k] = s[k]; c.m = s.m.slice(); c.clip = s.clip ? s.clip.slice() : null; return c; }
function Ctx(cv) { this.canvas = cv; this.__s = newState(cv); this.__st = []; this.__sub = []; this.__cur = null; this.__lx = 0; this.__ly = 0; }
var CP = Ctx.prototype;
Ctx.prototype.__reset = function () { this.__s = newState(this.canvas); this.__st = []; this.__sub = []; this.__cur = null; };
function paintProp(name, cKey, gKey, sKey) {
  Object.defineProperty(CP, name, {
    get: function () { return this.__s[sKey]; },
    set: function (v) {
      var s = this.__s;
      if (v && v.__grad) { s[gKey] = v; return; }
      var c = parseColor(v);
      if (c) { s[cKey] = c; s[gKey] = null; s[sKey] = v; } else if (v && v.__pat) { s[gKey] = null; s[cKey] = [128, 128, 128, 1]; unsup('createPattern'); }
    }
  });
}
paintProp('fillStyle', 'fill', 'fg', 'fs'); paintProp('strokeStyle', 'stroke', 'sg', 'ss');
[['globalAlpha', 'a', function (v) { v = +v; return v >= 0 && v <= 1 ? v : 1; }], ['lineWidth', 'lw', function (v) { v = +v; return v > 0 ? v : 1; }], ['lineCap', 'cap'], ['lineJoin', 'join'], ['font', 'font'], ['textAlign', 'ta'], ['textBaseline', 'tb'], ['globalCompositeOperation', 'gco']].forEach(function (d) {
  Object.defineProperty(CP, d[0], { get: function () { return this.__s[d[1]]; }, set: function (v) { this.__s[d[1]] = d[2] ? d[2](v) : v; } });
});
CP.imageSmoothingEnabled = true; CP.imageSmoothingQuality = 'low'; CP.miterLimit = 10; CP.direction = 'ltr'; CP.filter = 'none';
CP.save = function () { this.__st.push(cloneState(this.__s)); };
CP.restore = function () { var s = this.__st.pop(); if (s) this.__s = s; };
function mul(m, a, b, c, d, e, f) {
  var A = m[0] * a + m[2] * b, B = m[1] * a + m[3] * b, C = m[0] * c + m[2] * d, D = m[1] * c + m[3] * d, E = m[0] * e + m[2] * f + m[4], F = m[1] * e + m[3] * f + m[5];
  m[0] = A; m[1] = B; m[2] = C; m[3] = D; m[4] = E; m[5] = F;
}
CP.translate = function (x, y) { mul(this.__s.m, 1, 0, 0, 1, x, y); };
CP.scale = function (x, y) { mul(this.__s.m, x, 0, 0, y, 0, 0); };
CP.rotate = function (a) { var c = Math.cos(a), s = Math.sin(a); mul(this.__s.m, c, s, -s, c, 0, 0); };
CP.transform = function (a, b, c, d, e, f) { mul(this.__s.m, a, b, c, d, e, f); };
CP.setTransform = function (a, b, c, d, e, f) {
  if (a && typeof a === 'object') { f = a.f; e = a.e; d = a.d; c = a.c; b = a.b; a = a.a; }
  var k = this.canvas.__f || 1; if (a === undefined) { a = 1; b = 0; c = 0; d = 1; e = 0; f = 0; }
  this.__s.m = [a * k, b * k, c * k, d * k, e * k, f * k];
};
CP.resetTransform = function () { this.setTransform(1, 0, 0, 1, 0, 0); };
CP.getTransform = function () { var m = this.__s.m, k = this.canvas.__f || 1; return { a: m[0] / k, b: m[1] / k, c: m[2] / k, d: m[3] / k, e: m[4] / k, f: m[5] / k }; };
function tx(m, x, y) { return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }

/* --- gradientes --- */
function Grad(type, a) { this.__grad = true; this.type = type; this.a = a; this.stops = []; }
Grad.prototype.addColorStop = function (o, c) { var col = parseColor(c) || [0, 0, 0, 1]; this.stops.push({ o: +o, c: col }); this.stops.sort(function (p, q) { return p.o - q.o; }); };
CP.createLinearGradient = function (x0, y0, x1, y1) { return new Grad('lin', [x0, y0, x1, y1]); };
CP.createRadialGradient = function (x0, y0, r0, x1, y1, r1) { return new Grad('rad', [x0, y0, r0, x1, y1, r1]); };
CP.createConicGradient = function () { return new Grad('lin', [0, 0, 1, 0]); };
CP.createPattern = function () { return { __pat: true }; };
var GQ = 24;
function lutOf(gr) {
  var st = gr.stops, lut = [], i, j;
  for (i = 0; i <= GQ; i++) {
    var t = i / GQ, c;
    if (!st.length) c = [0, 0, 0, 0];
    else if (t <= st[0].o) c = st[0].c;
    else if (t >= st[st.length - 1].o) c = st[st.length - 1].c;
    else { for (j = 1; j < st.length && st[j].o < t; j++); var A = st[j - 1], B = st[j], u = B.o > A.o ? (t - A.o) / (B.o - A.o) : 0; c = [A.c[0] + (B.c[0] - A.c[0]) * u, A.c[1] + (B.c[1] - A.c[1]) * u, A.c[2] + (B.c[2] - A.c[2]) * u, A.c[3] + (B.c[3] - A.c[3]) * u]; }
    lut.push(c);
  }
  return lut;
}
function gradPaint(gr, m) {
  var lut = lutOf(gr), a = gr.a, fx, tfn;
  if (gr.type === 'lin') {
    var p0 = tx(m, a[0], a[1]), p1 = tx(m, a[2], a[3]), dx = p1[0] - p0[0], dy = p1[1] - p0[1], l2 = dx * dx + dy * dy;
    tfn = function (x, y) { return l2 ? ((x - p0[0]) * dx + (y - p0[1]) * dy) / l2 : 0; };
    fx = Math.abs(dx) > 1e-6;
  } else {
    var c1 = tx(m, a[3], a[4]), sc = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])), r0 = a[2] * sc, r1 = a[5] * sc;
    tfn = function (x, y) { var d = Math.sqrt((x - c1[0]) * (x - c1[0]) + (y - c1[1]) * (y - c1[1])); return r1 > r0 ? (d - r0) / (r1 - r0) : 0; };
    fx = true;
  }
  return { lut: lut, fx: fx, at: function (x, y) { var t = tfn(x, y); t = t < 0 ? 0 : t > 1 ? 1 : t; return Math.round(t * GQ); } };
}
function paintOf(ctx, which) {
  var s = ctx.__s, gr = which === 'f' ? s.fg : s.sg;
  if (gr) return { g: gradPaint(gr, s.m), c: null };
  return { g: null, c: which === 'f' ? s.fill : s.stroke };
}

/* --- salida de spans --- */
/* spans: arreglo plano [y, x0, x1, y, x0, x1, ...] ordenado por y */
function emitSpans(cv, spans, paint, alpha, gco, cl) {
  var bw = cv.__main ? cv.__w : cv.__bw, bh = cv.__main ? cv.__h : cv.__bh;
  var cx0 = 0, cy0 = 0, cx1 = bw, cy1 = bh;
  if (cl) { cx0 = Math.max(cx0, cl[0]); cy0 = Math.max(cy0, cl[1]); cx1 = Math.min(cx1, cl[2]); cy1 = Math.min(cy1, cl[3]); }
  if (cx1 <= cx0 || cy1 <= cy0) return;
  var i, n = spans.length, g = paint.g, c = paint.c, buf = cv.__main ? null : cv.__buf;
  if (!cv.__main) cv.__ver++;
  var open = {}, curY = -1e9;
  function out(r) { var col = r.col; nFill(col[0], col[1], col[2], col[3] * alpha, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0); }
  function closeStale(y) { for (var k in open) { if (open[k].y1 < y) { out(open[k]); delete open[k]; } } }
  function put(y, x0, x1, col, ci) {
    if (x1 <= x0) return;
    if (buf) { blend(buf, bw, y, x0, x1, col, alpha, gco); return; }
    if (y !== curY) { closeStale(y); curY = y; }
    var key = x0 + ',' + x1 + ',' + ci, r = open[key];
    if (r && r.y1 === y) r.y1 = y + 1;
    else { if (r) out(r); open[key] = { x0: x0, x1: x1, y0: y, y1: y + 1, col: col }; }
  }
  for (i = 0; i < n; i += 3) {
    var y = spans[i], x0 = spans[i + 1], x1 = spans[i + 2];
    if (y < cy0 || y >= cy1) continue;
    if (x0 < cx0) x0 = cx0; if (x1 > cx1) x1 = cx1;
    if (x1 <= x0) continue;
    if (!g) put(y, x0, x1, c, 0);
    else if (!g.fx) { var ix = g.at(x0, y + 0.5); put(y, x0, x1, g.lut[ix], ix); }
    else {
      var CH = 12, a = x0;
      while (a < x1) { var b = Math.min(x1, (Math.floor(a / CH) + 1) * CH), ix2 = g.at((a + b) / 2, y + 0.5); put(y, a, b, g.lut[ix2], ix2); a = b; }
    }
  }
  if (!buf) for (var k in open) out(open[k]);
}
function blend(buf, w, y, x0, x1, col, alpha, gco) {
  var a = col[3] * alpha, r = col[0], g = col[1], b = col[2], i = (y * w + x0) * 4, x;
  if (gco === 'destination-out') { for (x = x0; x < x1; x++, i += 4) buf[i + 3] = buf[i + 3] * (1 - a); return; }
  if (gco === 'lighter') {
    for (x = x0; x < x1; x++, i += 4) {
      var da0 = buf[i + 3] / 255, oa0 = Math.min(1, da0 + a);
      buf[i] = Math.min(255, buf[i] * da0 + r * a); buf[i + 1] = Math.min(255, buf[i + 1] * da0 + g * a); buf[i + 2] = Math.min(255, buf[i + 2] * da0 + b * a); buf[i + 3] = oa0 * 255;
    }
    return;
  }
  if (a >= 0.999) { for (x = x0; x < x1; x++, i += 4) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255; } return; }
  if (a <= 0) return;
  for (x = x0; x < x1; x++, i += 4) {
    var da = buf[i + 3] / 255, oa = a + da * (1 - a);
    if (oa > 0) { var k = da * (1 - a); buf[i] = (r * a + buf[i] * k) / oa; buf[i + 1] = (g * a + buf[i + 1] * k) / oa; buf[i + 2] = (b * a + buf[i + 2] * k) / oa; buf[i + 3] = oa * 255; }
  }
}

/* --- relleno de poligonos (scanline) --- */
function scan(polys, rule, bx0, by0, bx1, by1) {
  var E = [], ymin = 1e18, ymax = -1e18, p, i, out = [];
  for (p = 0; p < polys.length; p++) {
    var P = polys[p], n = P.length / 2;
    for (i = 0; i < n; i++) {
      var j = (i + 1) % n, ax = P[i * 2], ay = P[i * 2 + 1], bx = P[j * 2], by = P[j * 2 + 1];
      if (!(isFinite(ax) && isFinite(ay) && isFinite(bx) && isFinite(by)) || ay === by) continue;
      var dir = 1; if (ay > by) { dir = -1; var tx_ = ax, ty_ = ay; ax = bx; ay = by; bx = tx_; by = ty_; }
      E.push({ x: ax, y0: ay, y1: by, s: (bx - ax) / (by - ay), d: dir });
      if (ay < ymin) ymin = ay; if (by > ymax) ymax = by;
    }
  }
  if (!E.length) return out;
  E.sort(function (a, b) { return a.y0 - b.y0; });
  var ys = Math.max(by0, Math.ceil(ymin - 0.5)), ye = Math.min(by1, Math.ceil(ymax - 0.5)), ei = 0, act = [], y, k;
  for (y = ys; y < ye; y++) {
    var yc = y + 0.5;
    while (ei < E.length && E[ei].y0 <= yc) act.push(E[ei++]);
    var xs = [];
    for (k = act.length - 1; k >= 0; k--) {
      var e = act[k];
      if (e.y1 <= yc) { act.splice(k, 1); continue; }
      xs.push({ x: e.x + (yc - e.y0) * e.s, d: e.d });
    }
    if (xs.length < 2) continue;
    xs.sort(function (a, b) { return a.x - b.x; });
    var w = 0, st = 0;
    for (k = 0; k < xs.length; k++) {
      var was = rule === 'evenodd' ? (w & 1) : w !== 0;
      w += rule === 'evenodd' ? 1 : xs[k].d;
      var now_ = rule === 'evenodd' ? (w & 1) : w !== 0;
      if (!was && now_) st = xs[k].x;
      else if (was && !now_) {
        var a0 = Math.max(bx0, Math.ceil(st - 0.5)), a1 = Math.min(bx1, Math.ceil(xs[k].x - 0.5));
        if (a1 > a0) out.push(y, a0, a1);
      }
    }
  }
  return out;
}

/* --- trazados --- */
CP.beginPath = function () { this.__sub = []; this.__cur = null; };
CP.moveTo = function (x, y) { var p = tx(this.__s.m, x, y); this.__cur = { p: [p[0], p[1]], closed: false }; this.__sub.push(this.__cur); this.__lx = x; this.__ly = y; };
CP.lineTo = function (x, y) {
  if (!this.__cur) { this.moveTo(x, y); return; }
  var p = tx(this.__s.m, x, y); this.__cur.p.push(p[0], p[1]); this.__lx = x; this.__ly = y;
};
CP.closePath = function () { if (this.__cur) { this.__cur.closed = true; var q = this.__cur.p; var sx = q[0], sy = q[1]; this.__cur = { p: [sx, sy], closed: false }; this.__sub.push(this.__cur); } };
CP.rect = function (x, y, w, h) {
  var m = this.__s.m, a = tx(m, x, y), b = tx(m, x + w, y), c = tx(m, x + w, y + h), d = tx(m, x, y + h);
  this.__sub.push({ p: [a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]], closed: true });
  this.__cur = { p: [a[0], a[1]], closed: false }; this.__sub.push(this.__cur); this.__lx = x; this.__ly = y;
};
function hyp(a, b) { return Math.sqrt(a * a + b * b); }
function scl(m) { return Math.max(Math.sqrt(m[0] * m[0] + m[1] * m[1]), Math.sqrt(m[2] * m[2] + m[3] * m[3])); }
CP.ellipse = function (x, y, rx, ry, rot, a0, a1, ccw) {
  var m = this.__s.m, TAU = Math.PI * 2;
  if (!(rx >= 0 && ry >= 0)) return;
  if (!ccw) { if (a1 < a0) a1 = a0 + ((a1 - a0) % TAU + TAU) % TAU; if (a1 - a0 > TAU) a1 = a0 + TAU; }
  else { if (a0 < a1) a0 = a1 + ((a0 - a1) % TAU + TAU) % TAU; if (a0 - a1 > TAU) a0 = a1 + TAU; var t = a0; a0 = a1; a1 = t; }
  var r = Math.max(rx, ry) * scl(m), n = Math.max(6, Math.min(72, Math.ceil(Math.sqrt(r) * 2.4 * (a1 - a0) / TAU + 4)));
  var cr = Math.cos(rot || 0), sr = Math.sin(rot || 0), pts = [];
  for (var i = 0; i <= n; i++) {
    var a = ccw ? a1 - (a1 - a0) * i / n : a0 + (a1 - a0) * i / n, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
    var q = tx(m, x + ex * cr - ey * sr, y + ex * sr + ey * cr); pts.push(q[0], q[1]);
  }
  if (this.__cur && this.__cur.p.length) { this.__cur.p.push(pts[0], pts[1]); for (i = 2; i < pts.length; i++) this.__cur.p.push(pts[i]); }
  else { this.__cur = { p: pts, closed: false }; this.__sub.push(this.__cur); }
  this.__lx = x + Math.cos(a1) * rx; this.__ly = y + Math.sin(a1) * ry;
};
CP.arc = function (x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); };
CP.quadraticCurveTo = function (cx, cy, x, y) {
  var x0 = this.__lx, y0 = this.__ly, n = 10;
  for (var i = 1; i <= n; i++) { var t = i / n, u = 1 - t; this.lineTo(u * u * x0 + 2 * u * t * cx + t * t * x, u * u * y0 + 2 * u * t * cy + t * t * y); }
};
CP.bezierCurveTo = function (c1x, c1y, c2x, c2y, x, y) {
  var x0 = this.__lx, y0 = this.__ly, n = 14;
  for (var i = 1; i <= n; i++) { var t = i / n, u = 1 - t; this.lineTo(u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x, u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y); }
};
CP.arcTo = function (x1, y1, x2, y2, r) {
  var x0 = this.__lx, y0 = this.__ly;
  if (!this.__cur) { this.moveTo(x1, y1); return; }
  var v1x = x0 - x1, v1y = y0 - y1, v2x = x2 - x1, v2y = y2 - y1, l1 = hyp(v1x, v1y), l2 = hyp(v2x, v2y);
  if (!l1 || !l2 || !r) { this.lineTo(x1, y1); return; }
  v1x /= l1; v1y /= l1; v2x /= l2; v2y /= l2;
  var cross = v1x * v2y - v1y * v2x, dot = v1x * v2x + v1y * v2y;
  if (Math.abs(cross) < 1e-6) { this.lineTo(x1, y1); return; }
  var ang = Math.acos(Math.max(-1, Math.min(1, dot))), tl = r / Math.tan(ang / 2);
  var sx = x1 + v1x * tl, sy = y1 + v1y * tl, ex = x1 + v2x * tl, ey = y1 + v2y * tl, sg = cross > 0 ? 1 : -1;
  var cx = sx + (-v1y * sg) * r * -1, cy = sy + (v1x * sg) * r * -1;
  cx = sx - v1y * sg * r * -1; cy = sy + v1x * sg * r * -1;
  /* centro: sobre la bisectriz */
  var bx = v1x + v2x, by = v1y + v2y, bl = hyp(bx, by); bx /= bl; by /= bl;
  var dc = r / Math.sin(ang / 2); cx = x1 + bx * dc; cy = y1 + by * dc;
  var a0 = Math.atan2(sy - cy, sx - cx), a1 = Math.atan2(ey - cy, ex - cx);
  this.lineTo(sx, sy); this.arc(cx, cy, r, a0, a1, cross > 0);
};
CP.roundRect = function (x, y, w, h, r) {
  r = Array.isArray(r) ? (r[0] || 0) : (r || 0); r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  this.moveTo(x + r, y); this.lineTo(x + w - r, y); this.arc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  this.lineTo(x + w, y + h - r); this.arc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  this.lineTo(x + r, y + h); this.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  this.lineTo(x, y + r); this.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false); this.closePath();
};
CP.setLineDash = function (d) { this.__s.dash = (d || []).map(Number); };
CP.getLineDash = function () { return this.__s.dash.slice(); };
CP.isPointInPath = function () { return false; };

CP.__ready = function () { return this.canvas.__main || this.canvas.__prep(); };
function pathPolys(ctx) { var o = []; ctx.__sub.forEach(function (s) { if (s.p.length >= 6) o.push(s.p); }); return o; }
CP.fill = function (rule) {
  if (!this.__ready()) return; var polys = pathPolys(this); if (!polys.length) return;
  var s = this.__s, cv = this.canvas, bw = cv.__main ? cv.__w : cv.__bw, bh = cv.__main ? cv.__h : cv.__bh;
  var cl = s.clip, sp = scan(polys, rule === 'evenodd' ? 'evenodd' : 'nonzero', cl ? Math.max(0, cl[0]) : 0, cl ? Math.max(0, cl[1]) : 0, cl ? Math.min(bw, cl[2]) : bw, cl ? Math.min(bh, cl[3]) : bh);
  emitSpans(cv, sp, paintOf(this, 'f'), s.a, s.gco, null);
};
CP.clip = function () {
  var polys = pathPolys(this), s = this.__s, x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  if (!polys.length) { s.clip = [0, 0, 0, 0]; return; }
  polys.forEach(function (P) { for (var i = 0; i < P.length; i += 2) { if (P[i] < x0) x0 = P[i]; if (P[i] > x1) x1 = P[i]; if (P[i + 1] < y0) y0 = P[i + 1]; if (P[i + 1] > y1) y1 = P[i + 1]; } });
  var nc = [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)];
  if (s.clip) nc = [Math.max(nc[0], s.clip[0]), Math.max(nc[1], s.clip[1]), Math.min(nc[2], s.clip[2]), Math.min(nc[3], s.clip[3])];
  s.clip = nc;
  if (polys.length && !(polys.length === 1 && polys[0].length === 8)) unsup('clip no rectangular (se usa el rectangulo envolvente)');
};
function strokePolys(ctx) {
  var s = ctx.__s, sc = (Math.sqrt(s.m[0] * s.m[0] + s.m[1] * s.m[1]) + Math.sqrt(s.m[2] * s.m[2] + s.m[3] * s.m[3])) / 2;
  var w = Math.max(1, s.lw * sc), hw = w / 2, polys = [];
  function poly(P) { var a = 0, n = P.length / 2; for (var i = 0; i < n; i++) { var j = (i + 1) % n; a += P[i * 2] * P[j * 2 + 1] - P[j * 2] * P[i * 2 + 1]; } if (a < 0) { var R = []; for (i = n - 1; i >= 0; i--) R.push(P[i * 2], P[i * 2 + 1]); P = R; } polys.push(P); }
  function disc(x, y) { var n = hw < 2 ? 6 : hw < 6 ? 10 : 16, P = []; for (var i = 0; i < n; i++) { var a = i / n * Math.PI * 2; P.push(x + Math.cos(a) * hw, y + Math.sin(a) * hw); } poly(P); }
  function seg(ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l = hyp(dx, dy); if (l < 1e-6) return;
    var nx = -dy / l * hw, ny = dx / l * hw; poly([ax + nx, ay + ny, bx + nx, by + ny, bx - nx, by - ny, ax - nx, ay - ny]);
  }
  var dash = s.dash.length && s.dash.some(function (v) { return v > 0; }) ? s.dash.map(function (v) { return v * sc; }) : null;
  ctx.__sub.forEach(function (sub) {
    var P = sub.p.slice(); if (P.length < 4) return;
    if (sub.closed) P.push(P[0], P[1]);
    var lines = [P];
    if (dash) {
      lines = []; var di = 0, rem = dash[0], on = true, cur = [P[0], P[1]];
      for (var i = 2; i < P.length; i += 2) {
        var ax = P[i - 2], ay = P[i - 1], bx = P[i], by = P[i + 1 - 0], l = hyp(bx - ax, by - ay), pos = 0;
        while (l - pos > rem && rem >= 0) {
          pos += rem; var t = pos / l, px = ax + (bx - ax) * t, py = ay + (by - ay) * t;
          if (on) { cur.push(px, py); lines.push(cur); cur = null; } else cur = [px, py];
          on = !on; di = (di + 1) % dash.length; rem = dash[di] || 0.5;
          if (on && !cur) cur = [px, py];
        }
        rem -= (l - pos); if (on && cur) cur.push(bx, by);
      }
      if (on && cur && cur.length >= 4) lines.push(cur);
    }
    lines.forEach(function (Q) {
      var n = Q.length / 2, i2;
      for (i2 = 0; i2 < n - 1; i2++) seg(Q[i2 * 2], Q[i2 * 2 + 1], Q[i2 * 2 + 2], Q[i2 * 2 + 3]);
      if (hw >= 1) {
        for (i2 = 1; i2 < n - 1; i2++) {
          var ux = Q[i2 * 2] - Q[i2 * 2 - 2], uy = Q[i2 * 2 + 1] - Q[i2 * 2 - 1], vx = Q[i2 * 2 + 2] - Q[i2 * 2], vy = Q[i2 * 2 + 3] - Q[i2 * 2 + 1];
          var ul = hyp(ux, uy), vl = hyp(vx, vy);
          if (ul > 1e-6 && vl > 1e-6 && (ux * vx + uy * vy) / (ul * vl) < 0.92) disc(Q[i2 * 2], Q[i2 * 2 + 1]);
        }
        if (s.cap === 'round') { disc(Q[0], Q[1]); disc(Q[(n - 1) * 2], Q[(n - 1) * 2 + 1]); }
        else if (s.cap === 'square' && n >= 2) {
          [[0, 1], [n - 1, n - 2]].forEach(function (pr) { var ex = Q[pr[0] * 2], ey = Q[pr[0] * 2 + 1], fx = ex - Q[pr[1] * 2], fy = ey - Q[pr[1] * 2 + 1], fl = hyp(fx, fy) || 1; seg(ex, ey, ex + fx / fl * hw, ey + fy / fl * hw); });
        }
        if (sub.closed && n > 2) disc(Q[0], Q[1]);
      }
    });
  });
  return polys;
}
CP.stroke = function () {
  if (!this.__ready()) return; var polys = strokePolys(this); if (!polys.length) return;
  var s = this.__s, cv = this.canvas, bw = cv.__main ? cv.__w : cv.__bw, bh = cv.__main ? cv.__h : cv.__bh, cl = s.clip;
  var sp = scan(polys, 'nonzero', cl ? Math.max(0, cl[0]) : 0, cl ? Math.max(0, cl[1]) : 0, cl ? Math.min(bw, cl[2]) : bw, cl ? Math.min(bh, cl[3]) : bh);
  emitSpans(cv, sp, paintOf(this, 's'), s.a, s.gco, null);
};
CP.__rectDev = function (x, y, w, h) {
  var m = this.__s.m; if (m[1] !== 0 || m[2] !== 0) return null;
  var x0 = m[0] * x + m[4], x1 = m[0] * (x + w) + m[4], y0 = m[3] * y + m[5], y1 = m[3] * (y + h) + m[5], t;
  if (x1 < x0) { t = x0; x0 = x1; x1 = t; } if (y1 < y0) { t = y0; y0 = y1; y1 = t; }
  var L = Math.round(x0), R = Math.round(x1), T = Math.round(y0), B = Math.round(y1);
  if (R <= L && x1 > x0) R = L + 1; if (B <= T && y1 > y0) B = T + 1;
  return [L, T, R, B];
};
CP.fillRect = function (x, y, w, h) {
  if (!this.__ready()) return;
  var s = this.__s, cv = this.canvas, r = this.__rectDev(x, y, w, h);
  if (r) {
    var cl = s.clip, bw = cv.__main ? cv.__w : cv.__bw, bh = cv.__main ? cv.__h : cv.__bh;
    var L = Math.max(r[0], cl ? cl[0] : 0, 0), T = Math.max(r[1], cl ? cl[1] : 0, 0), R = Math.min(r[2], cl ? cl[2] : bw, bw), B = Math.min(r[3], cl ? cl[3] : bh, bh);
    if (R <= L || B <= T) return;
    if (!s.fg) {
      if (cv.__main) nFill(s.fill[0], s.fill[1], s.fill[2], s.fill[3] * s.a, L, T, R - L, B - T);
      else { cv.__ver++; for (var yy = T; yy < B; yy++) blend(cv.__buf, bw, yy, L, R, s.fill, s.a, s.gco); }
      return;
    }
    var sp = []; for (var y2 = T; y2 < B; y2++) sp.push(y2, L, R);
    emitSpans(cv, sp, paintOf(this, 'f'), s.a, s.gco, null); return;
  }
  var m = s.m, a = tx(m, x, y), b = tx(m, x + w, y), c = tx(m, x + w, y + h), d = tx(m, x, y + h), cl2 = s.clip;
  var bw2 = cv.__main ? cv.__w : cv.__bw, bh2 = cv.__main ? cv.__h : cv.__bh;
  var sp2 = scan([[a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]]], 'nonzero', cl2 ? Math.max(0, cl2[0]) : 0, cl2 ? Math.max(0, cl2[1]) : 0, cl2 ? Math.min(bw2, cl2[2]) : bw2, cl2 ? Math.min(bh2, cl2[3]) : bh2);
  emitSpans(cv, sp2, paintOf(this, 'f'), s.a, s.gco, null);
};
CP.strokeRect = function (x, y, w, h) {
  var sb = this.__sub, sc = this.__cur; this.__sub = []; this.__cur = null;
  this.rect(x, y, w, h); this.__sub = [this.__sub[0]]; this.stroke(); this.__sub = sb; this.__cur = sc;
};
CP.clearRect = function (x, y, w, h) {
  if (!this.__ready()) return; var s = this.__s, cv = this.canvas, r = this.__rectDev(x, y, w, h);
  if (!r) { var g0 = s.gco; s.gco = 'destination-out'; var f0 = s.fill, fg0 = s.fg, a0 = s.a; s.fill = [0, 0, 0, 1]; s.fg = null; s.a = 1; this.fillRect(x, y, w, h); s.gco = g0; s.fill = f0; s.fg = fg0; s.a = a0; return; }
  var bw = cv.__main ? cv.__w : cv.__bw, bh = cv.__main ? cv.__h : cv.__bh, cl = s.clip;
  var L = Math.max(r[0], cl ? cl[0] : 0, 0), T = Math.max(r[1], cl ? cl[1] : 0, 0), R = Math.min(r[2], cl ? cl[2] : bw, bw), B = Math.min(r[3], cl ? cl[3] : bh, bh);
  if (R <= L || B <= T) return;
  if (cv.__main) nClear(L, T, R - L, B - T);
  else { cv.__ver++; for (var yy = T; yy < B; yy++) { var i = (yy * bw + L) * 4; for (var xx = L; xx < R; xx++, i += 4) { cv.__buf[i] = cv.__buf[i + 1] = cv.__buf[i + 2] = cv.__buf[i + 3] = 0; } } }
};

/* --- texto --- */
CP.measureText = function (t) {
  var px = fontPx(this.__s.font), k = px / 16, w = 0; t = String(t);
  for (var i = 0; i < t.length; i++) { var d = GL[normCh(t.charAt(i))]; w += (d ? d[0] : 9) * k; }
  return { width: w, actualBoundingBoxLeft: 0, actualBoundingBoxRight: w, actualBoundingBoxAscent: px * 0.8, actualBoundingBoxDescent: px * 0.2, fontBoundingBoxAscent: px * 0.8, fontBoundingBoxDescent: px * 0.2 };
};
CP.__text = function (text, x, y, which, maxW, dx, dy) {
  if (!this.__ready()) return;
  var s = this.__s, m = s.m, sc = Math.sqrt(m[0] * m[0] + m[1] * m[1]) || 1, px = Math.max(4, fontPx(s.font) * sc);
  text = String(text);
  var p = tx(m, x, y), gl = [], tw = 0, i;
  for (i = 0; i < text.length; i++) { var ch = normCh(text.charAt(i)); if (ch.charCodeAt(0) < 32) continue; var g = glyphOf(ch, px); gl.push(g); tw += g.w; }
  if (!gl.length) return;
  var left = p[0] + (dx || 0);
  if (s.ta === 'center') left -= tw / 2; else if (s.ta === 'right' || s.ta === 'end') left -= tw;
  var th = gl[0].th, top = p[1] + (dy || 0);
  if (s.tb === 'top' || s.tb === 'hanging') top = top; else if (s.tb === 'middle') top -= th / 2; else if (s.tb === 'bottom' || s.tb === 'ideographic') top -= th; else top -= th * 13 / 16;
  top = Math.round(top);
  var rows = [], r, ox = left;
  for (r = 0; r < th; r++) rows.push([]);
  gl.forEach(function (g) {
    var o = Math.round(ox);
    for (var rr = 0; rr < g.rows.length && rr < th; rr++) { var rw = g.rows[rr], dst = rows[rr]; for (var q = 0; q < rw.length; q += 2) { var a = o + rw[q], b = o + rw[q + 1]; if (dst.length && dst[dst.length - 1] >= a) dst[dst.length - 1] = Math.max(dst[dst.length - 1], b); else dst.push(a, b); } }
    ox += g.w;
  });
  var sp = []; for (r = 0; r < th; r++) for (i = 0; i < rows[r].length; i += 2) sp.push(top + r, rows[r][i], rows[r][i + 1]);
  emitSpans(this.canvas, sp, paintOf(this, which), s.a, s.gco, s.clip);
};
CP.fillText = function (t, x, y, mw) { this.__text(t, x, y, 'f', mw, 0, 0); };
CP.strokeText = function (t, x, y, mw) {
  var d = Math.max(1, Math.round(this.__s.lw / 2));
  this.__text(t, x, y, 's', mw, -d, 0); this.__text(t, x, y, 's', mw, d, 0); this.__text(t, x, y, 's', mw, 0, -d); this.__text(t, x, y, 's', mw, 0, d);
};

/* --- imagenes --- */
CP.drawImage = function (im) {
  if (!this.__ready() || !im) return;
  var a = arguments, s = this.__s, cv = this.canvas, sx, sy, sw, sh, dx, dy, dw, dh, iw = im.__isCanvas ? im.__w : im.width, ih = im.__isCanvas ? im.__h : im.height;
  if (a.length >= 9) { sx = a[1]; sy = a[2]; sw = a[3]; sh = a[4]; dx = a[5]; dy = a[6]; dw = a[7]; dh = a[8]; }
  else { sx = 0; sy = 0; sw = iw; sh = ih; dx = a[1]; dy = a[2]; dw = a.length >= 5 ? a[3] : iw; dh = a.length >= 5 ? a[4] : ih; }
  if (!(sw > 0 && sh > 0) || !isFinite(dw) || !isFinite(dh)) return;
  var m = s.m, p0 = tx(m, dx, dy), p1 = tx(m, dx + dw, dy + dh), X0 = p0[0], Y0 = p0[1], W = p1[0] - p0[0], H = p1[1] - p0[1];
  if (m[1] !== 0 || m[2] !== 0) unsup('drawImage con rotacion');
  var f = 1, id;
  if (im.__isCanvas) {
    if (!im.__prep() || !im.__buf) return; f = im.__f; if (!im.__ver) return;
    if (cv.__main) { var tex = texOf(im); if (!tex) return; id = tex.id; }
  } else { if (im.__id === undefined || im.__id < 0) return; id = im.__id; if (!cv.__main) { unsup('drawImage(imagen) sobre canvas auxiliar'); return; } }
  /* recorte contra el clip (rectangular) */
  var cl = s.clip;
  if (cl) {
    var L = Math.min(X0, X0 + W), R = Math.max(X0, X0 + W), T = Math.min(Y0, Y0 + H), B = Math.max(Y0, Y0 + H);
    if (R <= cl[0] || L >= cl[2] || B <= cl[1] || T >= cl[3]) return;
    var nl = Math.max(L, cl[0]), nr = Math.min(R, cl[2]), nt = Math.max(T, cl[1]), nb = Math.min(B, cl[3]);
    var fl = (nl - L) / (R - L), fr = (R - nr) / (R - L), ft = (nt - T) / (B - T), fb = (B - nb) / (B - T);
    if (W < 0) { var t0 = fl; fl = fr; fr = t0; } if (H < 0) { var t1 = ft; ft = fb; fb = t1; }
    sx += sw * fl; sw -= sw * (fl + fr); sy += sh * ft; sh -= sh * (ft + fb);
    if (W >= 0) { X0 = nl; W = nr - nl; } else { X0 = nr; W = nl - nr; } if (H >= 0) { Y0 = nt; H = nb - nt; } else { Y0 = nb; H = nt - nb; }
  }
  if (cv.__main) { nImg(id, sx * f, sy * f, sw * f, sh * f, X0, Y0, W, H, s.a); return; }
  /* destino auxiliar: copia por software (vecino mas cercano) */
  var dst = cv.__buf, dbw = cv.__bw, dbh = cv.__bh, src = im.__buf, sbw = im.__bw, sbh = im.__bh; cv.__ver++;
  var rl = Math.round(Math.min(X0, X0 + W)), rr = Math.round(Math.max(X0, X0 + W)), rt = Math.round(Math.min(Y0, Y0 + H)), rb = Math.round(Math.max(Y0, Y0 + H));
  var ax = W === 0 ? 0 : (sw * f) / Math.abs(W), ay = H === 0 ? 0 : (sh * f) / Math.abs(H), flipX = W < 0, flipY = H < 0;
  for (var yy = Math.max(0, rt); yy < Math.min(dbh, rb); yy++) {
    var v = (flipY ? (rb - 1 - yy) : (yy - rt)) + 0.5, srcY = Math.min(sbh - 1, Math.max(0, Math.floor(sy * f + v * ay)));
    for (var xx = Math.max(0, rl); xx < Math.min(dbw, rr); xx++) {
      var u = (flipX ? (rr - 1 - xx) : (xx - rl)) + 0.5, srcX = Math.min(sbw - 1, Math.max(0, Math.floor(sx * f + u * ax))), si = (srcY * sbw + srcX) * 4;
      if (src[si + 3]) blend(dst, dbw, yy, xx, xx + 1, [src[si], src[si + 1], src[si + 2], src[si + 3] / 255], s.a, s.gco);
    }
  }
};
CP.getImageData = function (x, y, w, h) {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0); var d = new Uint8Array(w * h * 4), cv = this.canvas;
  if (!cv.__main && cv.__prep() && cv.__buf) {
    var f = cv.__f, bw = cv.__bw, bh = cv.__bh;
    for (var j = 0; j < h; j++) for (var i = 0; i < w; i++) {
      var sx = Math.floor((x + i) * f), sy = Math.floor((y + j) * f);
      if (sx >= 0 && sy >= 0 && sx < bw && sy < bh) { var si = (sy * bw + sx) * 4, di = (j * w + i) * 4; d[di] = cv.__buf[si]; d[di + 1] = cv.__buf[si + 1]; d[di + 2] = cv.__buf[si + 2]; d[di + 3] = cv.__buf[si + 3]; }
    }
  } else unsup('getImageData del canvas principal');
  return { width: w, height: h, data: d };
};
CP.createImageData = function (w, h) { if (w && w.width) { h = w.height; w = w.width; } return { width: w, height: h, data: new Uint8Array(w * h * 4) }; };
CP.putImageData = function (im, x, y) {
  var cv = this.canvas; if (cv.__main || !cv.__prep() || !cv.__buf) { unsup('putImageData sobre el canvas principal'); return; }
  var f = cv.__f, bw = cv.__bw, bh = cv.__bh; cv.__ver++;
  for (var j = 0; j < im.height; j++) for (var i = 0; i < im.width; i++) {
    var dx = Math.floor((x + i) * f), dy = Math.floor((y + j) * f); if (dx < 0 || dy < 0 || dx >= bw || dy >= bh) continue;
    var si = (j * im.width + i) * 4, di = (dy * bw + dx) * 4; cv.__buf[di] = im.data[si]; cv.__buf[di + 1] = im.data[si + 1]; cv.__buf[di + 2] = im.data[si + 2]; cv.__buf[di + 3] = im.data[si + 3];
  }
};

/* ---------- imagenes (Image) ---------- */
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
function Img() { El.call(this, 'img'); this.width = 0; this.height = 0; this.complete = false; this.__id = -1; this.__src = ''; }
Img.prototype = Object.create(El.prototype);
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
g.MutationObserver = g.ResizeObserver = g.IntersectionObserver = function () { this.observe = this.disconnect = this.unobserve = function () {}; this.takeRecords = function () { return []; }; };

/* ---------- document / navigator / storage ---------- */
var document = new Target(); g.document = document;
document.readyState = 'loading'; document.title = META.title || '';
document.body = new El('body'); document.head = new El('head'); document.documentElement = new El('html');
document.createElement = function (t) {
  t = String(t).toLowerCase();
  if (t === 'canvas') return new Canvas();
  if (t === 'img') return new Img();
  return new El(t);
};
document.createElementNS = function (ns, t) { return document.createElement(t); };
document.createTextNode = function (t) { return mkText(String(t)); };
document.createDocumentFragment = function () { var f = new El('#frag'); f.nodeType = 11; return f; };
document.getElementById = function (id) {
  if (META.canvasId && id === META.canvasId && mainCanvas) return mainCanvas;
  var e = byId[id];
  if (e) return e;
  e = new El('div'); e.__root = true; e.setAttribute('id', id); roots.push(e); return e;
};
function allRoots() { return [document.body].concat(roots); }
document.querySelector = function (sel) {
  if (/^canvas$/i.test(sel) && mainCanvas) return mainCanvas;
  var m = /^#([\w-]+)$/.exec(sel); if (m) return document.getElementById(m[1]);
  var r = allRoots(); for (var i = 0; i < r.length; i++) { var f = selOk(r[i], sel) ? r[i] : r[i].querySelector(sel); if (f) return f; } return null;
};
document.querySelectorAll = function (sel) { var o = []; allRoots().forEach(function (r) { if (selOk(r, sel)) o.push(r); o = o.concat(r.querySelectorAll(sel)); }); return o; };
document.getElementsByTagName = function (t) { return (/canvas/i.test(t) && mainCanvas) ? [mainCanvas] : document.querySelectorAll(t); };
document.getElementsByClassName = function (c) { return document.querySelectorAll('.' + c); };
document.hasFocus = function () { return true; };
document.createTreeWalker = function () { return { currentNode: null, nextNode: function () { return null; } }; };
g.NodeFilter = { SHOW_ALL: -1, SHOW_ELEMENT: 1, SHOW_TEXT: 4 };
g.Node = { ELEMENT_NODE: 1, TEXT_NODE: 3 }; g.HTMLElement = El; g.Element = El; g.HTMLCanvasElement = Canvas;
document.addEventListener = Target.prototype.addEventListener; document.removeEventListener = Target.prototype.removeEventListener;
document.dispatchEvent = function (ev) { if (!ev.target) ev.target = document; document.__fire(ev.type, ev); return true; };
document.activeElement = document.body; document.fullscreenElement = null; document.hidden = false; document.visibilityState = 'visible';
document.exitFullscreen = function () { return Promise.resolve(); };
document.cookie = ''; document.execCommand = function () { return false; };
document.fonts = { ready: Promise.resolve(), load: function () { return Promise.resolve([]); }, check: function () { return true; }, addEventListener: function () {} };

if (META.canvasId || META.hasCanvas) {
  var mc = new Canvas(); mc.__w = META.width; mc.__h = META.height; setMain(mc);
}

g.scrollTo = g.scroll = g.scrollBy = g.open = g.print = g.close = g.stop = function () {};
g.scrollX = g.scrollY = g.pageXOffset = g.pageYOffset = 0;
g.history = { length: 1, state: null, pushState: function () {}, replaceState: function () {}, back: function () {}, forward: function () {}, go: function () {} };
g.visualViewport = { width: 1280, height: 720, scale: 1, offsetLeft: 0, offsetTop: 0, addEventListener: function () {}, removeEventListener: function () {} };
g.getSelection = function () { return { removeAllRanges: function () {}, toString: function () { return ''; } }; };
g.innerWidth = 1280; g.innerHeight = 720; g.devicePixelRatio = 1; g.outerWidth = 1280; g.outerHeight = 720;
g.screen = { width: 1280, height: 720 };
g.navigator = { userAgent: 'PLAYSTATION 3', platform: 'PS3', language: 'es', languages: ['es'], onLine: false, maxTouchPoints: 0, getGamepads: function () { return []; }, vibrate: function () { return false; } };
g.location = { href: 'file:///game', search: '', hash: '', hostname: 'localhost', protocol: 'file:', pathname: '/game', origin: 'file://', reload: function () {} };
g.getComputedStyle = function () { return { getPropertyValue: function () { return ''; } }; };
g.matchMedia = function () { return { matches: false, media: '', addListener: function () {}, removeListener: function () {}, addEventListener: function () {}, removeEventListener: function () {} }; };
g.alert = function (m) { g.console.log('alert: ' + m); };
g.confirm = function () { return true; }; g.prompt = function (m, d) { return d == null ? '' : d; };
g.focus = g.blur = function () {};
g.Audio = function () { unsup('Audio'); return { play: function () { return Promise.resolve(); }, pause: function () {}, load: function () {}, addEventListener: function () {}, volume: 1, currentTime: 0 }; };
g.btoa = function (s) {
  s = String(s); var o = '', i = 0;
  for (; i < s.length; i += 3) {
    var a = s.charCodeAt(i), b = s.charCodeAt(i + 1), c = s.charCodeAt(i + 2);
    o += B64.charAt(a >> 2) + B64.charAt(((a & 3) << 4) | ((b || 0) >> 4)) + (i + 1 < s.length ? B64.charAt(((b & 15) << 2) | ((c || 0) >> 6)) : '=') + (i + 2 < s.length ? B64.charAt(c & 63) : '=');
  }
  return o;
};
g.atob = function (s) { var u = new Uint8Array(b64dec(String(s))), o = ''; for (var i = 0; i < u.length; i++) o += String.fromCharCode(u[i]); return o; };

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

/* =====================================================================
   MENU: dibuja el DOM del juego (ui, overlays) en el canvas y lo maneja con el pad
   ===================================================================== */
var BLOCK = { div:1, p:1, h1:1, h2:1, h3:1, h4:1, h5:1, h6:1, ul:1, ol:1, li:1, section:1, article:1, header:1, footer:1, nav:1, main:1, table:1, thead:1, tbody:1, tr:1, form:1, fieldset:1, details:1, pre:1, dl:1, dt:1, dd:1, caption:1, aside:1, figure:1 };
var SKIP = { script:1, style:1, option:1, svg:1, canvas:1, head:1, template:1, noscript:1, datalist:1 };
var HSIZE = { h1: 34, h2: 26, h3: 21, h4: 18, h5: 16, h6: 15 };
function hiddenEl(e) { return e.__hidden === true || (e.style && (e.style.display === 'none')); }
function isAct(e) {
  var t = lc(e);
  return t === 'button' || t === 'summary' || e.__a['data-a'] !== undefined || typeof e.onclick === 'function' || e.__a.role === 'button' || (t === 'a' && e.__a.href !== undefined) || (e.__L && e.__L.click && e.__L.click.length > 0);
}
function plain(e) {
  var s = '';
  (function w(n) {
    if (n.nodeType === 3) { s += clean(n.__t); return; }
    if (n.nodeType !== 1 || SKIP[lc(n)] || hiddenEl(n)) return;
    var t = lc(n); if (t === 'br' || BLOCK[t]) s += ' ';
    n.childNodes.forEach(w);
    if (BLOCK[t]) s += ' ';
  })(e);
  return s.replace(/\s+/g, ' ').trim();
}
function clean(t) { var o = ''; for (var i = 0; i < t.length; i++) { var ch = normCh(t.charAt(i)); if (ch === ' ' || GL[ch] || t.charCodeAt(i) === 10 || t.charCodeAt(i) === 9) o += ch; } return o; }
function hasCls(e, re) { return re.test(e.__a['class'] || ''); }
function buildItems(root) {
  var items = [], inl = '', st0 = null;
  function flush() { var t = inl.replace(/\s+/g, ' ').trim(); if (t) items.push({ k: 't', text: t, size: st0.size, bold: st0.bold, muted: st0.muted, head: st0.head }); inl = ''; }
  function walk(n, st) {
    if (n.nodeType === 3) { var ct = clean(n.__t); if (ct.trim() || inl) { if (!inl) st0 = st; inl += ct; } return; }
    if (n.nodeType !== 1) return;
    var t = lc(n);
    if (SKIP[t] || hiddenEl(n)) return;
    if (t === 'br') { flush(); return; }
    if (t === 'hr') { flush(); items.push({ k: 'hr' }); return; }
    if (t === 'input') {
      flush(); var ty = (n.__a.type || 'text').toLowerCase();
      if (ty === 'hidden' || ty === 'file') return;
      if (ty === 'checkbox' || ty === 'radio') items.push({ k: 'c', el: n, text: n.__a.title || n.__a['aria-label'] || n.__a.name || '', radio: ty === 'radio' });
      else if (ty === 'range') items.push({ k: 'g', el: n, text: n.__a.title || n.__a['aria-label'] || n.__a.name || '' });
      else if (ty === 'button' || ty === 'submit') items.push({ k: 'b', el: n, text: n.value || 'OK' });
      else items.push({ k: 'i', el: n, text: n.value, ph: n.__a.placeholder || '' });
      return;
    }
    if (t === 'textarea') { flush(); items.push({ k: 'i', el: n, text: n.value, ph: n.__a.placeholder || '' }); return; }
    if (t === 'select') { flush(); items.push({ k: 's', el: n, text: n.__a.title || n.__a['aria-label'] || '' }); return; }
    if (t === 'summary') { flush(); items.push({ k: 'sum', el: n, text: plain(n) }); return; }
    if (t === 'details' && !n.open) { flush(); n.childNodes.forEach(function (c) { if (lc(c) === 'summary') walk(c, st); }); return; }
    if (isAct(n)) {
      flush(); var tx2 = plain(n); if (!tx2) tx2 = n.__a.title || n.__a['aria-label'] || n.__a['data-a'] || '·';
      items.push({ k: 'b', el: n, text: tx2, pri: hasCls(n, /(^|\s)(pri|primary|cta|go|play|big)(\s|$)/), sel: hasCls(n, /(^|\s)(on|sel|selected|act|active|cur|chk)(\s|$)/) || n.__a['aria-pressed'] === 'true' });
      return;
    }
    var ns = { size: HSIZE[t] || st.size, bold: st.bold || !!HSIZE[t] || t === 'b' || t === 'strong' || t === 'th', muted: st.muted || hasCls(n, /(^|\s)(m|mut|muted|sub|hint|note)(\s|$)/), head: !!HSIZE[t] || st.head };
    if (hasCls(n, /(^|\s)(m|mut|muted|sub|hint|note|sm|small)(\s|$)/) || t === 'small') ns.size = Math.max(12, Math.round(st.size * 0.86));
    var blk = !!BLOCK[t];
    if (blk) flush();
    else if (t === 'span' && inl && !/\s$/.test(inl) && n.previousSibling && lc(n.previousSibling) === 'span') inl += '  \u00b7  ';
    if (t === 'li') { inl = '• '; st0 = ns; }
    n.childNodes.forEach(function (c) { walk(c, ns); });
    if (t === 'td' || t === 'th') inl += '   ';
    if (blk) flush();
  }
  var base = { size: 16, bold: false, muted: false, head: false };
  root.childNodes.forEach(function (c) { walk(c, base); });
  flush();
  return items;
}
function tw(str, px) { var w = 0, k = px / 16; for (var i = 0; i < str.length; i++) { var d = GL[normCh(str.charAt(i))]; w += (d ? d[0] : 9) * k; } return w; }
function wrap(text, px, maxW) {
  var words = text.split(' '), lines = [], cur = '';
  words.forEach(function (w) {
    var t = cur ? cur + ' ' + w : w;
    if (tw(t, px) <= maxW || !cur) { cur = t; while (tw(cur, px) > maxW && cur.length > 1) { var cut = cur.length - 1; while (cut > 1 && tw(cur.slice(0, cut), px) > maxW) cut--; lines.push(cur.slice(0, cut)); cur = cur.slice(cut); } }
    else { lines.push(cur); cur = w; }
  });
  if (cur) lines.push(cur);
  return lines;
}
var UI = { items: [], foc: -1, scroll: 0, sig: '', root: null, hold: {}, total: 0 };
function mainCtx() { return mainCanvas.getContext('2d'); }
function cssCol(v, d) { return parseColor(v || '') || d; }
function rgb(c, a) { return 'rgba(' + (c[0] | 0) + ',' + (c[1] | 0) + ',' + (c[2] | 0) + ',' + (a == null ? c[3] : a) + ')'; }
function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, 1]; }
function layoutItems(items, CW) {
  var y = 0, foc = [];
  items.forEach(function (it, idx) {
    var px = it.size || 16;
    it.focusable = (it.k === 'b' || it.k === 'sum' || it.k === 'c' || it.k === 's' || it.k === 'g');
    if (it.k === 't') {
      it.lines = wrap(it.text, px, CW); it.lh = Math.round(px * 1.32);
      it.top = y + (it.head ? 14 : 3); it.h = it.lines.length * it.lh; y = it.top + it.h + (it.head ? 6 : 2);
    } else if (it.k === 'hr') { it.top = y + 6; it.h = 2; y += 14; }
    else {
      var label = it.text || '';
      if (it.k === 's') { var o = optsOf(it.el), si = selIdx(it.el); label = (label ? label + ': ' : '') + '‹  ' + (si >= 0 ? (txt(o[si]).trim() || optVal(o[si])) : '-') + '  ›'; }
      else if (it.k === 'c') label = (it.el.checked ? '[x] ' : '[ ] ') + label;
      else if (it.k === 'g') { var mn = parseFloat(it.el.__a.min || 0), mxv = parseFloat(it.el.__a.max || 100), v = parseFloat(it.el.value); label = (label ? label + ': ' : '') + '‹  ' + (isNaN(v) ? '' : Math.round((v - mn) / (mxv - mn || 1) * 100) + '%') + '  ›'; }
      else if (it.k === 'i') label = it.text || it.ph || '...';
      else if (it.k === 'sum') label = (it.el.parentNode && it.el.parentNode.open ? '- ' : '+ ') + label;
      it.label = label; px = 16; it.size = px;
      it.lines = wrap(label, px, CW - 40); it.lh = Math.round(px * 1.32);
      it.top = y + 4; it.h = it.lines.length * it.lh + 22; y = it.top + it.h + 6;
    }
    if (it.focusable) foc.push(idx);
  });
  return { total: y, foc: foc };
}
function menuRoot() {
  var gm = byId.game, open = gm && gm.__hidden === false;
  if (open) {
    var ov = [['gm', 'gmc'], ['end', 'endc'], ['pm', 'pm']];
    for (var i = 0; i < ov.length; i++) {
      var w = byId[ov[i][0]], c = byId[ov[i][1]];
      if (w && w.__hidden === false && c && c.childNodes.length && !hiddenEl(c)) return { root: c, modal: true };
    }
    return null;
  }
  var ui = byId.ui;
  if (ui && !hiddenEl(ui)) return { root: ui, modal: false };
  return null;
}
function drawMenu(mr) {
  var c = mainCtx(), W = mainCanvas.__w, H = mainCanvas.__h, root = mr.root;
  var items = buildItems(root);
  var cw = Math.min(980, W - 120), x0 = Math.round((W - cw) / 2);
  var L = layoutItems(items, cw);
  var first = ''; for (var i0 = 0; i0 < items.length; i0++) if (items[i0].head) { first = items[i0].text; break; }
  var sig = (root.__a.id || '') + '|' + first;
  if (UI.root !== root || UI.sig !== sig) { UI.foc = L.foc.length ? L.foc[0] : -1; UI.scroll = 0; UI.root = root; UI.sig = sig; }
  if (UI.foc < 0 || UI.foc >= items.length || !items[UI.foc].focusable) UI.foc = L.foc.length ? L.foc[0] : -1;
  UI.items = items; UI.total = L.total; UI.focs = L.foc;
  var top = mr.modal ? 70 : 28, bot = 54, vh = H - top - bot;
  if (UI.foc >= 0) {
    var f = items[UI.foc];
    if (f.top - 10 < UI.scroll) UI.scroll = Math.max(0, f.top - 14);
    if (f.top + f.h + 10 > UI.scroll + vh) UI.scroll = f.top + f.h + 14 - vh;
  }
  UI.scroll = Math.max(0, Math.min(UI.scroll, Math.max(0, L.total - vh)));
  var de = document.documentElement.style, acc = cssCol(de['--a'], [62, 207, 142, 1]), bg = cssCol(de['--b1'], [14, 17, 24, 1]);
  bg = mix(bg, [10, 12, 18, 1], 0.55);
  var fgc = [232, 236, 244, 1], mu = [140, 150, 170, 1], btn = mix(bg, [255, 255, 255, 1], 0.09);
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.__s.clip = null; c.__s.fg = null;
  if (mr.modal) { c.fillStyle = 'rgba(0,0,0,0.72)'; c.fillRect(0, 0, W, H); c.fillStyle = rgb(bg, 1); c.fillRect(x0 - 24, top - 16, cw + 48, vh + 32); }
  else { c.fillStyle = rgb(bg, 1); c.fillRect(0, 0, W, H); c.fillStyle = rgb(mix(bg, acc, 0.12), 1); c.fillRect(0, 0, W, 6); }
  items.forEach(function (it, idx) {
    var y = Math.round(top + it.top - UI.scroll);
    if (y + it.h < top - 4 || y > top + vh + 4) return;
    var clipTop = top - 4, clipBot = top + vh + 4;
    c.__s.clip = [0, clipTop, W, clipBot];
    if (it.k === 't') {
      c.font = (it.bold ? 'bold ' : '') + it.size + 'px sans-serif'; c.textAlign = it.head ? 'center' : 'left'; c.textBaseline = 'top';
      c.fillStyle = rgb(it.head ? (idx === 0 || true ? mix(fgc, acc, 0.25) : fgc) : it.muted ? mu : fgc, 1);
      it.lines.forEach(function (ln, li) { c.fillText(ln, it.head ? x0 + cw / 2 : x0, y + li * it.lh); });
    } else if (it.k === 'hr') { c.fillStyle = rgb(mix(bg, fgc, 0.18), 1); c.fillRect(x0, y, cw, 2); }
    else {
      var on = idx === UI.foc, fill = it.pri ? mix(bg, acc, 0.35) : it.sel ? mix(btn, acc, 0.3) : btn;
      if (on) fill = mix(fill, acc, 0.28);
      c.fillStyle = rgb(on ? acc : mix(bg, fgc, 0.22), 1); c.fillRect(x0, y + 1, cw, it.h - 2); c.fillRect(x0 + 1, y, cw - 2, it.h);
      c.fillStyle = rgb(fill, 1); var bd = on ? 3 : 1; c.fillRect(x0 + bd, y + bd + 1, cw - bd * 2, it.h - bd * 2 - 2); c.fillRect(x0 + bd + 1, y + bd, cw - bd * 2 - 2, it.h - bd * 2);
      if (it.sel) { c.fillStyle = rgb(acc, 1); c.fillRect(x0 + 2, y + 4, 7, it.h - 8); }
      c.font = 'bold ' + it.size + 'px sans-serif'; c.textBaseline = 'top'; c.textAlign = (it.k === 's' || it.k === 'g' || it.k === 'c') ? 'center' : 'left';
      c.fillStyle = rgb(it.k === 'i' && !it.text ? mu : fgc, 1);
      var tx0 = c.textAlign === 'center' ? x0 + cw / 2 : x0 + 20;
      it.lines.forEach(function (ln, li) { c.fillText(ln, tx0, y + 11 + li * it.lh); });
    }
  });
  c.__s.clip = null;
  /* barra de scroll + ayuda */
  if (L.total > vh) { var bh = Math.max(24, vh * vh / L.total), by = top + (vh - bh) * (UI.scroll / (L.total - vh)); c.fillStyle = rgb(mix(bg, fgc, 0.3), 1); c.fillRect(W - 14, Math.round(by), 6, Math.round(bh)); }
  c.fillStyle = rgb(mix(bg, [0, 0, 0, 1], 0.4), 1); c.fillRect(0, H - 40, W, 40);
  c.font = 'bold 15px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = rgb(mu, 1);
  c.fillText('D-pad: mover      X: aceptar      O: volver      L1/R1: saltar', W / 2, H - 20);
  c.restore();
}
function drawHud() {
  var c = mainCtx(), W = mainCanvas.__w;
  function T(id) { var e = byId[id]; return e ? plain(e) : ''; }
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.__s.clip = null; c.__s.fg = null; c.globalAlpha = 1;
  var hh = 52, cols = (byId.sc || byId.hl || byId.hr) ? true : false;
  if (!cols) { c.restore(); return; }
  c.fillStyle = 'rgba(8,10,15,0.92)'; c.fillRect(0, 0, W, hh);
  c.textBaseline = 'middle';
  c.font = 'bold 22px sans-serif'; c.fillStyle = '#ffffff';
  c.textAlign = 'left'; c.fillText(T('hl'), 24, hh / 2);
  c.textAlign = 'right'; c.fillText(T('hr'), W - 24, hh / 2);
  c.textAlign = 'center'; c.font = 'bold 30px sans-serif'; c.fillText(T('sc') || '0 - 0', W / 2, hh / 2);
  c.font = 'bold 18px sans-serif'; c.fillStyle = '#c7cdd9'; c.textAlign = 'left'; c.fillText(T('tt'), W / 2 + 90, hh / 2);
  c.restore();
}

/* acciones del menu */
function fireVal(el) { el.dispatchEvent(mkEv('input', el)); el.dispatchEvent(mkEv('change', el)); }
function activate(it) {
  if (!it) return;
  var el = it.el;
  if (it.k === 'b') { el.dispatchEvent(mkEv('click', el)); }
  else if (it.k === 'sum') { var d = el.parentNode; if (d) { d.open = !d.open; d.dispatchEvent(mkEv('toggle', d, { bubbles: false })); } }
  else if (it.k === 'c') { if (it.radio) { el.checked = true; } else el.checked = !el.checked; fireVal(el); }
  else if (it.k === 's') adjust(it, 1);
  markDirty();
}
function adjust(it, dir) {
  var el = it.el;
  if (it.k === 's') { var o = optsOf(el); if (!o.length) return; var i = selIdx(el); i = (i + dir + o.length) % o.length; el.__si = i; fireVal(el); }
  else if (it.k === 'g') { var mn = parseFloat(el.__a.min || 0), mxv = parseFloat(el.__a.max || 100), st = parseFloat(el.__a.step || 1), v = parseFloat(el.value); if (isNaN(v)) v = mn; var stepv = Math.max(st, (mxv - mn) / 20); v = Math.max(mn, Math.min(mxv, v + dir * stepv)); el.__v = String(v); fireVal(el); }
  markDirty();
}
function moveFocus(dir) {
  var f = UI.focs || []; if (!f.length) return;
  var i = f.indexOf(UI.foc); if (i < 0) i = 0; else i = Math.max(0, Math.min(f.length - 1, i + dir));
  UI.foc = f[i]; markDirty();
}
function goBack() {
  var its = UI.items || [];
  for (var i = 0; i < its.length; i++) { var it = its[i]; if (it.k === 'b' && /^(‹|<|←|«)/.test(it.text)) { activate(it); return true; } }
  for (i = 0; i < its.length; i++) { it = its[i]; if (it.k === 'b' && /(inicio|volver|atr[aá]s|cerrar|cancelar|salir|menu|menú)/i.test(it.text)) { activate(it); return true; } }
  return false;
}
function menuPress(name) {
  var it = UI.items && UI.items[UI.foc];
  if (name === 'up') moveFocus(-1); else if (name === 'down') moveFocus(1);
  else if (name === 'l1' || name === 'l2') moveFocus(-5); else if (name === 'r1' || name === 'r2') moveFocus(5);
  else if (name === 'left') { if (it && (it.k === 's' || it.k === 'g')) adjust(it, -1); }
  else if (name === 'right') { if (it && (it.k === 's' || it.k === 'g')) adjust(it, 1); }
  else if (name === 'cross') activate(it);
  else if (name === 'circle') goBack();
}

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
var prev = 0, lastMode = '', rep = {};
g.__boot = function () {
  document.readyState = 'complete';
  document.__fire('DOMContentLoaded', { type: 'DOMContentLoaded' });
  g.__fire('DOMContentLoaded', { type: 'DOMContentLoaded' });
  g.__fire('load', { type: 'load' });
};
function frameInner(t, mask) {
  now = t;
  var mr = mainCanvas ? menuRoot() : null, gameOn = !!(byId.game && byId.game.__hidden === false);
  var diff = mask ^ prev;
  for (var i = 0; i < 16; i++) {
    var b = 1 << i;
    if (diff & b) {
      var down = !!(mask & b);
      if (mr) { if (down) { menuPress(BTN[i]); rep[i] = t + 380; } else rep[i] = 0; }
      else {
        var k = MAP[BTN[i]];
        if (k) { var type = down ? 'keydown' : 'keyup'; document.__fire(type, keyEvent(type, k)); g.__fire(type, keyEvent(type, k)); }
      }
    } else if (mr && (mask & b) && rep[i] && t >= rep[i] && (i === 0 || i === 1 || i === 2 || i === 3)) { menuPress(BTN[i]); rep[i] = t + 110; }
  }
  prev = mask;
  var due = timers.filter(function (x) { return x.t <= now; }).sort(function (a, b) { return a.t - b.t; });
  due.forEach(function (x) {
    if (x.iv) x.t = now + x.iv; else timers = timers.filter(function (y) { return y !== x; });
    try { x.f.apply(null, x.a); } catch (e) { g.console.log('ERR timer: ' + (e && e.stack || e)); }
  });
  var before = drawCount;
  var cbs = raf; raf = [];
  cbs.forEach(function (r) { try { r.f(t); } catch (e) { g.console.log('ERR raf: ' + (e && e.stack || e)); } });
  if (!mainCanvas) return;
  var gameDrew = drawCount !== before;
  mr = menuRoot();
  var mode = gameOn ? 'game' : 'menu';
  if (mode !== lastMode) { uiDirty = true; lastMode = mode; }
  if (gameOn) {
    if (gameDrew) { drawHud(); if (mr) drawMenu(mr); uiDirty = false; }
    else if (mr && uiDirty) { drawMenu(mr); uiDirty = false; }
  } else if (mr && uiDirty) { drawMenu(mr); uiDirty = false; }
  else if (!mr && uiDirty) { uiDirty = false; }
}
g.__frame = function (t, mask) {
  cur = [];
  try { frameInner(t, mask); }
  catch (e) { g.console.log('ERR frame: ' + (e && e.stack || e)); }
  if (cur.length) { last = cur; idleFrames = 0; } else if (last) { idleFrames++; if (!REPLAY_SETTLE || idleFrames <= REPLAY_SETTLE) replay(last); }
};
})(globalThis);

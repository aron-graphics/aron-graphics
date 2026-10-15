// <vs-calendar-heatmap> — native Web Component. ZERO dependencies. Copy this one
// file and use <vs-calendar-heatmap weeks="26" unit="commits"> anywhere: React,
// Svelte, Vue, vanilla.
//
// VsCalendar family — the calendar as an ACTIVITY MAP. Instead of a month to
// pick from, the last N weeks are laid out as a contribution graph (columns =
// weeks, rows = weekdays) and every day is shaded by how much happened on it.
// Built for dashboards: commits, workouts, sales, sessions.
//
//   • Data: `data` property ({ 'YYYY-MM-DD': count }) — or, without it, a
//     deterministic seeded series (`seed`) so the demo never flickers.
//   • Hover / focus a day → a tooltip that FOLLOWS on two real springs (it
//     travels, so it is not a CSS transition) and the cell lifts.
//   • Hover a legend swatch → every other intensity dims: read one band at a time.
//   • Click / Enter → selects the day (emits `change`), the footer reads it out.
//   • Keyboard: ←/→ one week, ↑/↓ one day, Home/End, Enter/Space. Touch: scrub
//     horizontally across the grid with a finger.
//   • `demo` walks the tooltip over the busiest days on a loop (card preview).

const HTMLElement = globalThis.HTMLElement ?? class {}; // SSR: no DOM on the server

// ── proximity glow engine (shared, module-level — one pointermove listener +
//    one rAF for every instance) ───────────────────────────────────────────────
const _subs = new Set();
let _px = 0, _py = 0, _hasPtr = false, _raf = 0, _on = false, _io = null;
function _flush() {
  _raf = 0; if (!_hasPtr) return;
  for (const s of _subs) {
    if (!s.visible) continue;
    if (s.disabled()) { if (s.lastI !== 0) { s.el.style.setProperty('--glow', '0'); s.lastI = 0; } continue; }
    if (!s.rect) s.rect = s.el.getBoundingClientRect();
    const r = s.rect;
    const nx = Math.max(r.left, Math.min(_px, r.right)), ny = Math.max(r.top, Math.min(_py, r.bottom));
    const i = Math.max(0, 1 - Math.hypot(_px - nx, _py - ny) / s.radius);
    if (i === 0 && s.lastI === 0) continue;
    s.el.style.setProperty('--gx', `${_px - r.left}px`);
    s.el.style.setProperty('--gy', `${_py - r.top}px`);
    s.el.style.setProperty('--glow', i.toFixed(3)); s.lastI = i;
  }
}
function _move(e) { _px = e.clientX; _py = e.clientY; _hasPtr = true; if (!_raf) _raf = requestAnimationFrame(_flush); }
function _inval() { for (const s of _subs) s.rect = null; if (_hasPtr && !_raf) _raf = requestAnimationFrame(_flush); }
function attachGlow(el, radius, disabled) {
  if (!_on) {
    _on = true;
    globalThis.addEventListener?.('pointermove', _move, { passive: true });
    globalThis.addEventListener?.('scroll', _inval, { passive: true, capture: true });
    globalThis.addEventListener?.('resize', _inval, { passive: true });
    _io = new IntersectionObserver((es) => { for (const e of es) for (const s of _subs) if (s.el === e.target) { s.visible = e.isIntersecting; if (e.isIntersecting) s.rect = null; } });
  }
  const s = { el, radius, disabled, rect: null, visible: true, lastI: 0 };
  _subs.add(s); _io.observe(el);
  return () => { _subs.delete(s); _io.unobserve(el); };
}

// ── `color` — repaints the BASE colour (white ink on dark, black on light) by
//    overriding the design tokens on the host. ────────────────────────────────
let vsBrandProbe;
function vsBrandRgb(value) {
  vsBrandProbe ||= document.createElement('canvas').getContext('2d');
  if (!vsBrandProbe) return null;
  vsBrandProbe.fillStyle = '#000';
  vsBrandProbe.fillStyle = value;
  const s = vsBrandProbe.fillStyle;
  if (s.charAt(0) === '#') return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const m = s.match(/[\d.]+/g);
  return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : null;
}
const VS_BRAND_TOKENS = ['--ui-accent', '--inp-accent', '--btn-primary-bg', '--card-ink', '--ui-ring', '--inp-ring', '--fx-tint', '--ring', '--rip', '--ui-accent-fg', '--badge-solid-fg', '--btn-primary-fg', '--accent-fg', '--btn-primary-rip', '--btn-primary-glow', '--btn-primary-bg-hover', '--vs-color', '--vs-color-rgb', '--vs-color-fg'];
function vsApplyColor(host, value) {
  const rgb = value ? vsBrandRgb(String(value).trim()) : null;
  if (!rgb) { for (const t of VS_BRAND_TOKENS) host.style.removeProperty(t); return; }
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
  const light = lum > 0.45;
  const fill = `rgb(${rgb[0]} ${rgb[1]} ${rgb[2]})`;
  const hover = rgb.map((c) => Math.round(light ? c * 0.92 : c + (255 - c) * 0.16));
  const set = (t, v) => host.style.setProperty(t, v);
  for (const t of ['--ui-accent', '--inp-accent', '--btn-primary-bg', '--card-ink']) set(t, fill);
  set('--btn-primary-bg-hover', `rgb(${hover[0]} ${hover[1]} ${hover[2]})`);
  for (const t of ['--ui-ring', '--inp-ring', '--fx-tint', '--ring', '--rip']) set(t, rgb.join(' '));
  for (const t of ['--ui-accent-fg', '--badge-solid-fg', '--btn-primary-fg', '--accent-fg']) set(t, light ? '#0b0b0b' : '#ffffff');
  for (const t of ['--btn-primary-rip', '--btn-primary-glow']) set(t, light ? '0 0 0' : '255 255 255');
  set('--vs-color', fill);
  set('--vs-color-rgb', rgb.join(' '));
  set('--vs-color-fg', light ? '#0b0b0b' : '#ffffff');
}

// ── real spring (semi-implicit Euler, two substeps — house motion doctrine) ──
class Spring {
  x = 0; v = 0; target = 0;
  constructor(k = 260, d = 17, eps = 0.002) { this.k = k; this.d = d; this.eps = eps; }
  step(dt) {
    const h = dt / 2;
    for (let i = 0; i < 2; i++) {
      const a = -this.k * (this.x - this.target) - this.d * this.v;
      this.v += a * h; this.x += this.v * h;
    }
  }
  get settled() { return Math.abs(this.v) < this.eps * 10 && Math.abs(this.x - this.target) < this.eps; }
  snap() { this.x = this.target; this.v = 0; }
}

// ── date helpers ─────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const safeDate = (d) => (d instanceof Date && !Number.isNaN(d.getTime()) ? d : new Date());
function toISO(d) { d = safeDate(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseISO(s) {
  const [y, m, d] = String(s || '').split('T')[0].split('-').map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  return new Date(y, m - 1, d);
}
const today = () => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); };
function addDays(d, n) { d = safeDate(d); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
const dayDiff = (a, b) => Math.round((safeDate(b) - safeDate(a)) / 86400000);
// deterministic 0..1 noise from a string — seeded demo data that never flickers
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}
const reducedMotion = () => !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// tiny element factory
function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
// CSS shared by every surface: hairline panel, masked proximity ring.
const SURFACE_CSS = (p) => `
  .${p}-surface { position:absolute; inset:0; z-index:0; border-radius:inherit; pointer-events:none;
    background: var(--bg-card, #0a0a0a); border: 1px solid var(--sel-menu-border, rgba(255,255,255,.09)); }
  .${p}-glow { position:absolute; inset:-1px; z-index:1; border-radius:inherit; padding:1px; pointer-events:none;
    background:
      radial-gradient(90px circle at var(--gx,50%) var(--gy,50%), rgb(var(--glow-rgb,255 255 255) / .42), rgb(var(--glow-rgb,255 255 255) / .18) 40%, transparent 72%),
      radial-gradient(240px circle at var(--gx,50%) var(--gy,50%), rgb(var(--glow-rgb,255 255 255) / .26), transparent 80%);
    -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); -webkit-mask-composite: xor;
    mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0); mask-composite: exclude;
    opacity: calc(var(--glow,0) * .8); transition: opacity 140ms; }
  .${p}-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip:rect(0 0 0 0); white-space:nowrap; }
`;

const CSS = `
  :host { --preview-fit: contain; display:inline-block; vertical-align:top; max-width:100%;
    width: calc(var(--weeks, 26) * 16px + 64px); font-family: inherit; }
  .chm { --hm-rgb: var(--vs-color-rgb, var(--ui-ring, 255 255 255)); --g: 3px;
    position:relative; isolation:isolate; border-radius:18px; color:var(--text,#ededed);
    user-select:none; -webkit-user-select:none; font-size:var(--ctrl-fs-md,14px); }
  @supports (corner-shape: squircle) { .chm { corner-shape: squircle; } }
  .chm--t-success { --hm-rgb: 62 207 142; --glow-rgb: 62 207 142; }
  .chm--t-warn { --hm-rgb: 245 166 35; --glow-rgb: 245 166 35; }
  .chm--t-danger { --hm-rgb: 255 99 105; --glow-rgb: 255 99 105; }
  .chm-in { position:relative; z-index:2; padding:16px 16px 14px; }

  .chm-head { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin-bottom:14px; flex-wrap:wrap; }
  .chm-total { font-size:22px; font-weight:650; letter-spacing:-.02em; line-height:1; font-variant-numeric: tabular-nums; }
  .chm-cap { margin-top:6px; font-size:12px; color:var(--text-secondary,#a1a1a1); line-height:1.2; }
  .chm-streak { display:flex; gap:14px; }
  .chm-stat { text-align:right; }
  .chm-stat b { display:block; font-size:13px; font-weight:600; font-variant-numeric:tabular-nums; }
  .chm-stat span { display:block; margin-top:3px; font-size:11px; color:var(--text-muted,#666); }

  .chm-board { position:relative; container-type:inline-size; width:100%; }
  .chm-cols { --c: clamp(7px, calc((100cqi - 30px - (var(--weeks, 26) - 1) * var(--g)) / var(--weeks, 26)), 13px); }
  .chm-months { position:relative; height:16px; margin-left:30px; font-size:10.5px; color:var(--text-muted,#666); }
  .chm-month { position:absolute; top:0; left:calc(var(--col) * (var(--c) + var(--g))); white-space:nowrap; text-transform:capitalize; }
  .chm-body { display:flex; gap:0; }
  .chm-wd { width:30px; flex:none; display:grid; grid-template-rows:repeat(7, var(--c)); row-gap:var(--g);
    font-size:10px; color:var(--text-muted,#666); }
  .chm-wd span { line-height:var(--c); height:var(--c); overflow:visible; white-space:nowrap; }
  .chm-grid { position:relative; display:grid; grid-template-rows:repeat(7, var(--c)); grid-auto-columns:var(--c);
    gap:var(--g); outline:none; touch-action: pan-y; border-radius:4px; }
  .chm-grid:focus-visible { outline:2px solid rgb(var(--ui-ring,255 255 255) / .55); outline-offset:4px; }
  .chm-row { display:contents; }
  .chm-cell { position:relative; width:var(--c); height:var(--c); border-radius:calc(var(--c) * .28); cursor:pointer;
    background: color-mix(in srgb, var(--text,#ededed) 8%, transparent);
    transition: transform 220ms cubic-bezier(.34,1.56,.64,1), opacity 180ms ease, box-shadow 160ms ease; }
  .chm-cell[data-l='1'] { background: rgb(var(--hm-rgb) / .2); }
  .chm-cell[data-l='2'] { background: rgb(var(--hm-rgb) / .4); }
  .chm-cell[data-l='3'] { background: rgb(var(--hm-rgb) / .64); }
  .chm-cell[data-l='4'] { background: rgb(var(--hm-rgb) / .95); }
  .chm-cell.is-future { visibility:hidden; pointer-events:none; }
  .chm-cell.is-hot { transform:scale(1.4); z-index:2; box-shadow: 0 0 0 1.5px var(--bg-card,#0a0a0a), 0 0 0 3px rgb(var(--hm-rgb) / .9); }
  .chm-cell.is-sel { box-shadow: 0 0 0 1.5px var(--bg-card,#0a0a0a), 0 0 0 3px var(--text,#ededed); z-index:1; }
  .chm-cell.is-today::after { content:''; position:absolute; inset:28%; border-radius:50%; background: var(--bg-card,#0a0a0a); opacity:.85; }
  .chm-grid:focus-visible .chm-cell.is-focus { box-shadow: 0 0 0 1.5px var(--bg-card,#0a0a0a), 0 0 0 3px rgb(var(--ui-ring,255 255 255) / .85); z-index:2; }
  .chm[data-lv] .chm-cell { opacity:.18; }
  .chm[data-lv='0'] .chm-cell[data-l='0'], .chm[data-lv='1'] .chm-cell[data-l='1'], .chm[data-lv='2'] .chm-cell[data-l='2'],
  .chm[data-lv='3'] .chm-cell[data-l='3'], .chm[data-lv='4'] .chm-cell[data-l='4'] { opacity:1; }

  .chm-grid.is-enter .chm-cell { animation: chm-in 520ms cubic-bezier(.34,1.56,.64,1) both;
    animation-delay: calc(var(--w) * 16ms + var(--r) * 22ms); }
  @keyframes chm-in { 0% { transform:scale(0); opacity:0; } 100% { transform:scale(1); opacity:1; } }

  .chm-tip { position:absolute; left:0; top:0; z-index:5; pointer-events:none; white-space:nowrap;
    padding:6px 9px; border-radius:9px; font-size:11.5px; line-height:1.2;
    background: var(--text,#ededed); color: var(--bg,#000);
    opacity:0; transition: opacity 140ms ease; will-change: transform, opacity; }
  .chm-tip b { font-weight:650; font-variant-numeric:tabular-nums; }
  .chm-tip.is-on { opacity:1; }
  .chm-tip::after { content:''; position:absolute; left:var(--ax, 50%); bottom:-4px; width:8px; height:8px; margin-left:-4px;
    background:inherit; transform:rotate(45deg); border-radius:1.5px; }

  .chm-foot { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:14px; flex-wrap:wrap; }
  .chm-detail { font-size:12px; color:var(--text-secondary,#a1a1a1); min-height:16px; min-width:0; }
  .chm-detail b { color:var(--text,#ededed); font-weight:600; }
  .chm-legend { display:flex; align-items:center; gap:4px; font-size:11px; color:var(--text-muted,#666); }
  .chm-legend span:first-child { margin-right:3px; } .chm-legend span:last-child { margin-left:3px; }
  .chm-sw { width:13px; height:13px; padding:0; border:0; border-radius:4px; cursor:pointer;
    background: color-mix(in srgb, var(--text,#ededed) 8%, transparent);
    transition: transform 180ms cubic-bezier(.34,1.56,.64,1); }
  .chm-sw[data-l='1'] { background: rgb(var(--hm-rgb) / .2); } .chm-sw[data-l='2'] { background: rgb(var(--hm-rgb) / .4); }
  .chm-sw[data-l='3'] { background: rgb(var(--hm-rgb) / .64); } .chm-sw[data-l='4'] { background: rgb(var(--hm-rgb) / .95); }
  .chm-sw:hover, .chm-sw:focus-visible { transform:scale(1.3); }
  .chm.is-disabled { opacity:.5; pointer-events:none; }
  @media (pointer: coarse) { .chm-sw { width:22px; height:22px; border-radius:6px; } }
  @media (prefers-reduced-motion: reduce) {
    .chm-grid.is-enter .chm-cell { animation:none; }
    .chm-cell, .chm-sw, .chm-tip { transition:none; }
  }
  ${SURFACE_CSS('chm')}
`;

class VsCalendarHeatmap extends HTMLElement {
  static observedAttributes = ['color', 'tone', 'weeks', 'end', 'seed', 'unit', 'week-start', 'locale', 'value', 'disabled', 'demo'];

  #r = {}; #cells = []; #data = null; #sel = ''; #focus = ''; #hot = '';
  #tipX = new Spring(320, 26, 0.1); #tipY = new Spring(320, 26, 0.1); #tipRaf = 0; #tipLast = 0; #tipInit = false;
  #countRaf = 0; #enterT = 0; #demoT = 0; #demoN = 0; #detachGlow = null; #built = false; #userTouched = false;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = h('style'); style.textContent = CSS;
    const r = this.#r;
    r.panel = h('div', 'chm');
    const surface = h('span', 'chm-surface'); surface.setAttribute('aria-hidden', 'true');
    r.glow = h('span', 'fx-glow chm-glow'); r.glow.setAttribute('aria-hidden', 'true');
    surface.appendChild(r.glow);
    const inner = h('div', 'chm-in');

    const head = h('div', 'chm-head');
    const ttl = h('div');
    r.total = h('div', 'chm-total', '0');
    r.cap = h('div', 'chm-cap');
    ttl.append(r.total, r.cap);
    const streak = h('div', 'chm-streak');
    const st1 = h('div', 'chm-stat'); r.longest = h('b'); st1.append(r.longest, h('span', '', 'Longest streak'));
    const st2 = h('div', 'chm-stat'); r.current = h('b'); st2.append(r.current, h('span', '', 'Current'));
    streak.append(st1, st2);
    head.append(ttl, streak);

    r.board = h('div', 'chm-board');
    const cols = h('div', 'chm-cols');
    r.months = h('div', 'chm-months'); r.months.setAttribute('aria-hidden', 'true');
    const body = h('div', 'chm-body');
    r.wd = h('div', 'chm-wd'); r.wd.setAttribute('aria-hidden', 'true');
    r.grid = h('div', 'chm-grid'); r.grid.setAttribute('role', 'grid'); r.grid.tabIndex = 0;
    body.append(r.wd, r.grid);
    cols.append(r.months, body);
    r.tip = h('div', 'chm-tip'); r.tip.setAttribute('aria-hidden', 'true');
    r.board.append(cols, r.tip);

    const foot = h('div', 'chm-foot');
    r.detail = h('div', 'chm-detail'); r.detail.setAttribute('aria-live', 'polite');
    r.legend = h('div', 'chm-legend');
    r.legend.append(h('span', '', 'Less'));
    for (let l = 0; l <= 4; l++) {
      const b = h('button', 'chm-sw'); b.type = 'button'; b.dataset.l = String(l);
      b.setAttribute('aria-pressed', 'false');
      b.setAttribute('aria-label', l === 0 ? 'Highlight days with no activity' : `Highlight intensity level ${l} of 4`);
      r.legend.appendChild(b);
    }
    r.legend.append(h('span', '', 'More'));
    foot.append(r.detail, r.legend);

    inner.append(head, r.board, foot);
    r.panel.append(surface, inner);
    root.append(style, r.panel);
    this.#wire();
  }

  connectedCallback() {
    vsApplyColor(this, this.getAttribute('color'));
    this.#sync(true);
    this.#detachGlow ||= attachGlow(this.#r.glow, 260, () => this.hasAttribute('disabled'));
    this.#syncDemo();
  }
  disconnectedCallback() {
    this.#detachGlow?.(); this.#detachGlow = null;
    cancelAnimationFrame(this.#tipRaf); cancelAnimationFrame(this.#countRaf);
    clearTimeout(this.#enterT); clearInterval(this.#demoT); this.#demoT = 0;
  }
  attributeChangedCallback(name, o, n) {
    if (name === 'color') vsApplyColor(this, n);
    if (!this.#built || o === n) { if (name === 'demo') this.#syncDemo(); return; }
    if (name === 'value') this.#sel = n || '';
    if (name === 'demo') { this.#syncDemo(); return; }
    this.#sync(['weeks', 'end', 'seed'].includes(name));
  }

  // ── public API ──────────────────────────────────────────────────────────────
  get data() { return this.#data; }
  set data(v) { this.#data = v && typeof v === 'object' ? v : null; if (this.#built) this.#sync(true); }
  get value() { return this.#sel; }
  set value(v) { this.#sel = v ? String(v) : ''; if (this.#built) this.#paintState(); }

  #a(n, d) { const v = this.getAttribute(n); return v == null || v === '' ? d : v; }
  #weeks() { return clamp(parseInt(this.#a('weeks', '26'), 10) || 26, 4, 53); }
  #end() { return parseISO(this.#a('end', '')) || today(); }
  #locale() { return this.#a('locale', 'en-US'); }
  #wsIdx() { return this.getAttribute('week-start') === 'sun' ? 0 : 1; }

  #count(iso, dow) {
    if (this.#data) return Math.max(0, Number(this.#data[iso]) || 0);
    const seed = this.#a('seed', 'vuesax');
    const n = hash01(seed + iso);
    if (n < 0.2) return 0;
    const d = parseISO(iso);
    const wk = Math.floor(dayDiff(new Date(2020, 0, 6), d) / 7);
    const sprint = 0.55 + 0.45 * Math.sin(wk * 0.9 + hash01(seed) * 6);
    const weekend = dow === 0 || dow === 6 ? 0.32 : 1;
    return Math.round(Math.pow(n, 1.7) * 22 * weekend * (0.35 + sprint));
  }

  // ── build every cell (only when the window changes), then paint state ──────
  #sync(rebuild = false) {
    const r = this.#r;
    if (!this.#built) { this.#sel = this.getAttribute('value') || ''; }
    const weeks = this.#weeks();
    this.style.setProperty('--weeks', String(weeks));
    r.panel.className = `chm chm--t-${this.#a('tone', 'default')}` + (this.hasAttribute('disabled') ? ' is-disabled' : '');
    r.grid.tabIndex = this.hasAttribute('disabled') ? -1 : 0;
    r.panel.setAttribute('aria-disabled', String(this.hasAttribute('disabled')));
    if (rebuild || !this.#built) this.#build(weeks);
    this.#built = true;
    this.#paintState();
  }

  #build(weeks) {
    const r = this.#r, loc = this.#locale(), ws = this.#wsIdx();
    const end = this.#end();
    const endOffset = (end.getDay() - ws + 7) % 7;
    const start = addDays(end, -endOffset - (weeks - 1) * 7);
    const fmt = new Intl.DateTimeFormat(loc, { weekday: 'short', month: 'short', day: 'numeric' });
    const unit = this.#a('unit', 'contributions');
    const endISO = toISO(end), todayISO = toISO(today());
    this.#cells = [];
    const rows = [];
    for (let d = 0; d < 7; d++) { const row = h('div', 'chm-row'); row.setAttribute('role', 'row'); rows.push(row); }
    let max = 0;
    for (let w = 0; w < weeks; w++) {
      for (let d = 0; d < 7; d++) {
        const date = addDays(start, w * 7 + d);
        const iso = toISO(date);
        const future = iso > endISO;
        const count = future ? 0 : this.#count(iso, date.getDay());
        if (count > max) max = count;
        this.#cells.push({ iso, date, w, d, count, future, label: fmt.format(date) });
      }
    }
    const level = (c) => (c <= 0 ? 0 : clamp(Math.ceil((c / Math.max(1, max)) * 4), 1, 4));
    for (const c of this.#cells) {
      c.l = level(c.count);
      const el = h('span', 'chm-cell' + (c.future ? ' is-future' : '') + (c.iso === todayISO ? ' is-today' : ''));
      el.setAttribute('role', 'gridcell');
      el.id = 'd' + c.iso;
      el.dataset.iso = c.iso; el.dataset.l = String(c.l);
      el.style.cssText = `grid-row:${c.d + 1};grid-column:${c.w + 1};--w:${c.w};--r:${c.d}`;
      el.setAttribute('aria-label', `${c.count} ${unit}, ${c.label}`);
      c.el = el;
      rows[c.d].appendChild(el);
    }
    r.grid.replaceChildren(...rows);
    r.grid.setAttribute('aria-label', `${unit} over the last ${weeks} weeks`);

    // month labels: first column whose first day starts a new month
    const mfmt = new Intl.DateTimeFormat(loc, { month: 'short' });
    const months = [];
    let last = -1;
    for (let w = 0; w < weeks; w++) {
      const d0 = addDays(start, w * 7);
      const m = d0.getMonth();
      if (m !== last) {
        if (!(w === 0 && d0.getDate() > 21) && !(months.length && w - months[months.length - 1].w < 3)) months.push({ w, m: mfmt.format(addDays(d0, 6)) });
        last = m;
      }
    }
    r.months.replaceChildren(...months.map((o) => { const s = h('span', 'chm-month', o.m); s.style.setProperty('--col', String(o.w)); return s; }));
    // weekday labels (Mon / Wed / Fri rhythm)
    const wf = new Intl.DateTimeFormat(loc, { weekday: 'short' });
    r.wd.replaceChildren(...Array.from({ length: 7 }, (_, i) => h('span', '', i % 2 === 0 && i < 6 ? wf.format(addDays(start, i)) : '')));

    // stats
    const live = this.#cells.filter((c) => !c.future);
    const total = live.reduce((s, c) => s + c.count, 0);
    let longest = 0, run = 0;
    for (const c of live) { run = c.count > 0 ? run + 1 : 0; if (run > longest) longest = run; }
    let current = 0;
    for (let i = live.length - 1; i >= 0 && live[i].count > 0; i--) current++;
    this.#stats = { total, longest, current, unit, top: live.reduce((a, c) => (c.count > (a?.count ?? -1) ? c : a), null) };
    const nf = new Intl.NumberFormat(loc);
    r.cap.textContent = `${unit} in the last ${weeks >= 8 ? Math.round(weeks / 4.345) + ' months' : weeks + ' weeks'}`;
    r.longest.textContent = `${longest} ${longest === 1 ? 'day' : 'days'}`;
    r.current.textContent = `${current} ${current === 1 ? 'day' : 'days'}`;
    this.#countUp(total, nf);

    if (!this.#focus || !this.#cells.some((c) => c.iso === this.#focus && !c.future)) this.#focus = this.#sel || endISO;
    // entrance cascade (week by week)
    if (!reducedMotion()) {
      r.grid.classList.remove('is-enter'); void r.grid.offsetWidth; r.grid.classList.add('is-enter');
      clearTimeout(this.#enterT);
      this.#enterT = setTimeout(() => r.grid.classList.remove('is-enter'), weeks * 16 + 7 * 22 + 600);
    }
  }
  #stats = null; #pinLv = '';

  #countUp(total, nf) {
    cancelAnimationFrame(this.#countRaf);
    const el = this.#r.total;
    el.textContent = nf.format(total);
    if (reducedMotion() || document.hidden) return;
    const t0 = performance.now(), D = 900;
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / D), e = 1 - Math.pow(1 - p, 3);
      el.textContent = nf.format(Math.round(total * e));
      if (p < 1) this.#countRaf = requestAnimationFrame(tick);
    };
    this.#countRaf = requestAnimationFrame(tick);
  }

  #paintState() {
    for (const c of this.#cells) {
      c.el.classList.toggle('is-sel', c.iso === this.#sel);
      c.el.classList.toggle('is-focus', c.iso === this.#focus);
      c.el.setAttribute('aria-selected', String(c.iso === this.#sel));
    }
    const f = this.#cells.find((c) => c.iso === this.#focus);
    if (f) this.#r.grid.setAttribute('aria-activedescendant', f.el.id);
    this.#paintDetail();
  }
  #paintDetail() {
    const r = this.#r, s = this.#stats; if (!s) return;
    const nf = new Intl.NumberFormat(this.#locale());
    const c = this.#cells.find((x) => x.iso === this.#sel);
    const b = (t) => { const e = h('b', '', t); return e; };
    if (c) r.detail.replaceChildren(b(`${nf.format(c.count)} ${s.unit}`), ` on ${c.label}`);
    else if (s.top) r.detail.replaceChildren('Busiest: ', b(s.top.label), ` · ${nf.format(s.top.count)}`);
  }

  // ── tooltip — follows the hovered cell on two springs ──────────────────────
  #showTip(iso) {
    const r = this.#r;
    const c = this.#cells.find((x) => x.iso === iso && !x.future);
    if (this.#hot && this.#hot !== iso) this.#cells.find((x) => x.iso === this.#hot)?.el.classList.remove('is-hot');
    if (!c) { this.#hideTip(); return; }
    this.#hot = iso; c.el.classList.add('is-hot');
    const nf = new Intl.NumberFormat(this.#locale());
    r.tip.replaceChildren(h('b', '', `${nf.format(c.count)} ${this.#stats.unit}`), ` · ${c.label}`);
    const br = r.board.getBoundingClientRect(), cr = c.el.getBoundingClientRect();
    const tw = r.tip.offsetWidth, th = r.tip.offsetHeight;
    const cx = cr.left - br.left + cr.width / 2;
    const x = clamp(cx - tw / 2, -6, br.width - tw + 6);
    const y = cr.top - br.top - th - 9;
    r.tip.style.setProperty('--ax', `${clamp(cx - x, 10, tw - 10)}px`);
    this.#tipX.target = x; this.#tipY.target = y;
    if (!this.#tipInit || reducedMotion()) { this.#tipX.snap(); this.#tipY.snap(); this.#tipInit = true; this.#renderTip(); }
    else if (!this.#tipRaf) { this.#tipLast = 0; this.#tipRaf = requestAnimationFrame(this.#tipTick); }
    r.tip.classList.add('is-on');
  }
  #hideTip() {
    this.#r.tip.classList.remove('is-on');
    if (this.#hot) this.#cells.find((x) => x.iso === this.#hot)?.el.classList.remove('is-hot');
    this.#hot = ''; this.#tipInit = false;
  }
  #renderTip() { this.#r.tip.style.transform = `translate3d(${this.#tipX.x.toFixed(2)}px, ${this.#tipY.x.toFixed(2)}px, 0)`; }
  #tipTick = (t) => {
    const dt = Math.min(0.032, this.#tipLast ? (t - this.#tipLast) / 1000 : 1 / 60); this.#tipLast = t;
    this.#tipX.step(dt); this.#tipY.step(dt); this.#renderTip();
    if (this.#tipX.settled && this.#tipY.settled) { this.#tipX.snap(); this.#tipY.snap(); this.#renderTip(); this.#tipRaf = 0; }
    else this.#tipRaf = requestAnimationFrame(this.#tipTick);
  };

  #select(iso, emit = true) {
    const c = this.#cells.find((x) => x.iso === iso && !x.future); if (!c) return;
    this.#sel = c.iso; this.#focus = c.iso;
    this.setAttribute('value', c.iso);
    this.#paintState();
    if (emit) this.dispatchEvent(new CustomEvent('change', { bubbles: true, composed: true, detail: { value: c.iso, count: c.count } }));
  }

  #wire() {
    const r = this.#r;
    const cellAt = (e) => e.target.closest?.('.chm-cell');
    r.grid.addEventListener('pointerover', (e) => { const c = cellAt(e); if (c) this.#showTip(c.dataset.iso); });
    r.grid.addEventListener('pointerleave', () => this.#hideTip());
    r.grid.addEventListener('pointerdown', (e) => {
      this.#stopDemo();
      if (e.pointerType !== 'mouse') {
        const c = cellAt(e); if (c) this.#showTip(c.dataset.iso);
        try { r.grid.setPointerCapture?.(e.pointerId); } catch {}
      }
    });
    // touch scrub: the finger slides across days and the tooltip follows
    r.grid.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || !e.buttons) return;
      const el = this.shadowRoot.elementFromPoint?.(e.clientX, e.clientY);
      const c = el?.closest?.('.chm-cell'); if (c) this.#showTip(c.dataset.iso);
    });
    r.grid.addEventListener('pointerup', (e) => { if (e.pointerType !== 'mouse' && this.#hot) this.#select(this.#hot); });
    r.grid.addEventListener('click', (e) => { const c = cellAt(e); if (c && e.pointerType !== 'touch' && e.pointerType !== 'pen') this.#select(c.dataset.iso); });
    r.grid.addEventListener('focus', () => { this.#stopDemo(); this.#paintState(); });
    r.grid.addEventListener('blur', () => this.#hideTip());
    r.grid.addEventListener('keydown', (e) => {
      const live = this.#cells.filter((c) => !c.future);
      const i = live.findIndex((c) => c.iso === this.#focus);
      let j = i;
      switch (e.key) {
        case 'ArrowUp': j = i - 1; break;
        case 'ArrowDown': j = i + 1; break;
        case 'ArrowLeft': j = i - 7; break;
        case 'ArrowRight': j = i + 7; break;
        case 'Home': j = 0; break;
        case 'End': j = live.length - 1; break;
        case 'Enter': case ' ': e.preventDefault(); if (live[i]) this.#select(live[i].iso); return;
        case 'Escape': this.#hideTip(); return;
        default: return;
      }
      e.preventDefault();
      j = clamp(j, 0, live.length - 1);
      this.#focus = live[j].iso; this.#paintState(); this.#showTip(this.#focus);
    });
    const showLv = (l) => { if (l == null || l === '') delete r.panel.dataset.lv; else r.panel.dataset.lv = l; };
    const swAt = (e) => e.target.closest?.('.chm-sw');
    r.legend.addEventListener('pointerover', (e) => { const b = swAt(e); if (b) showLv(b.dataset.l); });
    r.legend.addEventListener('pointerleave', () => showLv(this.#pinLv));
    r.legend.addEventListener('focusin', (e) => { const b = swAt(e); if (b) showLv(b.dataset.l); });
    r.legend.addEventListener('focusout', () => showLv(this.#pinLv));
    // click pins a band (stays isolated after the pointer leaves); click again unpins
    r.legend.addEventListener('click', (e) => {
      const b = swAt(e); if (!b) return;
      this.#pinLv = this.#pinLv === b.dataset.l ? '' : b.dataset.l;
      for (const s of r.legend.querySelectorAll('.chm-sw')) s.setAttribute('aria-pressed', String(s.dataset.l === this.#pinLv));
      showLv(this.#pinLv || b.dataset.l);
    });
    r.panel.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.#stopDemo(); });
  }

  // ── demo: the tooltip tours the busiest days, then one gets selected ────────
  #syncDemo() {
    const on = this.hasAttribute('demo') && !this.#userTouched && this.isConnected;
    if (on && !this.#demoT) {
      this.#demoN = 0;
      this.#demoT = setInterval(() => {
        const live = this.#cells.filter((c) => !c.future && c.l >= 3);
        if (!live.length) return;
        const c = live[Math.floor(hash01('demo' + this.#demoN++) * live.length)];
        this.#showTip(c.iso);
        if (this.#demoN % 4 === 0) this.#select(c.iso, false);
      }, 1500);
    } else if (!on && this.#demoT) { clearInterval(this.#demoT); this.#demoT = 0; }
  }
  #stopDemo() { if (this.#demoT) { this.#userTouched = true; clearInterval(this.#demoT); this.#demoT = 0; this.#hideTip(); } }
}

if (globalThis.customElements && !customElements.get('vs-calendar-heatmap')) customElements.define('vs-calendar-heatmap', VsCalendarHeatmap);

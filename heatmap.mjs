#!/usr/bin/env node
// Renders the Vuesax <vs-calendar-heatmap> card as two static SVG files — one
// for a dark page, one for a light one — so a GitHub README can show it without
// running a line of JavaScript.
//
// Every number below is read off the component's own stylesheet: the cell is at
// most 13px wide with a 3px gap, the weekday column is 30px, the month strip is
// 16px tall, the card is padded 16/16/14 and rounded by 18px, and the five
// intensity steps are the base ink at 8%, 20%, 40%, 64% and 95%.
//
//   node heatmap.mjs --login aron-graphics --out assets
//
// Without a token it draws the component's own seeded demo series, so the
// command never fails for want of credentials.

const DEFAULTS = {
  login: process.env.GITHUB_LOGIN || 'aron-graphics',
  weeks: 26,
  out: 'assets',
  locale: 'de-DE',
  unit: 'Beiträge',
  weekStart: 'mon',
  color: '',
  scale: 'quantile',
  end: '',
  seed: 'vuesax',
  token: process.env.HEATMAP_TOKEN || process.env.GITHUB_TOKEN || '',
  requireData: false,
  animate: true,
};

const STRINGS = {
  'de-DE': {
    longest: 'Längste Serie', current: 'Aktuell', day: 'Tag', days: 'Tage',
    inTheLast: (n, u) => `${u} in den letzten ${n}`, months: (n) => `${n} Monaten`,
    weeksUnit: (n) => `${n} Wochen`, busiest: 'Fleißigster Tag: ', less: 'Weniger', more: 'Mehr',
  },
  'en-US': {
    longest: 'Longest streak', current: 'Current', day: 'day', days: 'days',
    inTheLast: (n, u) => `${u} in the last ${n}`, months: (n) => `${n} months`,
    weeksUnit: (n) => `${n} weeks`, busiest: 'Busiest: ', less: 'Less', more: 'More',
  },
};

// ── the component's design tokens, resolved for each page background ─────────
const THEMES = {
  dark: {
    name: 'dark', card: '#0a0a0a', bg: '#000000', border: 'rgba(255,255,255,.09)',
    text: '#ededed', secondary: '#a1a1a1', muted: '#666666', ink: '255 255 255',
  },
  light: {
    name: 'light', card: '#ffffff', bg: '#ffffff', border: 'rgba(0,0,0,.09)',
    text: '#0b0b0b', secondary: '#5f5f5f', muted: '#8a8a8a', ink: '0 0 0',
  },
};
// .chm-cell[data-l] — 0 is the base ink at 8%, the rest is the heat colour
const ALPHA = [0.08, 0.2, 0.4, 0.64, 0.95];

// ── dates, as the component counts them ──────────────────────────────────────
const pad = (n) => String(n).padStart(2, '0');
const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const parseISO = (s) => {
  const [y, m, d] = String(s || '').split('T')[0].split('-').map(Number);
  return Number.isFinite(y) && Number.isFinite(m) && Number.isFinite(d) ? new Date(y, m - 1, d) : null;
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dayDiff = (a, b) => Math.round((b - a) / 86400000);

// the component's seeded fallback series, so a tokenless run still draws
function hash01(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15;
  return (h >>> 0) / 4294967295;
}
function seededCount(seed, iso, dow) {
  const n = hash01(seed + iso);
  if (n < 0.2) return 0;
  const wk = Math.floor(dayDiff(new Date(2020, 0, 6), parseISO(iso)) / 7);
  const sprint = 0.55 + 0.45 * Math.sin(wk * 0.9 + hash01(seed) * 6);
  const weekend = dow === 0 || dow === 6 ? 0.32 : 1;
  return Math.round(Math.pow(n, 1.7) * 22 * weekend * (0.35 + sprint));
}

// ── text, measured roughly so right-aligned groups land where they should ────
const W_CLASSES = [
  [/[ ]/, 0.278], [/[.,:;'·]/, 0.3], [/[ij!|lI]/, 0.26], [/[fjrt]/, 0.34],
  [/[0-9]/, 0.556], [/[A-Z]/, 0.68], [/[mwM W]/, 0.84], [/[a-zäöüß]/, 0.54],
];
function estW(str, size) {
  let w = 0;
  for (const ch of String(str)) {
    let f = 0.56;
    for (const [re, v] of W_CLASSES) if (re.test(ch)) { f = v; break; }
    w += f * size;
  }
  return w * 1.12; // measured against canvas metrics for the same stack
}
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// a colour given to --color repaints the heat ramp; the base ink stays the ink
function heatInk(theme, color) {
  if (!color) return theme.ink;
  const s = String(color).trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(' ');
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) { const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); if (p.length >= 3) return p.slice(0, 3).join(' '); }
  throw new Error(`--color akzeptiert #rgb, #rrggbb oder rgb(r g b), nicht ${s}`);
}

// ── the card ─────────────────────────────────────────────────────────────────
function render(opts, counts, theme) {
  const { weeks, locale, unit, weekStart } = opts;
  const t = STRINGS[locale] || STRINGS['en-US'];
  const ink = heatInk(theme, opts.color);
  const C = 13, G = 3, WD = 30, MONTHS_H = 16, PAD_X = 16, PAD_T = 16, PAD_B = 14;

  const end = parseISO(opts.end) || (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
  const ws = weekStart === 'sun' ? 0 : 1;
  const start = addDays(end, -((end.getDay() - ws + 7) % 7) - (weeks - 1) * 7);
  const endISO = toISO(end);
  const todayISO = toISO(new Date());

  const dayFmt = new Intl.DateTimeFormat(locale, { weekday: 'short', month: 'short', day: 'numeric' });
  const monthFmt = new Intl.DateTimeFormat(locale, { month: 'short' });
  const wdFmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  const nf = new Intl.NumberFormat(locale);

  // one cell per day of the window, future days left out of the drawing
  const cells = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 7; d++) {
      const date = addDays(start, w * 7 + d);
      const iso = toISO(date);
      const future = iso > endISO;
      const count = future ? 0 : (counts[iso] ?? (opts.useSeed ? seededCount(opts.seed, iso, date.getDay()) : 0));
      cells.push({ iso, date, w, d, count, future, label: dayFmt.format(date) });
    }
  }
  const live = cells.filter((c) => !c.future);
  const max = Math.max(1, ...live.map((c) => c.count));

  // `max` is the component's own ramp: four even steps up to the busiest day.
  // `quantile` spreads the same four steps over the days that saw activity, so
  // one outlier cannot flatten half a year into the palest shade.
  let level;
  if (opts.scale === 'quantile') {
    const active = live.filter((c) => c.count > 0).map((c) => c.count).sort((a, b) => a - b);
    const q = [0.25, 0.5, 0.75].map((p) => active[Math.min(active.length - 1, Math.floor(p * active.length))] || 1);
    level = (c) => (c <= 0 ? 0 : c <= q[0] ? 1 : c <= q[1] ? 2 : c <= q[2] ? 3 : 4);
  } else {
    level = (c) => (c <= 0 ? 0 : clamp(Math.ceil((c / max) * 4), 1, 4));
  }
  for (const c of cells) c.l = level(c.count);

  // head and foot copy
  const total = live.reduce((s, c) => s + c.count, 0);
  let longest = 0, run = 0;
  for (const c of live) { run = c.count > 0 ? run + 1 : 0; if (run > longest) longest = run; }
  let current = 0;
  for (let i = live.length - 1; i >= 0 && live[i].count > 0; i--) current++;
  const top = live.reduce((a, c) => (c.count > (a?.count ?? -1) ? c : a), null);
  const span = weeks >= 8 ? t.months(Math.round(weeks / 4.345)) : t.weeksUnit(weeks);
  const cap = t.inTheLast(span, unit);
  const plural = (n) => `${n} ${n === 1 ? t.day : t.days}`;

  // geometry — the host is weeks*16 + 64 wide, everything else follows
  const W = weeks * (C + G) + WD + PAD_X * 2 + 2;
  const gridW = weeks * C + (weeks - 1) * G;
  const gridH = 7 * C + 6 * G;
  const HEAD_H = 22 + 6 + Math.round(12 * 1.2);
  const FOOT_H = 16;
  const H = PAD_T + HEAD_H + 14 + MONTHS_H + gridH + 14 + FOOT_H + PAD_B;

  const gridX = PAD_X + WD;
  const gridY = PAD_T + HEAD_H + 14 + MONTHS_H;
  const footY = gridY + gridH + 14;

  const o = [];
  const p = (s) => o.push(s);
  const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, 'Noto Sans', sans-serif`;

  p(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${nf.format(total)} ${cap}`)}">`);
  p(`<title>${esc(`${nf.format(total)} ${cap}`)}</title>`);

  // The component's motion, rebuilt in CSS the SVG carries itself. A README
  // strips <script> and never forwards a pointer, so hover, click and keyboard
  // cannot survive the trip — but animation inside an image does, and these are
  // the three the component plays on its own: the grid cascading in week by
  // week, the total counting up, and `demo` walking the tooltip over the
  // busiest days. Nothing here depends on CSS running: every element already
  // sits in its final state, and the animations only take it away and bring it
  // back.
  const CASCADE = { cell: 520, perWeek: 16, perRow: 22 };
  const COUNT_MS = 900;
  const TOUR_STOP_MS = 1500;
  const tourStart = weeks * CASCADE.perWeek + 6 * CASCADE.perRow + CASCADE.cell - 400;
  const anim = [];
  if (opts.animate) {
    anim.push(
      `@keyframes vs-cell{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}`,
      `@keyframes vs-on{from{opacity:1}to{opacity:1}}`,
      `@keyframes vs-reveal{0%,98%{opacity:0}100%{opacity:1}}`,
      `.c{transform-box:fill-box;transform-origin:50% 50%;animation:vs-cell ${CASCADE.cell}ms cubic-bezier(.34,1.56,.64,1) both}`,
      `.n{opacity:0;animation:vs-on linear}`,
      `.nf{animation:vs-reveal ${COUNT_MS}ms linear both}`
    );
  }
  p(`<style>text{font-family:${FONT};}__ANIM__</style>`);

  // the card: a hairline panel, no drop shadow — the component's light-theme rule
  p(`<rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="17.5" fill="${theme.card}" stroke="${theme.border}"/>`);

  // head — the running total, what it counts, and the two streaks
  const totalAt = (y2) => `<text x="${PAD_X}" y="${PAD_T + 17}" fill="${theme.text}" font-size="22" font-weight="650" letter-spacing="-.44"`;
  if (!opts.animate) {
    p(`${totalAt()} >${esc(nf.format(total))}</text>`);
  } else {
    const FRAMES = 24, step = COUNT_MS / FRAMES;
    for (let i = 0; i < FRAMES; i++) {
      const e = 1 - Math.pow(1 - i / FRAMES, 3);
      p(`${totalAt()} class="n" style="animation-duration:${step.toFixed(1)}ms;animation-delay:${(i * step).toFixed(1)}ms">${esc(nf.format(Math.round(total * e)))}</text>`);
    }
    p(`${totalAt()} class="nf">${esc(nf.format(total))}</text>`);
  }
  p(`<text x="${PAD_X}" y="${PAD_T + 22 + 6 + 10}" fill="${theme.secondary}" font-size="12">${esc(cap)}</text>`);
  const statTop = PAD_T + HEAD_H - 31;
  const stat = (x, value, label) => {
    p(`<text x="${x}" y="${statTop + 11}" fill="${theme.text}" font-size="13" font-weight="600" text-anchor="end">${esc(value)}</text>`);
    p(`<text x="${x}" y="${statTop + 11 + 3 + 9}" fill="${theme.muted}" font-size="11" text-anchor="end">${esc(label)}</text>`);
  };
  const curX = W - PAD_X;
  const lonX = curX - Math.max(estW(t.current, 11), estW(plural(current), 13)) - 14;
  stat(lonX, plural(longest), t.longest);
  stat(curX, plural(current), t.current);

  // month strip — the first column of each new month, skipping a stub start and
  // any label that would crowd the one before it
  let last = -1;
  const labels = [];
  for (let w = 0; w < weeks; w++) {
    const d0 = addDays(start, w * 7);
    const m = d0.getMonth();
    if (m !== last) {
      if (!(w === 0 && d0.getDate() > 21) && !(labels.length && w - labels[labels.length - 1].w < 3)) {
        labels.push({ w, text: monthFmt.format(addDays(d0, 6)) });
      }
      last = m;
    }
  }
  for (const l of labels) {
    p(`<text x="${gridX + l.w * (C + G)}" y="${PAD_T + HEAD_H + 14 + 11}" fill="${theme.muted}" font-size="10.5">${esc(l.text)}</text>`);
  }

  // weekday column — the component labels rows 0, 2 and 4 only
  for (let i = 0; i < 7; i++) {
    if (i % 2 !== 0 || i >= 6) continue;
    const y = gridY + i * (C + G) + C / 2;
    p(`<text x="${PAD_X}" y="${y}" fill="${theme.muted}" font-size="10" dominant-baseline="central">${esc(wdFmt.format(addDays(start, i)))}</text>`);
  }

  // the grid
  const r = +(C * 0.28).toFixed(2);
  for (const c of cells) {
    if (c.future) continue;
    const x = gridX + c.w * (C + G);
    const y = gridY + c.d * (C + G);
    const fill = c.l === 0 ? theme.text : `rgb(${ink})`;
    const delay = opts.animate ? ` class="c" style="animation-delay:${c.w * CASCADE.perWeek + c.d * CASCADE.perRow}ms"` : '';
    p(`<rect x="${x}" y="${y}" width="${C}" height="${C}" rx="${r}" fill="${fill}" fill-opacity="${ALPHA[c.l]}"${delay}/>`);
    if (c.iso === todayISO) {
      const inset = C * 0.28;
      p(`<circle cx="${x + C / 2}" cy="${y + C / 2}" r="${+((C - inset * 2) / 2).toFixed(2)}" fill="${theme.card}" fill-opacity=".85"/>`);
    }
  }

  // foot — the busiest day on the left, the legend on the right
  if (top) {
    const head = esc(t.busiest);
    p(`<text x="${PAD_X}" y="${footY + 12}" font-size="12" fill="${theme.secondary}">${head}<tspan fill="${theme.text}" font-weight="600">${esc(top.label)}</tspan> · ${esc(nf.format(top.count))}</text>`);
  }
  const SW = 13, legendGap = 4;
  const legendMidY = footY + 8;
  const swatchesW = 5 * SW + 4 * legendGap;
  let lx = W - PAD_X - estW(t.more, 11) - 3 - swatchesW;
  p(`<text x="${lx - 3}" y="${legendMidY}" fill="${theme.muted}" font-size="11" text-anchor="end" dominant-baseline="central">${esc(t.less)}</text>`);
  for (let l = 0; l <= 4; l++) {
    const fill = l === 0 ? theme.text : `rgb(${ink})`;
    p(`<rect x="${+lx.toFixed(2)}" y="${legendMidY - SW / 2}" width="${SW}" height="${SW}" rx="4" fill="${fill}" fill-opacity="${ALPHA[l]}"/>`);
    lx += SW + legendGap;
  }
  p(`<text x="${W - PAD_X}" y="${legendMidY}" fill="${theme.muted}" font-size="11" text-anchor="end" dominant-baseline="central">${esc(t.more)}</text>`);


  // ── `demo`: the tooltip tours the busiest days, and the day under it lifts ──
  // The component picks among the days at level 3 and up every 1500ms. Here the
  // stops are fixed and spread across the window, so the loop reads as a walk
  // through the half year rather than a jitter in one corner.
  if (opts.animate) {
    const hot = live.filter((c) => c.l >= 3);
    const stops = [];
    const WANT = Math.min(5, hot.length);
    for (let i = 0; i < WANT; i++) {
      const slice = hot.filter((c) => c.w >= (i * weeks) / WANT && c.w < ((i + 1) * weeks) / WANT);
      const pick = (slice.length ? slice : hot).reduce((a, c) => (c.count > (a?.count ?? -1) ? c : a), null);
      if (pick && !stops.includes(pick)) stops.push(pick);
    }
    if (stops.length) {
      const T = stops.length * TOUR_STOP_MS;
      const pct = (ms) => ((ms / T) * 100).toFixed(3);
      stops.forEach((c, k) => {
        const cx = gridX + c.w * (C + G) + C / 2;
        const cy = gridY + c.d * (C + G) + C / 2;

        // the tooltip, sized to its own text
        const headText = `${nf.format(c.count)} ${unit}`;
        const tailText = ` · ${c.label}`;
        const tw = estW(headText, 11.5) * 1.05 + estW(tailText, 11.5) + 18;
        const th = 6 + Math.round(11.5 * 1.2) + 6;
        const tx = clamp(cx - tw / 2, PAD_X - 6, W - PAD_X - tw + 6);
        const ty = cy - C / 2 - th - 9;
        const ax = clamp(cx - tx, 10, tw - 10);

        // the lift: the component scales the day to 1.4 and rings it twice
        const hs = C * 1.4, hx = cx - hs / 2, hy = cy - hs / 2;
        const ringFill = c.l === 0 ? theme.text : `rgb(${ink})`;

        const prev = stops[(k - 1 + stops.length) % stops.length];
        const dx = (gridX + prev.w * (C + G) + C / 2 - cx) * 0.35;
        const dy = (gridY + prev.d * (C + G) + C / 2 - cy) * 0.35;

        const s0 = pct(k * TOUR_STOP_MS);
        const s1 = pct(k * TOUR_STOP_MS + 320);
        const s2 = pct((k + 1) * TOUR_STOP_MS - 200);
        const s3 = pct((k + 1) * TOUR_STOP_MS - 40);
        anim.push(
          `@keyframes vs-stop${k}{0%,${s0}%{opacity:0;transform:translate(${dx.toFixed(1)}px,${dy.toFixed(1)}px)}` +
          `${s1}%{opacity:1;transform:translate(0,0)}${s2}%{opacity:1;transform:translate(0,0)}` +
          `${s3}%,100%{opacity:0;transform:translate(0,0)}}`,
          `.s${k}{opacity:0;animation:vs-stop${k} ${T}ms cubic-bezier(.34,1.56,.64,1) ${tourStart}ms infinite both}`
        );

        p(`<g class="s${k}">`);
        p(`<rect x="${hx.toFixed(2)}" y="${hy.toFixed(2)}" width="${hs.toFixed(2)}" height="${hs.toFixed(2)}" rx="${(r * 1.4).toFixed(2)}" fill="${ringFill}" fill-opacity="${ALPHA[c.l]}"/>`);
        p(`<rect x="${hx.toFixed(2)}" y="${hy.toFixed(2)}" width="${hs.toFixed(2)}" height="${hs.toFixed(2)}" rx="${(r * 1.4).toFixed(2)}" fill="none" stroke="${theme.card}" stroke-width="3"/>`);
        p(`<rect x="${(hx - 2.25).toFixed(2)}" y="${(hy - 2.25).toFixed(2)}" width="${(hs + 4.5).toFixed(2)}" height="${(hs + 4.5).toFixed(2)}" rx="${(r * 1.4 + 2.25).toFixed(2)}" fill="none" stroke="rgb(${ink})" stroke-opacity=".9" stroke-width="1.5"/>`);
        p(`<path d="M${(tx + ax - 4).toFixed(2)} ${(ty + th - 1).toFixed(2)}h8l-4 5z" fill="${theme.text}"/>`);
        p(`<rect x="${tx.toFixed(2)}" y="${ty.toFixed(2)}" width="${tw.toFixed(2)}" height="${th}" rx="9" fill="${theme.text}"/>`);
        p(`<text x="${(tx + 9).toFixed(2)}" y="${(ty + th / 2).toFixed(2)}" font-size="11.5" fill="${theme.bg}" dominant-baseline="central"><tspan font-weight="650">${esc(headText)}</tspan>${esc(tailText)}</text>`);
        p(`</g>`);
      });
    }
  }

  // Someone who asked for less movement gets the card, standing still.
  if (opts.animate) anim.push('@media (prefers-reduced-motion:reduce){*{animation:none!important}.n{display:none}.nf,[class^="s"]{opacity:1}}');

  p('</svg>');
  const svg = o.join('\n').replace('__ANIM__', opts.animate ? anim.join('') : '') + '\n';
  return { svg, stats: { total, longest, current, max, top } };
}

// ── the calendar, from GitHub ────────────────────────────────────────────────
async function fetchCalendar(login, token, from, to) {
  const query = `query($login:String!,$from:DateTime!,$to:DateTime!){
    user(login:$login){ contributionsCollection(from:$from,to:$to){
      contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount } } } } }
  }`;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${token}`, 'content-type': 'application/json', 'user-agent': 'aron-graphics-heatmap' },
    body: JSON.stringify({ query, variables: { login, from: from.toISOString(), to: to.toISOString() } }),
  });
  if (!res.ok) throw new Error(`GitHub antwortete ${res.status} ${res.statusText}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors.map((e) => e.message).join('; '));
  const cal = body.data?.user?.contributionsCollection?.contributionCalendar;
  if (!cal) throw new Error(`Kein Kalender für ${login}`);
  const counts = {};
  for (const w of cal.weeks) for (const d of w.contributionDays) counts[d.date] = d.contributionCount;
  return counts;
}

function parseArgs(argv) {
  const o = { ...DEFAULTS, noAnimate: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const eq = a.indexOf('=');
    const key = (eq === -1 ? a.slice(2) : a.slice(2, eq)).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const val = eq === -1 ? argv[++i] : a.slice(eq + 1);
    if (!(key in o)) throw new Error(`Unbekannte Option --${a.slice(2)}`);
    if (key === 'requireData') { o[key] = true; if (eq === -1) i--; continue; }
    if (key === 'noAnimate') { o.animate = false; if (eq === -1) i--; continue; }
    o[key] = key === 'weeks' ? clamp(parseInt(val, 10) || 26, 4, 53) : val;
  }
  return o;
}

async function main() {
  const { writeFile, mkdir } = await import('node:fs/promises');
  const opts = parseArgs(process.argv.slice(2));
  if (!(opts.locale in STRINGS)) throw new Error(`--locale kennt nur ${Object.keys(STRINGS).join(' und ')}`);
  if (!['max', 'quantile'].includes(opts.scale)) throw new Error('--scale ist max oder quantile');

  const end = parseISO(opts.end) || (() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
  const ws = opts.weekStart === 'sun' ? 0 : 1;
  const start = addDays(end, -((end.getDay() - ws + 7) % 7) - (opts.weeks - 1) * 7);

  // --require-data is what a scheduled run passes: it must never fall back to
  // the demo series, because invented numbers on a profile are worse than a
  // red cross in the Actions tab.
  if (opts.requireData && !opts.token) {
    throw new Error(
      'Kein Token, aber --require-data: es gibt nichts Echtes zu zeichnen. ' +
      'Ein PAT mit read:user gehört als Secret HEATMAP_TOKEN hinterlegt.'
    );
  }
  let counts = {};
  if (opts.token) {
    counts = await fetchCalendar(opts.login, opts.token, start, addDays(end, 1));
  } else {
    opts.useSeed = true;
    console.warn('Kein Token — gezeichnet wird die Demo-Reihe der Vuesax-Quelle.');
  }

  const drawn = [THEMES.dark, THEMES.light].map((theme) => [theme, render(opts, counts, theme)]);
  const stats = drawn[0][1].stats;
  if (opts.requireData && stats.total === 0) {
    throw new Error(
      `Null Beiträge für ${opts.login} im ganzen Fenster. Meist steht in den ` +
      'Profileinstellungen "Include private contributions on my profile" auf aus — ohne den ' +
      'Schalter bleiben private Tage für jeden Token unsichtbar. Sonst ein klassisches PAT ' +
      'mit read:user als Secret HEATMAP_TOKEN hinterlegen.'
    );
  }
  await mkdir(opts.out, { recursive: true });
  for (const [theme, r] of drawn) await writeFile(`${opts.out}/heatmap-${theme.name}.svg`, r.svg);
  console.log(
    `${opts.out}/heatmap-{dark,light}.svg · ${stats.total} ${opts.unit}, ` +
    `Spitze ${stats.max} am ${stats.top?.iso ?? '–'}, Serie ${stats.longest} lang, aktuell ${stats.current}`
  );
}

main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });

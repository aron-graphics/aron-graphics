// Beschriftet <vs-calendar-heatmap> deutsch, ohne die Katalogquelle anzufassen.
//
// Der Baustein nimmt `locale` nur für Datum und Zahl. Seine Wörter — "Longest
// streak", "Busiest", "Less" — stehen fest im Quelltext, und `vs-calendar-heatmap.js`
// soll unverändert bleiben, damit ein späteres Update aus dem Katalog sie ohne
// Konflikt ersetzen kann. Also wird hier nachträglich umbeschriftet.
//
// Einmal nach dem Laden reicht nicht: #build() baut Kopf, Fuss und Legende bei
// jeder Datenänderung neu auf, #paintDetail schreibt die Fusszeile bei jedem
// Klick neu. Darum ein MutationObserver — und zwar auf den ganzen Schattenbaum,
// weil die Stellen sich nicht vorher anmelden, aber übersetzt wird nur in den
// vier Kästen, in denen überhaupt Wörter stehen. Die 182 Tageszellen bleiben
// damit aus dem Weg, auch während der Zähler 900ms lang jeden Frame schreibt.

const WOERTER = new Map([
  ['Longest streak', 'Längste Serie'],
  ['Current', 'Aktuell'],
  ['Busiest: ', 'Fleißigster Tag: '],
  ['Less', 'Weniger'],
  ['More', 'Mehr'],
  ['Highlight days with no activity', 'Tage ohne Aktivität hervorheben'],
]);

const MUSTER = [
  // "Beiträge in the last 6 months" — die Einheit steht schon deutsch im Attribut
  [/^(.*) in the last (\d+) (months|weeks)$/, (m) => `${m[1]} in den letzten ${m[2]} ${m[3] === 'months' ? 'Monaten' : 'Wochen'}`],
  // "135 days", "1 day"
  [/^(\d+) (days?)$/, (m) => `${m[1]} ${m[2] === 'day' ? 'Tag' : 'Tage'}`],
  // Fusszeile nach einem Klick: "<b>52 Beiträge</b> on Fr., 19. Juni"
  [/^ on (.+)$/, (m) => ` am ${m[1]}`],
  // aria-label des Rasters
  [/^(.*) over the last (\d+) weeks$/, (m) => `${m[1]} in den letzten ${m[2]} Wochen`],
  // aria-label der Legendenfelder
  [/^Highlight intensity level (\d+) of 4$/, (m) => `Stufe ${m[1]} von 4 hervorheben`],
];

function uebersetze(s) {
  if (!s) return null;
  const fest = WOERTER.get(s);
  if (fest !== undefined) return fest;
  for (const [re, bau] of MUSTER) {
    const m = re.exec(s);
    if (m) return bau(m);
  }
  return null;
}

// Nur dort, wo Wörter vorkommen. Die Zellen haben ihre eigenen aria-labels, die
// mit einer deutschen Einheit schon deutsch sind ("14 Beiträge, Mi., 8. Juli").
const KAESTEN = '.chm-cap, .chm-stat, .chm-detail, .chm-legend';
const BESCHRIFTET = '.chm-grid, .chm-sw';

function durchgehen(wurzel) {
  for (const kasten of wurzel.querySelectorAll(KAESTEN)) {
    const lauf = document.createTreeWalker(kasten, NodeFilter.SHOW_TEXT);
    for (let n = lauf.nextNode(); n; n = lauf.nextNode()) {
      const neu = uebersetze(n.nodeValue);
      // Nur schreiben, wenn sich etwas ändert — sonst löst der Schreibvorgang
      // den Beobachter wieder aus und die Sache dreht sich im Kreis.
      if (neu !== null && neu !== n.nodeValue) n.nodeValue = neu;
    }
  }
  for (const el of wurzel.querySelectorAll(BESCHRIFTET)) {
    const neu = uebersetze(el.getAttribute('aria-label'));
    if (neu !== null && neu !== el.getAttribute('aria-label')) el.setAttribute('aria-label', neu);
  }
}

export function aufDeutsch(host) {
  const wurzel = host.shadowRoot;
  if (!wurzel) return () => {};
  let geplant = 0;
  const lauf = () => { geplant = 0; durchgehen(wurzel); };
  const beobachter = new MutationObserver(() => { if (!geplant) geplant = requestAnimationFrame(lauf); });
  durchgehen(wurzel);
  beobachter.observe(wurzel, { childList: true, subtree: true, characterData: true });
  return () => { cancelAnimationFrame(geplant); beobachter.disconnect(); };
}

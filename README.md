### Aron Honold

Gestaltung und Code, meist beides am selben Tag. Was fertig ist, steht im Netz:

| Adresse                                            | Was es ist                                         |
| -------------------------------------------------- | -------------------------------------------------- |
| [aron.graphics](https://aron.graphics)             | Portfolio. Zweisprachig, statisch.                 |
| [tools.aron.graphics](https://tools.aron.graphics) | Werkzeuge, die vollständig im Browser rechnen.     |
| [ui.aron.graphics](https://ui.aron.graphics)       | Die eigene Bausteinsammlung.                       |

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/heatmap-dark.svg">
  <source media="(prefers-color-scheme: light)" srcset="assets/heatmap-light.svg">
  <img alt="Beiträge der letzten sechs Monate als Kalender-Heatmap" src="assets/heatmap-light.svg" width="480">
</picture>

<sub>Die Karte ist <a href="https://vuesax.com/c/vs-calendar-heatmap"><code>vs-calendar-heatmap</code></a> aus dem Vuesax-Katalog, als statisches SVG nachgezeichnet — eine README führt kein JavaScript aus. <a href="heatmap.mjs"><code>heatmap.mjs</code></a> holt den Beitragskalender über GraphQL und zeichnet beide Fassungen; <a href=".github/workflows/heatmap.yml">ein Workflow</a> stößt das jede Nacht an.</sub>

---

<sub>Selbst nachzeichnen: `node heatmap.mjs --login <name> --out assets`. Ohne Token zeichnet das Skript die Demo-Reihe der Vuesax-Quelle, mit `--scale max` die originale Farbrampe des Bausteins, und `--locale en-US --unit contributions` stellt es auf Englisch.</sub>

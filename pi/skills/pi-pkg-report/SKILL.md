---
name: pi-pkg-report
description: Übersicht ALLER installierten Pi-Erweiterungen — npm-Pakete aus settings.json UND Eigenbau-Extensions aus ~/.pi/agent/extensions/, beides immer zusammen. Vergleicht den Live-Stand mit dem HTML-Guide ~/pi-extensions-guide.html, aktualisiert die HTML bei neuen/entfernten Erweiterungen oder Versions-Änderungen und druckt eine Konsolen-Tabelle mit Kurzbeschreibung je Erweiterung. Use when the user asks about installed pi packages/extensions, wants the extensions overview or HTML guide, or asks to view pi-extensions-guide.html or other HTML/artifacts in the terminal.
---

# Pi-Package-Report — Live-Übersicht der installierten Erweiterungen

**Eiserne Regel:** Der Live-Stand steht IMMER in `~/.pi/agent/settings.json` (Feld `packages`,
npm-Pakete) UND live im Verzeichnis `~/.pi/agent/extensions/` (Eigenbau: `*.ts` direkt +
Unterverzeichnisse mit `.ts`, node_modules/tsconfig.json ausgenommen). Der Report umfasst
IMMER beide Quellen — ein Aufruf ohne Eigenbau-Zeilen ist falsch. Das HTML
`~/pi-extensions-guide.html` ist nur ein Cache, der gegen den Live-Stand abgeglichen wird —
niemals aus dem Gedächtnis antworten, immer frisch prüfen.

## Schritt 1 — Inventur (immer zuerst, deterministisch)

```bash
python3 <skill-dir>/scripts/report.py          # Diff + ANSI-Übersichtstabelle
python3 <skill-dir>/scripts/report.py --dl     # zusätzlich npm-Downloadstatistiken (langsamer, online)
```

Das Skript liefert:
- alle installierten npm-Pakete + Versionen (aus `~/.pi/agent/npm/node_modules/<pkg>/package.json`)
- Eigenbau-Extensions aus `~/.pi/agent/extensions/` (*.ts-Dateien direkt + Unterverzeichnisse
  mit .ts-Dateien; node_modules/tsconfig.json ausgenommen) — mit Änderungsdatum statt Version
- lokale Pfad-Pakete (falls vorhanden, gesondert aufgeführt)
- **Diff gegen das HTML**: fehlende Sektionen (NEU), Sektionen ohne Paket (ENTFERNT), Versions-Drift
- eine Kurztabelle mit 1-Zeiler je Paket (aus dem `<p class="lead">` der jeweiligen Sektion)

## Schritt 2 — Konsolen-Ausgabe (Pflicht, immer)

Gib dem User die Tabelle aus Schritt 1 als **Markdown-Tabelle** in der Konsole aus:
Nr, Paket, Version, Kategorie, 1-Zeiler — **inklusive aller Eigenbau-Zeilen** (Version-Spalte
dort = Änderungsdatum, Kategorie „Eigenbau"); niemals nur die npm-Pakete ausgeben. Damit
entscheidet er, ob die Kurzbeschreibung reicht oder ob er die HTML öffnet
(`xdg-open ~/pi-extensions-guide.html`). Bei nicht-leerem Diff:
sagen, was sich geändert hat und dass die HTML aktualisiert wird (Schritt 3).

## Schritt 3 — HTML-Reconciliation (nur wenn Diff nicht leer)

**Neue Pakete** — pro Paket:
1. README lesen: `head -100 ~/.pi/agent/npm/node_modules/<pkg>/README.md`
2. Version aus `package.json`, DL-Stats: `curl -s https://api.npmjs.org/downloads/point/last-month/<pkg>`
3. Kategorie zuordnen (bestehende: Kontext & Effizienz / Web & Wissen / Agenten & Ziele /
   Tools & Integration / Terminal & UI / Methodik — oder neue Kategorie, wenn nichts passt)
4. Sektion nach dem Template unten bauen und an der Kategorien-Position einfügen,
   TOC-Zeile + Quickref-Zeile ergänzen, Nummern (Quickref 1..N und Sektions-Kommentare)
   per Python-Skript **mit asserts** fixen — niemals von Hand umbrechen.

**Entfernte Pakete** — Sektion (inkl. umgebendem `<!-- ===... -->`-Kommentarblock), TOC-Zeile
und Quickref-Zeile löschen, renummerieren, danach muss `grep -i <name>` auf die Datei 0 Treffer
liefern (Querverweise anderer Sektionen entschärfen oder entfernen).

**Versions-Drift** — `chip ver` und Quickref-Versionszelle aktualisieren.

**Eigenbau-Extensions** (neu in `~/.pi/agent/extensions/`): analog zu neuen Paketen, aber
Quelle ist der Quelltext-Header (`head -40 ~/.pi/agent/extensions/<name>/index.ts` bzw.
`<name>.ts`) statt README; statt npm-/Versions-/DL-Chips nur
`<span class="chip">lokal: extensions/<name></span>`, Kategorie „Eigenbau“ (eigene TOC-h3,
Sektionen am Ende vor `</main>`, Quickref fortführen). Kein Versions-Drift — das Datum ist
nur Info. Entfernte Eigenbau-Extensions laufen über die normale ENTFERNT-Prozedur.

**Hero-Stats** prüfen: Anzahl Erweiterungen = Anzahl Sektionen; Kategorien zählen;
DL-Angabe grob plausibel halten.

### Sektions-Template (Struktur konsequent beibehalten)

```html
<!-- ============================================================
     N. PAKET-NAME (fortlaufende Nummer im HTML-Kommentar)
============================================================ -->
<section class="ext" id="<sektions-id>" data-name="<suchbegriffe klein, leerzeichen-getrennt, deutsch+englisch>">
  <div class="ext-header">
    <div class="ext-icon" style="background:rgba(R,G,B,.12); border:1px solid rgba(R,G,B,.3);">EMOJI</div>
    <div class="ext-title">
      <h2>paket-name</h2>
      <div class="pkg">
        <span class="chip cat">Kategorie</span>
        <span class="chip">npm: paket-name</span>
        <span class="chip ver">v1.2.3</span>
        <span class="chip">~XX Tsd DL/Monat</span>
      </div>
    </div>
  </div>
  <div class="ext-body">
    <p class="lead"><b>Aufhänger:</b> ein Lead-Absatz, was das Paket kann.</p>
    <h4>Abschnitt</h4>
    <ul><li>...</li></ul>
    <div class="code"><div class="code-head"><span>Pi-Session</span><button class="copy-btn">kopieren</button></div>
<pre><span class="c"># Kommentar</span>
<span class="p">Du:</span> beispiele
<span class="o">/command</span></pre></div>
    <div class="tip green|red|blue|yellow"><span class="tip-ico">💡|⚠️|ℹ️</span><div><b>Titel:</b> Hinweis …</div></div>
  </div>
</section>
```

Code-Span-Klassen im Tutorial: `c`=Kommentar, `p`=Prompt, `hl`=Tool-Call, `s`=String,
`o`=Slash-Command. TOC-Zeile: `<a href="#<sektions-id>"><span class="ico">EMOJI</span> anzeigename</a>`
unter der passenden `<h3>`-Kategorie. Quickref-Zeile:
`<tr><td>N</td><td class="nm"><a href="#<sektions-id>">name</a></td><td>VERSION</td><td>Kategorie-kurz</td><td>Kernfunktion</td><td>Einstieg</td></tr>`

### Validierung nach JEDER HTML-Änderung (Pflicht)

```bash
python3 <skill-dir>/scripts/validate.py   # Exit 0 = ok, 1 = Fehler, 2 = Setup
```

Prüft automatisch: VOID-Tags (`meta br hr img input link source wbr`), Stack-Balance,
alle `href="#…"`-Anker müssen als `id` existieren, `section.ext`-Anzahl == npm-Pakete in
settings.json + Eigenbau-Extensions in `~/.pi/agent/extensions/`, Quickref-Nummern
lückenlos 1..N. Erst bei Exit 0 gilt die Änderung als fertig.

Zwei Stolperfallen beim HTML-Editieren:
- **Kein ASCII-`"` innerhalb doppelt-gequoteter Attributwerte** — es beendet das Attribut
  früh und bricht das Parsing (z.B. Suchfeld-Platzhalter: deutsche Anführungszeichen
  `„…“` nutzen, nie `"…"`). Melden pi-lens oder der Validator Escape-Fehler auf einer
  Zeile, zuerst auf ein gerades Quote suchen, das das Attribut vorzeitig schließt.
- **Ein unplausibles Validator-Ergebnis (z.B. „0 Anker-Links“ bei 14 Sektionen) ist ein
  Checker-Bug, kein Clean-Pass** — mit zweiter Methode (regex) gegengeprüfen, nie
  Ergebnis 0/Kommentar-lose einfach als ok werten.

## Schritt 4 — HTML/Artefakte im Terminal ansehen (auf Wunsch)

```bash
python3 <skill-dir>/scripts/view.py                 # rendert ~/pi-extensions-guide.html im Terminal
python3 <skill-dir>/scripts/view.py <datei.html>     # beliebige simple HTML-Datei
python3 <skill-dir>/scripts/view.py --full           # inkl. Tutorial-Codeblöcke
python3 <skill-dir>/scripts/view.py --links          # OSC-8-Hyperlinks (klickbar)
python3 <skill-dir>/scripts/report.py --links    # Guide-Pfad als klickbarer Link
```

Rendert Überschriften, Chips (Version etc.), Quickref-Tabelle, Listen und Tipps als ANSI-Text
mit Terminal-Breite — kein Browser, keine Abhängigkeiten. `--full` zeigt auch `<pre>`-Tutorials.
`--links` erzeugt OSC-8-Hyperlinks: Titel + jede Sektionsüberschrift verlinkt auf
`file://…html#anker` — in WezTerm/kitty/Ghostty (tmux ≥ 3.4 leitet durch) klickbar,
Öffnen per xdg-open (HTML → Browser, springt direkt zur Sektion). Terminals ohne
OSC-8-Support zeigen bei --links Roh-Escapes — dann weglassen.

Optional für echtes Browsen (nicht nötig für den Guide):
`nix profile install nixpkgs#w3m` (Text-Browser) bzw. `nixpkgs#chafa` (Bilder im Terminal).

Klickbare Datei-Pfade im Terminal: in `~/.config/wezterm/wezterm.lua` macht eine
`hyperlink_rules`-Regel jeden absoluten Pfad `/home/…` klickbar (öffnet per xdg-open,
HTML-Dateien im Browser). Voraussetzung: WezTerm ≥ OSC-8-Support; tmux ≥ 3.4 leitet
Links durch. Im pi-TUI erscheinen Pfade als Text — die Regel hyperlinkt sie trotzdem.

## Schritt 5 — Kollisions-Check (nach jeder Installation/Entfernung oder auf Wunsch)

```bash
python3 <skill-dir>/check.py           # ANSI-Report; Exit-Code 1 bei harten Kollisionen
python3 <skill-dir>/check.py --json    # maschinenlesbar
```

Prüft zwei Ebenen:

1. **Harte Kollisionen** (Code-Scan über `registerCommand`/`registerTool` in allen
   .js/.ts der installierten Pakete + Skill-Namen aus SKILL.md-Frontmatter inkl.
   User-Skills): identische Command-/Tool-/Skill-Namen in 2+ Paketen → rot, kritisch.
   Es werden NUR die Pakete aus settings.json gescannt, keine Transitiv-Abhängigkeiten.
2. **Weiche Überlappungen** (kuratierte Rollen-Matrix `ROLES` + `VERDICTS` in check.py):
   Pakete mit gemeinsamen funktionalen Rollen werden paarweise ausgegeben mit Bewertung
   „OK — … (ergänzend)“ oder „ÜBERLAPPUNG PRÜFEN“, wenn kein Verdict hinterlegt ist.

Pflege bei neuen Paketen: in `ROLES` eine Rollen-Menge ergänzen (klein halten, z.B.
{"delegation", "code-review"}) und für jedes neue Überlappungspaar mit bekannter Bewertung
 einen Eintrag in `VERDICTS` hinterlegen (Key: `frozenset({a, b})`). Fehlt die Classification,
listet das Skript das Paket unter „Ohne Rollen-Classification“ auf.

Exit-Codes: 0 = sauber, 1 = harte Kollision, 2 = Setup-Fehler.

## Schritt 6 — Terminal-Preview in tmux-Splits (auf Wunsch)

```bash
python3 <skill-dir>/preview.py <datei>            # inline in aktueller Pane
python3 <skill-dir>/preview.py --split <datei>    # rechte Pane (45 %) mit Live-Vorschau
python3 <skill-dir>/preview.py --both  <datei>    # neues Fenster: links Code, rechts Vorschau
python3 <skill-dir>/preview.py --code <datei>     # Code-Ansicht erzwingen (bat)
```

Typ-Erkennung: Bilder (png/jpg/gif/webp/bmp/ico/svg/tiff) → `chafa --format symbols`
(mit `-s <pane_width>x<pane_height-4>` via TMUX_PANE-Abfrage — Sixel-Format NICHT nutzen,
tmux schluckt es!), HTML → `view.py` (Terminal-Render), alles andere → `bat` (Fallback `cat`).
`--split`/`--both` starten automatisch den `--watch`-Modus (mtime-Polling 0,8 s):
Änderungen an der Datei erscheinen sofort in der Vorschau. Vorschau-Panes schließen mit
Strg-d/`exit`/C-c. `--both` ist für HTML gedacht (Code links, gerenderte Vorschau rechts);
bei Nicht-HTML fällt es auf `--split` zurück. Voraussetzungen: tmux-Session (TMUX-Env),
bat ✓ installiert, chafa via `nix profile install nixpkgs#chafa`.

## Wichtig

- npm-Warnungen (`install-scripts`) bei `pi install/remove` sind harmlose Sicherheitshinweise.
- npm-Name ≠ Sektions-ID möglich: `@plannotator/pi-extension` → Sektion `plannotator`.
  Das Mapping steht in `report.py` (Dict `SECTION_ALIAS`) — bei neuen Sonderfällen ergänzen.
- DL-Zahlen im HTML sind Schnappschüsse; bei jeder Reconciliation frisch ziehen und die
  `~XX Tsd/Mio DL/Monat`-Chips aktualisieren.

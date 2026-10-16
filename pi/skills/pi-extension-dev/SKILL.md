---
name: pi-extension-dev
description: Pi-Coding-Agent-Extensions bauen, sicher installieren und deren TUI-Verhalten reproduzierbar testen/debuggen: API-Verifikation aus types.d.ts, Widgets/Overlays/Maus+Tastatur, Reload-sicherer State, isolierte Testumgebung, atomare Installation, tmux-Test-Harness und Extension-Bisect.
---

# pi-extension-dev

# Pi-Extension-Entwicklung (ExtensionAPI + TUI-Debugging)

Klasse: Extensions für den Pi-Coding-Agent bauen, deren UI-Verhalten testen und TUI-Artefakte auf den Verursacher zurückführen.

## Procedure

### 1. API verifizieren, nicht raten
- Doku zuerst: `$PI/docs/extensions.md` und `$PI/docs/tui.md` komplett lesen (`$PI` = Install-Pfad, hier `/home/gamzat/.pi/agent/install/releases/1.2.0/node_modules/@earendil-works/pi-coding-agent`).
- Exakte Signaturen aus `$PI/dist/core/extensions/types.d.ts` greppen (`setWidget`, `custom(`, `registerShortcut`, `on("tool_result"`); Komponenten-APIs aus `$PI/node_modules/@earendil-works/pi-tui/dist/*.d.ts`. Der write/edit-Tool-Typecheck meldet jede Abweichung — als Check nutzen, nicht wegcasten.
- UI-Zugriff NUR über das 2. Handler-Argument (`(ev, ctx)` / Shortcut-/Command-Handler `ctx`). `ExtensionAPI` selbst hat kein `.ui`/`.mode`. Guards: `ctx.mode === "tui"` (TUI-only UI), `ctx.hasUI` (Dialoge).

### 2. UI-Bausteine
- **Widget (non-blocking):** `ctx.ui.setWidget(key, string[] | undefined, { placement: "aboveEditor" | "belowEditor" })`; `undefined` entfernt.
- **Overlay:** `ctx.ui.custom<T>((tui, theme, keybindings, done) => Component, { overlay: true })`. Component braucht `render(width): string[]` UND `invalidate(): void` (no-op reicht); Fokus via `focused` + `handleInput(data)`; Maus via `handleMouse(ev): TuiMouseEventResult` — `ev.type` ist `"press"|"release"|"move"|"drag"|"click"|"wheel"`, `ev.wheelDelta < 0` = hoch, `ev.x/ev.y` sind LOKAL zur Komponente (eigene rowMap beim Rendern mitführen = klickbare Zeilen).
- **Tasten:** `matchesKey(data, keyId)`; Shift-Kombis als `"shift+r"` (nicht `"R"`); gültig u. a. `"escape"`, `"return"`, `"space"`, `"home"`, `"end"`.
- **Imports:** `@earendil-works/pi-coding-agent` (ExtensionAPI, ExtensionContext, Theme, KeybindingsManager) und `@earendil-works/pi-tui` (matchesKey, visibleWidth, Focusable, TUI, TuiMouseEvent) — Pi's Loader löst die auf.
- Vorlagen: `$PI/examples/extensions/overlay-test.ts` (Focusable+Overlay), `widget-placement.ts`.
- **Eingeklapptes Denken umbeschriften:** `ctx.ui.setHiddenThinkingLabel(label)` ist ein offizieller ui-Hook; global zugeklapptes Denken = pi-Einstellung `hideThinkingBlock: true` (settings.json). Pi's Klick-Toggle auf den Thinking-Block bleibt dabei aktiv.

### 3. Robustheit
- Jeder Handler in try/catch; Fehler in eigene Log-Datei (`fs.appendFileSync`), nie crashen.
- **State auf Modulebene** deklarieren, nicht in der Factory-Closure: Pi feuert bei Extension-Reload (`/reload`, Settings-Change) die Factory neu; der Modul-Cache bleibt, die Closure nicht.
- `session_start` auch bei `reason: "reload"` feuern — Buffer NICHT bei Reload leeren, nur bei echter neuer Session (`reason !== "reload"`).
- **Keine destruktiven Einzeltasten** in Overlays (clear/dismiss nie auf unmodifiziertem Buchstaben): ein Fehlgriff im Fokus löscht Daten; Shift-Kombi oder Bestätigung verwenden.

### 4. Reproduzierbares TUI-Testing (tmux-Harness)
- Start: `tmux new-session -d -s <name> -x 160 -y 45 "cd /tmp && pi --model <provider/model>"`; Prompt per `tmux send-keys -t <s> "…" Enter`; Lesen: `tmux capture-pane -t <s> -p` (Text) bzw. `-e` (ANSI-Farbcodes als Beweis, z. B. Renderer-Attribution über exakte RGB-Sequenz).
- Prüfpunkte einzeln anfahren, nach jedem `sleep` + capture; am Ende `tmux kill-session -t <name>`.
- Lange Testläufe (Modell-Prompt mit Wartezeit + mehrere Captures) als ein `bg_run`-Shell-Skript starten und aufs Abschluss-Event warten; `bg_wait` matcht NICHT bg_run-Tasks (nur Subagenten-/Provider-Runs).
- Slash-Commands (`/foo`) per send-keys sind unzuverlässig (Autocomplete-Popup kann Zeichen konsumieren) — Funktionen über registrierte Shortcuts oder den Modell-Umweg („Führe bitte genau diesen Befehl mit dem bash-Tool aus: …") triggern und Tastatur-Interaktion (Enter/Escape/Buchstaben) direkt senden.

### 5. TUI-Artefakte dem Verursacher zuordnen (Bisect)
- Verdächtigen Render mit `capture-pane -e` auf exakte ANSI-Codes reduzieren und gegen die Kandidaten-Quellen (Paket-dist) greppen.
- Extension-Bisect: `pi --no-extensions -e <absoluter Paketpfad>` Kombinationen einzeln testen (`~/.pi/agent/npm/node_modules/<pkg>`); Verursacher ist oft eine Kombination, nicht ein Paket allein.
- Transiente Editor-Bereich-Artefakte: mit Enter-ohne-Text testen, ob der Inhalt wirklich im Editor-Buffer steht (übermittelter Text) oder nur Overlay-Render ist (nichts gesendet) — das unterscheidet Buffer-Pollution von Renderer-Artefakten.

### 6. Entwickeln, installieren, aktivieren (ohne laufende Sessions zu stören)
- In `~/.pi/agent/ext-dev/<name>/` entwickeln und Test-Skripte nur dort ablegen — alles unter `extensions/` ist ein Ladekandidat.
- Vor dem Ändern einer bestehenden Extension sichern: `~/.pi/agent/backups/<name>-<YYYYMMDD-HHMM>/`.
- Atomar installieren: in einen Temp-Ordner neben dem Ziel kopieren, dann `mv -T <tmp> <ziel>` — laufende Sessions können während des Kopierens neu laden.
- Live-Test isoliert: `PI_CODING_AGENT_DIR=<testdir> pi …` (eigene Settings ohne Pakete und Anmeldedaten des Nutzers) im tmux-Harness; Einstellungen der Extension landen so nur im Testordner.
- Headless-Render-Test: `render(width)` für 40/80/200 aufrufen und prüfen, dass `visibleWidth(zeile) <= width` gilt und keine ungewollten SGR-Folgen (z. B. Hintergrund `\x1b[4x`/`\x1b[48;`) entstehen.
- Dem Nutzer sagen: aktiv erst nach `/reload` oder Neustart; `/reload` beendet Hintergrundaufgaben ohne `surviveReload`.

### 7. Pi-Kern-UI abfangen (Notify/Show-Meldungen)
- Es gibt KEIN Extension-Event für Notifies oder Log-Zeilen — abfangen nur per Prototype-Patch: `InteractiveMode` aus `<pi-dist>/dist/modes/interactive/interactive-mode.js` (exportierte ESM-Klasse) per `import(pathToFileURL(p).href)` laden und `prototype.showError/showWarning/showStatus` wrappen (Original am Ende aufrufen, `this` erhalten). Alle Extension-Notifies münden über `showExtensionNotify` genau dort.
- `package.json`-`exports` der pi-coding-agent erlaubt KEINE Deep-Imports per Specifier — immer direkter Datei-Pfad + file-URL, bevorzugt via `import.meta.resolve("@earendil-works/pi-coding-agent")`, Fallback auf bekannten Install-Pfad + `fs.existsSync`.
- Patch einmal pro Prozess (Modul-Flag), nicht pro Factory-Run — sonst stapeln `/reload`s Wrapper und jeder Fehler wird n-fach aufgezeichnet.
- Eigenes `ctx.ui.notify` löst den gepatchten Pfad aus → Suppress-Flag um eigene Notifies setzen; `showStatus` aktualisiert in der UI dieselbe Zeile, also identische aufeinanderfolgende Meldungen deduplizieren.
- Gepatchte Methoden haben keinen `ExtensionContext` — zuletzt gesehenen Context in Modul-State cachen (z. B. aus `session_start`/`tool_result`) für Widget-Refresh. Async-Factory ist erlaubt (Loader awaited); Fehlschlag des Patches abfangen und funktionale Degradierung einbauen.

### 8. TUI-Echo mit fremdem Inhalt: execSync-stderr-Falle
- `child_process.execSync` OHNE `stdio`-Option leitet child-stderr an **process.stderr** weiter (execSync-Sonderverhalten; execFile/spawnSync pipen still!). In der pi-TUI erscheint das ROH über dem Eingabefeld und wirkt wie „Fehler im Editor". Paket-grep-Muster: `execSync(` mit Folgzeilen-Optionen prüfen, nicht nur gleiche Zeile.
- Diagnose-Rezept: `NODE_OPTIONS='--require /tmp/hook.cjs' pi …` mit Hook auf `process.stderr.write`, der bei Inhalts-Treffer `new Error().stack` mitdruckt → Stack nennt Datei+Zeile des Verursachers sofort. /proc/<pid>/fd/2-Scan hilft NICHT, wenn der Writer in-process pumpt.
- Timing-Attribution vor dem Stack-Fang: stderr in Datei umleiten, `tail -f` mit Zeitstempel mitlaufen lassen. Write bei Startup ≠ Write pro Turn: löst ein NICHT-verwandter Befehl (z. B. `echo`) denselben Write aus, ist ein Hook vor JEDEM tool_call die Quelle — nicht der Befehlsinhalt; das wählt die Verdächtigen (tool_call-Hooks) vor dem Grep aus.
- Fund: `bigpowers/extensions/omp-hooks.ts` `currentBranch()` (guard-git-Hook vor JEDEM bash tool_call, `execSync("git rev-parse --abbrev-ref HEAD")`) → außerhalb Repos deutsche git-Meldung im TUI. Lokal mit `stdio:["ignore","pipe","ignore"]` gepatcht (2026-10-16); **npm-Updates des Pakets überschreiben den Patch** — bei erneutem Echo zuerst diese Datei prüfen.

### 9. Tool-Renderer mit quergreifendem State (Gruppen über mehrere Aufrufe)
- `registerToolRenderer`-Callbacks erhalten den RenderCtx mit `toolCallId` und `invalidate()` — beides in die eigene Komponente durchreichen. Den Ctor-Param NICHT `invalidate` nennen: er kollidiert mit der vom Component-Interface geforderten Methode `invalidate(): void` (TS „Duplicate identifier") — `markDirty` verwenden und die Interface-Methode als no-op lassen.
- Quergreifender State: Modul-Maps `callId → invalidate` füllen die Komponenten im Konstruktor; ein Toggle ruft die Invalidates aller Gruppenmitglieder — das erzeugt Frame-Neuzeichnung aller betroffenen Zeilen.
- Animation in der TUI: beim Umklappen `animAt = Date.now()` setzen; `render()` prüft elapsed und gibt `[]` zurück, bis das Mitglied dran ist; ein `setTimeout(markDirty, wait+16)` liefert den Folge-Frame. Kollabiert-Zustand = erstes Mitglied rendert Gruppenzeile, Rest `[]`.
- Sequenzgrenzen aus Events ableiten: `message_end` mit assistant-Text oder user-Rolle, `turn_start`, `user_bash` beenden eine Aufruf-Sequenz; `agent_end` ist der Auto-Collapse-Punkt. NUR Calls gruppieren, deren `tool_call`-Event live gesehen wurde (Set) — beim Rebuild historischer Chats feuern keine Events und die Textgrenzen sind nicht ableitbar.

## Pitfalls
- Type-Assertions (`as unknown as T` etc.) ohne unmittelbar vorausgehenden `SAFETY:`-Kommentar blockieren den write/edit-Write (anti-slop-Lint): die Invariante, die TypeScript nicht prüfen kann, in einem Kommentar über der Assertion benennen.
- `matchesKey(data, "R")` ist invalide — Shift-Keys heißen `"shift+r"`, weil KeyId-Parser Modifier präfixt.
- Overlay-Component ohne `invalidate()` wird vom Type der `custom()`-Factory abgelehnt — Component-Interface verlangt es, auch als no-op.
- `pi -p`/JSON-Modus hat keine TUI: UI-Aufrufe immer hinter `ctx.mode === "tui"`-Guard, sonst bricht print/rpc.
- Modifikatoren wie alt über `tmux send-keys M-x` können vom Shortcut-Layer korrekt erkannt werden, während das Overlay die Rohtakte einzeln sieht — Overlay-Öffnen und -Schließen in einem Durchlauf möglich; beim Testen Open- und Close-Tasten trennen.

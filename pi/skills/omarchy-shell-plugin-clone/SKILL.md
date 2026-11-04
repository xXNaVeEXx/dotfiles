---
name: omarchy-shell-plugin-clone
description: Omarchy-Shell-Plugins (Bar-Widgets, Overlays wie Clipboard/Clock/Menu) user-seitig erweitern — offizieller Weg via omarchy plugin clone nach ~/.config/omarchy/plugins/<user>.<id>/, IPC-Routing über clonedFrom, keepLoaded-Hot-Reload-Falle, GUI-Handtest mit toggle+wtype+grim. Use when an installed Omarchy shell plugin or bar widget must be customized or extended.
---

# omarchy-shell-plugin-clone

# Omarchy Shell-Plugin-Anpassung (clone-Pfad)

Shell-Plugins (Bar-Widgets, Overlays, Menüs) des Omarchy-Shell niemals in
`/usr/share/omarchy/shell/plugins/` editieren (read-only, wird bei `omarchy update`
überschrieben). Offizieller Weg: `omarchy plugin clone <id>`.

## Procedure

1. Plugin-Inventar: `omarchy-shell shell listPlugins` (id, kinds, enabled).
   Quellen lesen: `/usr/share/omarchy/shell/plugins/<name>/` (manifest.json,
   QML, ggf. Helper-JS wie ClipboardHistory.js — Logik liegt dort, nicht in QML).
2. Clonen: `omarchy plugin clone omarchy.<name>` → landet in
   `~/.config/omarchy/plugins/<username>.<name>/`, deaktiviert das Original und
   aktiviert den Klon. IPC-Aufrufe an die alte id (`omarchy-shell shell toggle
   omarchy.<name>`, Keybinds, `omarchy menu …`) werden über manifest-Feld
   `omarchy.clonedFrom` automatisch zum Klon geroutet — Aufrufer nicht ändern.
3. Im Klon editieren; externe Helper-Scripts nach `~/.local/bin/` (ausführbar!),
   in QML via `Quickshell.env("HOME") + "/.local/bin/<script>"` + `Quickshell.execDetached`.
4. Persistente Daten des Plugins: eigene Datei neben der Original-State-Datei,
   z. B. `~/.local/state/omarchy/<plugin>-<store>.json`, in QML als zweites
   `FileView { atomicWrites: true; watchChanges: true }` (Muster: historyFile im
   Clipboard-Plugin). Struktur-Konvention des Original-Stores beibehalten.
5. Reload: Speichern unter `~/.config/omarchy/plugins/` hot-reloadet normal;
   erzwingen mit `omarchy-shell shell rescanPlugins`.
6. Handtest (GUI): Overlay per `omarchy-shell shell toggle omarchy.<id>` öffnen,
   Tasten per `wtype -M ctrl -k f -m ctrl` / `wtype -k Tab` senden (geht an das
   Overlay wegen Exclusive-Focus), Screenshots `grim /tmp/x.png`, Ausschnitt via
   `magick x.png -crop WxH+X+Y +repage`, dann read (Vision-Bridge beschreibt).
   Overlay schließen: nochmal toggle oder `wtype -k Escape`.

## Pitfalls

- **keepLoaded-Falle**: bereits geladene Plugins (Overlays wie Clipboard,
  keepLoaded:true) übernehmen QML-Edits NICHT per hot-reload/rescan —
  `omarchy restart shell` nötig. Ohne Restart läuft alter Code weiter und Tests
  verwirren scheinbar (Feature „tut nichts“).
- QML-Fehler landen oft unsichtbar (Quickshell-stdout, kein journald-Eintrag).
  Deterministisch prüfen: erzeugt die neue Funktion eine sichtbare Nebenwirkung
  (Datei geschrieben, State geändert)? Klammern-Balance via python-Zählung als
  Schnellcheck.
- Live-Konflikt: wenn der Nutzer gerade am Desktop arbeitet, kämpfen wtype-Keys
  mit echten Eingaben — Favoriten/History-Dateien ändern sich unter der Hand.
  Ground truth immer frisch aus der State-Datei lesen, nicht aus alten Shots.
  Und niemals Keys blind senden: erst Baseline-Screenshot nehmen und Overlay-
  Status prüfen — ging das Overlay zwischenzeitlich zu (Nutzer-Escape),
  landen die Keys im Desktop/Terminal des Nutzers.
- `set -euo pipefail` in Helper-Scripts: `[[ cond ]] && cmd` am Ende killt das
  Script bei false — if/then nutzen.
- Qt/QML-Delegate: ListModel-Rollen müssen via `displayModel.append({role: …})`
  gepusht und im Delegate als `required property` deklariert sein.
- Eingebaut-Zahlen wie Limits (history 500) im Klon unabhängig konfigurierbar
  machen (property), nicht hardcoded duplizieren.

## Referenzimplementierung

Favoriten-Reiter im Clipboard-Manager: Klon
`~/.config/omarchy/plugins/gamzat.clipboard/` mit Tab-Leiste History/Favoriten,
Stern-Marker (Ctrl+F / Klick), `Tab` wechselt Ansicht, Favoriten-Store
`~/.local/state/omarchy/clipboard-favorites.json` (unabhängig von History-Cap,
überlebt Delete/Clear), Helper `~/.local/bin/omarchy-user-clipboard`
(paste/copy-only/open per --favorites-index, spiegelt
omarchy-clipboard-paste-text/-open). Darauf aufgebaut: Label-Badges an
Favoriten (F2/Strg+L, Textfeld + Farb-Palette mit Random-Default; Labels
matchen auch den Suchfilter beider Ansichten, meta im favoriteKeysMap
mitführen), Eintrags-Editor für den Inhalt (F4/Strg+E, mehrzeiliges TextEdit,
Strg+Enter speichert, Edit wird per altem entryKey in beide Stores gespiegelt,
sodass Stern-Sync bleibt), sowie Del-freies Entfernen (sichtbarer ✕-Button je
Zeile + Backspace bei leerem Suchfilter).

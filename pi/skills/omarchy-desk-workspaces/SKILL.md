---
name: omarchy-desk-workspaces
description: "Use when Omarchy workspaces in the bar must be added/removed dynamically, a home workspace with Handy-artige widget cards is wanted, or a desk card/plugin QML (gamzat.desk, gamzat.workspaces) renders empty."
---

# omarchy-desk-workspaces

# Omarchy Desk (Workspaces + Karten)

Architektur (user-seitig, keine Omarchy-Dateien geändert):
- `~/.config/omarchy/plugins/gamzat.desk/` — Service (`Desk.qml`): pro Monitor ein Layershell-Fenster (Layer Bottom, im Edit-Modus Top) mit Karten im 12×8-Raster; Karten unter `cards/*.qml`, Typen in `Registry.js` (`types`, `defaultDesk()`, `defaultConfig()`).
- `~/.config/omarchy/plugins/gamzat.workspaces/` — Bar-Widget, ersetzt `omarchy.workspaces` in `~/.config/omarchy/shell.json` (bar.layout.left). Liest `desk.json`, zeigt Home-Glyph und „+“.
- Konfig `~/.config/omarchy/desk.json` (`workspaces[]`, `home`, `names`, `desks{ws:{cards[{type,c,r,w,h}]}}`); beide Plugins beobachten die Datei (FileView watchChanges), Schreiben atomar.
- IPC: `omarchy-shell gamzat.desk <edit|done|toggleEdit|home|addWorkspace|removeWorkspace N|setHome N|rename N name|list>`; Bindings in `~/.config/hypr/bindings.lua` (SUPER+H = Home, SUPER+SHIFT+H = Edit; SUPER+Home ist belegt).
- Aktivieren: `omarchy plugin enable <id>`, danach `omarchy restart shell`.

Neue Karte: `cards/XCard.qml` (Wurzel `Item` mit `property var cfg`) plus Eintrag in `Registry.js types` (file, icon, w, h, minW, minH). Datenquellen der Bar-Widgets wiederverwenden (hw-widget.py --panel, ~/.local/state/omarchy/agents/*.json).

Übersicht + Gesten (Mission Control): `gamzat.desk/Overview.qml` (IPC `overview|overviewClose|overviewToggle`): Workspace-Leiste oben, Fenster als `ScreencopyView{captureSource: toplevel.wayland, live}` (liefert auch Live-Bild von Fenstern auf inaktiven Workspaces); Drag auf Workspace/„+“ → `hl.dsp.window.move({workspace, follow=false, window="address:0x…"})`. Gesten in `~/.config/hypr/input.lua`: `hl.gesture({fingers=4, direction="horizontal", action="workspace"})`, up/down per Funktion → `omarchy-shell gamzat.desk overview|overviewClose`; Richtung umdrehen via `hl.config({gestures={workspace_swipe_invert=false}})`. `Desk.qml syncPersistent()` setzt per `hyprctl eval 'hl.workspace_rule({workspace="N", persistent=true})'` Regeln für alle desk.json-Workspaces, damit Wischen auch leere erreicht. Gesten/Drag kann der Agent nicht simulieren (kein uinput/ydotool) → Nutzer testen lassen; Übersicht per IPC + grim + `wtype -k Right` prüfbar.

Stolperfallen:
- Farb-Singleton im Plugin heißt `ShellColor` (nicht `Color`); Schrift/Abstände `Style`.
- Nie `property var data` auf einer Item-Wurzel (überschreibt die Default-Property → Kinder weg, Karte leer).
- Ids wie `left` meiden: in Delegates kam `left` als undefined an → Breite 0, Repeater-Items unsichtbar. Sprechende Ids (`leftCol`).
- Änderungen an `cards/*.qml` brauchen `omarchy restart shell` (Plugin-Hot-Reload nutzt veraltete Kompilate).
- Karten existieren nur auf dem aktiven Workspace → zum Testen `hyprctl dispatch 'hl.dsp.focus({ workspace = "6" })'`, Screenshot, zurück zum vorherigen Workspace (vorher `hyprctl activeworkspace -j`).
- Screenshots: `grim` ohne `-g` in einen eigenen Ordner (`~/.tmp/...`), mit PIL croppen; `/tmp` wird überschrieben; das read-Tool findet frische Dateien manchmal erst im 2. Versuch.
- Leere Delegates debuggen: `onItemAdded` + Timer-Log mit `parent.width/visible` zeigt sofort, ob Breite 0 oder unsichtbar.

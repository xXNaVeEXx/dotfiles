---
name: omarchy-bar-widgets
description: Eigene Widgets in die Omarchy-Statusbar und ins omarchy.agents-Panel bringen — Command-Module in shell.json, Usage-Record-Collector fürs Agents-Panel (Schema, percent-Bruch-Falle), inkl. z.ai/bigmodel.cn Usage-API. Use when adding custom data/widgets to the Omarchy bar or agents panel, or querying z.ai GLM Coding Plan usage.
---

# omarchy-bar-widgets

# Omarchy Statusbar-Widgets & Agents-Panel-Provider selbst bauen

Zwei offiziell unterstützte Wege, eigene Daten in die Omarchy-Statusbar zu bringen,
ohne `/usr/share/omarchy/` anzufassen (read-only, wird bei Update überschrieben).

## Weg 1: Command-Module in der Bar (schnell)

In `~/.config/omarchy/shell.json` unter `bar.layout.<section>` eintragen:

```json
{ "id": "zai", "type": "command",
  "exec": "/absoluter/pfad/zum/script",
  "interval": 300, "tooltip": "Fallback-Tooltip",
  "onClick": "omarchy-shell <ipc-target> toggle" }
```

- Script läuft via `bash -lc` alle `interval` Sekunden (**Default 5s — interval immer explizit setzen!**).
- Ausgabe: Plaintext oder Waybar-JSON `{"text","tooltip","class"}`; `class:"active"` hebelt das Widget farblich hervor.
- Unterstützte Settings je Entry: `text, tooltip, onClick, onMiddleClick, onRightClick, keepSpace, horizontalMargin (7.5), verticalPadding (6), fontSize (12)`.
- `shell.json` hot-reloadedt beim Speichern — kein Restart nötig.
- Implementierung: `CustomCommandModule` in `/usr/share/omarchy/shell/plugins/bar/Bar.qml` (~Zeile 1800), Parser `Util.parseModuleJson`.

## Weg 2: Eigener Provider im `omarchy.agents`-Panel (reich)

Das Agents-Panel zeichnet **jedes** gültige JSON in
`~/.local/state/omarchy/agents/usage/<id>.json` — kein Eingriff in Plugin-Code nötig.
Der first-party `omarchy-agent-usage-update`-Loop löscht fremde Records NICHT; das
Panel (Main.qml) rescant das Verzeichnis nach jedem eigenen Update-Tick (≤15 min)
und per FileView live bei Dateiänderung. Sofort-Rescan: `omarchy-shell omarchy.agents refresh`.

### Record-Schema (Mindestfelder)

```json
{ "schemaVersion": 1, "id": "zai", "name": "Z.ai GLM", "tierLabel": "GLM Coding Max",
  "ready": true, "hasLocalStats": false, "hasPromptStats": false,
  "limits": [
    {"label": "Session (5-hour)", "title": "Session", "percent": 0.0, "resetsAt": ""},
    {"label": "Weekly (7-day)", "title": "Weekly", "percent": 0.76, "resetsAt": "ISO-8601-mit-TZ"}
  ],
  "modelUsage": {}, "recentDays": [], "todayPrompts": 0, "totalPrompts": 0,
  "updatedAt": "ISO" }
```

### Fallen

- **`percent` ist ein Bruch 0–1**, nicht 0–100! Panel rendert `Math.round(percent*100)+"%"`, Alarm ab `percent >= 0.9`. (z.ai-API liefert dagegen 0–100 → teilen.)
- Provider erscheint nur, wenn `providerHasData()`: `limits.length > 0` genügt, sonst need prompts/sessions/balance.
- Leere `recentDays`/`modelUsage` blenden die Sektionen TOKENS BY DAY/MODEL sauber aus.
- `resetsAt: ""` → keine Reset-Zeile. Reset-Zeitangabe nur liefern, wenn das Fenster wirklich läuft (z. B. 5h-Fenster bei 0 Verbrauch: nextResetTime ist ein weit-zukünftiger Anker, keine echte Resetzeit).
- Hero-Icon: `assets/<id>.svg` Konvention im Plugin-Ordner (read-only) → unbekannte IDs fallen auf den Bar-Glyph `󱚣` zurück. Alternativ `omarchy plugin clone omarchy.agents` (forkt aber ganzes Panel).
- Provider-Switch-Chips erscheinen ab 2 Providern; `omarchy-shell omarchy.agents next` zyklisch.
- Settings-Sperre: `settings.providers[id].enabled === false` versteckt Provider (Default: enabled).

## Befrager-Muster (bewährt, gebaut für z.ai GLM Coding Plan)

Ein Script, drei Modi (`--bar` Waybar-JSON, `--record` Panel-Record, `--json` Debug),
pro Endpoint ein eigener HTTP-Cache `~/.cache/omarchy/agent-usage/<id>[-<name>].json`
mit eigener TTL (Quota ~90s, Stunden-Serien ~240s), damit Bar-Poll + Record-Timer die
API nicht doppelt schlagen. Refresh via systemd-User-Timer
(`~/.config/systemd/user/omarchy-<id>-usage.{service,timer}`, `OnUnitActiveSec=5min`,
`Persistent=true`) — Record atomisch via mkstemp+os.replace schreiben.

- z.ai/bigmodel.cn Coding-Plan-Usage (undokumentiert, verifiziert 10/2026):
  `GET https://open.bigmodel.cn/api/monitor/usage/quota/limit`, Header `Authorization: <key>`
  (RAW key, kein Bearer — Bearer geht auch). Intl: `https://api.z.ai/api/monitor/usage/quota/limit`.
  Response `data.limits[]`: `TOKENS_LIMIT unit==3` = 5h-Session (beginnt mit der ersten Anfrage), `TOKENS_LIMIT
  unit==6` = Weekly, `TIME_LIMIT` (unit 5) = Monatskontingent (`usage`=Kapazität, `currentValue`=verbraucht,
  `remaining`); `percentage` 0–100; `nextResetTime` = epoch-ms; `data.level` = lite/pro/max. Zuordnen über `unit` +
  `number` (unit 3 = Stunden, mit number 5 = 5-h-Fenster; unit 6 = Woche; unit 5 = Monat), nicht über `nextResetTime`:
  Ruht die Session, ist ihr `nextResetTime` ein weit entfernter Anker, und das 5-h-Fenster sieht wie ein Monatsfenster
  aus. Grund: Die API ist undokumentiert, und eine Verwechslung zeigt still falsche Prozente (Panel „Session 0 %“,
  während Anfragen mit 429 Code 1308 scheitern). Kontingent-Tore, die diese Records lesen, nehmen deshalb das Maximum
  aller Nicht-Wochen-Limits statt eines Labels.
- Token-Analyse (Tokens by day / by model, undokumentiert, verifiziert 10/2026):
  `GET https://open.bigmodel.cn/api/monitor/usage/model-usage?startTime=&endTime=` (Format `%Y-%m-%d %H:%M:%S`, ≤7 Tage = hourly; größere Fenster liefern stillschweigend DAILY-Granularität (nutzbar für Langzeit-Historie: 30-Tage-Chunks rückwärts, auch 90/180 d funktionieren, Konto-weit über alle Geräte); `x_time`-Buckets sind Asia/Shanghai +08 → vor Tages-Bucketing in lokale TZ konvertieren). Intl: `https://api.z.ai/api/monitor/usage/model-usage`.
  Response `data`: `x_time[]`, `tokensUsage[]`, `modelCallCount[]` (parallel zu x_time), `modelDataList[]` ({modelName, tokensUsage[], totalTokens — totalTokens überspannt das RAW-Fenster, NICHT die lokalen 7 Tage}), `granularity:"hourly"`. Kein In/Out-Split → alles in `inputTokens` des Records. Beim Einlesen `len(x_time)` gegen die erwartete Stundenzahl prüfen und den Zeitstempel-Parser beide Formate akzeptieren lassen (`%Y-%m-%d %H:%M` UND `%Y-%m-%d`) — die Granularität kann kippen, ohne dass ein Fehler auftritt.
  Record: `recentDays:[{date,messageCount=<TOKENS>}]` (7 lokale Tage aufsteigend), `modelUsage`, `activeDays`, `todayPrompts`, `todayTotalTokens`, `hasLocalStats:true`; `hasPromptStats:false` (sonst "0 sessions" im Tooltip). Modellzeilen per window-gefilterter Summe aus derselben Stundenreihe berechnen wie die Tagesbalken — sonst Drift zwischen Chart und Modell-Total (totalTokens überspannt Rohfenster).
- API-Key-Quelle: `~/.pi/agent/auth.json` → `["<provider-id>"]["key"]` (env-Overrides ZAI_API_KEY/ZAI_CODING_KEY).

## Hardware-/btop-Widget auf Asahi (M1 Max, verifiziert 10/2026)

Beispiel: `~/.config/omarchy/scripts/hw-widget.py` (Waybar-JSON, btop-Tooltip, Klick→`foot -e btop`).
Datenquellen auf Asahi/Apple Silicon:
- **P/E-Cores**: `/sys/devices/system/cpu/cpuN/cufreq/cpuinfo_max_freq` — ≥3 000 000 = P-Core (Firestorm), darunter E-Core (Icestorm); `scaling_cur_freq` = live.
- **Temperaturen**: `sensors -j` (NICHT thermal_zone — liefert nur macsmc-battery). `tas2764-*`-Chips = SoC-Cluster-Temps (CPU/GPU, ~31–34°C idle), `macsmc_hwmon` = NAND/Battery-Hotspot/Charge-Regulator/WiFi-Temp + Fan RPM + Total System Power + Heatpipe Power.
- **GPU**: integrierte Apple GPU, kein devfreq (`/sys/class/devfreq/*gpu*` leer), kein lspci; nur Name aus `/proc/device-tree/model` (regex `M\d[^,)]*`), keine Util ohne root.
- **Disk-Dedup**: `df --output=source,target,…` + `seen_sources`-Set — /, /home, /var/log teilen sich dieselbe Partition, sonst 3× gleiche Zeile.
- **Rates**: State-File `~/.cache/omarchy/hw-widget.state` (Deltas /proc/stat, /proc/diskstats, /sys/class/net/*/statistics), erster Lauf 0.25s-Inline-Sample; 0.5s < dt < 300s sonst Stale-Delta.
- Ausführung ~0.3s (sensors+df+ps subprocesses) — interval 3s unkritisch.
- PIL fehlt auf Omarchy-ARM → Screenshot-Crop mit `magick <src> -crop WxH+X+Y +repage -resize 200% out.png`.

## Eigenes Bar-Widget-Plugin (Third-Party, verifiziert 10/2026)

Statt command-Widget in shell.json: aufklappendes Panel wie omarchy.agents/monitor via eigenem Plugin `~/.config/omarchy/plugins/<id>/`:
- **manifest.json**: `{"id":"gamzat.hardware","kinds":["bar-widget"],"entryPoints":{"barWidget":"Panel.qml"},"barWidget":{"displayName":"Hardware","category":"System","allowMultiple":false}}` (+ falls Overlay-artige Panels gewünscht: kinds overlay).
- **Panel.qml-Gerüst**: `Panel { moduleName/ipcTarget: "<id>"; manageIpc: false }` + eigener `IpcHandler { target:"<id>"; function open/close/toggle/state(): string }` (**braucht `import Quickshell.Io`**, sonst „IpcHandler is not a type"), `BarIconButton { anchors.fill: parent; bar: root.bar; text:"󰻠"; active:<bool>; onPressed: root.toggle() }`, `implicitWidth/Height: button.implicit*`. Panel-Fenster: `KeyboardPanel { anchorItem: button; owner: root; bar: root.bar; open: root.opened; contentWidth: panel.fittedContentWidth(Style.space(430)); contentHeight: panel.fittedContentHeight(col.implicitHeight, Style.space(640)) }` mit PanelKeyCatcher (onCloseRequested: root.close()) + ScrollView + Column (width: scrollArea.availableWidth). UI-Bausteine aus qs.Ui: Panel, KeyboardPanel, BarIconButton, PanelSectionHeader, PanelSeparator; Style/ShellColor aus qs.Commons. Daten: Timer (running: root.opened) → Process+StdioCollector{waitForEnd:true} → JSON.parse mit try/catch (alten Snapshot behalten). First-Party bar-widgets laufen über denselben loadPluginWidget-Pfad — Lade-API identisch.
- **Aktivierung**: `omarchy-shell shell rescanPlugins` → `omarchy plugin list` (enabled?) → shell.json: `{"id":"<id>"}` in `bar.layout.right` + id in `plugins`-Array. **Reihenfolge-Falle**: shell.json-Edit VOR Plugin-Scan → Layout-Item wird still ignoriert; nachträglich rescanPlugins nachziehen.
- **Hot-Reload-Falle**: Panel.qml-Änderung löst „Local plugin changed, reloading" aus, lädt aber alt kompilierte Version weiter; verlässlich: Quickshell-Prozess killen (auto-Neustart ~10s, IpcHandler erst danach erreichbar; Shell-Slots bis zu 30s auf service warten) — danach `omarchy-shell <id> state` in separatem Bash-Aufruf pollen (`for i in 1..10; do sleep 3; omarchy-shell … && break; done`). **pkill-Selbstmord-Falle**: `pkill -f "quickshell -n -p …"` matcht auch die eigene `bash -c`-Kommandozeile, die das Muster als Text enthält → der Tool-Aufruf stirbt mit exit 143, Folge-Befehle laufen nicht. Kill-Muster so wählen, dass es sich nicht selbst matcht: `pkill -f '[q]uickshell -n -p'` (Bracket-Trick) oder `pkill -x quickshell`.
- **Debug-Muster Binäre Suche**: bei „Plugin lädt, verhält sich falsch" (Position, Attach, Bindings) ein Wegwerf-Plugin mit minimalem Panel.qml in denselben Bar-Slot legen und bestätigen, dass der Minimalfall funktioniert; dann Verdächtiges in Versionsschritten zurückbauen (V1 ok → +Datenplumbing → +Properties → +Imports), pro Schritt `state()`-Diagnose — so isoliert man die eine Zeile (z. B. `property var data`), die den Fehler macht. Danach Wegwerf-Plugin restlos entfernen (shell.json-Entries + Verzeichnis + rescanPlugins).
- **KRITISCH: Property-Name `data` am Panel-Root verboten** — kollidiert mit QML Items built-in default property `data` (children/resources) und schattiert sie → button.QsWindow.window wird null → KeyboardPanel verankert bei (margin,margin) links oben statt am Button, OHNE Fehlermeldung. Stattdessen `hwData` o.ä. Diagnose: `omarchy-shell <id> state` mit dbg {aw, mapX/mapY} (aw muss „BarPanel_QML_*" sein, nicht null).
- **Null-Guards**: visible-Bindings explizit boolesch: `visible: root.hwData !== null && !!root.hwData.procs && root.hwData.procs.length > 0` — `root.hwData && X` erzeugt „Unable to assign [undefined] to bool"-Warnungen bei null. Repeater-Delegates: kein spacing auf Nicht-Positionern (Item hat kein spacing), `required property var modelData` nutzen.
- Debug-Journey-Falle: Screenshot-Crops zeigen Ausschnitte — „links im Crop" ≠ „links am Bildschirm". Erst state()-Koordinaten prüfen, dann Crops interpretieren (NorthEast-Crop: Crop-Kante links = Screen ~65%).

## Agents-Panel um eigene Detail-Sektion erweitern (verifiziert 11/2026)
- `omarchy plugin clone omarchy.agents` → `~/.config/omarchy/plugins/gamzat.agents/Panel.qml` editieren; nach QML-Änderung reicht Hot-Reload NICHT zuverlässig → `omarchy restart shell`, dann `omarchy-shell shell toggle omarchy.agents` (zweimal toggeln = zu!).
- Datenquelle getrennt vom Panel: Python-Script schreibt JSON (`~/.local/state/omarchy/agents/details.json`), Panel liest per `FileView{watchChanges}` und startet das Script beim Öffnen per `Process`; zusätzlich systemd-User-Timer (5 min). Pi-Sessions (`~/.pi/agent/sessions`) liefern usage{input,output,cacheRead,cacheWrite,cost}; z.ai-API model-usage nur Konto-Totals ohne Split.
- Preise NIE von Hand pflegen: Kette aufgezeichnete Kosten der Quelle → `~/.pi/agent/models-store.json` (pi hält es frisch) → LiteLLM-Preisliste (`raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json`, 1×/Tag per ETag, bei Fehler letzte Kopie + Retry nach 1 h) → sonst „ohne Preis“ statt $0. Nur Tokens ohne Kosten werden nachbepreist (Zeilenvektor um un-costed in/out/cR/cW5/cW1 erweitert); Selbst-Audit vergleicht aufgezeichnete Kosten der letzten 30 Tage mit dem Preisbuch → `pricing.drift/unpriced` in details.json, Panel zeigt es in `priceNote()`. LiteLLM-Schlüssel: `<pid>/<modell>` oder bare, Datumsuffix `-YYYYMMDD` und `@default` abschneiden; Regionalpräfixe (`us.`, `eu.`) nicht nehmen. Cache-Schema bei Zeilenänderung: Dateiname versionieren (`details-files-v2.json`).
- Panelhöhe ist vom Bildschirm gedeckelt → neue Sektionen scrollen (Pfeil runter). Test: grim + `tesseract` (das read-Tool lieferte für neue Screenshots ENOENT).
- Nur ein `onOpenedChanged`-Handler pro Item erlaubt → in den vorhandenen mergen.

## Workspaces/Desk-Karten statt Bar-Widget
Dynamische Workspace-Leiste und Handy-artige Widget-Karten pro Workspace (Home-Desk) → Skill `omarchy-desk-workspaces`. In Plugin-QML heißt der Farb-Singleton `ShellColor` (nicht `Color`, dort undefined), und Ids wie `left` in Delegates meiden (kamen als undefined an → Breite 0).

## Verifikation

1. Script-Modi manuell ausführen, JSON prüfen.
2. Bar: `omarchy capture screenshot fullscreen save` → Top-Strip croppen (PIL) und ansehen.
3. Panel: `omarchy-shell omarchy.agents open` (+ ggf. `next`) → Screenshot-Check.
4. Timer: `systemctl --user list-timers omarchy-<id>-usage.timer`.

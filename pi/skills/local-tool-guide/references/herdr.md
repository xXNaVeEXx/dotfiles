# herdr — Instanz-Referenz (Terminal-Workspace-Manager für AI-Agenten)

herdr: tmux-artiger Multiplexer mit Hintergrund-Server (Panes überleben Detach/SSH-Abbruch), mouse-first, agent-aware (Sidebar-Zustände working/blocked/done/idle). Konzept: Session → Workspace → Tab → Pane → Agent. Rust-Binary, Home https://herdr.dev, Repo github.com/herdrdev/herdr.

## Live-Bindings berechnen

1. `herdr --default-config` druckt ALLE Default-Keybindings (kommentiert, inkl. Syntax-Regeln).
2. Lokale Config `~/.config/herdr/config.toml`, Sektion `[keys]`, überschreibt gezielt; **nicht gesetzte Keys behalten Defaults** → Live-Tabelle = Merge, Abweichungen markieren.
3. `prefix+?` zeigt im laufenden herdr ALLE aktiven Bindings live (mit `/` filterbar) — finale Wahrheitsquelle, falls die Config gewechselt hat.

## Maschinen-Spezifika (Config spiegelt absichtlich die Omarchy-tmux-Config)

- **Prefix = `ctrl+space`** (Upstream-Default: `ctrl+b`) — größte Abweichung, immer zuerst nennen.
- `prefix+h` = Split horizontal (Upstream: Fokus links!). Fokus läuft NUR über `ctrl+alt+←↓↑→`, Direkt-Resize `ctrl+alt+shift+←↓↑→`.
- Detach `prefix+d`, Reload `prefix+q` (Upstream: `prefix+q` = Detach, `prefix+shift+r` = Reload).
- Tabs: rename `prefix+r`, close `prefix+k`, direkt `alt+1..9` / `alt+←→`; Workspaces direkt `alt+↑↓`; Splits direkt `alt+enter` / `alt+shift+enter`.
- UI: Theme gruvbox, Akzent blau, `new_cwd = "follow"`, Toasts via System-Notifications, `confirm_close = false`, `mouse_capture = true`, Fenstertitel `{hostname}: {workspace}`.

## Remote-Machines & Agent-Notifications (verifiziert an Doku + --help)

- Setup: `herdr machine add <label>` (interaktiv; installiert herdr ggf. auf der Remote-Maschine, startet dort den Hintergrund-Server; Optionen `--remote-session <name>`, `--label`). Attach: `herdr --remote <label>` (thin client) — Remote-Maschine hält eigenen Server, Sessions + Pane-Prozesse überleben Disconnect.
- **Agent-Erkennung ist prozessbasiert:** Agent einfach im herdr-Pane starten (Pi ist in der Integrationsliste, ebenso Claude Code/Codex/Copilot/OpenCode u. a.) — kein spezieller Start-Befehl nötig. `herdr agent start` nur für CLI-Start in existierendem Pane.
- **Notifications:** verbundene Machines streamen "workspace information, agent states, and notifications" in den lokalen Client (ohne Pane-Screen-Streaming); "get notified when it finishes or needs you". Zustände: `idle/working/blocked` (+ `done` bleibt sichtbar bis angesehen); `blocked` = sichtbare Frage-/Approval-/Permission-UI im Bottom-Buffer. Grenze: Zustellung nur solange der lokale herdr-Client läuft.
- TUI-los skriptbar: `herdr --machine <label> agent list`, `herdr agent wait <target> --until <idle|working|blocked|done|unknown> --timeout <ms>` (ohne `--until`: idle/done/blocked; ohne Timeout endlos). SSH-Auth-Erneuerung: `herdr machine reconnect <label>`.

## Ressourcen

- `herdr --help` nennt selbst: `herdr --skill` (Agent-Skill-Datei zum Steuern von Panes), https://herdr.dev/agent-guide.md (Mensch-Einführung), https://herdr.dev/llms.txt (Debugging), Docs https://herdr.dev/docs/ (quick-start/concepts/configuration/agents/connecting-machines/session-state/agent-automation/socket-api/plugins/marketplace).
- Diagnose: `herdr status [server|client]`, `herdr agent list`, `herdr agent explain <target> --json`, `herdr integration status`; Logs `~/.config/herdr/herdr*.log`.
- In Panes gilt `HERDR_ENV=1`; verschachteltes `herdr` in einem herdr-Pane ist blockiert.
- Chord-Kollisionen: `ctrl+alt+Pfeile` (hier als Fokus belegt) kollidieren unter GNOME/Ghostty/Konsole — unter Hyprland/Omarchy frei; wenn der Desktop sie je belegt, Fokus-Chords ändern.

## Existierende Artefakte

- `~/herdr-anleitung.md` (deutsch, Live-Merge + Defaults-Spalte). Bei herdr-Update oder Config-Änderung neu generieren nach dem Skill-Verfahren (Schritt 1–5), nicht patchen.
- `~/herdr-schulung.html` (interaktive Trainings-Seite, Build-Muster: `references/interactive-trainer-page.md`). Gleiche Regel: bei Binding-Änderungen Daten-Arrays neu befüllen bzw. neu generieren.

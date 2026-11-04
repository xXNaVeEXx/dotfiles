---
name: agent-computer-use
description: "Desktop- und Browser-Fernsteuerung dieses Rechners über agent-desktop (AT-SPI semantisch, Ref-Loop) und agent-browser (Chrome-CLI/MCP) — inkl. AT-SPI-Bus-Reparatur, Wayland-POLICY_DENIED-Escapes und Toolkit-Flags. Use when GUI apps or the browser shall be remotely controlled (computer use / browser use), agent-desktop status shows accessibility denied, or clicks on Wayland get POLICY_DENIED."
---

# agent-computer-use

# Computer Use & Browser Use auf diesem Rechner (agent-desktop + agent-browser)

Vercels `agent-desktop` (AT-SPI, semantische Aktionen, keine Screenshots) und `agent-browser` (Chrome-CLI/MCP) steuern Desktop und Browser token-effizient. Beide sind global installiert (npm -g unter nvm-Node 26, Native-Binaries gebündelt; Reinstall: `npm install -g --allow-scripts=agent-browser,agent-desktop agent-desktop agent-browser` — Postinstall braucht allow-scripts).

## Wann dieses Skill
- GUI-Apps dieses Rechners fernsteuern (klicken, tippen, Werte lesen) ohne Screenshots/OCR
- Browser fernsteuern (Seiten lesen, Formulare, Navigation)
- „computer use"-artige Aufgaben auf omarchy (Hyprland/Wayland, aarch64)

## Desktop-Loop (agent-desktop)
Loop: beobachten → handeln → verifizieren, Refs sind SNAPSHOT-gebunden (`@<snapid>:eN`):
```bash
agent-desktop status                                   # accessibility muss "granted" sein
agent-desktop list-apps                                # registrierte Apps
agent-desktop find --app <name> --name "<Text>"        # klein & gezielt (besser als Voll-Snapshot)
agent-desktop click @<snapid>:eN                       # semantisch, headless
agent-desktop find --app <name> --name "<Erwartung>"   # Verifikation
```
Token-Disziplin: `find` statt Voll-`snapshot`; wenn snapshot, dann `-i --compact`.

## Stolperfalle 1: AT-SPI-Bus „denied" (socket refusing)
`status` meldet denied „socket missing or refusing", obwohl `busctl --user` den Bus zeigt: Socket-Datei und Listener auseinandergefallen (strace: connect ECONNREFUSED auf `/run/user/$UID/at-spi/bus_0`). Fix: `systemctl --user restart at-spi-dbus-bus.service`. Apps, die VOR dem kaputten Bus starteten, registrieren NIE — App neu starten (`agent-desktop launch <name>`).

## Stolperfalle 2: POLICY_DENIED bei click auf Wayland
Hyprland/Wayland: nur semantische Aktionen (AT-SPI Action-Interface). Elemente OHNE Action-Interface (z. B. libadwaita/Nautilus-Sidebar-Zeilen: nur Select/SetFocus) → `POLICY_DENIED`, physischer Fallback gibt es auf Hyprland nicht (kein Mutter RemoteDesktop; Gesten nur X11). Escapes:
1. **python-gi Atspi direkt** (python-gobject installiert): Parent-List `select_child(idx)`, `query_value().set_value()`, EditableText — wirkt semantisch, bewiesen an Nautilus.
2. **App unter XWayland starten**: `GDK_BACKEND=x11 <app>` → echte Screen-Coords + XTEST physisch möglich (`--headed`).
Bounds `null` ist dabei NORMAL (GTK4/Wayland kennt keine Screen-Positionen) und blockiert semantische Klicks NICHT.

## Stolperfalle 3: Toolkit-Registrierung
GTK3/4: automatisch. Qt: `QT_ACCESSIBILITY=1` in App-Env. Chromium/Browser: `agent-desktop launch <browser> --arg=--force-renderer-accessibility`. Electron: ohne Flag.

## Browser-Loop (agent-browser)
```bash
agent-browser open <url> && agent-browser read          # agent-lesbarer Text
agent-browser snapshot                                  # A11y-Tree mit @refs
agent-browser click "a" | "text=..." | @ref
agent-browser get url/title/text; agent-browser close
```
Chrome wird von agent-browser selbst verwaltet (`agent-browser install` = Update) — ABER auf aarch64 gibt es keine Chrome-for-Testing-Builds: dann System-Chromium nutzen (pacman -Sy chromium; agent-browser findet es automatisch; die „behind stable"-Warnung ist nur Versions-Lag von Arch ARM, kosmetisch). MCP-Server ist in Pi als `agent-browser` (deferred) registriert — Tools per tool_search laden, kein Prompt-Flood. `agent-desktop` hat in npm 1.1.0 noch KEIN `mcp`-Subcommand (nur CLI via bash).

## Abgrenzung zu älteren Wegen
- `browser-cdp-control` (CDP-Handarbeit): nur noch für Spezialfälle (Header-Mitschnitt, obfuscierte Player).
- `linux-gui-computer-use` (xdotool/OCR/XWayland): Pixel-Fallback, wenn eine App gar kein AT-SPI anbietet.
- Fenster-/Workspace-Management: hyprctl/IPC bleibt erste Wahl.

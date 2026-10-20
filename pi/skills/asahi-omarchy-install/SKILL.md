---
name: asahi-omarchy-install
description: Omarchy-Desktop auf Asahi/Apple-Silicon (aarch64) installieren, non-interaktiv nachziehen und reparieren — ARM-Paketlücken im Installer umlenken, GUI schwarz/leere Bar per QML-Singleton-Rename fixen, UFW/LAN-SSH, localectl-Layout, QS-Log-Diagnose. Use when Omarchy on ARM/Asahi must be installed, resumed, or its shell/bar/menus render black or broken.
---

# asahi-omarchy-install

# Asahi-Omarchy (ARM) installieren und reparieren

Klasse: Omarchy-Desktop auf Apple-Silicon-Asahi (aarch64) installieren,
fertig konfigurieren und GUI-/Paket-Fehler beheben. Der ARM-Zweig hinkt
dem x86_64-Upstream hinterher — viele Failure-Modes sind dort strukturell.

## 1. Vor der Installation: ARM-Paketlücken prüfen
- Omarchy-Installer zieht Pakete aus hardcodierten Repo-Targets. Auf aarch64
  fehlen regelmäßig ganze Build-Artefakte (Sub-Pakete wie Themes/Settings/
  Toolkit-Utils werden nicht für ARM gebaut, obwohl das Hauptpekt existiert).
- Prüfen: `pacman -Sl omarchy omarchy-aarch64 | grep <name>` je Target; Repo-DBs
  alternativ direkt per curl + `tar --zstd -xOf` inspizieren (DBs sind zstd).
- Fehlt ein Target dauerhaft: das Ziel im Installer auf die plain `[extra]`-Variante
  umlenken (viele Omarchy-Spezialpakete haben ein funktionierendes Upstream-Pendant
  ohne die kaputte Extra-Dep-Kette). Patch dokumentieren + Backup `.orig` daneben.

## 2. Installer non-interaktiv nachziehen
- Setup-Skript liegt unter `~/.local/share/omarchy/`; Schritte einzeln per
  `--step <name>` nachziehbar, `--status` zeigt Fortschritt und conf-Datei.
- Install als User starten: `nohup runuser -u gamzat -- bash -lc 'cd ~/.local/share/omarchy && bash install.sh' > /var/log/omarchy-install.log`
  und das Log per Poll überwachen (Abschlusszeile abwarten, nicht nur Exit-Code).
- Temporäre NOPASSWD-Sudoers-Datei (chmod 440) für den Install anlegen und
  UNBEDINGT danach löschen.

## 3. Netz: Distro-SSH-Härtung
- Basis-Images haben oft UFW mit `Default deny incoming` — ICMP geht, TCP-Timeouts
  trotzdem. Immer zuerst `ufw status verbose` + `iptables -S`.
- Fix: `ufw allow from <LAN-CIDR> to any port 22 proto tcp`.
- ARP-MACs von Repeater-Strecken verfälschen die Host-Identität; identifies
  beweisbar über established-SSH-Peers (`ss -tn`) oder Login-Hostname.

## 4. GUI schwarz / Bar leer (Qt-QML-Singleton-Schattierung)
- Symptom: Bar/Sheets/Menüs als schwarze Flächen, Hover reagiert, Popups zeigen
  teils Inhalt. Diagnose: QS-Log `strings /run/user/<uid>/quickshell/by-id/<new>/log.log | grep TypeError`.
- Ursache: neuere Qt-Versionen (≥6.12) führen eingebaute QML-Singletons (z. B.
  `QtQuick.Color`) ein, die ein gleichnamiges Projekt-Singleton überdecken —
  alle Theme-Bindings werden `undefined`, die Bindings sterben und re-evaluieren nie.
- Fix (lokal, bis Upstream-Paket ihn liefert): Singleton umbenennen —
  1. `cp Commons/Color.qml Commons/ShellColor.qml`
  2. qmldir: `singleton ShellColor 1.0 ShellColor.qml`
  3. global `perl -pi -e 's/\bColor\./ShellColor./g'` über alle .qml (vorher
     grep-en, dass KEINE Qt-Builtin-Nutzung `Color.rgba|hsla|darker` existiert!)
  4. `rm -rf ~/.cache/quickshell` (kompilierter QML-Cache!), Shell-Restart,
     TypeError-Count muss 0 sein.
- Upstream-Pakete mit dem Fix können für ARM trotzdem fehlende Sub-Pakete haben —
  vor `pacman -S omarchy` immer `pacman -S --print` prüfen; ein versehentlicher
  Downgrade auf das lokale alte Repo-Paket ist möglich (explizit `repo/pkg` wählen).
- Patch-Skript hinterlegen (`/usr/share` ist pacman-owned, jedes Update
  überschreibt den Fix) und nach jedem Omarchy-Update re-applizieren.

## 5. Layout & First-Run
- DE-Layout: `localectl set-keymap de && localectl set-x11-keymap de` + Shell-Restart
  (Hyprland-Lua-Config liest vconsole, nicht hyprctl-Kommandos).
- Theme muss ZWEI Dinge setzen: `~/.local/state/omarchy/current/theme.name`
  (Datei) und `current/theme/` (generierte Dateien). theme-set mit korrektem
  `OMARCHY_PATH` UND `HOME` als User laufen lassen; `omarchy theme current` muss
  den Namen zeigen, sonst gilt es als unbekannt.
- Default-Agent: `omarchy default agent <name>` (pi, opencode, claude, codex, …);
  Agent-CLI muss vorher installiert sein, der Setter startet den Agent gleich mit.

## 6. GUI-Ferndiagnose (ergänzt tty-handoff-bridge)
- hyprctl/grim brauchen User-Env: SIG aus `/run/user/<uid>/hypr`, WAYLAND_DISPLAY
  tatsächlichen Socket-Namen aus /run lesen (wayland-1 möglich).
- Screenshots selbst ansehen; bei dünnen Bars nicht auf Vision vertrauen:
  `magick <png> -crop <WxH+0+0> -colors 6 -format %c histogram:info:-` zeigt,
  ob helle Text-Pixel existieren (monoton dunkel = kein Text gerendert).
- QS-TypeErrors beim Start sind der schnellste Root-Cause-Indikator — Kette
  lesen (erste Zeile = erste tote Bindung), nicht symptommäßig pkill-en.

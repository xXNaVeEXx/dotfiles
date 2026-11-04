---
name: nix-home-manager-archaeology
description: Rekonstruieren, welche home-manager-Generation eine Config-Datei wann eingeführt/geändert hat und welche Config/Umgebung ein laufender Prozess beim Start wirklich erhielt — Generations-Store-Pfade auflösen, Prozess-Startzeit gegen Symlink-Umschaltzeit halten, geerbte Session-Env (SHELL & Co.) via /proc/PID/environ prüfen, App-Default-Fallback nachweisen. Use when an app behaves as if its config were missing or old although the live config file looks correct, or when a spawned shell/app ignores the login shell or env, or when the timeline/authorship of an HM-managed config file matters.
---

# Config-Forensik für home-manager-verwaltete Dateien

Use when an app behaves as if its config were missing/old although the live file looks right — the answer is almost always *which config was live when the process started*, not what is on disk now.

## Verfahren

1. **Live-Stand feststellen:** `ls -la ~/.config/<app>/` — Symlink zeigt auf `/nix/store/<hash>-home-manager-files/…`. Die Symlink-mtime = Zeitpunkt des letzten `home-manager switch`, NICHT der Inhaltshistorie.
2. **Prozess-Startzeit gegen Switch-Zeit halten:** `ps -o pid,lstart,cmd -p <pid>`. Ein Prozess liest seine Config beim Start; startete er VOR dem letzten Switch, las er die damals livee Generation — egal was die Datei jetzt zeigt. Diese eine Gegenüberstellung (Prozess-lstart vs. Symlink-mtime) klärt die meisten „Config greift nicht"-Fälle.
3. **Generationen auflösen:** `ls -la ~/.local/state/nix/profiles/ | grep home-manager` → `home-manager-N-link`-Symlinks, deren mtime = Switch-Zeitpunkt. Historische Datei direkt im Store lesen (immutable, lesbar):
   `/nix/store/<hash>-home-manager-generation/home-files/.config/<app>/<file>`
   Je Generation greppen — fehlt die Datei dort, existierte sie zu dem Switch noch gar nicht → die App lief auf ihren Built-in-Defaults.
4. **Default-Fallback nachweisen:** Apps mit Config-Fehler oder fehlender Datei fallen auf Built-in-Defaults zurück (z. B. native Titelleiste statt borderless). GUI-Prozesse aus Desktop-Dateien schreiben stderr oft nach `/dev/null` → zuerst `journalctl --user -b | grep -i <app>` und `readlink /proc/<pid>/fd/2` prüfen, bevor man Theorien baut.
5. **Config-Ladung ohne Fenster prüfen:** billige CLI-Subcommand, die die Config mitlädt (z. B. `wezterm ls-fonts`) — rc=0 plus ein erkennbarer Wert aus der Config (Font-Echo) beweist: Datei lädt sauber; das Problem ist woanders (alter Prozess, zweite Binary, andere Datei).
6. **Empirischer Gegenbeweis:** frisches Fenster mit der LIVE-Config starten (`--config-file` auf eine Kopie, einzigartige `--class`, ein unverwechselbares Merkmal wie Vollton-Hintergrundfarbe einbauen), fensterscharf screenshoten und gegen das verdächtige laufende Fenster stellen. Trennt „Config ist falsch" von „Fenster ist alt" in einem Schritt. Testfenster mit Timeout starten und Reste selektiv killen (siehe Skill linux-gui-computer-use, Stolperfallen).

## Geerbte Session-Umgebung statt Config-Datei

Gleiche Symptomklasse, anderer Mechanismus: Terminal-Multiplexer/Workspace-Manager (z. B. herdr, tmux-Server) spawnen Panes mit dem SHELL, das der SERVER-Prozess beim Start geerbt hat — nicht mit dem passwd-Eintrag. Diagnosekette:

1. Server-PID: `pgrep -x <app> | head -1`; dann `tr '\0' '\n' < /proc/<pid>/environ | grep '^SHELL='` gegen den passwd-Eintrag (`grep ^$USER /etc/passwd`) und `systemctl --user show-environment | grep SHELL` halten.
2. Beweis: `pgrep -P <server-pid>` + `tr '\0' ' ' < /proc/<child>/cmdline` zeigt die wirklich gespawnte Shell der Panes.
3. Zeitachse: Session-Start (`ps -o lstart= -C Hyprland`) gegen die Config-Änderung halten (z. B. chsh-Zeitpunkt / Symlink-mtime) — eine laufende grafische Session friert ihre Env beim Login ein; alles später daraus Gespawnte erbt den alten Stand, auch wenn systemd --user inzwischen den neuen kennt.
4. Fix vorziehen, der unabhängig von geerbter Env ist: explizite App-Config (z. B. `[terminal] default_shell = "<absoluter zsh-Pfad>"` in der App-config.toml). Ein App-Restart hilft nur, wenn der ELTERN-Prozess frische Env hat; sonst hilft erst Logout/Login der ganzen Session — und schon geöffnete Panes behalten ihre alte Shell bis zum Schließen.

Undokumentierte Config-Keys einer stripped Binary findet man über `strings <binary> | grep -iE 'shell|mode|config'` — Serde/Rust-Config-Structs stehen mit ihren Feldnamen im Klartext drin (z. B. `default_shell`, `shell_mode`).

## Stolperfallen

- Der Live-Symlink zeigt IMMER auf die neueste Generation — er sagt nichts darüber, was ein früher gestarteter Prozess gelesen hat. Ausschlaggebend ist der Vergleich aus Schritt 2.
- Eine fehlende Datei in einer älteren Generation ist ein starkes Signal: Config wurde erst später eingeführt; alle davor gestarteten Prozesse liefen auf Defaults. Das ist keine Anomalie, sondern der Normalfall bei „Config heute Nacht dazugekommen".
- Binary-Vielfalt ausschließen: `which -a <app>` und `pgrep -a <procname>` — nur wenn EINE Binary und EIN Prozess existieren, ist die Generations-Rechnung die ganze Wahrheit; zweite Binary (nix vs. distro) kann eine zweite Config-Location bedeuten.
- Config-Watcher bei Symlinks in den nix-store: ein Switch re-pointet den Symlink, ein laufender Prozess watcht oft die aufgelöste alte Store-Datei und bekommt den Wechsel nie mit — Neustart des Prozesses ist dann Teil der Lösung, nicht Beweis fürs Versagen der Config.

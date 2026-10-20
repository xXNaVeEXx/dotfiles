# pacman-Upstream-Bruch debuggen und umgehen

Lage: Ein Installer/Setup-Skript ruft `pacman -S … <targets>` mit fest
kodierten Repo-Targets auf und bricht mit `error: target not found: <pkg>` ab.
Die Frage: Paket wirklich nirgends verfügbar (Upstream-Bruch) oder nur falscher
Kanal/Name? Und wenn verfügbar: wie umgehen?

## 1. Verfügbarkeit klären (jede Aussage mit Befehl belegen)

- Installierbarkeit + Architektur + Deps des Kandidaten:
  `pacman -Si <repo>/<pkg>` → Name/Version/Architecture/Depends On.
  Hartes Fehlen einer Dependency im selben Repo macht auch das Target
  unbrauchbar (pacman löst beim -S auf, nicht beim -Si).
- Repo-Inventar: `pacman -Sl <repo> | awk '{print $2}'` (alle Namen), gezielt
  `pacman -Sl <repo> | grep -i <teil>`.
- Offizielle Alternative prüfen: `pacman -Sl extra | grep -E "^extra <pkg> "`
  — die distro-eigene Version hat oft weniger gepatchte Deps.
- AUR: `curl -s 'https://aur.archlinux.org/rpc/v5/info?arg[]=<pkg>'` →
  results[] leer heißt auch AUR leer.
- Repo-Kanäle vergleichen (edge/rc/stable o. ä.): pacman-DBs sind
  **Zstandard**, nicht gzip — `curl -sL <server>/<kanal>/<arch>/<repo>.db -o
  /tmp/x.db && tar --zstd -tf /tmp/x.db` und Einträge greppen
  (`<pkg>-<ver>-<rel>/desc`). HTTP-Status der DB-URL vorher mit
  `curl -o /dev/null -w '%{http_code}'` prüfen — Verzeichnis-Listing liefert
  oft eine 404-HTML-Seite statt Fehler.

## 2. Entscheidung

- Target existiert in anderem Kanal → pacman.conf-Server auf den Kanal
  umbiegen, `-Sy` und Installer erneut laufen lassen.
- Target fehlt ÜBERALL (Installer-Branch ist dem Repo-Publishing voraus):
  Upstream-Bruch. Umgehen, wenn eine distro-offizielle Version dieselbe
  Funktion liefert und KEINE hart fehlende Dependency hat.
- Niemals Versionen mischen, die sich gegenseitig up/downgraden: Installers
  mit `--ignore`-Logik beachten (explizite Targets übergehen IgnorePkg).

## 3. Umgehen eines kaputten hardkodierten Targets

1. Targets-Funktion im Installer-Checkout lokalisieren (`grep -rn "<pkg>"`,
   oft `…_package_targets()` in helpers) und auf das existierende Target
   patchen (z. B. `omarchy/hyprland` → `extra/hyprland`); Original als
   `.orig` sichern, Besitzrechte auf den Checkout-User halten.
2. Prüfen, ob spätere Verifikationsschritte die Original-Paarung erzwingen
   (z. B. `verify_published_pair`) — nur aktive Pfade blockieren wirklich.
3. Temporäres NOPASSWD-sudoers-Drop-in, Installer als User mit nohup + Log
   starten, bg-Poll auf Erfolgsschlusszeile; NOPASSWD danach entfernen
   (Pitfalls im Haupt-SKILL.md).
4. Nach Upstream-Heilung das gepatchte Target wieder auf Repo-Version
   anheben (`pacman -S <repo>/<pkg>` als Upgrade).

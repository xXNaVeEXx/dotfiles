---
name: lumi-desktop-local-builds
description: Schwere Builds, Tests und dsh-Runtime-Proben für apps/lumi-desktop lokal ausführen (Mac nicht erreichbar): Wächter-Schleife gegen den Ausgabe-Wächter, cargo-safe/pnpm-safe, dsh-Kompatibilitäts-Proben mit Cache-Kopien. Use when apps/lumi-desktop builds/tests/dsh probes must run locally or a session was killed by the output watchdog mid-build.
---

# lumi-desktop-local-builds

# Schwere Builds/Tests und dsh-Runtime-Proben für apps/lumi-desktop LOKAL

Anwenden, wenn Builds, Tests oder dsh-Kompatibilitäts-Proben für apps/lumi-desktop lokal laufen sollen, weil das MacBook nicht erreichbar ist — oder wenn eine Sitzung vom Ausgabe-Wächter per SIGTERM getrennt wurde und lange Befehle nach dem Resume weiterlaufen müssen.

## 1 Grundregeln (je Schritt)
- cargo NUR über `apps/lumi-desktop/tools/cargo-safe.sh`, pnpm NUR über `tools/pnpm-safe.sh` (beide: flock auf `<repo>/.tmp/cargo-build.lock`, systemd-run MemoryMax, TMPDIR auf Platte, Nix-Shell `.#desktop`).
- Immer nur EIN schwerer Schritt gleichzeitig; vorher `free -m` (verfügbar > 3 GB). Nie cargo und pnpm parallel.
- Ausgabe nach `<repo>/.tmp/<name>.log` (absolute Pfade! `/tmp` ist RAM — nichts Großes dorthin), nur `tail` lesen.
- Echtes dsh braucht offizielles Node: `PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`.

## 2 Wächter-Schleife für lange Befehle (Ausgabe-Wächter tötet stille Sitzungen)
Nie länger als ~10 Minuten ohne eigene Ausgabe. Statt eines blockierenden Aufrufs:

```bash
R=/absoluter/repo/pfad
setsid nohup bash -c "cd $R/apps/lumi-desktop && timeout 1500 tools/cargo-safe.sh <ziel> > $R/.tmp/<name>.log 2>&1; echo \"EXIT=\$?\" >> $R/.tmp/<name>.log" >/dev/null 2>&1 &
sleep 90; tail -n 3 $R/.tmp/<name>.log   # wiederholen bis EXIT=… im Log steht
```

Stolperfallen:
- Das bash-Tool des Agenten tötet beim Return die ganze Prozessgruppe — `& disown` allein reicht NICHT, der Hintergrundjob stirbt still. `setsid` löst die Gruppe; ohne Nachweis im Log gilt der Lauf als nicht gestartet.
- Präzedenz-Falle: `cd X && cmd &` hintergrundet die GESAMTE Kette; Befehle nach `;`/neue Zeile laufen im alten cwd → relative Pfade (`../../.tmp`) zeigen dann ins Leere und simulieren einen Fehlschlag. Immer absolute Pfade für Log-Checks, oder `cd` vor dem `&` in einem eigenen Schritt.
- Diagnose, bevor something als „läuft nicht" gilt: `pgrep -af <prozess>` und `ls` auf den Log-Pfad mit absolutem Pfad.

## 3 dsh-Kompatibilitäts-Proben (z. B. Plugin vs. Runtime-Pin)
1. `tools/compat-fetch.sh --neueste` → Cache `~/.cache/lumi-compat-neueste` (Plugins @HEAD, `versions.tsv` listet Commits). npm-Downloads ok; nichts in `~/.cache` löschen.
2. Vor jeder Probe das dist des Hosts prüfen: `ext-host-dsh/dist` veraltet gern gegen `src` (tsc-Zeitstempel vergleichen). Neu bauen mit offiziellem Node: `node_modules/.bin/tsc -p tsconfig.json && node_modules/.bin/tsc -p bridge/tsconfig.json` — sonst fehlen neue RPC-Handler (z. B. `plugin/bundles`) und die Probe scheitert an phantom-Fehlern.
3. Treiber-Muster (Node-Skript, Vorlage `.tmp/p8k-load.mjs`): `dist/src/main.js` spawnen mit `--dsh-home <tmp> --plugin <dir> --cwd <basis> [--web]`, dann über stdin/stdout-JSON-RPC `host/initialize` → `plugin/list` pollen → `plugin/bundles` (skippedBundles). Ausnahme erteilen = `profiles/lumi/compatibility.json` mit `{"<name>@<version>": ["<runtime>"]}` vor dem Start schreiben.
4. Runtime-Seite testen OHNE Repo-Pins zu ändern: Host-Kopie im Cache-Baum anlegen (src + tsconfigs kopieren, package.json mit sed auf die Zielversion), dort `npm install`. Stolperfalle neuere dsh-Stände (≥ 0.2.1): sie erkläern ~100 `@deepseek-ai/*`-Pakete als echte peerDependencies statt sie zu bündeln — `--legacy-peer-deps` installiert die NICHT, der Host stirbt erst zur Laufzeit an `ERR_MODULE_NOT_FOUND`. Abhilfe: per Node-Skript über `node_modules/@deepseek-ai/*/peerDependencies` die fehlenden sammeln und in EINEM `npm install peer@range …` nachziehen.
5. Erwartungsbilder: ohne Ausnahme + alte Runtime → Bundle in `skippedBundles`, `plugin/list` zeigt es nicht; mit passender Runtime (oder Ausnahme) → `state:"active"` (mit `--web`; ohne web bleibt es `pending`, wartet auf webServer — kein Fehler).

## 4 Abschluss
Testzahlen aus den Logs zitieren (nextest-Summary, vitest-Summary, clippy/tsc exit), Probe-Ergebnis als „Version X: active/skipped"-Paar. Für Rust: `clippy -p <crate> --all-targets -- -D warnings` zusätzlich zu nextest laufen lassen — nextest verkraftet unbenutzte Imports, clippy mit `-D warnings` nicht. Generierte UI-Dateien nur per Generator (`cargo-safe.sh export-ts` für Contracts, `node tools/i18n-desktop-keys.mjs` für i18n); Abgleich = Generator laufen lassen, `git diff` in `ui/src/generated/` muss leer bleiben außer den beabsichtigten Schlüsseln.

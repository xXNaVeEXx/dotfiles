---
name: lumi-desktop-local-builds
description: Schwere Builds, Tests und dsh-Runtime-Proben für apps/lumi-desktop lokal ausführen (Mac nicht erreichbar): Wächter-Schleife gegen den Ausgabe-Wächter, cargo-safe/pnpm-safe, dsh-Kompatibilitäts-Proben mit Cache-Kopien, plus Orchestrator-Abnahme von Worker-Ergebnissen vor dem Commit. Use when apps/lumi-desktop builds/tests/dsh probes must run locally, a session was killed by the output watchdog mid-build, or a build worker finished and its uncommitted result needs acceptance.
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

## 4 Abnahme durch Orchestrator nach Worker-Abschluss (vor jedem Commit)
Worker enden gern KURZ vor den finalen Läufen (Watchdog/Timeout) — „fertig" heißt erst fertig nach eigener Verifikation. acp-Worker haben ein 30-Min-Hard-Limit: Brief so gestalten, dass Code+Tests zuerst kommen, LÄUFE am Ende gebündelt und der Bericht früh/fortlaufend geschrieben wird. Nach einem Timeout: Waisen-Läufe prüfen (`pgrep -af cargo`), Log-Stand auswerten (`Finished`/`error`), dann Resume mit diesem KONKREten Zwischenstand füttern (nicht pauschal „mach weiter").
1. Bericht auf Platzhalter prüfen: `grep -n "folgt nach\|TODO\|⟨" docs/reports/<paket>.md` — leere Test-Abschnitte selbst füllen.
2. Selbst verifizieren (je ein schwerer Schritt): `tools/cargo-safe.sh nextest run -p <betroffene crates>` → `tools/cargo-safe.sh clippy -p <crates> --all-targets -- -D warnings` → aus `ui/`: `../tools/pnpm-safe.sh test`. Berichts-Abschnitt „Tests" mit diesen EIGENEN Zahlen füllen (plus Hinweis auf Orchestrator-Fixes). Test-Zahlen NIE schätzen oder aus Erinnerung eintragen — Zeile für Zeile aus dem echten Log kopieren (zählbare Summen wie „198 Dateien / 1084 Tests" wurden schon zweimal um genau 1 daneben geschätzt und mussten nach dem Lauf korrigiert werden). Wartet ein Worker auf einen eigenen Hintergrund-Verifikationslauf, MUSS er ihn pollend begleiten (sleep+tail-Schleife) — stilles Warten triggert den Ausgabe-Wächter, und der bg-Lauf stirbt mit dem Worker (Prozessgruppe). Ist die Teilarbeit bei Timeout trotzdem komplett implementiert, übernimmt der Orchestrator die Schlussverifikation selbst — billiger als ein Resume-Zyklus.
3. Typische Restfixe nach Workern: fehlende i18n-Keys → in `i18n/desktop/coding.en.json`/`coding.ru.json` per Python (`ensure_ascii=False`, Key = deutscher Quelltext) ergänzen — Fehljobs aus der VITEST-Ausgabe lesen (`grep -A12 "Failed Tests"`), keine eigene Regex-Replik über Quelltext bauen (matcht mehrzeilig falsch). Clippy `must_use`-Reste → `let _ =` vor den Aufruf. Rust-Struct-Felder ohne Default brechen ALLE Struct-Literal-Initializer im Workspace — auch Tests älterer Pakete; nach Feld-Erweiterungen (z. B. an ThreadRecord-artigen Records) die Test-Initializer überall nachziehen, sonst fliegt der Kompilierfehler erst beim nächsten Paket-Lauf auf.
   - Serde-Kontrakt-Regel für JSON-API-Structs (Rust→UI/TS): verlangt der Kontrakt „fehlende Optionale werden weggelassen", brauchen Option-Felder `#[serde(default, skip_serializing_if = "Option::is_none")]` — ohne das serialisiert serde `"feld": null` und Kontrakt-/Snapshot-Tests schlagen fehl, obwohl die Deserialisierung klaglos läuft. Geteilter-Irrtums-Falle: Worker-Komponente UND deren Test-Helper bauen gern dieselbe falsche Datenform (z. B. verschachtelte Diskriminanten-Objekte statt flacher String-Tags) — Suite läuft grün gegen den Mock und bricht trotzdem gegen echte Daten. Richte beide Seiten am GENERIERTEN Kontraktstyp aus (ui/src/generated/…); Test-Factory per Spread ({...base, ...state}) bauen, nicht per Feldzuweisung.
   - Rust-E0716-Regel für Worker-Restfixe: `let Some(x) = expr.chain().as_ref() else …` kompiliert NICHT, wenn `expr.chain()` ein Temporäres liefert und `x` erst im NÄCHSTEN Statement genutzt wird (Temporäre fallen am Ende des let-Statements). Vor dem let-else ein `let owned = expr.chain();` binden und darauf `as_ref()` nehmen. Ein-Ausdruck-Ketten (`Some(x.chain().y().await)`) sind ungefährdet, weil Nutzung im selben Statement steht.
   - Bibliotheken übersetzen HTTP-Statuscodes in eigene Meldungen: stringbasierte Fehler-Erkennung (z. B. 401→Refresh) auf den LIBRARY-Text der unwrap-ten Fehlerkette testen, nicht nur auf den HTTP-Code — rmcp meldet 401 als „Auth required, when send initialize request", ohne jede Ziffer. Beim Ergänzen neuer Matcher die konkrete Meldung aus dem Test-Fail-Panik kopieren.
   - Beispiel-/Testserver (z. B. mini_mcp_server): neue Auth- oder Guard-Layer gehören HINTER das auslösende Flag — axum-Layers greifen für ALLE Starts, auch ohne Flag, und 401n dann jede bestehende Testnutzung, die das Flag nicht setzt. Ebenso RFC-9728-Gedenke: `/.well-known/*`-Metadaten müssen Guard-frei bleiben (Guard-Layer nimmt Pfad-Weiche VOR der Token-Prüfung), sonst findet der Client den Authorization-Server nie.
   - i18n-Heimat-Regel: jeder Key lebt GENAU EINMAL in seiner Paket-Datei (z. B. `coding-p9d.{en,ru}.json`); Duplikate in `coding.{en,ru}.json` feuern den en↔ru-Gleichheits-Test. Beim Entfernen per `sed` Zeile N prüfen: war sie der letzte Eintrag, hängt ein trailing comma (`",\n}` → `"}`) — danach `json.load` validieren.
   - Vite-Transform-Cache-Falle: meldet ein i18n-Test Keys als fehlend, die nachweislich in den JSONs stehen (import.meta.glob wird beim TRANSFORMIEREN der Testdatei zu statischen Imports expandiert; ein stale Artefakt hält den alten glob-Stand): Testdatei beliebig anfassen (auch eine Kommentar-/`void 0;`-Zeile erzwingt Neu-Transformierung) oder `node_modules/.vite` löschen. Beweis-Trick: syntaktisch wirkungslose Zeile einfügen → wird's grün, ist es der Cache, nicht der Datensatz. Strukturelle Abhilfe: i18n-Tabellen in Tests per `node:fs` lesen statt per glob — dann entfällt die Falle ganz.
4. Commit-Konvention einhalten: Subject ≤72 (Guard-Hook), deutscher Body + „Geprüft:"-Abschnitt mit Zahlen; `git add` + `git commit` ZUSAMMEN (nach Hook-Block Staging unzuverlässig); push via `.tmp/askpass.sh`.

## 5 Abschluss
Testzahlen aus den Logs zitieren (nextest-Summary, vitest-Summary, clippy/tsc exit), Probe-Ergebnis als „Version X: active/skipped"-Paar. Für Rust: `clippy -p <crate> --all-targets -- -D warnings` zusätzlich zu nextest laufen lassen — nextest verkraftet unbenutzte Imports, clippy mit `-D warnings` nicht. Generierte UI-Dateien nur per Generator (`cargo-safe.sh export-ts` für Contracts, `node tools/i18n-desktop-keys.mjs` für i18n); Abgleich = Generator laufen lassen, `git diff` in `ui/src/generated/` muss leer bleiben außer den beabsichtigten Schlüsseln.

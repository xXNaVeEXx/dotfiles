# Speicher des Next-Builds im Docker-Abbild messen (Kunden-Abbilder im main-Build)

Anwendung: Der main- oder Tag-Build bricht im Kunden-Schritt mit `FATAL ERROR: Ineffective mark-compacts near heap limit
… JavaScript heap out of memory` (oder `Reached heap limit` im Next-Build-Worker) ab, oder ein Build läuft nur knapp
durch. Ziel: den echten Bedarf unter den Bedingungen des CI-Runners belegen, bevor Heap-Grenze oder Next-Einstellungen
geändert werden.

## 1. Bedingungen des Runners feststellen
- Runner-Art aus dem Job lesen: `gh api repos/<repo>/actions/jobs/<id> --jq '.runner_name, .labels'`. GitHub-gehostete
  `ubuntu-latest`-Runner in privaten Repos laufen mit 2 vCPU und rund 8 GB RAM (aktuelle Zahl in der GitHub-Doku prüfen).
- Heap-Grenze des Builds steht im Dockerfile (`ENV NODE_OPTIONS="--max-old-space-size=…"`, in beiden App-Dockerfiles).
- Im Job-Log des roten Laufs nachsehen, welcher Kunde starb und ob ein abgeschalteter Mechanismus trotzdem arbeitet
  (z. B. `grep -c PackFileCacheStrategy` = Webpack-Datei-Cache aktiv). Die Schleife bricht beim ersten roten Kunden ab;
  die Kunden danach sind ungeprüft.

## 2. Unter Runner-Bedingungen messen (x86-Rechner, nicht ARM)
- `docker build --memory …` begrenzt die RUN-Schritte unter BuildKit NICHT. Stattdessen einen eigenen Builder
  (`docker buildx create --driver docker-container --name <n> --use --bootstrap`) anlegen und dessen Container begrenzen
  (`docker update --memory 8g --memory-swap 8g --cpuset-cpus 0-1 buildx_buildkit_<n>0`). So liegt die Grenze wie beim
  Runner um den gesamten Build.
- **Der Abnahmelauf nimmt das unveränderte Dockerfile und turbo.json aus dem Zweig** (`git archive HEAD | ssh <host> 'tar
  -x -C <ordner>'`, dann `docker buildx build --builder <n> --target installer --build-arg CUSTOMER=<slug> -f
  apps/<app>/Dockerfile .`) und baut jeden Kunden mit eigener App nacheinander, Abbruch beim ersten Fehler. Grund: Ein
  Mess-Dockerfile mit eingebauten Hilfen kann genau den Weg umgehen, an dem die Einstellung im echten Bau scheitert.
- Spitzen-RSS und Dauer (Erkundungsläufe): im Mess-Dockerfile den Build-RUN mit `/usr/bin/time -v` aufrufen (Paket
  `time` vorher in dieser Stufe installieren) und „Maximum resident set size“ und „Elapsed“ aus dem Log lesen. Heap je
  Prozess über einen per `--require` geladenen Sampler (Spitze von `process.memoryUsage()` je PID). Die Container-Spitze
  (`memory.peak` im BuildKit-Container) enthält Page-Cache von apt/`pnpm install`; sie ist nur eine obere Schranke, der
  echte Bedarf ist die Prozess-RSS.
- GC-Verlauf: `--trace-gc` ist in `NODE_OPTIONS` nicht erlaubt. Ein kleines Skript per `--require` laden, das
  `v8.setFlagsFromString('--trace-gc')` setzt.
- Je Variante ein eigener Lauf mit demselben Kunden (`--build-arg CUSTOMER=<slug>`). Lange Läufe auf einem Rechner, der
  beim Abmelden Prozesse beendet, nur per `systemd-run --user --unit=<name> …` starten und das Ergebnis aus dem Log holen.
- **Die Wirkung jeder Einstellung im Log des echten Build-Befehls nachweisen**, nicht nur, dass sie gesetzt ist (z. B.
  Cache aus ⇒ 0 Zeilen `PackFileCacheStrategy`). Grund: Ein `ENV` im Dockerfile erreicht `next.config` hinter `pnpm turbo
  run build` nur, wenn `turbo.json` die Variable nennt (Turbo 2: strict env mode filtert still); ein fehlgeschlagenes
  Ersetzen im Mess-Dockerfile wirkt genauso unsichtbar.
- Zuerst die Ausgangslage nachstellen (der CI-Fehler muss im Messlauf auftreten), dann je Hebel ein Lauf.
- Am Ende auf dem Messrechner aufräumen: `docker buildx rm <n>`, Container `buildx_buildkit_<n>0` und dessen Volume,
  alte inaktive Builder-Einträge (`docker buildx ls`), Messordner. Stirbt der Mess-Worker vorher, räumt der
  Orchestrator selbst auf.

## 3. Hebel (gemessen an der besichtigungs-app: Next 16, Webpack, ~3000 TS-Dateien, 8-GB-Runner)
In dieser Reihenfolge; nur die Kombination aus 1 und 2 brachte die Kunden-Builds sicher durch (~5 min, Compile 2,8 min):
1. **Persistenten Webpack-Cache im Docker-Bau abschalten** (`config.cache = false` im `webpack()`-Callback, nur wenn eine
   ENV wie `WEBPACK_CACHE_OFF=1` aus dem Dockerfile gesetzt ist; lokal bleibt er an). Die Variable zusätzlich in
   `turbo.json` unter `tasks.build.passThroughEnv` eintragen (ändert nur den Speicher, nicht die Ausgabe → nicht `env`).
   Größter Einzelhebel: `.next/cache` wird im Abbild nie wiederverwendet, seine Serialisierungs-Puffer hielten aber über
   1 GB Heap fest. Absichern: Nach dem Build im Dockerfile abbrechen, wenn trotz Schalter `.next/cache/webpack` existiert,
   und ein Test, der jede im Dockerfile gesetzte und in `next.config` gelesene Variable in `turbo.json` verlangt — so
   meldet schon der PR-`image`-Job einen Rückfall.
2. **`experimental.webpackBuildWorker: true` ausdrücklich setzen.** Ein eigener `webpack()`-Callback schaltet den
   Build-Worker sonst ab, und alle Compile-Durchgänge laufen im Next-Hauptprozess. Allein (mit Cache an) reichte er
   nicht.
3. `experimental.cpus: 2`: Jeder Static-Generation-Worker lädt das Server-Bündel (~1 GB RSS); mehr Worker sprengen den
   Runner-RAM.
4. `experimental.webpackMemoryOptimizations: true`: allein ohne messbare Wirkung, schadet aber nicht.
- **Eine höhere Heap-Grenze ist kein Ausweg**, wenn die RSS-Spitze dann über den Runner-RAM wächst; dann bricht statt des
  Node-Prozesses der ganze Builder ab (`ResourceExhausted`).

## 4. Bewerten und dokumentieren
- Erfolg: alle Kunden mit eigener App (nicht nur einer) und das Basis-Abbild laufen durch, RSS-Spitze mit Reserve unter
  dem Runner-RAM, Heap-Spitze ≤ ~85 % der Grenze. Ein Basis-Build nahe an der Grenze ist schon ein Befund, auch wenn er
  gerade noch durchläuft.
- Das Ergebnis mit Messtabelle in die Status-Datei und als Kommentar mit Messwert neben die Grenze im Dockerfile; beide
  Apps (App-Kopie) gleich anpassen.
- Läuft die PR-CI den Kunden-Schritt nicht, die Lücke benennen: ein grüner PR beweist nichts über den Kunden-Build. Der
  PR-`image`-Job baut aber dieselbe Stufe mit denselben Einstellungen und fängt mit der Docker-Prüfung aus Hebel 1 den
  Basis-Fall mit.

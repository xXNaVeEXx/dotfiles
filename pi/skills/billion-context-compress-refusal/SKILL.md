---
name: billion-context-compress-refusal
description: "billion-context-Faltungen, die mit „Compression refused: coverage regression“, „cannot satisfy turn integrity“, „no net shrink“ oder dem Repeat-failure-Guard scheitern oder als abgeschnittene Stub-Blöcke landen, diagnostizieren und entschärfen — Bereichsform prüfen (höchstens ein lückenloser Neuversuch), ID-Drift im Session-State messen, Stubs per decompress-to-file reparieren, Auslöser vermeiden, Turn-Abbruch nach Ablehnung verhindern (compress nie allein senden), Upstream-Fix verfolgen. Use when an ACP/billion-context compress is refused (coverage regression, turn integrity, no net shrink), a turn aborts right after a compress with „unsupported stop reason length“, a fresh block shows a tiny truncated summary, the user complains about recurring ACP refusal or stop-reason errors, or a nearly full session must be compacted although acp_status shows nothing compressible."
---

# billion-context-compress-refusal

# billion-context: Faltung abgelehnt („coverage regression“)

Die Meldung ist die Antwort des Proxys auf einen eigenen `compress`-Aufruf. Ein Guard lehnt jede Faltung ab, nach der schon gefaltete Nachrichten ohne Block dastünden. Auslöser ist ein Upstream-Bug: Werden alte Blöcke zusammengeführt (T2/T3-Distill, Bereiche `bX…bY`), geht Abdeckung verloren, sobald Nachrichten-IDs gedriftet sind.

## 1. Erkennen
- Text: `Compression refused: coverage regression — folding these ranges would leave N already-folded message(s) without any covering block …`. Ab dem zweiten Mal kommt „Repeat-failure guard“ dazu.
- Log: `~/.local/state/billion-context/bili.log` → `compress REFUSED <bereiche> — coverage regression: N … (x_…)`.
- Variante: `… cannot satisfy turn integrity without unfolding already-folded message(s)`. Sie kommt, wenn ein Bereich
  vorhandene Blöcke zusammenführen soll (`bX…bY`) oder an Turns schneidet, die schon gefaltet sind.

## 2. Diagnose (nur lesen)
1. Session-State finden: `cd ~/.local/share/billion-context/sessions/<provider>; grep -l '<Topic eines eigenen Blocks>' *.json`.
2. Felder: `.payload.state.blocks[]` (blockId, active, startRef, endRef, effectiveMessageIds, directBlockIds), `.payload.state.messageRefs.byRaw`, `.payload.messages[]`.
3. Drift messen (IDs aktiver Blöcke außerhalb ihres eigenen Bereichs):
   ```
   jq -c '.payload.state as $s | $s.messageRefs.byRaw as $m | [$s.blocks[]|select(.active)|(.startRef|ltrimstr("m")|tonumber) as $a|(.endRef|ltrimstr("m")|tonumber) as $e|.effectiveMessageIds[]|select((($m[.]//"m0")|ltrimstr("m")|tonumber) as $n|$n<$a or $n>$e)] | {drift: length, top: (map(sub("_[0-9]+$";""))|group_by(.)|map([.[0],length])|sort_by(-.[1])|.[0:3])}' <state>.json
   ```
4. Hat ein Hash-Präfix viele `_N`-Suffixe, sind das inhaltsgleiche Nachrichten, nämlich leere oder nur aus Leerzeichen bestehende Assistant-Texte. Gegenprobe: `jq '.payload.messages[]|select(.id|startswith("<präfix>"))|.text' <state>.json`.
5. Stand des Fixes: `jq -r .version ~/.pi/agent/npm/node_modules/billion-context/package.json`, `npm view billion-context version`, `gh api repos/ranxianglei/billion-context/pulls/4485 --jq .merged`.

## 3. Handeln
- Höchstens EIN Neuversuch, und nur wenn der abgelehnte Aufruf von der Form aus 4. abwich (mehrere Bereiche mit Lücke dazwischen, Schnitt mitten durch einen Turn): dann genau ein zusammenhängender Bereich, der alle vorhandenen Blöcke ganz umfasst. Scheitert auch er, ist es Drift: keine weiteren Bereichsvarianten, denn jede Ablehnung sieht der Nutzer als Meldung, und ein einziger Bereich über alle Blöcke scheitert, solange Drift besteht.
- Bei Drift Distill-Nudges in dieser Sitzung ignorieren, auch die eskalierte Fassung („EMERGENCY — TIER 2 DISTILLATION“, „Context limit reached“). Grund: Sie verlangen genau die Block-Zusammenführung, die scheitert; bei echtem Überlauf faltet der Proxy selbst (Blöcke „preflight overflow compress“), und die Sitzung bleibt nutzbar. Nach einer Drift-Ablehnung in dieser Sitzung gar nicht mehr falten, auch keine selbst gewählten Rohbereiche: Sie scheitern ebenso, sobald sie Nur-Leerzeichen-Texte (gedriftete `_N`-IDs) enthalten. Vor der ersten Ablehnung Rohbereiche aus `acp_status` („Compressible ranges“) falten; vorhandene Blöcke nur innerhalb EINES zusammenhängenden Bereichs mitnehmen (siehe 4.).
- Nach einer „turn integrity“-Ablehnung keine Block-Zusammenführung mehr versuchen, auch nicht mit anderen
  Blockgruppen; nur noch die Rohbereiche falten, die `acp_status` listet. Grund: Die Sperre gilt für jede Zusammenführung
  über die schon gefalteten Turns, und jede weitere Variante erzeugt nur eine weitere Meldung beim Nutzer.
- Meldet die Ablehnung „Current compressible ranges“, nur genau diese Rohbereiche falten. Dieselbe Block-Zusammenführung (`b2..b11`) mit umformulierter Zusammenfassung zu senden scheitert deterministisch; nach dem Circuit-Breaker („3 consecutive compress failures“) gar nicht mehr falten und die Aufgabe weiterführen.
- Für den Guard gibt es keinen Schalter. `compress.injectNudge` bzw. `ACP_COMPRESS_NUDGE` schaltet nur die Nudges ab, und das global für alle Sitzungen.
- Das Proxy-Bundle (`dist/index.js`) nicht live patchen: Es betrifft alle pi-Sitzungen, wirkt erst nach einem Neustart, und `pi update` überschreibt es. Nur auf ausdrücklichen Wunsch.
- Dem Nutzer offen sagen, dass es ein Upstream-Fehler ist. Workaround bis zum Update: nach Abschluss der Arbeit eine frische Sitzung. Behoben ist er ab 0.1.210 (siehe 3b, Aktualisierung per `pi update --extension npm:billion-context`); zuerst die installierte Version prüfen. Einen öffentlichen Kommentar am Upstream-Issue nur nach Rückfrage schreiben.

## 3b. Turn-Abbruch nach abgelehnter Faltung
- Bestand eine Antwort nur aus Proxy-Werkzeugen (compress/decompress) und schlugen alle fehl, beendet der Proxy den
  Lauf früh mit finishReason „length“. Der Anthropic-Pfad meldet das als `Anthropic beta messages stream emitted
  unsupported stop reason "length"` (stopReason „error“), OpenAI-kompatible Pfade als stopReason „length“. pi
  wiederholt den Lauf nicht selbst, weil die Meldung keinem retrybaren Fehlermuster entspricht.
- compress daher nie allein senden, immer zusammen mit einem echten Tool-Call. Grund: Dann ist die Antwort nicht nur
  aus fehlgeschlagenen Proxy-Werkzeugen, und der Proxy fragt das Modell erneut an, statt den Lauf zu beenden.
- Die Extension `~/.pi/agent/extensions/turn-weiter.ts` setzt solche technisch beendeten Läufe in TUI/RPC automatisch
  fort (Folge-Nachricht mit triggerTurn, sobald die Sitzung frei ist; höchstens 3 in Folge und 12 je Stunde; nie nach
  einem Abbruch durch den Nutzer; „length“ ohne Ausgabe bleibt pis Überlauf-Verdichtung). Log
  `~/.pi/agent/turn-weiter.log`, Abschalten per Datei `~/.pi/agent/turn-weiter.off`, Quelle und Test unter
  `~/.pi/agent/ext-dev/turn-weiter/` (`node test.mjs`). Wirkt in laufenden Sitzungen erst nach `/reload`.
- Herdr-Sitzungen ohne Extension zusätzlich per Watchdog abfangen: idle/done und letzter Assistant-Eintrag der
  Sitzungs-JSONL mit stopReason „error“/„length“ → sofort `herdr agent prompt` mit „weiter nach Plan“.
- Upstream behoben ab billion-context 0.1.210 (PR #5231 „failed compress must not kill the task“, #4521 „bereits
  gefaltete/geschützte Bereiche = Erfolg ohne Wirkung“). Aktualisieren nur dieses Pakets:
  `pi update --extension npm:billion-context`, danach `jq -r .version ~/.pi/agent/npm/node_modules/billion-context/package.json`.
  Der Proxy auf Port 18787 ist geteilt: Der nächste neu gestartete pi-Prozess (z. B. `pi -p "OK"`) übernimmt ihn mit der
  neuen Version („rotating stale proxy … graceful shutdown“), laufende Sitzungen arbeiten mit unverändertem Zustand weiter
  (`acp_status` zeigt dann `host=billion-context <neu>`). npm-Warnungen zu nicht ausgeführten install-scripts sind
  unkritisch, solange `node -e "new (require('better-sqlite3'))(':memory:')"` im npm-Ordner läuft. Danach im
  turn-weiter-Log beobachten, ob noch Fortsetzungen nötig sind; wenn nicht, per `turn-weiter.off` abschalten.

## 4. Vorbeugen
- Keine Assistant-Texte aus nur Leerzeichen vor Tool-Calls: entweder ein sinnvoller Satz oder direkt der Tool-Call.
- Beim Zusammenführen vorhandener Blöcke EINEN zusammenhängenden Bereich von der ersten bis zur letzten faltbaren Nachricht wählen; mehrere Bereiche in einem Aufruf nur lückenlos aneinander und an ganzen Turns ausgerichtet. Grund: Der Proxy hat die Grenzen früherer Blöcke beim Falten an Turns und geschützte Nachrichten angepasst; eine Lücke zwischen eigenen Bereichen trifft dann leicht schon gefaltete Nachrichten und löst dieselbe Ablehnung aus wie Drift.
- Früh auf Rohbereiche falten (T1), bevor sich viele Blöcke und Drift ansammeln. Sehr lange Sitzungen nach einem großen Auftrag neu beginnen.

## 5. Stub-Blöcke und „no net shrink“
- Jede Zusammenfassung selbst vollständig schreiben. Nie Text aus früheren `compress`-Aufrufen, Fingerprints oder Blockköpfen im Kontext übernehmen. Grund: Diese Anzeigen sind gekürzt und enden mit „…“. Der Proxy speichert genau den gelieferten Text, und ein Block mit ~200 Zeichen über Dutzende Nachrichten verliert deren Inhalt.
- Erkennen: Die compress-Antwort meldet für einen großen Bereich `full summary <N>ch` mit kleinem N, und der Tail endet mit „…“. `acp_status` zeigt solche Blöcke etwa als `8.3K→56`.
- Reparieren:
  1. Je Stub `decompress({blockId, full: true, toFile: "/tmp/<block>.md"})`. Das holt das Original in eine Datei, ohne den Kontext aufzublähen.
  2. Daraus eine vollständige Zusammenfassung schreiben und sie als neuen Block auf einen freien Rohbereich legen, z. B. die decompress- und Lese-Nachrichten selbst. Ihre erste Zeile erklärt den Stub-Block für überholt.
  3. Den Stub selbst nicht neu falten. Grund: Eine längere Zusammenfassung über denselben Bereich lehnt der Proxy mit „Compression refused: no net shrink“ ab, weil sie den Kontext vergrößern würde.
- Bei „no net shrink“ denselben Bereich nie mit derselben Zusammenfassung erneut senden. Stattdessen kürzer schreiben, einen größeren Bereich wählen oder gar nicht falten.

## 6. Kontext fast voll, aber nichts faltbar
- Erkennen: `acp_status` zeigt nur alte Blöcke, `0 tool | 0 text`, „max compressible 0“, und BILLED INPUT ist Stunden alt
  („measured <n>m ago“). Dann sieht der Proxy die aktuelle Masse nicht, und `compress` bringt nichts; der Druck steht in
  pis eigener Anzeige (Fußzeile in %).
- Handeln: Zuerst den Arbeitsstand in die Übergabe-/Stand-Datei schreiben (laufende Arbeit, IDs, nächste Schritte, Regeln),
  dann pis eingebautes `/compact <Fokus-Hinweis>` (der Hinweis steuert, was die Zusammenfassung behält; er verweist auf
  die Stand-Datei). Selbst auslösen: ein bg_run-Helfer (`notifyOnCompletion: false`) wartet auf zwei aufeinanderfolgende
  idle-Messungen des eigenen Panes (`herdr agent get <pane>`) und schickt dann `herdr agent prompt <pane> "/compact …"`;
  den eigenen Turn danach sofort beenden. Startet gleich danach ein anderer Turn (z. B. ein automatischer Review-Turn),
  reiht pi den Befehl ein und verdichtet nach dessen Ende — den Helfer dann nicht erneut starten. Kommt dagegen vor dem
  Leerlauf eine neue Nutzernachricht, sendet der Helfer nie: ihn per `bg_kill` beenden und nach diesem Turn neu starten.
- Prüfen: Ein eingereihter Befehl liefert den Fokus-Hinweis nach der Verdichtung zusätzlich als Nutzernachricht, die
  einen Turn startet. Nicht erneut compacten, sondern den Eintrag in der Sitzungs-JSONL (Pfad aus
  `herdr agent get <pane>` → `.result.agent.agent_session.value`) suchen:
  `tail -c 6000000 <sitzung>.jsonl | tail -n +2 | jq -rc 'select(.type=="compaction") | [.timestamp, (.tokensBefore|tostring)] | join(" | ")' | tail -2`.
  Grund für `tail -n +2`: `tail -c` schneidet die erste Zeile an, jq bricht daran ab, und die leere Ausgabe täuscht
  „keine Verdichtung“ vor. Danach zuerst die Stand-Datei lesen und weiterarbeiten.

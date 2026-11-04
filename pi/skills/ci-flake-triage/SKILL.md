---
name: ci-flake-triage
description: Einzeln rote CI-Tests (main rot, gleicher Stand im PR grün, sporadisch oder „flaky“) systematisch triagieren und ursächlich beheben — Baum-Gleichstand prüfen, Fehlhistorie der letzten roten Läufe per gh run view --log-failed durchsuchen, Job-Rerun nur als Bestätigung, Timeout-Stellen auf verlorene Signale (tokio watch send ohne Empfänger, notify ohne Wartenden) prüfen und einen deterministischen Regressionstest rot/grün beweisen. Use when a CI test fails intermittently, main CI turns red after a merge whose PR was green, or a test times out waiting for an event that should already have happened.
---

# ci-flake-triage

# CI-Flake-Triage

Ziel: Einen einzeln roten Test nicht nur neu anstoßen. Belegen, ob es Last oder ein echter Race ist, und Races ursächlich beheben.

## Ablauf
1. **Gleichstand prüfen:** `git diff --quiet <pr-head> <main-sha>`. Gleicher Baum, PR grün, main rot ⇒ nicht-deterministisch.
2. **Fehlerstelle holen:** `gh run view <id> --log-failed > f.log`. Farbcodes stehen dort als Literaltext (`^[[31;1m`), nicht als ESC-Zeichen. Vor dem grep `sed -E 's/\^\[\[[0-9;]*m//g'` anwenden, sonst findet `FAIL \[` nichts. Panik-Zeile und Laufzeit notieren: Laufzeit ≈ ein Timeout im Test ⇒ es wurde auf ein Ereignis gewartet, das nie kam.
3. **Historie:** `gh run list --workflow <wf> --status failure --limit 20 --json databaseId,createdAt,event,headBranch`. Je Lauf `--log-failed` (Codes entfernt) nach `  FAIL [` bzw. `##[group]❌` durchsuchen. War der Test nie dabei, ist es ein neuer oder seltener Race, kein „bekannter Flake“.
4. **Bestätigen und main entsperren:** `gh run rerun <id> --failed`, per Hintergrund-Wache abwarten. Grün bestätigt nur die Nicht-Determinismus-These und ersetzt keine Ursachenanalyse.
5. **Code an der Timeout-Stelle lesen:** Wer setzt das erwartete Signal, und lebt in dem Moment schon ein Empfänger? Typische Races:
   - `tokio::sync::watch::Sender::send` speichert den Wert NICHT, wenn kein Receiver lebt. `let (tx, _) = watch::channel(..)` verwirft den Receiver sofort. Ein späteres `subscribe()` + `wait_for` sieht dann den alten Wert und läuft ins Timeout. Fix: `send_replace`. Im Repo nach Geschwister-Stellen greppen (`.send(` auf watch-Sendern); oft wurde nur ein Pfad repariert.
   - `Notify::notify_waiters` ohne wartenden Task hinterlegt kein Permit. Fix: `notify_one`, oder einen Zustand plus Notify verwenden.
   - Bei `broadcast` kommen nur Nachrichten nach dem Abo an. Fix: erst abonnieren, dann auslösen.
   - Web-Client mit Live-Ereignissen (SSE/WebSocket → TanStack Query `invalidateQueries`): Trifft das Ereignis die ERSTE Ladung einer Abfrage (`fetchStatus === "fetching"`, `data === undefined`), hängt v5 die Invalidierung an den laufenden Abruf (`query-core` `Query.fetch` bricht nur ab, wenn schon Daten da sind). Hat dieser die DB vor dem Einfügen gelesen, fehlt die neue Zeile, und nach seinem Erfolg gilt die Abfrage nicht mehr als ungültig; im E2E fehlt die Nachricht bis zum Timeout, und zwar nur in einer von mehreren Wiederholungen. Fix: kleiner Helfer, der in diesem Zustand erst `cancelQueries` und dann `invalidateQueries` ruft, sonst nur invalidiert; Unit-Test mit echtem `QueryClient`, Ereignis während der Erstladung, rot gegen den alten Weg.
6. **Deterministischer Regressionstest:** Die Reihenfolge erzwingen, statt auf Last zu hoffen. Beispiel: erst warten, bis der Zustand „fertig“ ist (Status-Poll mit `wait_until`), DANN die wartende API mit kurzem Timeout aufrufen. Den Test VOR dem Fix laufen lassen: Er muss rot sein. Mit Fix muss er grün sein.
7. **Verifikation:**
   - Testdatei, den betroffenen Flake-Test 10× in einer Schleife, die Crate-Suite (nextest) und clippy `-D warnings` laufen lassen. Builds nur über das Remote-Skript des Projekts.
   - Ein eigener kleiner PR, die Ursache steht im Body.
   - Nach dem Merge die main-CI abwarten, auch die Jobs, die nur auf main laufen (z. B. Windows).

## Variante: roter PR-Job (Jest/Monorepo, gleiche Triage in Kurzform)
- Job-Log in eine Datei holen (`gh run view <run> --job <jobid> --log > /tmp/x.log`) und dort gezielt suchen: `grep -n "FAIL "`, `grep -n "^.*Failed:"` (Turbo nennt das rote Paket), `grep -n "Exceeded timeout"`. Nie das rohe Log in den Kontext lesen.
- Prüfen, ob die rote Suite im eigenen Diff liegt (`git diff --stat origin/<basis>...HEAD -- <datei>`; Historie mit `git log origin/<basis> -- <datei>`). Liegt sie nicht im Diff, die Gesamtlaufzeit der Paket-Suite im Log notieren: Eine ungewöhnlich lange Suite (z. B. >800 s) mit einem 5-s-Timeout-Riss ist Lastflake auf dem Runner. Dann `gh run rerun <run> --failed` (nur der rote Job; die übrigen Pflicht-Checks bleiben grün) und per Wache auf alle Pflicht-Checks warten; den Test nicht im eigenen PR anfassen (fremder Code, eigener Fix-PR).

## Stolperfallen
- Ein grüner Rerun ist kein Fix. Ohne Ursache kommt der Flake bei späteren main-Pushes wieder.
- Test-Timeouts nur hochsetzen, wenn der Code nachweislich kein verlorenes Signal hat. Sonst verdeckt das einen Produktfehler, z. B. ein Werkzeug, das „läuft noch“ meldet, obwohl die Arbeit fertig ist.
- Solange ein Remote- oder rsync-Build läuft, keine Quelldateien ändern. Den Fix erst nach dem Rot-Lauf einsetzen.

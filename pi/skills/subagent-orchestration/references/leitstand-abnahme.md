# Leitstand: Merge, Integrations-Selbsttest, Live-KI-Probe, Nachbesserung, Folgeauftrag

Gilt für Mehrspuren-Läufe (Leitstand → Spur-Orchestratoren → Worker), in denen nur der Leitstand merged und am Ende
selbst testet. Steuerdateien je Spur: `orch/<x>/{PLAN.md, BERICHT.md, STOP-WD, PANE, NACHBESSERUNG-<n>.md}`.

## 1. Merge einer Spur (nur der Leitstand)
1. Signal: Die Aufsicht meldet FERTIG (BERICHT.md + STOP-WD). Spuren setzen STOP-WD manchmal, während ihre CI-Wache
   noch läuft → CI selbst prüfen: `gh pr checks <n>` muss nur `pass`/`skipping` zeigen.
2. Prüfen: Head-SHA im PR = lokaler Spurstand = Bericht; Migrationsdateien ALLER Ketten im Diff
   (`[.files[].path | select(test("drizzle/[0-9]{4}_"))]`) gegen die Reservierung — Apps mit eigenem `drizzle/`
   haben eine eigene Nummerierung und brauchen eigene Bereiche je Spur; Diff grob auf `any`/`@ts-ignore`
   (`eslint-disable` für `require` in Tests ist unkritisch). Den Auftrag Punkt für Punkt gegen das Ergebnis abhaken,
   nicht gegen den Bericht: je geforderter Oberflächenteil den Text in den Übersetzungsdateien bzw. die Komponente im
   Diff suchen (`git diff <basis> HEAD -- 'apps/*/messages/de.json' | grep …`) und im Screenshot finden. Fehlt ein
   Punkt, als Nachbesserung nachfordern, bevor gemergt und dem Nutzer berichtet wird. Grund: Worker lassen einzelne
   Auftragsteile still weg (z. B. den aktiven Hinweis an Admins neben einem Badge), und der Bericht erwähnt das nicht;
   sonst entdeckt es erst der Nutzer.
3. **Mandanten-Review jeder neuen Abfrage und Route** (vor dem Merge, auch wenn die CI grün ist), in beide Richtungen:
   - Kein Leck: Jede Firmendaten-Abfrage nutzt den Firmen-Scope. Fällt in Zweigen mit „sieht alles“-Rechten die
     Zuweisungs-Bedingung weg, muss stattdessen die Firmen-Bedingung greifen (eigene Firma ODER zugewiesen); nur das
     Recht „alle Firmen“ läuft ohne Filter. Grund: Ein weggelassener Filter liefert in Tests mit einer Firma richtige
     Ergebnisse und fällt erst als Datenleck auf.
   - Keine Aussperrung: Routen/Actions auf einen bestimmten Datensatz (Termin, Angebot …) nehmen die Firma aus dem
     Datensatz und prüfen den Zugriff mit `getActiveFirmaId(session, besitzerFirma) === besitzerFirma`, statt die
     „aktive Firma“ der Session zu lesen. Grund: Admins mit „alle Firmen“ haben oft keine feste Firma in der Session
     (die Wahl steckt nur in der URL); `getActiveFirmaId(session)` liefert für sie `null`, und die Funktion scheitert
     erst beim Nutzer, weil Testbenutzer eine feste Firma haben.
   - Keine Unsichtbaren: Zeilen OHNE Firma (`firma_id IS NULL`, z. B. firmenübergreifende Admins) fallen bei einem
     Filter `eq(firmaId, gewählteFirma)` aus JEDER Liste. Verwaltungslisten für Betrachter mit „alle Firmen“ nehmen sie
     ausdrücklich dazu und kennzeichnen sie („Alle Firmen“), Auswahllisten bleiben firmengebunden. Grund: Admins wählen
     immer eine Firma, deshalb fehlt so ein Datensatz überall, ohne dass ein Fehler erscheint.
   - Abgeleitete Zahlen in Kennzahlen- und Auswertungswerkzeugen (Vereinigung, Quote, Summe über mehrere Bereiche)
     nur aus Bereichen bilden, für die das Recht besteht. Grund: Die eigene Zahl eines gesperrten Bereichs fehlt dann
     zwar korrekt, aber die Kombination verrät trotzdem, wozu es dort Datensätze gibt.
   - Tests je Fund: „Firma A findet nichts aus Firma B“ und „Admin ohne feste Firma darf“, jeweils ohne Fix rot. Die
     Regel in die Spur-Regeln aufnehmen und an Spuren mit offenen Abfragen melden.
   - Neue KI-Aufrufe (auch kleine Hilfsaufrufe wie Korrektur, Titel, Zusammenfassung): Läuft jeder über den
     Abrechnungsweg der App mit Aufrufkontext (Mandant, Benutzer), mit Guthaben- und Freischaltungsprüfung vorher und
     Buchung danach? Grund: Ein Modellaufruf ohne Kontext erscheint auf keiner Firmenrechnung und läuft auch für Firmen
     ohne KI; in Tests fällt das nie auf.
4. `gh pr merge <n> --merge --admin --match-head-commit <sha>` (tote Pflicht-Kontexte); danach origin/test holen,
   alle Spur-DBs und die Integrations-DB migrieren, Lockfile-Änderung prüfen
   (`git diff --stat <alt> origin/test -- pnpm-lock.yaml`). Den frei gewordenen Worktree wieder detached auf
   origin/test setzen und den Zweig mit `git branch -d` löschen (er ist dann im HEAD enthalten; `-D` sperrt der
   Shell-Guard). Issue-Status und Ergebnis-Kommentar am Tracker nachziehen.
   Klickwege in „So testest du es“-Anleitungen (Kommentar, Status-Datei, Antwort an den Nutzer) immer aus der Quelle
   der Navigation ablesen (z. B. `src/lib/seitenleiste.ts`: Gruppe → `label`), nie aus der eigenen Vorstellung oder dem
   Seiteninhalt. Grund: Der Nutzer klickt die Anleitung wörtlich nach; ein erfundener Menüpunkt kostet ihn Zeit und
   führt zu falschen Vermutungen (fehlendes Recht statt falsch benannter Seite).
5. Nachricht an die übrigen Spuren: `git merge origin/test` (kein Rebase), bei Lockfile-Änderung
   `pnpm install --frozen-lockfile`. Dateiüberschneidungen vorher bestimmen
   (`comm -12 <(git diff --name-only <spur-basis>...HEAD | sort) <(git diff --name-only <alt> <neu> | sort)`) und
   konkret nennen; generierte Dateien neu erzeugen statt von Hand mergen. Läuft ein Worker im Spur-Baum: erst nach
   dessen Abschluss mergen.
6. Meldet der Nutzer danach einen Fehler aus der Zielumgebung: ausgerollten Stand über den Versions-Endpunkt prüfen,
   Ursache im Code belegen, Eilauftrag an die Spur, nach dem Merge eine Rollout-Wache (`curl …/api/version` je Minute
   bis der neue Commit erscheint) und dem Nutzer Bescheid geben, sobald er nachtesten kann. Bittet er, einem Benutzer
   „das Recht zu geben“, zuerst die wirksamen Rechte nur lesend bestimmen: Rollen (bei Keycloak beim Login in die DB
   abgeglichen) → Rollen-Vorgaben im Code (`ROLE_DEFAULTS`), darüber explizite Überschreibungen im Rechte-JSON des
   Benutzers (`permissions->'<schlüssel>'`), dazu die Firmenzuordnung. Fehlt kein Recht, liegt es an Auffindbarkeit
   (Menüname, Firma, Liste) — dann das beheben und keine Daten ändern. Grund: Ein vorsorglich gesetztes Recht oder eine
   nachgetragene Firma ändert still den Zuschnitt des Kontos und verdeckt den eigentlichen Fehler.

## 2. Integrations-Selbsttest nach jedem Merge
1. Eigener Worktree detached auf origin/test, eigene DB, eigener Port; läuft über dieselben Sperr-Wrapper wie die Spuren.
2. Typecheck, Lint und Unit-Tests aller seit Laufbeginn geänderten Pakete samt Abhängigen in einem Aufruf:
   `npx turbo run typecheck lint test --filter='...[<start-commit>]' --concurrency=2` unter der schweren Sperre. Der
   CI-Lauf auf dem Ziel-Branch baut oft nur Images; die Kombination der Merges prüft sonst niemand.
3. Alle neuen E2E-Specs ZUSAMMEN, beide Standard-Projekte plus das Spezialprojekt, das Lizenz-gate-Specs einsammelt,
   `--retries=0`. Specs mitnehmen, deren Fixtures eine Spur geändert hat (`grep -l <fixture> e2e/*.spec.ts`), und bei
   Änderungen an gemeinsamen Komponenten (Seitenschutz, Layout) deren Specs. Grund: Spur-Nachweise laufen allein, vor
   dem Merge der anderen und auf der eigenen DB — Testdaten-Kollisionen zeigen sich erst hier.
4. Rot: dieselbe Spec einzeln nachlaufen lassen (`--output=<eigener-ordner>`), um Wechselwirkung von deterministischem
   Fehler zu trennen. Belege (error-context.md, Screenshot, Log) sofort nach `orch/<x>/selbsttest/` kopieren — jeder
   neue Playwright-Lauf leert den Standard-Ausgabeordner, auch der eines parallel laufenden Rundgang-Workers. Jedes
   Fehlerbild selbst ansehen, bevor eine Ursache feststeht: Ist das gesuchte Element im Bild frei, trifft der Selektor
   meist etwas anderes (breites Namensmuster plus `.first()` erwischt mit wachsenden Testdaten z. B. einen Abspielknopf
   im Verlauf statt des Mikrofons → exakter Name oder im Container eingrenzen). Rot nur in einer von mehreren
   Wiederholungen heißt Race, nicht Last: Ursache im Code suchen (Skill ci-flake-triage, verlorene Signale).
5. Eigener Playwright-Rundgang je Feature mit Screenshots (Desktop und Handy 390 px), von einem Worker geschrieben,
   unabhängig von den Specs der Spuren, mit Navigation wie ein Nutzer ab der Arbeitsseite; Konsolen-Fehler und
   Antworten ≥ 500 mitschreiben. Mindestens einen Durchgang mit einem Admin ohne feste Firma (Rolle „alle Firmen“),
   wenn die Zielnutzer so arbeiten. Jeden Screenshot selbst ansehen und jeden Worker-Befund vor einer Nachbesserung
   am Bild/Code bestätigen — Rundgang-Worker melden auch Vorbestehendes und korrektes Verhalten als Auffälligkeit.
6. Auch die Nachweis-Screenshots der Spuren ansehen, nicht nur ihren Bericht: Sie zeigen fachliche Fehler, die kein
   Test prüft (z. B. ein Nachteil, der wie ein Gewinn eingefärbt ist).

## 3. Live-KI-Probe ohne Mock (für KI-Features)
- E2E mocken die KI-Antwort; Modellverhalten (ein ausgelassener Anlege-Schritt, eine erfundene Entwarnung, Einheiten-
  Verwechslung) zeigt nur ein Live-Lauf. Die Produktionsfunktion des Features direkt aufrufen: kleines tsx-Skript in
  einem gitignorten Ordner der App, `--require <server-only-stub>`, Modell aus `.env.local`, je ein Lauf ohne und mit
  Denken; Dauer, Ergebnis und Fehlerbild festhalten.
- Agenten-Fähigkeiten (z. B. „versteht einen Verlauf mit Sprachnachrichten“) mit den ECHTEN Werkzeugen proben: Daten
  über die vorhandenen Domänenfunktionen anlegen (Präfix je Lauf, danach aufräumen), dann den Agenten die Frage stellen,
  ohne ihm die Daten zu reichen; bewerten, ob er das Werkzeug nutzt und die Details nennt. Grund: Werkzeuge laufen dort
  außerhalb eines Request-Scopes. Server-Code, der dabei `auth()`/`headers()` liest, wirft SYNCHRON (ein `.catch()`
  am Promise fängt das nicht), und das Werkzeug scheitert in jedem KI-Lauf, was weder Unit-Tests mit gemocktem Auth
  noch E2E zeigen. Fix-Muster: Session wie die Guards auflösen (Benutzer-Kontext zuerst, dann Cookie) und in
  `try/catch` fail-closed.
- Ohne Anmeldung auf dem Test-Cluster gilt als Weg-durch-die-App-Beleg: die Dienst-Antwort aus dem App-Pod mit dessen
  Umgebungswerten holen, durch das gemergte Schema der App laufen lassen (kleines tsx-Skript im Worktree) und das
  ausgelieferte Server-Bündel nach den neuen Bezeichnern durchsuchen (`kubectl exec … -- grep -rl <name>
  /app/apps/<app>/.next/server`). Den Klick-Test übernimmt dann der Nutzer nach der Testanleitung.
- Probe-Skripte, die einen Zustand abfragen (Profilwechsel, Download, Hintergrundlauf), nehmen die Zustandsnamen aus
  dem Code oder der ersten Antwort, protokollieren jeden Wechsel und brechen bei unbekanntem Zustand und nach kurzer
  Höchstzeit ab. Grund: Ein geratener Zielname lässt die Schleife bis zum Zeitlimit laufen, und die eigentliche Probe
  findet nie statt.
- Eingaben synthetisch erzeugen, z. B. Handschrift per ImageMagick: Schreibschrift-Font über `fc-list` suchen und den
  Dateipfad der .otf an `-font` geben (den Familiennamen löst magick nicht auf), Zeilen mit leichter Rotation, etwas
  Rauschen und Weichzeichnen; Ergebnis mit `read` ansehen.
- Vor der Probe die Bildfähigkeit der Modellvariante mit einem curl-Aufruf (`image_url` als data-URL) prüfen; nicht
  jede Variante desselben Anbieters nimmt Bilder an.
- Fix-Muster bei schwankendem Modellverhalten: deterministische Nachbearbeitung (fehlende Schritte ergänzen),
  feste Textteile (Schlusssatz, Hinweis auf den Prüfumfang) aus dem Code statt vom Modell, dazu eine Prompt-Regel;
  Unit-Tests mit den echten Modellantworten als Fixtures. Prompt-Änderungen mit ≥ 10 Live-Läufen vorher und nachher
  messen und eine Zielquote samt Zählkriterium in den Auftrag schreiben — Einzelläufe schwanken.
- Verwirft das Modell Kürzel/Abkürzungen als „unleserlich“ (Prompt verlangt „rate niemals“, „nicht abkürzen“): Glossar
  als Code-Datei einführen und kompakt in den Prompt einbetten, Regel „Kontext entscheidet; bei Zweifel die
  wahrscheinlichste Deutung mit `unsicher: true` statt Verwerfen“, und nach der Auswertung deterministisch
  normalisieren (Kürzel ≤ 2 Buchstaben nur als ganzer Name, mehrdeutige Kürzel unverändert, Mengenpräfix „2x“ → Menge,
  Maße wie 180x200 nie anfassen) — VOR der Ergänzung fehlender Schritte, damit Raumbezüge übereinstimmen. Messung: ein
  Testbild je Fallgruppe, je Bild bewertet (korrekt aufgelöst / erfunden / „unleserlich“ gemeldet), dazu das
  Regressionsbild der früheren Messung (Namenstreue darf nicht sinken). Dasselbe Glossar speist die Hilfeseite, damit
  Liste und Verhalten nicht auseinanderlaufen.

## 4. Nachbesserungs-Protokoll
1. `orch/<x>/NACHBESSERUNG-<n>.md`: Befund (Lauf, Stand, Belege), Ursache, nummerierter Auftrag mit Nachweisbefehl
   (beide Projekte, `--repeat-each`), PR-Titel, Abschluss (`## Nachtrag <n>` in BERICHT.md, dann STOP-WD).
2. STOP-WD löschen und die Löschung prüfen, dann Kurzfassung + Pfad per `herdr agent prompt`; die Aufsicht erst im
   NÄCHSTEN Tool-Aufruf starten, nie im selben Parallel-Block. Grund: Parallel gestartet sieht sie den alten Marker
   noch und meldet sofort FERTIG. Wenn ein Worker erlaubt ist, die Wache-Pflicht in die Nachricht schreiben.
3. Neuer Branch von origin/test — ein gemergter Spur-Branch wird nicht weiterverwendet; ein noch offener PR wird auf
   seinem Branch nachgebessert.
4. Die Statusseite (`scripts/status-page-spuren.py`) zeigt eine Nachbesserung offen, bis `## Nachtrag <n>` existiert.
5. Kleine Befunde des eigenen Reviews (Rechte-Lücke in einer Zahl, fehlender Import, Tippfehler, Doku-Eintrag) behebt
   der Leitstand im offenen PR-Zweig selbst, sobald der Worker fertig ist: erst ein Test, der den Befund rot zeigt,
   dann Fix, voller Vorpush, Encoding-Prüfung, Push auf denselben Zweig. Grund: Eine Nachbesserungs-Runde über den
   Worker kostet Kontingent und eine CI-Runde mehr als der Fix selbst.

## 5. Folgeauftrag des Nutzers während des Laufs
1. Zuerst das Issue am Tracker anlegen und die Nummer aus der Antwort nehmen (nie raten); Branch, Commits, PR-Titel
   tragen diese Nummer.
2. Der Spur mit dem meisten Kontext zum betroffenen Code geben (auch eine fertige Spur): `orch/<x>/AUFTRAG-<nr>.md`
   mit Wunsch sinngemäß, Ist-Stand (Dateien), Soll, Daten-/Normalisierungsvorgaben, Tests, Screenshots vorher/nachher,
   Abschluss wie bei einer Nachbesserung (`## Nachtrag <nr>`, STOP-WD).
3. Migrationsnummern aus ungenutzten Reservierungen anderer Spuren vergeben (je Kette prüfen, welche Nummer auf dem
   Ziel-Branch die höchste ist) und die abgebende Spur informieren.
4. In der Statusseiten-Konfiguration die neue Nummer der Spur zuordnen (`mag_weitere`), damit ihre PRs erscheinen.

## 6. Vorher/Nachher-Messung aufteilen
Auf dem gemergten Stand beide Konfigurationsstufen messen (z. B. Denk-Level hoch und niedrig, je ≥ 2 Wiederholungen):
so trennt sich der Effekt der Code-Maßnahmen von dem der Einstellung. Werte aus n = 1 mit Ausreißer nicht berichten.
Abweichungen einer Spur immer gegen eine Basis-Messung im SELBEN Zeitfenster bewerten (Anbieter-Latenz schwankt über
den Tag um 20 % und mehr). Ergebnis als kleine Tabelle unter `orch/selbsttest/` ablegen, sie geht in den Bericht.
Misst ein Worker selbst vorher/nachher, verlangt der Brief den Vorher-Lauf in einem eigenen Worktree auf der Basis
(oder nach einem Commit), nie per `git checkout <basis> -- <pfade>` im eigenen Arbeitsbaum. Grund: Das Zurücksetzen
verschluckt uncommittete Änderungen unter diesen Pfaden, und der Nachher-Lauf misst dann einen unvollständigen Stand.

## 7. RAM-Schutz und Fairness im Sperr-Wrapper
`JEST_MAX_WORKERS=2` exportieren und `--maxWorkers=2` per `NODE_OPTIONS=--require <preload.cjs>` einsetzen, wenn der
Aufruf kein `--maxWorkers`/`-w`/`--runInBand`/`-i` trägt; Build- und E2E-Klasse gegenseitig ausschließen. Den Heap
nie unter den Bedarf des Builds deckeln (`next build` braucht ~6 GB → 8192 für Build/E2E, sonst 3072; ein vorhandenes
`--max-old-space-size` des Aufrufers behalten). Die geteilte Build/E2E-Sperre braucht eine Warteschlange (Ticket-Datei
je Wartendem mit Startzeit und PID, nur das älteste lebende Ticket darf `flock` versuchen, tote Tickets räumt jeder) —
ohne sie gewinnt nach jeder Freigabe zufällig, wer gerade pollt, und lange Wartende verhungern. Wrapper-Änderungen in
eine `.new`-Kopie schreiben, an einer umgebogenen Kopie testen (Lock-Ordner, RAM-Schwelle 0, kurze Sleeps) und per `mv`
einsetzen, das Original vorher sichern — laufende Wrapper lesen sonst halb geschriebene Skripte.

## 8. Mess- und Untersuchungsberichte von Workern abnehmen
1. Jede Kernaussage gegen die eigenen Rohdaten des Workers halten (Ergebnis-JSON/JSONL, nicht nur seine Tabelle):
   „X war die Ursache“ gilt nicht, wenn der Ausgangsfall auch ohne die Änderung besteht; „unverändert“ gilt nicht, wenn
   die Rohdaten abweichende Texte zeigen. Grund: Worker fassen optimistisch zusammen und übernehmen ihre Anfangsthese.
2. Ressourcen-Zahlen nur aus isolierter Messung akzeptieren (je Variante eigener Prozess, mehrere Läufe). Eine neue
   Standard-Einstellung, die RAM oder Zeit kostet, erst nach einer Entscheidungsregel mit Schwelle im
   Nachbesserungs-Auftrag übernehmen („Zusatz ≤ X → bleibt, sonst alter Standard plus Schalter“).
3. Prüfen, ob ALLE Varianten des Auftrags gemessen wurden (wie §1.2 für Umsetzungspunkte); fehlende als nummerierten
   Punkt mit Messplan (Fälle, Wiederholungen, Zählkriterium) nachfordern.
4. Messskripte, die ein bezahltes Modell rufen, bekommen ein Aufrufbudget im Brief und brechen bei 429 ab. Grund: Das
   Konto bedient oft auch die Anwendung, die der Nutzer gerade testet (kontingent.md §8).
5. Die Nachbesserung auf DENSELBEN Zweig des offenen PR schicken (`resumeFrom` des Workers, falls sein Kontext die
   Messung noch kennt); PR-Text und Doku müssen am Ende nur Belegtes enthalten.
6. Meldet ein Worker nebenbei eine Störung der Zielumgebung (Speicher, Datenbank, externer Dienst „kaputt“), sie vor
   jeder Meldung an den Nutzer selbst gegenprüfen: App-Logs der letzten Stunden nach dem Fehlerbild durchsuchen und den
   Zugriff im App-Pod mit DEREN Umgebungswerten nur lesend proben (z. B. S3: ListObjectsV2 mit `max-keys=1`, SigV4 per
   `node:crypto`, per `kubectl exec -i … -- sh -c "cat > /tmp/p.mjs && node /tmp/p.mjs; rm -f /tmp/p.mjs" < p.mjs`;
   nur Variablen-NAMEN ausgeben, nie Werte). Grund: Worker proben oft mit eigenem, fehlerhaftem Client von außen und
   halten dessen Fehler für einen Ausfall; ein falscher Alarm kostet den Nutzer Zeit und Vertrauen. Ist die Meldung
   falsch, sie aus PR-Text und Doku entfernen lassen.
7. Nennt ein Worker rote Tests „vorbelastet“ (schon auf dem Basis-Zweig rot), das vor der Abnahme selbst prüfen: Ist
   die CI des Basis-Zweigs für dieselbe Suite grün, ist die Behauptung fast immer falsch. Dann die Suite im Worktree des
   Workers einzeln laufen lassen und die erste echte Fehlerzeile lesen (Antwortkörper, TypeError); eine
   „Gegenprobe per Stash“ des Workers zählt nicht. Grund: Worker erklären eigene Regressionen gern mit der Umgebung —
   typisch ist ein neuer Import, den die Test-Mocks nicht kennen; im PR wäre die CI rot geworden.

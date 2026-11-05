# Modellwechsel eines noch nicht gestarteten Laufs (Plan-Aufträge mit Modellvorgabe)

Steht das Modell im Auftragsbrief (Satz „Dein Modell: …“) und die Queue hat eine Modell-Spalte, und der geplante Anbieter hat keinen freien Platz (Obergrenze je Anbieter erreicht) oder ist gesperrt, aber ein anderer Anbieter hat Platz:

1. Platz-/Kontingentlage prüfen (Quota-Skript, RAM-Skript), nur wechseln, wenn der Ausweich-Anbieter frei ist und seine Obergrenze nicht überschritten wird.
2. Satz „Dein Modell: …“ im Brief per `sed -i` auf das neue Modell setzen und per `grep -c "Dein Modell: <neu>" <brief>` (Erwartung 1) gegenprüfen. Grund: Der Worker liest Brief UND Start-Task; widersprechen sich beide, wählt er Denkstufe/Arbeitsweise nach dem falschen Modell.
3. Modell-Spalte in der Queue anpassen, dann erst starten (`model`-Parameter passend zum Brief).
4. Wechsel mit Grund (Platzlage in Prozent) in die Entscheidungsdatei und ins Journal eintragen.
5. Teile derselben Kette (Teil n+1) tragen ihr eigenes „Dein Modell“; bei Wechsel der ganzen Kette alle Teil-Briefe mitziehen, sonst springt die Kette zurück.
6. Lange Ketten (viele Teile, strikt nacheinander) belegen einen Platz fast den ganzen Lauf: Sind die Plätze des teuren Anbieters von zwei langen Ketten belegt, die übrigen Ketten und Einzelläufe geschlossen auf den freien Anbieter legen, statt jeden Teil einzeln zu verschieben.
7. Belegung je Anbieter vor JEDEM Start aus der Queue zählen (`grep "| läuft" QUEUE.md | awk -F'|' '{print $5}' | awk '{print $NF}' | sort | uniq -c`), nicht aus dem Gedächtnis: Das Kontingent-Skript zählt keine laufenden Plätze, und ein gerade fertig gewordener Lauf kann einen Platz des anderen Anbieters vortäuschen. Wurde die Obergrenze doch überschritten, den frisch gestarteten Lauf sofort mit `acp_delegate_cancel` beenden, Brief und Queue auf den freien Anbieter umstellen (Schritte 2–4) und neu starten.
8. Ist nach einer Abnahme genau ein Platz je Anbieter frei und der nächste Teil einer Kette gehört dem jeweils anderen Anbieter, beide parallel in EINEM Aufruf-Block starten (unabhängige acp_delegate-Aufrufe), danach Queue und Journal gemeinsam nachziehen.
9. Ketten mit Folgeteilen blockieren freie Plätze: Sind alle offenen Zeilen Folgeteile laufender Vorgänger, bleibt ein Platz leer — das ist kein Fehler, sondern Kettenlogik. Dann nur Kontrollrunde und Herzschlag, keinen Teil vorzeitig starten (Teil n+1 baut auf der Datei von Teil n auf).
10. Gesperrter Anbieter (Hochlast-/Kontingentsperre mit Wiederfreigabe-Zeit): laufende Läufe weiterlaufen lassen, keine Neustarts dort; Folgeschritte auf dem freien Anbieter (z. B. Abgleich) normal starten und Schritte, die den gesperrten Anbieter brauchen (zweiter Prüfer), erst nach der Freigabezeit neu prüfen — die Sperrzeit im Journal und in der Meldung an den Nutzer nennen.

# Start des Gesamt-Abgleichs nach den Teilplänen

- Vor dem Start den Gesamtprüfbefehl einmal ausführen und die Mängel nach Kategorie zählen (offene Fundament-Bedarfe, Wellen-/Spurabhängigkeiten, Pfadüberschneidungen); diese Zählung und die bevorzugte Lösungsrichtung als Satz in den Start-Task schreiben (z. B. bei vielen Paketen, die dieselbe Gruppen-Datei beschreiben: `abhaengig`-Ketten oder Fundament-Gerüste mit Scan/Glob statt Paket-Aufteilung; Testformat erhalten). Grund: Der Abgleich-Worker wählt sonst die aufwendigste Lösung (Pakete aufspalten), die neue Überschneidungen erzeugt.
- Vor dem Start prüfen, dass der Worktree sauber ist (`git status --short` leer), damit der Abgleich-Commit nur seine Änderungen enthält.

# Abnahme des Gesamt-Abgleichs und Start der Prüfer

- Abnahme: Gesamtprüfbefehl, Schnitt-/Architekturprüfung selbst nachlaufen lassen (alle Exit 0), `git status --short` zeigt nur erwartete Dateien, dann ein Commit über den ganzen Doku-Ordner (jetzt laufen keine anderen Worker mehr). Ziele des Auftrags, die nicht erreichbar waren (z. B. Wellenlast), im Journal nennen und den Prüfern als Merkpunkt mitgeben.
- Vor dem Prüfer-Start den Plan-Build ausführen und committen (`wp.py build` o. ä.): Die Prüfer lesen die gebauten Gesamtdateien (z. B. `wps.json`), die erst der Build erzeugt; read-only-Läufe können sie sonst nicht lesen.
- Reviewer-Läufe schreiben keine Dateien: Die Befundliste steht in `/tmp/acp-delegate/<runId>.out` (zwischen den `📦 [ACP]`-Zeilen); mit `grep -v "^📦"` nach `PRUEFUNG-<n>.md` kopieren. Sperrt ein Anbieter, laufen beide Prüfer auf dem freien Anbieter (Queue-Zeile mit beiden runIds).
- Prüferbefunde sind teils Heuristik (aus Titel-/Zieltext, nicht gelesen): in der Zusammenführung Einzelfälle gegen die Datei prüfen, bevor ein Befund „übernehmen“ oder „ablehnen“ bekommt.

# Korrektur-Lauf nach den Prüfern

- Befundliste mit eindeutigen Nummern (B01…) schreiben, je Befund „übernehmen / ablehnen (Grund) / eingeschränkt“; nur diese Liste ist Eingabe des Korrektur-Workers.
- Start-Task: Hinweis, dass Befunde teils Heuristik sind (Listen per Skript aus der yaml erzeugen, Pakete vor der Änderung lesen), Testformat/Quotierung erneut nennen und ein zeilenweise geschriebenes Korrektur-Log verlangen (eine Zeile je Befund). Grund: Das Log ist der einzige Beleg für die Abnahme und zeigt in Kontrollrunden Fortschritt, bevor der Lauf endet.
- Kontrollrunde während des Laufs: `git status --short` (geänderte yaml) und Zeilenzahl des Logs genügen als Lebenszeichen neben der `.activity`-mtime; das Log entsteht erst nach einigen Minuten — fehlt es früh, ist das kein Mangel.
- Abnahme: alle Prüf-/Build-Befehle selbst nachlaufen lassen, je Befund eine Zeile im Log gegenprüfen, 3 übernommene Befunde stichprobenartig in der yaml nachsehen, dann ein Commit über den ganzen Doku-Ordner.

# Abnahme-Commit bei parallelen Planer-Läufen

- Mehrere Läufe schreiben gleichzeitig in verschiedene Dateien desselben Worktrees: je Abnahme nur die Datei des fertigen Laufs hinzufügen (`git add <pfad>/<BEREICH>.yaml`), nie den ganzen Doku-Ordner — sonst landen halbfertige Dateien laufender Worker im falschen Commit.
- Exit-Signal ≠ Ergebnis: Endet ein Worker mit SIGTERM (Watchdog nach Abschluss), zählt die Ergebniszeile am Ende der `.out`-Datei („ERGEBNIS: fertig …“) plus der Prüfbefehl des Auftrags (selbst nachlaufen lassen, Exit 0). Dann normal abnehmen; nur ohne ERGEBNIS-Zeile oder bei rotem Check Nacharbeit per `resumeFrom`.
- Commit-Nachricht mit Zahlen vorab berechnen und als einfachen String übergeben; verschachtelte `$(…)`-Ersetzung in der Nachricht ging schon schief (Nachricht „(1 )“). Verfälschte Nachricht nie per amend/reset korrigieren (Historie bleibt unangetastet), sondern mit leerem Folge-Commit (`--allow-empty`) nachtragen.
- Formatvorgaben, die der Prüfbefehl nicht erzwingt (Testeintrag `<Testdatei>: <ID> <Prüfinhalt>`, je Katalog-ID ≥ 1 Test), per kleinem Skript gegenprüfen (yaml laden, Einträge ohne Dateiendung und Pakete mit weniger Tests als IDs zählen). Bei Treffern Nacharbeit per `resumeFrom` mit konkreter Mängelliste, und die Vorgabe danach als Satz in jeden folgenden Start-Task derselben Auftragsklasse schreiben. Grund: Planer kürzen Testeinträge auf Schlagworte, und der Check bleibt trotzdem grün.
- YAML-Falle „Pfad: Text“: Ein ungequoteter Listeneintrag der Form `- pfad/datei.rs: LC-X-001 Text` wird als Abbildung (dict) geladen, nicht als String; der Prüfbefehl des Auftrags kann trotzdem grün sein. Das eigene Format-Skript meldet das als `TypeError` beim `' '.join(tests)` (kein Skriptfehler, sondern der Befund): Anzahl der Nicht-String-Einträge je Paket des Teils zählen, Nacharbeit per `resumeFrom` („jeden Testeintrag ganz in Anführungszeichen oder als `>-`-Folded-Scalar setzen, Inhalt unverändert“), und die Quotierungs-Vorgabe in jeden folgenden Start-Task derselben Auftragsklasse aufnehmen.
- Das Skript auf die Pakete des gerade abgenommenen Teils einschränken (SOLL-Liste der Katalog-IDs als Filter): Ältere, schon abgenommene Teile derselben Datei liefern sonst Altlasten, die nicht der Nacharbeit gelten — sie als Merkpunkt für den Prüflauf notieren statt den laufenden Worker damit zu belasten. Auch die ID-Abdeckung im Testtext (steht jede Katalog-ID des Pakets in einem Test?) auf diese Teilmenge prüfen; „Anzahl Tests ≥ Anzahl IDs“ allein beweist sie nicht.
- Stichproben-Check bei skriptgenerierten Planer-Dateien: Meldet der Planer „Testtexte generisch aus Katalogtiteln“ oder „pi-lens withheld findings“, ist wp.py/Prüfbefehl die Autorität; die generische Qualität als Merkpunkt für den späteren Prüflauf notieren statt jetzt nachzuarbeiten.

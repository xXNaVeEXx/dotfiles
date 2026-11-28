# Rundenprüfung: sechs Anzeigen, die still falsch werden

Ergänzt `statusseite.md` (Pflege der Seite) und `kontingent-hochrechnung.md`. Jede Kontrollrunde des Leitstands prüft
die Punkte 1 bis 5, bevor die Meldung an den Nutzer geht; Punkt 6 gilt, sobald ein Prüfschritt wegen fremder Dateien
rot wird. Allen gemeinsam: Die Anzeige wirkt gesund, während der Stand dahinter falsch oder stehen geblieben ist. Auch
der Auftrag „halte die Statusseite aktuell“ beginnt mit Punkt 1 und 2, nicht mit dem Neuerzeugen der Seite.

## 1. Summenzeile der Statusseite gegen eine eigene Zählung halten

1. Den Fortschritt aus der Zählung des Queue-Werkzeugs nehmen (Übersicht je Welle und Spur) und je Queue gegenzählen,
   aber nur Zellen, die GENAU das Statuswort sind:
   `awk -F'|' '/^\| <ID-Präfix>/{n++; c=$(NF-1); gsub(/^ +| +$/,"",c); if (c=="fertig") f++} END{print f"/"n}' <QUEUE.md>`.
   Nicht mit `grep -c '| fertig'` zählen. Grund: Das zählt Zellen wie „fertig gebaut, wartet auf Endlauf“ mit, und dann
   meldet der Leitstand selbst mehr Fortschritt, als es gibt; die Zahl im nächsten Bericht ausdrücklich berichtigen.
2. Dieselbe Zahl aus der erzeugten Seite lesen (Text des Platzhalters `{{queue:<Sektion>}}`).
3. Weichen sie ab, die Statuszellen suchen, die das Wort enthalten, aber nicht damit beginnen:
   `awk -F'|' '{c=$(NF-1); gsub(/^ +| +$/,"",c); if (c ~ /fertig/ && c !~ /^fertig/) print $2"|"c}' <QUEUE.md>`.
4. Ursache im Renderer beheben, nicht in den Zellen: Das ERSTE Wort der Zelle entscheidet über die Art. Nur wenn es
   kein Statuswort ist, die ganze Zelle durchsuchen, und dann zuerst nach Fehler, Abnahme, Arbeit und „offen“, erst
   zuletzt nach „fertig“. Grund: Spuren schreiben Freitext wie „prüfen: Worker fertig, Review folgt“ oder „Stufe 1
   fertig; Stufe 2 offen“; eine Teilwort-Suche über die ganze Zelle zählt solche Pakete als fertig, und die Seite
   meldet mehr Fortschritt, als es gibt.
5. Vor dem Austausch des Renderers alte und neue Einordnung über ALLE Queue-Zeilen vergleichen (beide Fassungen der
   Funktion laden, jede Statuszelle durch beide schicken, Abweichungen ausgeben). Nur die gesuchten Zellen dürfen sich
   ändern. Dann atomar ersetzen (`.new`, `python3 -m py_compile`, `mv`) und die Seite neu erzeugen.
6. Fragt der Nutzer, was noch offen ist, die Zahlen aller Wellen aus dem Queue-Werkzeug nennen (fertig, offen je
   Welle, danach folgende Phasen), nicht nur die laufende Welle.

## 2. Kopf der Übersicht: oben nur, was jetzt gilt

1. Den obersten Abschnitt („Stand in Kürze“) von oben lesen. Stehen dort Meldungen mit altem Datum vor dem heutigen
   Stand, wirkt die ganze Seite veraltet, auch wenn die Zahlen darunter live sind.
2. Oben in dieser Reihenfolge: ein Punkt „Jetzt“ nur aus Live-Platzhaltern (Zahlen und laufende Pakete je Spur), ein
   Punkt „Zuletzt (<Datum, Uhrzeit>)“ von Hand, dann Kontingent mit Live-Wert und offener Frage an den Nutzer, dann
   laufende Sonderarbeit und Störungen.
3. Erledigte Meldungen in einen eigenen Abschnitt am Dateiende verschieben („Ältere Meldungen“) und Live-Platzhalter
   aus ihnen entfernen. Grund: Ein Platzhalter in einem alten Satz zeigt den heutigen Wert unter einem alten Datum.
4. Beim Umbau den ganzen Text nach Sätzen mit festem Datum oder fester Zahl durchsehen (Wochenende, Grenzwert, „läuft
   seit …“, Rechnername, Checklisten-Haken abgeschlossener Phasen) und sie berichtigen oder zeitlos fassen. Ändert der
   Nutzer einen Grenzwert, die alte Zahl in der ganzen Datei suchen (`grep -n '<alte Zahl> %'`), nicht nur im Kopf.
5. Dem Nutzer sagen, was live ist (Zahlen, Takt des Timers) und was nur je Runde erneuert wird (der Handtext).

## 3. Läuft der Einbau wirklich noch?

Führt eine Spur ein Paket als „integrieren“ oder wartet sie laut Journal auf einen Einbau oder Endlauf, je Runde
belegen, dass der Prozess lebt:

- letzte Zeilen und Änderungszeit des Einbau-Logs, pid aus der pid-Datei mit `ps -p <pid>`, Statuszelle in der Queue;
- Kindprozesse der Spur-Sitzung (`ps --ppid <pi-pid>`): Wartet dort nur ein langer Warte-Wecker, obwohl kein Einbau
  läuft, steht die Spur.

Endet das Log mit einem Abbruch durch ein Signal und ist die pid weg, die Spur sofort anweisen: Einbau abgekoppelt neu
starten (`setsid nohup …`), Ursache in einer Journalzeile festhalten. Grund: Ein Einbau, der als Hintergrundauftrag der
Sitzung läuft, wird mit dessen Prozessgruppe beendet; der Warte-Wecker der Spur wartet dann bis zu seinem Höchstwert
auf nichts, und alle davon abhängigen Pakete stehen mit.

Dreht ein Einbau mehrere Runden, weil sich der gemeinsame Zweig währenddessen bewegt (jede Runde ein voller
Schlusstest), die Spuren beim Einbau abwechseln lassen: Haben beide etwas einbaufertig, wartet die eine, bis das
Paket der anderen drin ist. Die Regel nur für diesen Fall fassen; hat nur eine Spur etwas bereit, baut sie sofort ein.

Ändert der Leitstand Vorgaben für laufende Schlusstests (Speicherdeckel, Job-Zahl), im selben Satz sagen, dass
laufende Läufe zu Ende laufen. Grund: Die Spur bricht sonst einen fast fertigen Lauf ab, um die neue Vorgabe zu
erfüllen.

## 4. Kontingent: alle Grenzen der Ablesung lesen

1. Die Rohablesung ansehen, nicht nur die Zeile des eigenen Tor-Skripts:
   `jq -c '.limits[] | {label, p: (.percent*100|floor), resetsAt}' <ablesung>.json`.
2. Gibt es neben der allgemeinen Wochengrenze eine eigene Grenze für ein Modell, festhalten, welche Sitzung auf diesem
   Modell läuft (Leitstand, Spuren, Worker), und beide Werte in Bericht und Statusseite nennen. Grund: Ein Tor, das nur
   die erste Grenze prüft, lässt weiterlaufen, während die Grenze des Leitstand-Modells voll läuft; dann bauen die
   Spuren ohne Aufsicht weiter.
3. Steigt der Wochenwert zwischen zwei Runden deutlich schneller als im Tagesschnitt, die Hochrechnung sofort
   berichtigen und belegen, wer verbraucht: über alle Sitzungsdateien mit Änderung seit dem letzten Messpunkt
   (Hauptsitzungen und die der Unter-Agenten) die Kosten je Antwort summieren und nach Arbeitsordner und Modell
   gruppieren (Feld `usage.cost.total` der Antwort-Zeilen, `cwd` aus dem Kopf der Datei, nur Zeilen ab dem Messpunkt).
   Im Bericht die Anteile je Projekt als grobe Werte nennen. Kommt der Anstieg überwiegend von anderen Projekten auf
   demselben Konto, sie nicht anfassen; dem Nutzer den Hebel nennen (dort bremsen oder ein günstigeres Modell wählen)
   und sagen, was ohne Antwort gilt. Grund: Ohne die Aufteilung drosselt der Leitstand die eigenen Spuren, obwohl sie
   nur einen kleinen Teil verbrauchen, und der Nutzer sucht die Ursache am falschen Ort.
4. Läuft der Leitstand auf einem Modell mit eigener, knapper Grenze: Kontrolltakt nicht verkürzen und den Kontext
   klein halten, statt die Seite öfter von Hand zu erneuern.
5. Fällt der Wochenwert ohne eigenes Zutun deutlich, frisch messen und die Rücksetzzeit vergleichen. Ist sie
   unverändert, gilt der neue Wert als Zurücksetzen durch den Nutzer: jede Bremse, die nur wegen der nahenden Grenze
   galt, bei beiden Spuren ausdrücklich aufheben (sie halten sie sonst weiter ein), Nutzer-Liste und Übersicht
   umstellen und im Bericht sagen, dass die Änderung nicht vom Leitstand kam und welches Risiko bleibt. Weiter nach
   „Nutzer sagt, das Kontingent sei wieder da“ in `kontingent-hochrechnung.md`.
6. Enden Worker kurz vor oder nach einem solchen Sprung mit einer Drosselungs-Meldung, das als Ratenlimit des
   Anbieters einordnen (Zeitraum aus dem Proxy-Protokoll nennen), nicht als Fehler des Pakets; die Spur schließt die
   gesicherte Arbeit mit einer Fortsetzung ab.

## 5. Wartet Arbeit, obwohl ein Platz frei ist?

1. Laufende Worker aus dem Lauf-Register zählen, nicht aus der Queue, und gegen die Obergrenze halten. Gilt die
   Obergrenze nur für den knappen Anbieter, das Modell je Lauf mit ausgeben und nur dessen Läufe zählen. Ist ein Platz
   frei und stehen in der Queue Pakete mit „prüfen“, „wartet auf Slot“ oder einer bereiten Nacharbeit, den Grund
   belegen: das Start-Werkzeug der Spur selbst fragen (`<queue-werkzeug> next <Spur>`). Es nennt das Tor, das sperrt
   (Kontingent, Arbeitsspeicher, Abhängigkeit).
2. Nennt das Start-Werkzeug eine andere Zahl laufender Läufe als das Register, oder bietet es für ein Paket ein
   anderes Modell an als dessen Modell-Spalte, zählt seine eigene Zählung falsch. Die Zeilen suchen, die es zählt,
   und gegen das Register halten. Zwei häufige Ursachen:
   - Die Zählung sucht den Modellnamen irgendwo in der Statuszelle, und die Zelle eines Laufs des anderen Anbieters
     nennt das Prüfmodell im Freitext („nacharbeit läuft (<anderes Modell> Run <kennung>; <Prüfmodell>-Prüfung Mängel
     …)“). Im Werkzeug beheben, nicht in den Zellen: Der Modellname zählt nur DIREKT hinter der Lauf-Kennung
     (`\b[0-9a-f]{8}(?:-[0-9a-f]{4,12})*\s+(<modellnamen>)\b`). Das neue Muster mit einigen echten Zellen prüfen
     (zählt / zählt nicht, auch die lange Kennung mit Bindestrichen), den Selbsttest des Werkzeugs fahren, atomar
     ersetzen, danach die Zählung des Werkzeugs gegen das Register halten und beiden Spuren das Zellenformat nennen.
   - Eine Zelle nennt einen laufenden Lauf ohne Kennung („nacharbeit läuft (<modell>-Worker, Brief …)“). Dann sieht
     die Zählung ihn nicht, und es laufen mehr Läufe des knappen Anbieters als erlaubt. Die Zelle über den
     Status-Befehl des Werkzeugs berichtigen, nichts abbrechen, beiden Spuren die Regel nennen: Zelle SOFORT beim
     Start als „läuft <Kennung> <modell>“, Freitext dahinter, und vor jedem Start das Start-Werkzeug fragen.
   Grund für beides: Zählt das Werkzeug falsch, bleiben Pakete des knappen Anbieters liegen, es weicht auf das
   falsche Modell aus, oder die Obergrenze wird überschritten.
3. Hält eine Spur Pakete zurück, weil sie einen Anbieter für gesperrt hält, ihre Annahme gegen die Messung halten
   (Zellen wie „wartet: Tor zu“ suchen, dann das Tor-Skript fragen). Ist das Tor offen, die Spur die Zellen
   berichtigen und nach der Reihenfolge des Start-Werkzeugs starten lassen. Grund: Die Spur merkt sich eine Sperre
   aus einer früheren Anweisung und prüft sie nicht neu, wenn das Kontingent zurückgesetzt wurde.
4. Sperrt das Speicher-Tor nur, solange ein Build auf demselben Rechner läuft: die Spur anweisen, das Tor in kurzen
   Abständen (etwa 10 min) neu zu prüfen, solange Prüfungen oder Nacharbeiten warten, und die Reihenfolge der
   wartenden Arbeit nennen. Grund: Die Spur prüft das Tor einmal und legt sich dann mit ihrem langen Wecker schlafen;
   der Speicher ist Minuten später wieder frei, der Platz bleibt aber bis zum Wecker leer.
5. Sind alle Plätze belegt, je Spur zählen, wer sie hält. Hält eine Spur alle und wartet bei der anderen Arbeit seit
   mehr als einer Runde (letzte Journalzeile der wartenden Spur ist Stunden alt), die Plätze teilen: Solange die
   andere Spur wartende Arbeit für den knappen Anbieter hat, hält jede Spur höchstens einen Platz. Laufende Worker
   laufen zu Ende; die abgebende Spur startet nach dem ersten fertigen Lauf keinen neuen, bis auch der zweite fertig
   ist. Der wartenden Spur die Reihenfolge für den Platz nennen, schwerste Funde zuerst. Grund: Jede Spur füllt freie
   Plätze sofort selbst nach; eine eingebaute Fairness-Regel des Start-Werkzeugs greift oft nur in einer Betriebsart
   und ist nach einem Umschalten außer Betrieb.
6. Der wartenden Spur zugleich Arbeit geben, die ohne den knappen Platz geht: Nacharbeiten ohne schwerste Funde mit
   dem Modell des anderen Anbieters, danach prüft das starke Modell nur den Nacharbeit-Diff. Nacharbeiten mit
   schwersten Funden bleiben beim starken Modell.
7. Meldet eine Spur „alle Plätze belegt“, die Läufe, die sie aufzählt, gegen das Register mit Modellspalte halten.
   Grund: Die Spur liest Ordnernamen aus dem Register und zählt Läufe des anderen Anbieters als belegte Plätze mit;
   der Platz bleibt dann leer, obwohl ihr eigenes Journal schlüssig klingt.
8. Sind die Plätze des Anbieters mit Abstand frei, während der andere an seiner Grenze steht und dort schon Läufe
   laufen: das nächste Paket des knappen Anbieters als Leitstand-Ausnahme mit dem günstigeren Modell des freien
   Anbieters bauen lassen und die Zweitprüfung dessen anderem Modell geben. Grund: Ein weiterer Start beim knappen
   Anbieter schießt über dessen Grenze, weil laufende Läufe nicht anhalten.
9. Quittung als Journalzeile verlangen und in der nächsten Runde am gestarteten Lauf belegen.
10. Dem Nutzer den Engpass und den einen Handgriff nennen, der ihn löst (z. B. den ausgefallenen Build-Rechner
    einschalten), statt nur „wartet“ zu melden.

## 6. Prüfschritt, der nicht bei jedem Paket läuft

Wird ein Prüfschritt im Einbau rot, obwohl das Paket die genannten Dateien nicht angefasst hat, stehen die Fehler
schon im gemeinsamen Zweig. Dann zuerst das verursachende Paket finden (Dateipfad der Meldung gegen
`git log --first-parent --oneline -- <datei>` im gemeinsamen Zweig) und klären, warum der Schritt dort nicht lief.
Zwei Formen:

**a) Bedingter Schritt löst beim Gegenstück nicht aus** (z. B. der Build für eine zweite Plattform):

1. Die Auslöse-Bedingung des Schritts im Queue-Werkzeug lesen (`grep -n -i '<plattform>' <werkzeug>`). Löst sie nur
   bei Zeilen aus, die die Plattform selbst nennen, fehlt das Gegenstück: Code, der nur für die ANDERE Plattform gilt
   (`cfg(unix)`, `cfg(not(windows))`, `target_os = "linux"`), lässt auf der geprüften Plattform unbenutzte Importe
   und Variablen zurück, ohne den Schritt je auszulösen.
2. Die Bedingung um das Gegenstück erweitern, die neue Fassung mit einer Handvoll Beispielzeilen prüfen (soll
   auslösen / soll nicht auslösen, etwa `cfg(test)` und `cfg(feature = …)`), den Test des Werkzeugs fahren, atomar
   ersetzen.

**b) Prüfung liest den ganzen Baum, läuft aber nur mit ihrem eigenen Paket** (Regel-Tests, die die Quellen aller
Pakete nach verbotenen Aufrufen durchsuchen und in EINEM Paket liegen):

1. Die Test-Auswahl des roten Schlusstests und die des verursachenden Pakets vergleichen (Startzeile im Log). Fehlt
   beim Verursacher das Paket, in dem die Regel-Tests liegen, sind sie dort nie gelaufen.
2. Im Queue-Werkzeug das Paket mit den Regel-Tests an die Test-Auswahl JEDES Schlusstests hängen (nur beim
   Testschritt, nicht bei Lint und Typprüfung), Selbsttest fahren, atomar ersetzen, Entscheidung mit dem Preis
   festhalten (wenige Minuten je Schlusstest).

Für beide Formen:

3. Die Altfehler EINMAL beheben lassen, mit Vorrang, weil jeder weitere Einbau daran scheitert: durch die Spur, die
   das verursachende Paket gebaut hat, als kleinen Integrationsfix in einem eigenen Worktree vom aktuellen Stand
   (Stellen mit Datei und Zeile nennen, „nur diese Stellen, keine Logik“), danach den gescheiterten Einbau neu
   starten. Liegt das verursachende Paket noch offen, stattdessen im Paket, das die Fehler zuerst trifft, mit
   Zusatzfreigabe der fremden Dateien.
4. Der anderen Spur und laufenden Nacharbeitern sagen, welche Meldungen nicht ihre sind: Ein Rot NUR wegen dieser
   Stellen wird nicht nachgearbeitet, sondern nach dem Fix durch Einmischen des gemeinsamen Zweigs und einen neuen
   Schlusstest erledigt; eigene Verstöße in anderen Dateien behebt jedes Paket selbst. Grund: Sonst beheben zwei
   Pakete dieselben Zeilen, und der zweite Einbau endet im Konflikt.
5. Dem Nutzer sagen, seit wann der gemeinsame Zweig rot ist, welche Fälle die Änderung am Werkzeug abdeckt und dass
   sie nicht jeden denkbaren Fall fängt; ein voller Lauf über alle Pakete gehört in die Abschlussprüfung der Welle.

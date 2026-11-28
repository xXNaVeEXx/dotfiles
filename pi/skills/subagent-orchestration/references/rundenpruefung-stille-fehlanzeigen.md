# Rundenprüfung: sechs Anzeigen, die still falsch werden

Ergänzt `statusseite.md` (Pflege der Seite) und `kontingent-hochrechnung.md`. Jede Kontrollrunde des Leitstands prüft
die Punkte 1 bis 5, bevor die Meldung an den Nutzer geht; Punkt 6 gilt, sobald ein Prüfschritt wegen fremder Dateien
rot wird. Allen gemeinsam: Die Anzeige wirkt gesund, während der Stand dahinter falsch oder stehen geblieben ist. Auch
der Auftrag „halte die Statusseite aktuell“ beginnt mit Punkt 1 und 2, nicht mit dem Neuerzeugen der Seite.

## 1. Summenzeile der Statusseite gegen eine eigene Zählung halten

1. Je Queue selbst zählen: `grep -c '| fertig' <QUEUE.md>` gegen `grep -c '^| <ID-Präfix>' <QUEUE.md>`.
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

## 4. Kontingent: alle Grenzen der Ablesung lesen

1. Die Rohablesung ansehen, nicht nur die Zeile des eigenen Tor-Skripts:
   `jq -c '.limits[] | {label, p: (.percent*100|floor), resetsAt}' <ablesung>.json`.
2. Gibt es neben der allgemeinen Wochengrenze eine eigene Grenze für ein Modell, festhalten, welche Sitzung auf diesem
   Modell läuft (Leitstand, Spuren, Worker), und beide Werte in Bericht und Statusseite nennen. Grund: Ein Tor, das nur
   die erste Grenze prüft, lässt weiterlaufen, während die Grenze des Leitstand-Modells voll läuft; dann bauen die
   Spuren ohne Aufsicht weiter.
3. Steigt der Wochenwert zwischen zwei Runden deutlich schneller als im Tagesschnitt, die Hochrechnung sofort
   berichtigen und den Grund nennen, soweit er belegt ist (z. B. Sitzungen anderer Projekte auf demselben Konto:
   Sitzungsdateien mit Änderung in der letzten Stunde je Projektordner zählen).
4. Läuft der Leitstand auf einem Modell mit eigener, knapper Grenze: Kontrolltakt nicht verkürzen und den Kontext
   klein halten, statt die Seite öfter von Hand zu erneuern.

## 5. Wartet Arbeit, obwohl ein Platz frei ist?

1. Laufende Worker aus dem Lauf-Register zählen, nicht aus der Queue, und gegen die Obergrenze halten. Gilt die
   Obergrenze nur für den knappen Anbieter, das Modell je Lauf mit ausgeben und nur dessen Läufe zählen. Ist ein Platz
   frei und stehen in der Queue Pakete mit „prüfen“, „wartet auf Slot“ oder einer bereiten Nacharbeit, den Grund
   belegen: das Start-Werkzeug der Spur selbst fragen (`<queue-werkzeug> next <Spur>`). Es nennt das Tor, das sperrt
   (Kontingent, Arbeitsspeicher, Abhängigkeit).
2. Nennt das Start-Werkzeug eine andere Zahl laufender Läufe als das Register, oder bietet es für ein Paket ein
   anderes Modell an als dessen Modell-Spalte, zählt seine eigene Zählung falsch. Die Zeilen suchen, die es zählt,
   und gegen das Register halten. Häufigste Ursache: Die Zählung sucht den Modellnamen irgendwo in der Statuszelle,
   und die Zelle eines Laufs des anderen Anbieters nennt das Prüfmodell im Freitext („nacharbeit läuft (<anderes
   Modell> Run <kennung>; <Prüfmodell>-Prüfung Mängel …)“). Im Werkzeug beheben, nicht in den Zellen: Der Modellname
   zählt nur DIREKT hinter der Lauf-Kennung (`\b[0-9a-f]{8}(?:-[0-9a-f]{4,12})*\s+(<modellnamen>)\b`). Das neue Muster
   mit einigen echten Zellen prüfen (zählt / zählt nicht, auch die lange Kennung mit Bindestrichen), den Selbsttest
   des Werkzeugs fahren, atomar ersetzen, danach die Zählung des Werkzeugs gegen das Register halten und beiden
   Spuren das Zellenformat nennen. Grund: Zählt das Werkzeug einen fremden Lauf mit, hält es die Grenze für erreicht;
   Pakete des knappen Anbieters bleiben liegen, oder es weicht auf das falsche Modell aus.
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
8. Quittung als Journalzeile verlangen und in der nächsten Runde am gestarteten Lauf belegen.
9. Dem Nutzer den Engpass und den einen Handgriff nennen, der ihn löst (z. B. den ausgefallenen Build-Rechner
   einschalten), statt nur „wartet“ zu melden.

## 6. Bedingter Prüfschritt: löst er auch beim Gegenstück aus?

Wird ein Prüfschritt (z. B. der Build für eine zweite Plattform) im Einbau rot, obwohl das Paket die roten Dateien
nicht angefasst hat, stehen die Fehler schon im gemeinsamen Zweig. Dann zuerst klären, warum der Schritt bei den
verursachenden Paketen nicht lief:

1. Die Auslöse-Bedingung des Schritts im Queue-Werkzeug lesen (`grep -n -i '<plattform>' <werkzeug>`). Löst sie nur
   bei Zeilen aus, die die Plattform selbst nennen, fehlt das Gegenstück: Code, der nur für die ANDERE Plattform gilt
   (`cfg(unix)`, `cfg(not(windows))`, `target_os = "linux"`), lässt auf der geprüften Plattform unbenutzte Importe
   und Variablen zurück, ohne den Schritt je auszulösen.
2. Die Bedingung um das Gegenstück erweitern, die neue Fassung mit einer Handvoll Beispielzeilen prüfen (soll
   auslösen / soll nicht auslösen, etwa `cfg(test)` und `cfg(feature = …)`), den Test des Werkzeugs fahren, atomar
   ersetzen.
3. Die Altfehler EINMAL beheben lassen: im Paket, das sie zuerst trifft, mit Zusatzfreigabe der fremden Dateien und
   dem Auftrag „nur Importe und Bedingungen, keine Logik“. Beiden Spuren sagen, dass ein Rot nur wegen dieser Dateien
   auf den Einbau dieses Pakets wartet und nicht ein zweites Mal behoben wird. Grund: Sonst beheben zwei Pakete
   dieselben Zeilen, und der zweite Einbau endet im Konflikt.
4. Dem Nutzer sagen, welche Fälle die erweiterte Bedingung abdeckt und dass sie nicht jeden denkbaren Fall fängt; ein
   voller Lauf des Schritts gehört in die Abschlussprüfung der Welle.

# Rundenprüfung: vier Anzeigen, die still falsch werden

Ergänzt `statusseite.md` (Pflege der Seite) und `kontingent-hochrechnung.md`. Jede Kontrollrunde des Leitstands prüft
diese vier Punkte, bevor die Meldung an den Nutzer geht. Allen gemeinsam: Die Anzeige wirkt gesund, während der Stand
dahinter falsch oder stehen geblieben ist. Auch der Auftrag „halte die Statusseite aktuell“ beginnt mit Punkt 1 und 2,
nicht mit dem Neuerzeugen der Seite.

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
   seit …“, Rechnername, Checklisten-Haken abgeschlossener Phasen) und sie berichtigen oder zeitlos fassen.
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

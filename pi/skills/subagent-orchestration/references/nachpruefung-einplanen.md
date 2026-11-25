# Nachgeordnete Arbeit fest einplanen (Nachprüfung, Sammel-Nacharbeit, Anschluss-Läufe)

Gilt für jede Arbeit, die der Leitstand einer Spur zusätzlich zur Paket-Queue aufträgt: Nachprüfung schon eingebauter Pakete
(siehe `einzelregeln.md`, Abschnitt „Prozessschritte der Spuren gegeneinander halten“), gesammelte mittlere Funde, zweite Stufe
eines Sammelpakets.

## Regel
Solche Arbeit nie „in freien Plätzen“ oder „in Wartezeiten“ vergeben. Solange startbare Pakete in der Queue stehen, gibt es keinen
freien Platz: Die Spur füllt jeden frei werdenden Platz sofort mit dem nächsten Paket (so ist sie angewiesen), und die Zusatzarbeit
rutscht ans Ende der Welle. Dort sind ihre Funde am teuersten, weil alle späteren Pakete schon auf dem ungeprüften Stand aufbauen.

## Ablauf
1. Im Auftrag eine feste Reihenfolge nennen: Der erste Teil nimmt den NÄCHSTEN frei werdenden Platz, vor dem nächsten neuen Paket
   (Paket beim Namen nennen, das dafür wartet). Die übrigen Teile folgen im Wechsel mit je einem Paket.
2. Die Teile nach Risiko ordnen (Anmeldung, Signaturen, Geheimnisse, Netz- und Dateizugriff zuerst) und klein genug schneiden, dass
   ein Lauf sie schafft; ein zu großes Bündel teilen und die Teile einzeln zählen.
3. Modell je Teil nach derselben Regel wie beim Paket-Review wählen (das andere Modell als der Erbauer); steht das im Auftrag nicht,
   wählt die Spur aus Gewohnheit dasselbe. Modellregel, Reviewer-Auftrag und Ablage der Befunde aus Sicht der Spur:
   `kontingent-pause-und-review-nachpruefung.md`.
4. Schwere Funde sofort als Fix im eigenen Lauf mit eigenem Commit und Einbau, mittlere je Teil in eine Befunddatei sammeln.
   Die Spur meldet erst fertig, wenn alle Teile geprüft und die schweren Funde behoben sind.
5. Quittung als Journalzeile verlangen, die die Reihenfolge nennt.
6. Bei jedem Wecken gegenprüfen: Steht für jeden vergebenen Teil eine Start- oder Befundzeile im Journal? Liste der offenen Teile in
   die Stand-Datei schreiben und mitführen. Ist seit dem Auftrag mehr als ein neues Paket gestartet, aber kein weiterer Teil, die
   Reihenfolge sofort nachschärfen (Schritt 1), nicht bis zum Wellenende warten.
7. Die Zusatzläufe in die Kontingent-Hochrechnung aufnehmen (jeder Teil zählt wie ein Paket, Fix-Läufe dazu) und dem Nutzer die
   geänderte Schätzung ausdrücklich nennen (`kontingent-hochrechnung.md`).

## Review-/Einbau-Stau (gebaut, aber nicht eingebaut)
- Als Spur den Stau selbst begrenzen, bevor der Leitstand eingreifen muss: Warten mehr als 2 Pakete auf Review oder Einbau (Endlauf/integ), startet
  die Spur KEIN neues Bau-Paket; frei werdende Plätze gehen der Reihe nach an Reviews (ältestes fertiges Paket zuerst, immer anderes
  Modell als der Erbauer), dann an Nacharbeit, erst dann an neue Pakete. Grund: Jedes ungeprüfte Paket baut Folgepakete auf unbewiesenem
  Stand, und das Wochenkontingent wird für Gebautes ausgegeben, das noch nicht in der Integrationslinie liegt.
- Einbau strikt nacheinander in der Reihenfolge der Abhängigkeiten (Endlauf und integ nie parallel; erst nach integ des Vorgängers der
  nächste Endlauf). Konflikte in gemeinsamen Hotspot-Dateien (Werkzeug-Register, erzeugtes Handbuch) beide Seiten behalten bzw. neu erzeugen.
- Steht im Auftrag eine feste Review-Reihenfolge, per Journalzeile quittieren und bei jedem Wecken die Liste „wartet auf Review / Endlauf /
  integ“ aus dem Stand nachziehen.

## Hinweise
- Der erste Teil einer Nachprüfung zeigt die Fehlerquote: Findet er schwere Mängel, die übrigen Teile nicht strecken, sondern
  vorziehen, und dem Nutzer die Quote nennen.
- Eine Spur, die die Zusatzarbeit quittiert hat, hält sich an den Wortlaut. Steht dort „wenn Platz ist“, ist Liegenlassen
  regelkonform; der Fehler liegt dann im Auftrag, nicht bei der Spur.
- Prüfung und Nacharbeit kosten spürbar mehr Kontingent je Paket als der reine Bau; den Wert je Paket nach den ersten geprüften
  Paketen neu messen, statt den alten weiterzuverwenden.

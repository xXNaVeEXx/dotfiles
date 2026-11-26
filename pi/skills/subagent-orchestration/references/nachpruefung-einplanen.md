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
5. Den Fix für schwere Funde vor dem Einbau gegenprüfen lassen, sobald er Sicherheitsfunde behebt (Befehlsausführung, Netz-Tor,
   Anmeldung, Geheimnisse) oder mehrere schwere Funde in einem Lauf: Reviewer mit dem starken Modell, nur der Diff seit dem
   Prüfstand, mit der Frage „ist jeder schwere Fund behoben, und gibt es je Fund einen Test über den echten Aufrufweg?“. Ohne
   schweren Restfund einbauen, sonst zurück an den Worker. Das im Auftrag ausdrücklich verlangen und die Befunddatei nennen.
   Grund: Beim Paket-Review ist die Gegenprüfung der Nacharbeit eingeübt, beim Sammel-Fix einer Nachprüfung plant die Spur
   nur Abnahme, Prüflauf und Einbau; ein Fix, der die Lücke nur am Testweg schließt, landet dann ungeprüft im gemeinsamen Zweig.
6. Quittung als Journalzeile verlangen, die die Reihenfolge nennt.
7. Bei jedem Wecken gegenprüfen: Steht für jeden vergebenen Teil eine Start- oder Befundzeile im Journal? Liste der offenen Teile in
   die Stand-Datei schreiben und mitführen. Ist seit dem Auftrag mehr als ein neues Paket gestartet, aber kein weiterer Teil, die
   Reihenfolge sofort nachschärfen (Schritt 1), nicht bis zum Wellenende warten. Bei jedem neuen Befund den geplanten Weg des
   Fixes lesen (letzte Journalzeile der Spur) und Schritt 5 nachtragen, wenn die Gegenprüfung fehlt.
8. Die Zusatzläufe in die Kontingent-Hochrechnung aufnehmen (jeder Teil zählt wie ein Paket, Fix-Läufe dazu) und dem Nutzer die
   geänderte Schätzung ausdrücklich nennen (`kontingent-hochrechnung.md`).

## Reviewer-Aufträge praktisch
- Auftrag als Datei mit festem Ausgabeformat (`BEFUND: n P0, n P1, n P2`, je Fund `P?: Datei:Zeile – Problem – Vorschlag`,
  Urteil FREI/BLOCK); der Reviewer hat kein Schreibwerkzeug, das Ergebnis aus seinem Lauf-Ordner in die Befunddatei ziehen.
  Die Abschlussmeldung „nichts gespeichert“ ist Lernpass-Rauschen und kein Fehler.
- Ein Reviewer mit `cwd` im Integrationsordner hat kein `git` und liest nur den Branch-Stand; die Zeilenangaben vorab im
  Sammel-Fix-Brief als „Worker vor dem Ändern selbst prüfen“ kennzeichnen. Für die Gegenprüfung eines Fix-Diffs den Reviewer
  mit `cwd` im Paket-Worktree starten und die lesenden git-Befehle (`git diff <Prüfstand>..HEAD`, `git log`) im Auftrag nennen.
- Wächter-Tests, die den Quelltext nach verbotenen Aufrufen durchsuchen, brechen oft an der ersten Zeile `mod tests;` bzw.
  `#[cfg(test)]` ab und lesen echten Code dahinter nie. Der Reviewer sucht solche Aufrufe selbst per `rg`; beim Beheben den
  Wächter korrigieren UND prüfen, dass er danach keine neuen Treffer in anderen Dateien findet.
- Der Sammel-Fix läuft im Worktree EINES Pakets des Bündels; dessen `.pfade` um alle Code-Ordner des Bündels und den Bericht
  erweitern (Kommentar mit Grund). Weicht der Worker begründet vom Review ab (Fundstelle in anderer Datei, Fund nur teilweise
  umgesetzt), steht das im Bericht: lesen und gegenprüfen lassen, nicht blind übernehmen.

## Mehrlauf-Anschluss im selben Worktree (Lauf 1..n nacheinander)
- Läufe strikt nacheinander, ein Schreiber je Worktree; vor jedem Lauf `feat` einmergen (bei `handbuch.html`-Konflikt `--ours` +
  `node tools/manual-gen.mjs`, dann `--check`) und den Stand-Commit nennen. Jeder Lauf: eigene Abnahme + Prüflauf grün, Bericht-Abschnitt
  „Stufe 2 – <Bereich>“ mit „Offen (mit Konsument)“, KEIN integ. Der Kanalstart/Konsument, der in Lauf 1/2 „Offen“ blieb, wandert
  als Aufgabe in den letzten Lauf, sonst bleiben Bausteine verwaist.
- Ist der zweite Claude-Platz frei, darf der Review von Lauf 1..k-1 (fester Commit-Bereich, Reviewer nur lesend) PARALLEL zum
  Schreiber laufen; im Auftrag den Bereich benennen und „Änderungen außerhalb der Liste ignorieren“. Die Nacharbeit aller
  Befunde (Teil A + B + angestaute Hinweise anderer Spuren) läuft danach gebündelt in EINEM Lauf im selben Worktree, nicht je Teil.
- Rückfragen des Workers (Option A/B mit Empfehlung) beantwortet die Spur sofort per `subagent_supervisor reply` plus `subagent steer`;
  übernimmt sie die Empfehlung, das in einer Zeile begründen. Eine kleine fehlende Gegenstelle, die die UI schon ruft, lieber mitbauen
  lassen („falls ≈40 Zeilen“) als als Offen stehen lassen.
- Meldungen des Lint-Hooks zu fremden Status-Dateien, die per `feat`-Merge in den Worktree kamen, nicht anfassen (nicht Paketumfang).

## Review-/Einbau-Stau (gebaut, aber nicht eingebaut)
- Als Spur den Stau selbst begrenzen, bevor der Leitstand eingreifen muss: Warten mehr als 2 Pakete auf Review oder Einbau (Endlauf/integ), startet
  die Spur KEIN neues Bau-Paket; frei werdende Plätze gehen der Reihe nach an Reviews (ältestes fertiges Paket zuerst, immer anderes
  Modell als der Erbauer), dann an Nacharbeit, erst dann an neue Pakete. Grund: Jedes ungeprüfte Paket baut Folgepakete auf unbewiesenem
  Stand, und das Wochenkontingent wird für Gebautes ausgegeben, das noch nicht in der Integrationslinie liegt.
- Einbau strikt nacheinander in der Reihenfolge der Abhängigkeiten (Endlauf und integ nie parallel; erst nach integ des Vorgängers der
  nächste Endlauf). Konflikte in gemeinsamen Hotspot-Dateien (Werkzeug-Register, erzeugtes Handbuch) beide Seiten behalten bzw. neu erzeugen.
- Steht im Auftrag eine feste Review-Reihenfolge, per Journalzeile quittieren und bei jedem Wecken die Liste „wartet auf Review / Endlauf /
  integ“ aus dem Stand nachziehen.
- Wird ein Endlauf rot, nachdem der gemeinsame Stand in ein wartendes Paket eingemischt wurde, dem Nutzer nur melden, was belegt ist:
  welcher Schritt rot ist, seit wann, was dahinter wartet und dass die Ursache offen ist. Vor einem Eingriff prüfen, ob die Spur
  schon selbst untersucht (Kindprozesse der Spur-Sitzung, Statuszelle, Journal), und die Ursache in der nächsten Runde belegen.
  Grund: Ein zweiter Auftrag in eine laufende Untersuchung unterbricht sie, und eine vermutete Ursache im Bericht wird als Befund gelesen.

## Hinweise
- Der erste Teil einer Nachprüfung zeigt die Fehlerquote: Findet er schwere Mängel, die übrigen Teile nicht strecken, sondern
  vorziehen, und dem Nutzer die Quote nennen.
- Eine Spur, die die Zusatzarbeit quittiert hat, hält sich an den Wortlaut. Steht dort „wenn Platz ist“, ist Liegenlassen
  regelkonform; der Fehler liegt dann im Auftrag, nicht bei der Spur.
- Prüfung und Nacharbeit kosten spürbar mehr Kontingent je Paket als der reine Bau; den Wert je Paket nach den ersten geprüften
  Paketen neu messen, statt den alten weiterzuverwenden.

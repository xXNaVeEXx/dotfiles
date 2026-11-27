# Wellenwechsel: nächste Welle starten, wenn die vorige zusammengeführt ist (Leitstand)

Die nächste Welle ist meist viel größer als die vorige (mehrere hundert Pakete je Spur). Skripte und Regeln, die bei
fünfzig Paketen liefen, brechen dann an Stellen, die nichts mit der Arbeit zu tun haben.

## Ablauf
1. Voraussetzungen belegen: Antrag der alten Welle gemergt, Integrationszweig = Remote, alte Spuren haben fertig gemeldet,
   Kontingent je Anbieter gemessen, Platte und RAM geprüft.
2. Die Queues der neuen Welle erzeugen. Der Schritt dauert bei großen Wellen deutlich länger als gewohnt: einzeln fahren,
   mit großzügigem Zeitlimit, nicht zusammen mit einer Sicherungskopie im selben Aufruf (sonst bricht beides im Zeitlimit ab,
   und es bleibt unklar, was fertig wurde).
3. Die erzeugte Start-Anleitung der Spuren gegen die Lehren der alten Welle lesen, bevor eine Spur startet: Nennt sie noch ein
   Werkzeug, das es nicht mehr gibt, oder fehlen Regeln, die erst unterwegs entstanden sind? Die Lehren als eigenen Nachtrag
   in einer Datei pflegen und per kleinem Skript vor den Regel-Abschnitt der Anleitung setzen (prüft, ob er schon drin ist).
   Nicht die Vorlage im Queue-Werkzeug umschreiben. Grund: Jedes erneute Erzeugen der Queues überschreibt die Anleitung, und
   der Nachtrag lässt sich danach mit einem Befehl wieder einsetzen; in die Übergabe-Notiz schreiben, dass das nötig ist.
   In den Nachtrag gehören: der gültige Startweg für jede Rolle, die Worker-Obergrenze, die Zweitprüfung, die stehenden
   Pfad-Freigaben, die Meldeform für nicht angeschlossene Bausteine, Test-Regeln aus den CI-Befunden, Speicher-Regel.
4. Offene Reste der alten Welle (Schlussberichte der Spuren, CI-Befunde, Anschlüsse) als Merkposten-Liste mit Abhak-Format
   ablegen. Die Spur prüft die Liste vor jedem Paketstart und nimmt passende Posten als Pflichtpunkt in den Auftrag.
   Was am Wellenende offen bleibt, wird ein Sammelpaket. Grund: Sonst gehen die Reste zwischen zwei Wellen verloren.
5. Alte Spuren stoppen, neue starten, Aufsichten, Kontingent-Wache und Speicher-Wache neu aufsetzen. Übersicht, Stand-Datei
   mit erstem Messpunkt der Welle, Nutzer-Liste (Überholtes als erledigt kennzeichnen) und Statusseite umstellen.
6. Nach wenigen Minuten die ersten Journalzeilen gegenlesen: Nutzen die Spuren den gültigen Startweg, tragen sie Pfade ein,
   planen sie die Zweitprüfung?

## Was bei der größeren Welle bricht
- Aufsichts- und Hilfsskripte, die je Paket etwas in eine Umgebungsvariable oder Befehlszeile legen (z. B. Pfad-Muster für
  alle Worktrees), enden mit „Argument list too long“ (Exit 126). Nur aktive Pakete aufnehmen (nicht „fertig“, und „offen“
  nur mit vorhandenem Worktree) und mit einem Probelauf die Länge prüfen. Folge beachten: Neu gestartete Pakete sieht das
  Skript erst nach seinem nächsten Neustart.
- Das Kontingent: Die ersten großen Pakete mit starkem Modell samt Prüfung und Nacharbeit verbrauchen in wenigen Stunden
  viele Punkte, bevor ein einziges Paket fertig ist. Nach zwei bis drei Stunden hochrechnen und die Spuren rechtzeitig auf
  „keine neuen Pakete mit dem knappen Anbieter, nur Prüfer und laufende Nacharbeit“ stellen (siehe `kontingent-hochrechnung.md`).
- Der eigene Anteil am Verbrauch: Laufen fremde Vorhaben auf demselben Konto, die Kosten je Lauf aus dem Lauf-Register nach
  Arbeitsordner summieren (Kostenfeld je Schritt in der Statusdatei) und dem Nutzer beide Anteile nennen. Grund: Sonst
  wirkt der schnelle Anstieg wie ein Fehler der eigenen Spuren.
- Der Speicher, wenn der Build-Rechner fehlt und beide Spuren lokal bauen: eine Dauerwache über alle eigenen Bau-Bereiche
  laufen lassen (bei hoher Swap-Belegung einfrieren, bei Entspannung auftauen, erst kurz vor der Grenze des Systems den
  größeren eigenen Bau beenden), nie Fremdes beenden.
- Spuren räumen bei vollem Zwischenspeicher von sich aus fremde Ordner weg. In die Anleitung schreiben: nie fremde Dateien
  löschen, den vollen Zustand als offenen Punkt an den Leitstand melden und warten, eigene Kopien auf die Festplatte legen.
- Prüfläufe, die nur auf dem Zielzweig laufen (z. B. andere Betriebssysteme), zeigen erst nach dem Merge Rot. Den ersten
  Lauf auf dem Zielzweig nach dem Merge ansehen und die Befunde in die Merkposten aufnehmen.

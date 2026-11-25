# Verbotenen Anbieter wieder freigeben (mit Obergrenze)

Gegenstück zu `kontingent.md` §10. Gilt, wenn der Nutzer mitten im Lauf einen zuvor verbotenen Anbieter wieder erlaubt
und dabei eine Zahl nennt („Anbieter B bis N %“). Die Zahl gilt nur für diesen Anbieter; die Grenze des anderen
Anbieters ändert sich dadurch nicht.

## Ablauf

1. Lage lesen, bevor etwas umgestellt wird: Schalter-Datei und ihr Inhalt, die Stellen des Queue-Werkzeugs, die sie
   lesen (`grep -n '<schalter>\|<modellname>' <werkzeug>`), die Zeile des Anbieters im Tor-Skript samt Rampen-Decke,
   Ausnahme-Datei, beide Kontingentwerte jetzt, Plan-Modelle der offenen Pakete (Paketplan, nicht die Queue – die
   Queue zeigt das umgeschriebene Modell).
2. Sicherungen aller Dateien anlegen, die sich ändern (Tor-Skript, Test des Tor-Skripts, Queue-Werkzeug, Startdateien
   der Spuren).
3. Tor-Skript: Wochenschwelle des Anbieters UND seine Rampen-Decke auf die genannte Zahl setzen (eigene Variable für
   die Decke dieses Anbieters). Grund: Eine befristete Ausnahme-Zeile oder die Schwelle allein reicht nicht; die
   Endspurt-Rampe öffnet in den letzten Stunden vor dem Wochenwechsel bis zur alten Decke und überschreitet die Zahl
   des Nutzers. Sperrzeiten des Anbieters (Hochlast) bleiben.
4. Test des Tor-Skripts: die bisherigen Fälle per env auf die alten Schwellen festlegen (sie prüfen die Rampe an
   sich), zwei neue Fälle für den Betriebs-Standard anhängen (knapp unter der Zahl offen, knapp darüber zu, auch im
   Rampenfenster). Neue Fassung als `.new` gegen den Test laufen lassen, dann `mv` (`kontingent.md` §1).
5. Schalter-Datei in den Sicherungsordner verschieben, nicht löschen; der Rückweg ist ein `mv`. Danach den Test des
   Queue-Werkzeugs laufen lassen. Am Code ist meist nichts zu ändern, wenn der Weg ohne Schalter dort schon geprüft
   wird.
6. Texte nachziehen, die das Verbot noch aussprechen: Startdateien der Spuren und die Vorlage im Queue-Werkzeug
   (Startfehler-Regel, Kontingent-Abschnitt). Neue Fassung: Plan-Modell gilt; Ausweichen auf den freigegebenen
   Anbieter bei gesperrtem Tor oder vollen Plätzen des anderen; Review durch das starke Modell für JEDES Paket des
   schwächeren Modells, unabhängig von der Größe.
7. Spuren per Prompt anweisen: was sich ändert, welche offenen Pakete jetzt mit dem freigegebenen Modell starten,
   dass feste Reihenfolgen (wartende Reviews, Nachprüfung) weiter gelten und die knappen Plätze des starken Anbieters
   zuerst an Prüfungen gehen. Quittung als Journalzeile verlangen und in der nächsten Runde am ersten Start belegen
   (`kontingent.md` §10 Punkt 5, mit umgekehrter Erwartung).
8. Platzregel klären und in den Auftrag schreiben: Die Obergrenze gleichzeitiger Worker gilt oft nur für den knappen
   Anbieter; Läufe des freigegebenen begrenzen dann nur Höchstzahl je Spur und RAM-Tor. Vor der Freigabe den freien
   Arbeitsspeicher prüfen.
9. Entscheidung mit Wortlaut des Nutzers, geänderten Dateien, Testergebnissen und Rückweg in Entscheidungs- und
   Standdatei eintragen; Übersicht und Nutzerliste nachziehen.

## Meldung an den Nutzer

- Sagen, was jetzt der freigegebene Anbieter übernimmt und was weiter am knappen Anbieter hängt: Prüfungen und die
  Orchestrator-Sitzungen der Spuren selbst. Grund: Die Freigabe spart Verbrauch, hebt die Pause an der Grenze des
  knappen Anbieters aber nicht auf.
- Den Zeitpunkt nennen, zu dem die Grenze des knappen Anbieters erreicht wird, und was ohne Antwort dann geschieht
  (z. B. keine neuen Läufe dort, Spur-Sitzungen auf das freigegebene Modell umstellen, bauen lassen, Prüfung und
  Einbau nach dem Wochenwechsel).
- Die Frage nach der Grenze des knappen Anbieters getrennt und erneut stellen; eine Freigabe für Anbieter B ist keine
  Antwort darauf.

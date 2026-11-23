# Zahlwege und Kunden-Erweiterungen: Bau- und Prüf-Fragen

Für Funktionen, die Geld bewegen (Online-Zahlung, Verbuchung, Umsatz-Zählung) oder die als Erweiterung nur bei einzelnen Kunden laufen. Als Brief-Baustein für Worker und als Prüfliste für Reviewer nutzen.

## Maßstab in einem Satz

Niemand zahlt denselben Betrag zweimal, und keine Zahlung zählt doppelt im Umsatz.

## Fragen je Zahlweg

Für jeden Weg, auf dem Geld kommen kann (Rechnung, Auftrag, bar vor Ort, Überweisung von Hand), eine Fallzeile führen und sofort füllen: Codestelle **und** Testdatei:Zeile. „Kein Test“ ist ein eigenes Ergebnis, kein Leerfeld.

1. **Sperre vor dem Geld, nicht Hinweis danach.** Steht irgendwo „wird verbucht, bekommt nur einen Hinweis“, dann fragen: Welche Stelle verhindert, dass die Zahlung überhaupt angeboten wird? Alle Quellen für „schon bezahlt“ einsammeln — bezahlte Rechnung, bezahlter Vorgang am Auftrag, unterschriebener Arbeitsnachweis mit Zahlart „bar“. Eine einzige Funktion entscheidet; Knopf, Zahlseite und Verbuchung benutzen dieselbe.
2. **Zwei Objekte, ein Betrag.** Auftrag und Rechnung(en) zum selben Auftrag tragen denselben Betrag. Fälle durchspielen: Rechnung bezahlt → Auftrag gesperrt; Auftrag bezahlt → Rechnung gesperrt; eine bezahlt + weitere offen; Dauer-Link des einen offen, während das andere bezahlt wird; schon geöffnete Kasse schließt nach der Sperre ab.
3. **Welche Zustände sind zahlbar?** Ausdrücklich als Liste im Code, nicht als verstreute Vergleiche. Prüfen, in welchem Zustand ein frisch angelegtes Dokument ist und ob der Mailversand den Zustand ändert — sonst fehlt der Knopf still genau im Normalfall (neue Rechnung = Entwurf).
4. **Beträge in Cent, Betrag aus genau einer Quelle.** Bei abweichendem Betrag oder anderer Währung festlegen und testen, was passiert. Nachträglich geänderte Rechnung: wird der Betrag beim Öffnen des Links nachgezogen?
5. **Idempotenz als Datenbank-Satz.** Der Übergang ist ein `UPDATE … WHERE status='offen' RETURNING`, Folgearbeiten (Statusregeln) laufen nach dem Commit und rollen nie zurück. Ergebnis der Verbuchung auf HTTP-Code abbilden: Wiederholung des Anbieters nur bei echtem Fehler.
6. **Bezahlt hat zwei Definitionen.** Umsatz-Modul liest den Status, KI-Kennzahlen lesen `paidAt` — beides setzen.
7. **Verlauf.** Schreibt ein Hintergrundlauf regelmäßig ein UPDATE, erzeugt der Verlaufs-Trigger je Lauf einen Eintrag.

## Fragen zu Rechten und Mandanten

- **Jede Action, die ein Bauteil aufruft**, einzeln prüfen — nicht nur die Haupt-Action. Ein Bauteil-Test mit vorgetäuschten Actions verdeckt genau die Lücke „Link darf er, Live-Status nicht“ (rote Fehlerkarte für die Zielgruppe). Der Test muss prüfen, *welche* Action gerufen wird.
- **Vorschau und Testmail** brauchen dieselbe Zugriffsprüfung wie der echte Versand, sobald sie Dokumentdaten auflösen.
- **Firmen-Quelle je Weg festlegen:** aktive Firma der Sitzung oder Firma des Dokuments? Abnahme-Fall: Administrator mit `firma.viewAll`, `firmaId: null`, einmal ohne und einmal mit `?firma=` — er darf weder eine Fehlerkarte „keine Firma ausgewählt“ sehen noch die Firma vom Client vorgeben können.
- **Neue öffentliche Seite** (ohne Anmeldung): alle Stellen suchen, die `/share` als Ausnahme kennen (Layout, Navigation, Firmen-Auswahl, Middleware), und eine gemeinsame Liste der öffentlichen Präfixe benutzen.

## Erweiterung nur für einzelne Kunden

- Der Kundenordner kann Seiten, Routen, Actions und rohe SQL-Migrationen liefern, aber kein typisiertes Schema, keine Übersetzungen, kein Menü. Fachliches deshalb in ein Paket, im Kundenordner nur einschalten; der Kern bekommt neutrale Einhängepunkte (Register), die bei leerem Register nichts tun, und importiert das Paket nie.
- **Beweis „leeres Register = unveränderte Ausgabe“** gegen eine eingecheckte Soll-Ausgabe (Zeichen für Zeichen), nicht gegen eine Ausgabe desselben Codes.
- Feste Kataloge (Vorlagen-Variablen) brauchen Leerwerte in **jeder** App, die den Katalog rendert, sonst druckt eine Vorlage den rohen Platzhalter.
- Kern-Bauteile lesen keine Texte aus dem Namensraum der Erweiterung.
- Der E2E-Bau läuft ohne Kundenordner: Seiten des Kunden existieren dort nicht. Klicktest im Kundenbau (`dev:customer`) einplanen. Code nur im Kundenordner ist auf dem gemeinsamen Test-Cluster nicht sichtbar — vor dem Bau mit dem Auftraggeber klären, wo er testen will.

## Technische Fallen

- TanStack Query v5: `refetchInterval` bekommt das **Query-Objekt** (`query.state.data`), nicht die Daten. Ein Parameter vom Typ `unknown` verdeckt den Fehler; das Nachfragen muss in jedem Endzustand und bei Fehler enden (Test mit Fake-Timern).
- Jest gegen Postgres: Test-Datenbank-Helfer ohne `createDrizzleClient` bauen (offene Verbindungen, Lauf endet nicht ohne `--forceExit`); je Suite eigene Datenbank, am Ende zählen, dass keine übrig ist. Postgres-Tests laufen nur mit gesetzter Schalter-Variable — ohne sie werden sie **übersprungen**, „grün“ heißt dann nichts.
- Test-INSERT mit Zeitstempel: `$n::text::timestamp`; Spalten `timestamp without time zone` als UTC zu lesen ist eine Annahme über die Verbindung, vorher prüfen.
- Mail-Marke ersetzen: steht sie mitten im Satz, kein Block-Element in den Absatz setzen; ohne Ersatz restlos entfernen.
- Abnahme-Testlauf nur auf einem festen Stand (kein Worker schreibt, `git status` leer davor und danach) — sonst misst der Lauf einen Mischstand und ein Fehlschlag sagt nichts über die Lieferung.

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
5. **Angezeigtes Geld = geflossenes Geld?** Bei jeder Summe (Umsatz, Übersicht, Kennzahl) die Quelle des Betrags nachschlagen: Kommt er aus dem heutigen Dokumentbetrag oder aus dem tatsächlich gezahlten Betrag? Ein Dokument im Zustand „bezahlt“, dessen Betrag später geändert wurde (oder während die Kasse offen war), überzeichnet sonst die Einnahme. Ist es altes Kernverhalten, das auch für von Hand bezahlt markierte Dokumente gilt: nicht nebenbei umbauen, sondern mit gemessenen Zahlen dem Auftraggeber vorlegen. Ein Hinweis auf die Abweichung gehört an jede Stelle, an der der Mitarbeiter „bezahlt“ sieht — prüfen, welche Listen des Kerns den Hinweis gar nicht zeigen können.
6. **Idempotenz als Datenbank-Satz.** Der Übergang ist ein `UPDATE … WHERE status='offen' RETURNING`, Folgearbeiten (Statusregeln) laufen nach dem Commit und rollen nie zurück. Ergebnis der Verbuchung auf HTTP-Code abbilden: Wiederholung des Anbieters nur bei echtem Fehler.
7. **Bezahlt hat zwei Definitionen.** Umsatz-Modul liest den Status, KI-Kennzahlen lesen `paidAt` — beides setzen.
8. **Verlauf.** Schreibt ein Hintergrundlauf regelmäßig ein UPDATE, erzeugt der Verlaufs-Trigger je Lauf einen Eintrag.
9. **Sperren gelten für jeden Aufrufer.** Eine Bremse oder Sperre (z. B. „nur ein Abgleich je Firma gleichzeitig“) bei jedem Aufrufer nachschlagen: Knopf in der Oberfläche **und** Hintergrundlauf. Ein Kommentar „läuft unter Sperre“ ist kein Beleg — die Aufrufstelle zeigen.

## Fragen zu Rechten und Mandanten

- **Jede Action, die ein Bauteil aufruft**, einzeln prüfen — nicht nur die Haupt-Action. Ein Bauteil-Test mit vorgetäuschten Actions verdeckt genau die Lücke „Link darf er, Live-Status nicht“ (rote Fehlerkarte für die Zielgruppe). Der Test muss prüfen, *welche* Action gerufen wird.
- **Drei Dinge je Action, alle vor der ersten Wirkung:** Recht, Firma, und ob der Nutzer genau diesen Datensatz sehen darf (wer nur eigene Aufträge oder Rechnungen sieht, bekommt zu fremden dieselbe Antwort wie bei „gibt es nicht“ — gleicher Fehlertext, kein angelegter Vorgang). Als Tabelle über alle exportierten Actions führen, auch über die Hüllen im Kundenordner.
- **Gespiegelte Regeln brauchen einen Vergleichstest.** Bildet ein Paket eine Sichtbarkeits-Regel des Kerns nach (weil die Kern-Funktion eine Sitzung oder mehr Daten braucht), dann verlangt die Abnahme einen Test, der für dieselben Datensätze und eine Stichprobe von Nutzern behauptet „Kern lässt genau dann durch, wenn das Spiegelstück durchlässt“, und rot wird, sobald beide auseinanderlaufen. Bewusste Abweichungen (Paket strenger als der Kern) stehen als eigener, benannter Fall drin und werden dem Auftraggeber als Entscheidung vorgelegt. Fehlt der Test: Fund „Wichtig“.
- **Behauptete Verhaltensgleichheit nach einem Umbau** („nur ausgelagert, Kern unverändert“): den entfernten Block im Diff zeilenweise gegen den neuen Export halten **und** die Aufrufstelle prüfen — beides mit Datei:Zeile. Eines allein ist kein Beleg.
- **Vorschau und Testmail** brauchen dieselbe Zugriffsprüfung wie der echte Versand, sobald sie Dokumentdaten auflösen.
- **Firmen-Quelle je Weg festlegen:** aktive Firma der Sitzung oder Firma des Dokuments? Abnahme-Fall: Administrator mit `firma.viewAll`, `firmaId: null`, einmal ohne und einmal mit `?firma=` — er darf weder eine Fehlerkarte „keine Firma ausgewählt“ sehen noch die Firma vom Client vorgeben können. Den Fall für **jedes** Dokument einzeln durchgehen (Rechnung, Auftrag, Übersicht): Ein Bauteil, das die Firma nur aus der Adresse nimmt, bleibt ohne `?firma=` still unsichtbar, während das Nachbar-Bauteil richtig die Firma des Dokuments benutzt.
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
- Test-INSERT mit Zeitstempel: `$n::text::timestamp`; Spalten `timestamp without time zone` als UTC zu lesen ist eine Annahme über die Verbindung, vorher prüfen. Dasselbe gilt für Tagesfilter in SQL (`at time zone 'UTC' at time zone 'Europe/Berlin'`): Sie stimmen nur, solange der Datenbank-Dienst in UTC läuft — mit `SET TIME ZONE 'Europe/Berlin'` gegentesten.
- Mail-Marke ersetzen: steht sie mitten im Satz, kein Block-Element in den Absatz setzen; ohne Ersatz restlos entfernen. Die Erkennung hat **eine** Schreibweise-Regel für Text und Betreff (Groß-/Kleinschreibung egal), und nach dem Entfernen bleiben keine Reste wie „Rechnung :“ oder doppelte Leerzeichen. Eingaben zum Durchprobieren: Marke mehrfach, im `href`, im Link-Text, im HTML-Kommentar, im zitierten Teil einer Antwort.
- Abnahme-Testlauf nur auf einem festen Stand (kein Worker schreibt, `git status` leer davor und danach) — sonst misst der Lauf einen Mischstand und ein Fehlschlag sagt nichts über die Lieferung. Läuft schon der nächste Worker, bekommt der Prüfer einen eigenen Schnappschuss (`git worktree add --detach <ordner> <commit>`), der nach dem Bericht wieder entfernt wird.

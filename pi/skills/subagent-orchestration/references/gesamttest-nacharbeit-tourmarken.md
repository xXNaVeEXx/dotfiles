# Nacharbeit nach rotem Gesamttest der Welle (Tour-Marken, GUI-Smoke)

Gilt, wenn der Leitstand nach dem Gesamttest einer Welle einer schon fertig gemeldeten Spur (DONE bleibt bestehen) Rot-Punkte
zurückgibt, z. B. „Tour-Schritt n: Marke `<selector>` nicht gefunden“.

## Ursache je Marke belegen, nicht vermuten
1. Zum Schritt die Tour-Datei im Handbuch (`docs/manual/.../<WP>.json`: Seite, `selector`) und die Ablaufstelle des Smoke
   (Navigation per App-Ereignis, dann Warten auf den Selektor mit Frist) lesen.
2. Drei Klassen unterscheiden, jede hat einen anderen Fix:
   a) Seite gebaut, Marke steht aber nur in einem Zweig, der erst nach einem Backend-Aufruf rendert (`{status && …}`): Fehlt die
      Gegenstelle (Gateway-Methode nicht registriert, Tauri-Gruppe nicht in `gruppen()`), bleibt die Marke aus. Fix = Gegenstelle
      anschließen (neue Datei im Gateway-Kanalordner, Tauri-Gruppe eintragen), Test über den echten Aufrufweg; die Seite NICHT
      umbauen, damit die Marke auch im Fehlerfall erscheint (das wäre Lockern der Tour).
   b) Seite/Gruppe existiert im UI gar nicht (Baustein nur im Rust-Kern): kleinste ehrliche Seite mit der Marke an der Wurzel,
      lesende Gateway-Methoden, Tauri-Gruppe, Handbuch-Text anpassen (steht dort „keine eigene Seite“), `manual-gen` neu laufen lassen.
   c) Seite vorhanden, aber nicht erreichbar (Route/Navigationseintrag fehlt): Eintrag ergänzen.
3. Tour-Schritte nie löschen oder lockern; ist der Fix groß, Größe und Rest ehrlich im Bericht, kleinste erfüllende Variante trotzdem liefern.

## Ablauf
- Eigener Worktree von `feat` (`git worktree add ../wt/<name> -b claw/<name> feat/…`), außerhalb der Paket-Queue: keine `.pfade`/Statuszelle,
  die Pfadfreigabe steht im Brief (neue Dateien in genannten Ordnern frei, alles andere per Rückfrage).
- Brief mit Befund (Datei:Zeile), Klassen-Hypothese als „prüfen, nicht übernehmen“, Beleg-Befehl (`tools/claw-gui-smoke.sh --touren <tour>` über
  `rb.sh`) und Bericht-Pfad. Ein Claude-Worker; gleichzeitig baut eine andere Spur Routen/Navigation → vor dem Einbau `feat` einmischen,
  in gemeinsamen Routen-Dateien beide Seiten behalten.
- Einbau unter der int-Sperre (Rezept wie integ), `NACHARBEIT-OK` (`<SHA> <Ursache, Fix, Beleg>`) erst NACH dem Push schreiben.

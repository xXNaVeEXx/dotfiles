# Nacharbeit nach rotem Gesamttest der Welle (Tour-Marken, GUI-Smoke)

Gilt, wenn der Leitstand nach dem Gesamttest einer Welle einer schon fertig gemeldeten Spur (DONE bleibt bestehen) Rot-Punkte
zurückgibt, z. B. „Tour-Schritt n: Marke `<selector>` nicht gefunden“.

## Ursache je Marke belegen, nicht vermuten
1. Zum Schritt die Tour-Datei im Handbuch (`docs/manual/.../<WP>.json`: Seite, `selector`) und die Ablaufstelle des Smoke
   (Navigation per App-Ereignis, dann Warten auf den Selektor mit Frist) lesen.
2. Vier Klassen unterscheiden, jede hat einen anderen Fix:
   a) Seite gebaut, Marke steht aber nur in einem Zweig, der erst nach einem Backend-Aufruf rendert (`{status && …}`): Fehlt die
      Gegenstelle (Gateway-Methode nicht registriert, Tauri-Gruppe nicht in `gruppen()`), bleibt die Marke aus. Fix = Gegenstelle
      anschließen (neue Datei im Gateway-Kanalordner, Tauri-Gruppe eintragen), Test über den echten Aufrufweg; die Seite NICHT
      umbauen, damit die Marke auch im Fehlerfall erscheint (das wäre Lockern der Tour).
   b) Seite/Gruppe existiert im UI gar nicht (Baustein nur im Rust-Kern): kleinste ehrliche Seite mit der Marke an der Wurzel,
      lesende Gateway-Methoden, Tauri-Gruppe, Handbuch-Text anpassen (steht dort „keine eigene Seite“), `manual-gen` neu laufen lassen.
   c) Seite vorhanden, aber nicht erreichbar (Route/Navigationseintrag fehlt): Eintrag ergänzen.
   d) Nach Fix a) bleibt die Marke rot: Gateway startet im Smoke gar nicht (Umgebung des Smoke-Skripts, z. B. Datei-SecretStore ohne
      Bestätigungsvariable). Belegen per Probelauf mit direktem `claw_rpc(<Methode>)` – die Antwort nennt den Startfehler. Fix im
      Smoke-Skript (eine Zeile, vom Leitstand/Orchestrator freigegeben); trifft alle Gateway-abhängigen Marken, auch fremder Spuren →
      im Journal melden, bei Duplikat nach dem Einmischen nur eine Zeile behalten.
3. Tour-Schritte nie löschen oder lockern; ist der Fix groß, Größe und Rest ehrlich im Bericht, kleinste erfüllende Variante trotzdem liefern.

## Ablauf
- Eigener Worktree von `feat` (`git worktree add ../wt/<name> -b claw/<name> feat/…`), außerhalb der Paket-Queue: keine `.pfade`/Statuszelle,
  die Pfadfreigabe steht im Brief (neue Dateien in genannten Ordnern frei, alles andere per Rückfrage).
- Brief mit Befund (Datei:Zeile), Klassen-Hypothese als „prüfen, nicht übernehmen“, Beleg-Befehl (`tools/claw-gui-smoke.sh --touren <tour>` über
  `rb.sh`) und Bericht-Pfad. Ein Claude-Worker; gleichzeitig baut eine andere Spur Routen/Navigation → vor dem Einbau `feat` einmischen,
  in gemeinsamen Routen-Dateien beide Seiten behalten.
- Review ab ~500 Zeilen wie bei Paketen (anderes Modell); typische Funde: veraltete „Noch nicht angeschlossen“-Sätze in Handbuch-JSONs
  und Tour-Texte, die mehr versprechen als die Seite kann → Reviewer-Auftrag ausdrücklich darauf hinweisen; Sammel-Nacharbeit im selben Worktree.
- Einbau (kein wpq-integ für Nicht-Pakete): Python-Skript importiert `wpq.py` per importlib, hält `with m.lock(m.LK / "int.lock")`,
  prüft int auf `m.BASE` und HEAD == origin, `m.git(m.INT, "merge", "--no-ff", "-m", <Betreff ≤72>, …, <Branch>)`, dann `m.push(print)`.
  So committet der Orchestrator nie selbst in int (und der Bash-Hook blockt Befehle mit dem Text „git commit“). Skript danach löschen.
- `NACHARBEIT-OK` (`<SHA> <Ursache, Fix, Beleg>`) erst NACH dem Push schreiben; der Leitstand holt die Datei ab (sie verschwindet) –
  Abholung im `STAND.md` des Leitstands nachlesen, nicht neu schreiben.

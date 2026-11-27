# GUI-Tour-Smoke im frischen Datenordner: Fixtures statt Seiten umbauen

Ergänzt references/wellen-gate-nacharbeit.md (Abschnitt „Typische Ursachen eines roten Gesamttests“).

## Vorgehen bei roten Tour-Schritten („Marke fehlt“)
1. Smoke um eine Diagnose-Ausgabe je Fehlschritt erweitern (Seitentext ~160 Zeichen + vorhandene `data-tour`-Marken).
   Ein Lauf zeigt dann, ob die Seite Fehlertext, Leerzustand oder das falsche Fenster zeigt.
2. Fehlertext „… konnte nicht geladen werden“ zuerst als Gateway-Startproblem lesen (Beschreibung im Text vollständig
   lesen): Läuft die App ohne Test-Feature, verweigert der Gateway das Datei-Geheimnis-Backend ohne ausdrückliche
   Bestätigungs-Variable → im Smoke-Skript neben `LUMI_SECRET_STORE=file` die Bestätigung exportieren (Temp-Ordner,
   nichts Echtes im Klartext). Bei Merge mit einer anderen Spur, die dieselbe Zeile ergänzt hat: genau eine Zeile behalten.
3. Leerzustand („kein Gespräch“, „keine Bots“) = der frische Datenordner hat keine Daten: Der Smoke legt die Fixtures
   selbst an, bevor die Touren laufen (Tauri-Befehl `claw_rpc` per `window.__TAURI_INTERNALS__.invoke`; Bot erstellen
   liefert die Sitzungs-ID), und setzt für Seiten, die die Sitzung aus der URL lesen, `history.replaceState(null,"","/?sitzung=<id>")`
   vor der Navigation. Die Tour-Erwartungen und Seiten bleiben unverändert (nie Marken streichen).
4. Zeigt eine Komponente trotz Fixture nichts (z. B. Statusleiste rendert bei leerer Eintragsliste null), den Datenweg
   zurückverfolgen: Die UI kennt oft nur die Sitzungs-ID, die RPC erwartete den Schlüssel. Dann die RPC um einen zweiten
   Zugang per ID erweitern (genau eines von beiden, sonst invalid_params, mit Rust-Test) statt im Smoke zu tricksen;
   Fixture-Daten über den echten Schreib-RPC (z. B. Patch mit dem Haupt-Sitzungsschlüssel des Bots) anlegen.
5. Stimmen die Roh-Antworten der RPCs (per Diagnose ausgegeben), die Komponente aber trotzdem leer bleibt: Zuerst die
   UI-Annahmen über Pflichtfelder prüfen (der Server lässt leere/Null-Felder weg, ein Eintrag ohne z. B. `inputTokens`
   wird von zu strengen Typwächtern verworfen → nur das wirklich nötige Feld prüfen, Test mit „sparsamem“ Eintrag),
   dann ein veraltetes `ui/dist` auf dem Build-Host: Der Smoke baut die Oberfläche nur bei fehlendem dist neu →
   zusätzlich neu bauen, wenn irgendeine Datei in `ui/src` jünger als `ui/dist/index.html` ist. Beleg: derselbe
   Tourlauf grün, sobald der Smoke „baue die Oberfläche …“ meldet.
6. Fremde, bereits abgenommene Seiten (andere Spur) nur melden, nicht anfassen.
7. Sporadisch rote ERSTE Navigation (nur der erste Schritt rot, alles danach grün, lokal und in anderen CI-Läufen
   grün): Die Navigation läuft über ein Ereignis (Tauri `app://navigate` per `plugin:event|emit`), dessen Listener
   die UI erst asynchron nach dem ersten Rendern anmeldet — ein Ereignis direkt nach „Fenster zeigt Oberfläche“ geht
   verloren und wird nicht wiederholt. Fix im Smoke-Skript, nicht in der Seite: Hilfsfunktion „navigiere und warte“,
   die das Ereignis alle ~5 s erneut sendet, bis die Marke da ist oder die Frist (Startseite ~60 s) endet; Fehlt die
   Seite wirklich, bleibt der Prüfpunkt rot (Diagnosezeile mit Seitentext, URL, Marken). Ursache vor dem Fix im Skript
   und im Listener (`useEffect` in der App-Wurzel) belegen; ohne Reproduktion ehrlich als „Vermutung“ markieren.
   Solche Nacharbeiten bei laufendem CI-Wiederholungslauf nur auf dem Nacharbeit-Zweig vorbereiten, nicht pushen.

## Prüfläufe für die eigenen Änderungen
- `cargo fmt --check` über das ganze Crate schlägt an fremden, vorbestehenden Dateien an: nur die eigenen Dateien mit
  `rustfmt --edition 2021 --check <Dateien>` prüfen und fremde Formatierung nicht mitreformatieren.
- Wird ein Remote-Lauf mitten im Bau mit „Terminated“/RB_EXIT=143 beendet (kein Fehler im Log), ist das ein externer
  Abbruch: unverändert neu starten, nicht den Code verdächtigen.
- Nach einem Merge/Wechsel meldet der Bau „couldn't read …/mod.rs“ (veralteter Modulscan): `touch crates/*/build.rs src-tauri/build.rs`
  und neu starten.
- Tests, die einen echten Host/Agenten starten, lesen die Rechner-Konfiguration (`~/.pi/agent/mcp.json`) mit und
  bekommen zusätzliche MCP-Meldungen bzw. überschriebene Werkzeuge: im Test-Aufbau MCP abschotten (`no_mcp = true`
  bzw. `disabledBuiltinExtensions:["mcp"]` im `lumi_init`) und ALLE gleichartigen Tests per `grep -rn lumi_init
  crates/*/tests src-tauri` mitprüfen. Tests mit „übersprungen, wenn dist fehlt“ fallen erst im Gesamtlauf auf, wenn der
  Host gebaut ist: Beleg immer mit gebautem Host und Laufzeit > 0,5 s (früher Ausstieg = kein Beleg).
- Mehrere Skripte, die dasselbe Binary im selben Ziel-Ordner bauen (E2E vs. GUI-Smoke mit anderen Features), überschreiben
  sich gegenseitig → eigene Kopie des Binaries je Skript (`lumi-testmode`).

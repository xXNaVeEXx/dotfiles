# GUI-Tour-Smoke im frischen Datenordner: Fixtures statt Seiten umbauen

Ergänzt references/wellen-gate-nacharbeit.md (Abschnitt „Typische Ursachen eines roten Gesamttests“).

## Vorgehen bei roten Tour-Schritten („Marke fehlt“)
1. Smoke um eine Diagnose-Ausgabe je Fehlschritt erweitern (Seitentext ~160 Zeichen + vorhandene `data-tour`-Marken).
   Ein Lauf zeigt dann, ob die Seite Fehlertext, Leerzustand oder das falsche Fenster zeigt.
2. Fehlertext „… konnte nicht geladen werden“ zuerst als Gateway-Startproblem lesen (Beschreibung im Text vollständig
   lesen): Läuft die App ohne Test-Feature, verweigert der Gateway das Datei-Geheimnis-Backend ohne ausdrückliche
   Bestätigungs-Variable → im Smoke-Skript neben `LUMI_SECRET_STORE=file` die Bestätigung exportieren (Temp-Ordner,
   nichts Echtes im Klartext).
3. Leerzustand („kein Gespräch“, „keine Bots“) = der frische Datenordner hat keine Daten: Der Smoke legt die Fixtures
   selbst an, bevor die Touren laufen (Tauri-Befehl `claw_rpc` per `window.__TAURI_INTERNALS__.invoke`; Bot erstellen
   liefert die Sitzungs-ID), und setzt für Seiten, die die Sitzung aus der URL lesen, `history.replaceState(null,"","/?sitzung=<id>")`
   vor der Navigation. Die Tour-Erwartungen und Seiten bleiben unverändert (nie Marken streichen).
4. Zeigt eine Komponente trotz Fixture nichts (z. B. Statusleiste rendert bei leerer Eintragsliste null), den Datenweg
   zurückverfolgen: Die UI kennt oft nur die Sitzungs-ID, die RPC erwartete den Schlüssel. Dann die RPC um einen zweiten
   Zugang per ID erweitern (genau eines von beiden, sonst invalid_params, mit Rust-Test) statt im Smoke zu tricksen;
   Fixture-Daten über den echten Schreib-RPC (z. B. Patch mit dem Haupt-Sitzungsschlüssel des Bots) anlegen.
5. Fremde, bereits abgenommene Seiten (andere Spur) nur melden, nicht anfassen.

## Prüfläufe für die eigenen Änderungen
- `cargo fmt --check` über das ganze Crate schlägt an fremden, vorbestehenden Dateien an: nur die eigenen Dateien mit
  `rustfmt --edition 2021 --check <Dateien>` prüfen und fremde Formatierung nicht mitreformatieren.
- Wird ein Remote-Lauf mitten im Bau mit „Terminated“/RB_EXIT=143 beendet (kein Fehler im Log), ist das ein externer
  Abbruch: unverändert neu starten, nicht den Code verdächtigen.
- Nach einem Merge/Wechsel meldet der Bau „couldn't read …/mod.rs“ (veralteter Modulscan): `touch crates/*/build.rs src-tauri/build.rs`
  und neu starten.

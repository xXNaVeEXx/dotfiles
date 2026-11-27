# localsearch / tinysparql-Index (GNOME-Dateiindexer) — read-only prüfen

Gilt für `localsearch-3` (User-Unit `localsearch-3.service`, Bus `org.freedesktop.LocalSearch3`, Kind `localsearch-extractor-3`), Bibliothek `tinysparql` (früher tracker / libtracker-sparql). Arch: Paket `localsearch`; Einstellungen unter `gsettings list-recursively org.freedesktop.Tracker3.Miner.Files`.

## Dateien
- Index: `~/.cache/tracker3/files/meta.db` (+ `-wal`, `-shm`), mehrere GB bei rekursivem `$HOME`; Fehlerordner `~/.cache/tracker3/files/errors/`.
- Öffnen: `sqlite3 "file:$HOME/.cache/tracker3/files/meta.db?mode=ro"` — nie schreibend, der Indexer hält die DB offen.
- Der Index ist ein reproduzierbarer Cache: Verlust kostet nur Neuindizierung, keine Nutzerdaten.

## Schema
- Jede Klasse des Graphen `tracker:FileSystem` = Tabelle `"http://tracker.api.gnome.org/ontology/v3/tracker#FileSystem_<Klasse>"` (z. B. `…_nie:DataObject`, `…_nfo:FileDataObject`, `…_nie:InformationElement`, `…_nfo:Folder`, `…_rdfs:Resource`), Schlüssel `ID` = Zeile in `Resource(ID, Uri, BlankNode)`.
- **Einwertige Properties liegen in der Tabelle ihrer Domain-Klasse**, nicht der spezifischeren: `nfo:belongsToContainer`, `nie:dataSource` → `…_nie:DataObject`; `nfo:fileCreated/fileSize/fileLastModified/fileName` → `…_nfo:FileDataObject`. Mehrwertige Properties = eigene Tabellen `…_<Domain>_<property>` (z. B. `…_nie:InformationElement_nie:isStoredAs`). Tabellen mit Property-Namen im Namen suchen: `SELECT name FROM sqlite_master WHERE sql LIKE '%<prop>%'`.
- Datei-/Verzeichnis-Identität = `urn:fileid:<fs-uuid>:<inode>` als `nie:InformationElement` mit `nie:isStoredAs <file-URL>`; Dateien zeigen mit `nfo:belongsToContainer` auf die Identität ihres Ordners. Wird ein Verzeichnis gelöscht und neu angelegt (Build-Tools legen `incremental/`-Ordner ständig neu an), entsteht eine **zweite Identität für dieselbe URL** — die alte bleibt mit Typ und `isStoredAs` stehen.

## Nützliche Abfragen
- ID aus Fehlermeldung auflösen: `SELECT ID, Uri FROM Resource WHERE ID IN (…)`.
- Typisiertheit einer Identität: Zählzeilen in `…_nie:InformationElement`, `…_nfo:Folder`, `…_rdfs:Resource` für `ID=?`.
- Konsistenz `belongsToContainer` (alle Dateien): Datei-URL muss mit `Container-URL || '/'` beginnen, sonst „verwaiste/alte Identität“; Ergebnis nach Zustand gruppieren.
- Doppelte Identitäten: `SELECT "nie:isStoredAs", COUNT(*) FROM "…_nie:InformationElement_nie:isStoredAs" GROUP BY 1 HAVING COUNT(*) > 1` → Anzahl veralteter Identitäten (unter `target/` = Build-Artefakte).

## Bekannte Absturzursache (localsearch 3.12.0, tinysparql 3.12.0)
- Meldung im Journal: `Could not execute sparql: Unexpected error with batch, elements are:` + `Error obtained was: <prop>: Unable to insert multiple values on single valued property (old: X, new: Y)` → `ERROR:../localsearch/src/indexer/tracker-indexer.c:…:sparql_buffer_flush_cb: code should not be reached` → `Bail out!` (SIGABRT, `si_code SI_TKILL`).
- Kette: SQLite-Funktion `SparqlUpdateValue` (tracker-db-interface-sqlite.c) meldet die Verletzung nur als generischen Fehler (`sqlite3_result_error`, kein Code) → DB-Interface `QUERY_ERROR` → `TRACKER_SPARQL_ERROR_QUERY_FAILED` → `tracker_sparql_buffer_flush_finish` verpackt als „Unexpected error with batch“ (Code bleibt) → Indexer behandelt nur CORRUPT/CONSTRAINT/NO_SPACE, sonst `g_assert_not_reached`. Auf tinysparql-master liegt die Prüfung in der SPARQL-Schicht und liefert `CONSTRAINT` → kontrolliertes Ende statt Abort; Fixstand anhand der Tags prüfen.
- Auslöser auf dieser Maschine: `index-recursive-directories = ['$HOME']` plus Cargo-Builds (`target/` mit hunderttausenden Dateien, Ordner ständig neu angelegt) → Absturzserien während Builds, `Restart=on-failure` startet sofort neu (NRestarts hoch), 1–1,4 GB RAM-Spitzen je Neuindizierung.

## Fix-Optionen (anbieten, Nutzer entscheidet)
1. `omarchy-crash-mute '/usr/lib/localsearch-3'` — nur Benachrichtigungen aus.
2. Build-Ordner aus dem Index nehmen: `gsettings get org.freedesktop.Tracker3.Miner.Files ignored-directories` (liefert ein JSon-Array; Bestehende Liste übernehmen) → `gsettings set org.freedesktop.Tracker3.Miner.Files ignored-directories "[…, 'target', 'node_modules']"`. Beseitigt den Auslöser, schrumpft Index und RAM; Build-Artefakte verschwinden aus der GNOME-Suche.
3. Upstream-Issue bei GNOME localsearch (nur mit explizitem JA; vorher Distribution-Tracker nach `sparql_buffer_flush_cb` durchsuchen).

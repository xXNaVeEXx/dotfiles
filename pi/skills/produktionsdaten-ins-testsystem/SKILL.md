---
name: produktionsdaten-ins-testsystem
description: Echte Mandanten-Daten eines Kundenservers pseudonymisiert in eine Test-Datenbank (Postgres, mandantenfähige App) übernehmen oder dort ersetzen — Klären, nur lesend erkunden, Sicherung, Abzug ohne Geheimnis- und Kommunikationstabellen, Zwischen-DB samt Migration, lesbare nie zustellbare Ersatzwerte, katalog-erzeugtes Ersetzen mit Probe auf einer Ziel-Kopie, Dateien, Nachkontrolle und Aufräumen; use when the user wants customer or production data loaded into a test/staging system, a test copy refreshed, or real data pseudonymized for testing.
---

# produktionsdaten-ins-testsystem

# Produktionsdaten pseudonymisiert ins Test-System übernehmen

Klasse: Daten echter Mandanten (Firmen) aus einer Kundeninstanz in ein Test-System laden — ergänzen oder eine ältere
Kopie ersetzen —, ohne dass das Test-System danach echte Menschen erreicht oder echte Zugänge benutzt.
Grundsatz für den ganzen Ablauf: Personenbezogene Inhalte nie in den Agenten-Kontext holen. Abfragen liefern nur
Summen, Tabellen- und Spaltennamen; Daten fließen nur zwischen Datenbanken und Dateien.
Projektwerte (Server, Tabellen, Indizes) für das mag-tech-monorepo: `references/mag-tech.md`.

## 0. Einmal klären, gebündelt (mit Vorschlag je Punkt)
1. Umfang: welche Mandanten. 2. Ersetzen oder ergänzen. 3. Ausschlüsse (Vorschlag aus §1). 4. Ersatzwerte für
   Kontaktwege (Vorschlag: E-Mail und Telefon ersetzen, Namen und Adressen echt lassen). 5. Dateien mitnehmen.
6. Hinweis: Hat das Test-System einen externen KI-Anbieter, gehen die Daten beim Testen dorthin.
- Ersatzwerte müssen für Menschen lesbar sein, keine Codes oder Hashes: E-Mail `vorname.nachname@beispiel.example`
  (TLD `.example` ist dauerhaft für Beispiele reserviert, nie zustellbar), Firmen `info@<firmenname>.example`,
  Telefon aus den Filmrufnummern der Bundesnetzagentur (dauerhaft nie vergeben): Ortsnetz 030 23125 000–999,
  040 66969 000–999, 069 90009 000–999, 089 99998 000–999, 0221 4710 000–999; mobil 0176 040690 00–99,
  0171 39200 00–99.

## 1. Nur lesend erkunden (`SET default_transaction_read_only = on;`, nur Summen)
- Beide Seiten: Schemas (liegt der Identity-Provider in derselben DB?), Tabellen mit `n_live_tup` und Größe, Mandanten
  mit Kennzahlen, gleiche Mandanten-IDs im Ziel (ältere Kopie), Ablage der Dateien (Volume oder S3; nur
  Variablen-NAMEN der Umgebung ausgeben).
- Geheimnis-Spalten finden: `column_name ~* '(passw|token|secret|api_?key|smtp|imap|webhook|endpoint|p256dh|private)'`.
- Ausschließen (nur die Daten, das Schema bleibt): Identity-Provider-Schema, E-Mail-Konten und -Inhalte,
  Messenger-Kanäle und -Gespräche, Push-Abos und -Schlüssel, KI-Chats/-Läufe/-Guthaben, Änderungsprotokoll,
  Lizenzen, Buchhaltungs- und Bankzugänge, instanzweite Tabellen (Migrationsliste, globale Parameter,
  Absender-Einstellungen, Freigaben). Grund: Sonst ruft das Test-System echte Postfächer ab, nimmt echten Bots die
  Nachrichten weg, schickt Push auf echte Handys oder bricht die Lizenzbindung.

## 2. Sichern
- Ziel komplett mit `pg_dump -Fc` auf einen Rechner außerhalb des Pods schreiben und prüfen
  (`pg_restore --list <datei> | grep -c "TABLE DATA"`). Direkt vor dem echten Lauf noch einmal sichern.

## 3. Abzug und Zwischen-DB
- Quelle: `pg_dump -Fc --no-owner --no-privileges --schema=<app-schemas> --exclude-table-data=<muster>…` als
  ssh-Strom direkt in eine lokale Datei (kein Umweg über /tmp des Servers).
- Lokale Zwischen-DB: Erweiterungen (z. B. `pg_trgm`) VOR dem Restore anlegen, weil `--schema` keine Erweiterungen
  mitnimmt und sonst Indizes fehlen. Dann die Migrationen des Ziel-Standes der App laufen lassen und die Spaltenliste
  mit dem Ziel vergleichen (`information_schema.columns`, `LC_ALL=C sort` + `comm`): 0 Unterschiede.

## 4. Pseudonymisieren (im Zwischenstand, eine Transaktion, `session_replication_role = replica`)
- Hilfsfunktionen in einem eigenen Schema: Kurzname (Kleinbuchstaben, Umlaute ausgeschrieben, sonst Punkt),
  Telefon normalisieren plus Zuordnungstabelle (gleiche echte Nummer → gleiche Ersatznummer, fortlaufend über die
  Blöcke), Mail-Zuordnung alt → neu, Ersetzer für E-Mails und Telefonnummern in Freitext, JSON-Ersetzer nur für
  Schlüssel mit telefon/phone/fax im Namen (so bleibt z. B. die IBAN in Rechnungs-Schnappschüssen unberührt).
- Eindeutige Indizes beachten: Ersatz-Mails je Mandant pro ZEILE vergeben und gleiche Namen mit `.2`, `.3` eindeutig
  machen; eine Zuordnung je alter Adresse kollidiert, sobald zwei Personen gleich heißen.
- In jedem Skript `\set VERBOSITY terse`. Grund: Fehler mit DETAIL zeigen echte Werte im Agenten-Kontext.
- Portal- und Einladungs-Token neu würfeln, damit echte Links auf dem Test-System nicht greifen.
- Nachkontrolle über ALLE Text-/JSON-Spalten der übernommenen Tabellen (Abfragen per `format()` aus dem Katalog
  erzeugen): E-Mails, die nicht auf `.example` enden = 0; Telefon-Spalten nur noch Ersatzbereiche (Werte ohne
  Ziffern sind Platzhalter). Treffer der Telefonsuche in Kurzname-/URL-Spalten sind Fehlalarme.

## 5. Ersetzen-Skript aus dem Katalog erzeugen (`scripts/erzeuge_import.py`)
- Vorlage `scripts/erzeuge_import.py` in den Arbeitsordner kopieren, Mandanten und Ausschlüsse oben im Skript
  setzen (Projektwerte: `references/mag-tech.md`); die Katalog-Eingaben und ihre Abfragen stehen im Kopf des Skripts.
  Die Bezeichner-Prüfung im Skript beibehalten: Der Schreib-Hook meldet SQL aus f-Strings sonst als Injektion.
- Eingaben: Tabellen mit Daten im Abzug, FK/PK/Spalten des Ziels. Kopien der Quelltabellen ins Schema `imp`
  (`CREATE TABLE … AS`, ohne Constraints) und davon einen Dump mit dem pg_dump der ZIEL-Hauptversion (z. B. aus einem
  Postgres-Container). Grund: Neuere Clients schreiben Einstellungen und ein Archivformat, das ältere pg_restore
  ablehnen.
- EINE Transaktion: (1) Zielzeilen der Mandanten löschen, die es in der Quelle nicht mehr gibt — Kinder zuerst;
  Besitz über die Mandanten-Spalte oder einen Eltern-Fremdschlüssel, NIE über Verweise auf Benutzer oder Mandanten
  (Ersteller-Spalten sind kein Besitz, sonst fehlen z. B. alle Adressen fremder Ersteller). (2)
  `session_replication_role = replica`, Upsert `ON CONFLICT (pk) DO UPDATE` der Quellzeilen — nur Zeilen MIT
  Mandanten-ID; instanzweite Zeilen (Mandanten-ID leer) bleiben die des Ziels, weil sie dort andere IDs haben und
  sonst eindeutige Indizes brechen oder doppelte Vorgaben entstehen. (3) zurück auf `origin`, Fremdschlüssel NUR der
  übernommenen Zeilen prüfen (das Ziel hat oft eigene ältere Lücken), Zählung Quelle = Ziel je Tabelle, bei jeder
  Abweichung `RAISE EXCEPTION` → nichts übernommen.
- Benutzer und Mandanten nie löschen, nur aktualisieren. Anmelde-Konten des Test-Systems (Benutzer mit Konto beim
  Identity-Provider) samt Rollen-/Gruppenzeilen unverändert lassen; veraltete Ziel-Benutzer derselben Person geben
  vor dem Upsert eindeutige Felder frei (Login-ID, zugeordnetes Fahrzeug o. ä.).
- Hängende Verweise der Quelle selbst (z. B. auf ein gelöschtes Original-Dokument) im Schema `imp` auf NULL setzen,
  wenn das Ziel dafür einen Fremdschlüssel hat.

## 6. Probe auf einer Kopie des Ziels
- Sicherung lokal in eine Probe-DB spielen; Fremdschlüssel, die dort wegen alter Lücken nicht anlegbar sind, als
  `NOT VALID` nachziehen (aus `pg_restore -L <liste> -f -`). Grund: Sonst prüft die Probe weniger als das Ziel.
- Erfolg: COMMIT, 0 Fremdschlüssel-Lücken, 0 Abweichungen, Anmelde-Konten und eigene Testdaten (KI-Chats u. ä.)
  unverändert, und KEINE Tabelle außerhalb der Übernahme geschrumpft (Zeilenzahl je Tabelle vorher/nachher).
  Grund: Kaskaden-Löschungen in behaltenen Tabellen zeigt nur dieser Vergleich.

## 7. Echter Lauf
- `imp`-Dump per `kubectl exec -i … pg_restore`, Skript per stdin, danach Sequenzen nachziehen (Resync-Skript der
  App), Schema `imp` löschen, Kontrolle wie in der Probe, App-Logs der letzten Minuten auf Fehler prüfen.
- Dateien: nur die von übernommenen Zeilen referenzierten, als tar-Strom zwischen den Pods
  (`tar -cf - -T <liste>` | `tar -xf - --skip-old-files`), danach Namen und Größen beider Seiten vergleichen und
  Fehlendes oder Abweichendes einzeln nachholen. Dateinamen können Leerzeichen enthalten (beim Vergleich am letzten
  Leerzeichen trennen).

## 8. Aufräumen und berichten
- Zwischen-DBs, Probe-DBs und Datendateien löschen (lokal und /tmp der Pods); Skripte ohne Daten behalten,
  Sicherungen als Rückweg nennen.
- Bericht: Tabelle je Mandant (Zahlen), Regeln der Ersatzwerte mit erfundenen Beispielen, was unverändert blieb, was
  ausgeschlossen ist, Klickweg zum Testen, Rückweg.

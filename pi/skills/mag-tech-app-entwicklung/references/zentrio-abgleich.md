# zentrio-app mit der besichtigungs-app abgleichen (Fork-Resync)

zentrio-app ist eine generische Kopie der besichtigungs-app (neutrale Texte, eigenes Funktions-Modulsystem, eigene Navigation, Pflichtenheft, eigene Migrationsnummern). `packages/domain-*` sind geteilt und wirken in beiden Apps automatisch — portiert wird nur die App-Ebene (`src`, `__tests__`, `e2e`, `messages`, `scripts`, `drizzle`).

## 1. Lücke messen, bevor portiert wird
- Erst prüfen, ob Einzel-Cherry-Picks überhaupt tragen: je Commit den Patch auf `apps/zentrio-app/` umschreiben und `git apply -3 --check`. Melden die meisten „does not exist in index“, fehlt zentrio der Unterbau aus älteren Commits — dann ist Datei-Abgleich statt Cherry-Pick nötig. Grund: Ein Commit setzt fast immer Dateien früherer, nie portierter Commits voraus.
- Port-Grad je Commit: Anteil der hinzugefügten Zeilen (die in besichtigung noch existieren), die in der zentrio-Datei vorkommen. ≥90 % = portiert, 20–90 % = teilweise, <20 % = fehlt. docs/, CHANGELOG, k8s/, deploy/ ausklammern.
- Shallow-Repo beachten: Dateien vor der Graft-Grenze sind keinem Commit zuordenbar; die Bewertung „1:1 übernehmbar oder anpassen“ dann je Datei/Feature statt je Commit führen.

## 2. Datei-Level-Abgleich (Worktree, nie im Haupt-Checkout)
- Jede Datei in eine Kategorie: GLEICH, VERALTET (zentrio-Blob kommt in der besichtigungs-Historie vor → besichtigungs-Fassung kopieren), ABWEICHEND (zentrio-eigene Änderung), NUR-B (kopieren), NUR-Z (zentrio-eigen, nie anfassen).
- ABWEICHEND per `git merge-file -L zentrio -L basis -L besichtigung <z> <basis> <b>` mergen; Basis = die per difflib ähnlichste historische besichtigungs-Fassung (`git log --format=%H -- <pfad>` + `git show`). `messages/de.json` per Schlüssel-Merge (zentrio-Werte gewinnen, neue Schlüssel dazu, `ensure_ascii=False`).
- `*.generated.ts` nicht mergen, sondern nach dem Abgleich neu erzeugen (`npm run ki:hilfe-texte`).
- Ausschlussliste für besichtigungs-Seiten, die zentrio umbenannt hat (z. B. `hilfe/besichtigung` ↔ zentrio `hilfe/termine`).
- Merge-Stand sofort als lokalen WIP-Commit sichern (`git add -A apps/zentrio-app && git commit -F … --no-verify`), damit Konfliktlösungs-Worker eigene Worktrees auf diesem Commit bekommen.
- Konfliktmarker zählen nur als `^<<<<<<< `/`^=======$`/`^>>>>>>> `; das Merge-Log kann Schein-Konflikte zeigen (Escape- vs. Roh-Steuerzeichen) → Datei auf Marker prüfen.

## 3. Konflikte lösen (Regel je Hunk)
- Code/Logik/Bugfix: besichtigungs-Seite. zentrio-Eigenheiten behalten: `useFunktionen`/`FunktionsGate`/`src/config/funktionen.ts`, `nav-items.ts`/`island-nav-items.ts`/`NavSearch`, Pflichtenheft, Kalender-Typ-Ausblendung, `zentrio-*`-Helfer, `neutralisiereUebergabeText`, Marke „Zentrio“.
- Häufigster Hunk-Typ: besichtigung holt Text per `t('…')`, zentrio hatte ihn neutral hartkodiert → `t()` übernehmen und den neutralen Text in `de.json` setzen. Deshalb `de.json` in GENAU EINER Spur zentral neutralisieren; die Dateispuren liefern nur eine TSV-Liste `Schlüssel<TAB>Wunschtext`.
- Spuren bei vielen Dateien thematisch schneiden (Hilfe-Seiten / Termine+Kalender+Kunden / Angebote+Aufträge+Rechnungen / Umsatz+Stunden+Dashboard+KI-Tools / Shell+Navigation+Rechte+Einstellungen / Rest), je Spur eigener Worktree auf dem WIP-Commit, gemeinsamer Brief als Datei.

## 4. Begriffe neutralisieren (nur sichtbare Texte)
- Besichtigung→Termin (Genus: die→der), LKW→Fahrzeug (der→das), Fuhrpark→Fahrzeuge, Umzug (eigenständig)→Auftrag, Umzugsfirma/Möbelpacker neutral. Schlüssel, IDs, Pfade, Routen, Bezeichner nie.
- Was zentrio heute schon sichtbar zeigt, bleibt (vorher per `git grep -c <begriff> test -- apps/zentrio-app/src apps/zentrio-app/messages` zählen): „Beladeadresse“, „Umzugsliste“ sind dort etabliert → nicht pauschal ersetzen; hat der Schlüssel in der alten zentrio-de.json schon eine neutrale Fassung, die nehmen.
- Nach dem Abgleich auch die konfliktfrei kopierten Dateien prüfen: Zahl sichtbarer Umzugsbegriffe je Datei gegen `test:` vergleichen; NEU/MEHR-Treffer (Einführungen, KI-Benchmark, Status-Board, Karte) nachziehen.
- Namensraum `Touren`: der Wächter `__tests__/components/einfuehrung-tour-texte.test.ts` verlangt `de.json`-Touren wortgleich mit `src/lib/einfuehrungen/*.ts` → Änderungen in beiden Quellen synchron (per Skript alt→neu ersetzen).
- Kette bug-bereiche ↔ `rechte-wirkung.ts` ↔ Icon-Map `RechteEditorVoll.tsx` matcht per exaktem String → immer alle drei gleich umbenennen.

## 5. Sprache, Migrationen, Rest
- zentrio ist nur deutsch (`src/i18n/request.ts` fest `de`). Mit dem Abgleich kommen Sprachwahl-Karte, Sprach-Abgleich in ClientLayout und `actions/sprache.ts` mit — entfernen (samt Einbindung), solange zentrio deutsch bleibt; `en.json`/`ru.json` liegen lassen, weil übernommene Tests sie importieren (ihre Übersetzungen sind nicht neutralisiert).
- `src/lib/app-marke/manifest.ts` `STANDARD_NAME` auf „Zentrio“ setzen.
- Fehlende Migrationen als nächste zentrio-Nummer anlegen, Kopfzeile `-- <nr>_<name>.sql (MAG-…)` + `-- Dieselbe Migration wie apps/besichtigungs-app/drizzle/<datei> —`, Kommentar-Begriffe neutral.
- Neue Seiten (Einsatzplanung, Karte, Stammdaten-Unterseiten, Hilfe) brauchen Einträge in zentrio-Nav und ggf. einen Funktions-Schlüssel in `src/config/funktionen.ts`.
- zentrio-Wächter mitprüfen: `__tests__/i18n-rahmen.test.ts`, `mobile-funktionsabdeckung`, Rechte-Wächter-Ausnahmeliste.
- Doku: Status-Datei `apps/zentrio-app/docs/status/JJJJ-MM-TT-<thema>.md` + Block in `apps/zentrio-app/docs/STATUS.md`, `apps/zentrio-app/CHANGELOG.md`.

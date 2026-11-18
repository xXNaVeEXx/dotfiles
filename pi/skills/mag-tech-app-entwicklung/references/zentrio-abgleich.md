# zentrio-app mit der besichtigungs-app abgleichen (Fork-Resync)

zentrio-app ist eine generische Kopie der besichtigungs-app (neutrale Texte, eigenes Funktions-Modulsystem, Pflichtenheft, eigene Migrationsnummern, nur deutsch). `packages/domain-*` sind geteilt und wirken in beiden Apps automatisch — portiert wird die App-Ebene (`src`, `__tests__`, `e2e`, `messages`, `scripts`, `drizzle`) plus die Betriebs-Ebene (`docker-compose*.yml`, `k8s/`, `.github/workflows/build-zentrio.yml`), wenn besichtigung neue Dienste bekommen hat.

## 1. Lücke messen, bevor portiert wird
- Basis = Commit des letzten Abgleichs (steht in `apps/zentrio-app/docs/abgleich-*.md` / STATUS.md). Commits seit dort je Commit bewerten: 1:1 / angepasst / bewusst nicht / Merge; Tabelle mit Begründung als `apps/zentrio-app/docs/abgleich-besichtigungs-app-<JJJJ-MM>.md`.
- Erst prüfen, ob Einzel-Cherry-Picks überhaupt tragen: je Commit den Patch auf `apps/zentrio-app/` umschreiben und `git apply -3 --check`. Melden die meisten „does not exist in index“, fehlt zentrio der Unterbau aus älteren Commits — dann ist Datei-Abgleich statt Cherry-Pick nötig.
- Port-Grad je Commit: Anteil der hinzugefügten Zeilen (die in besichtigung noch existieren), die in der zentrio-Datei vorkommen. ≥90 % = portiert, 20–90 % = teilweise, <20 % = fehlt. docs/, CHANGELOG, deploy/ ausklammern.
- Kundendaten (`customers/<slug>`) und Migrations-Umnummerierungen der besichtigungs-app nie übernehmen.

## 1b. Nachzug kleiner neuer test-Commits (Abgleich-PR schon offen)
- Neue Commits seit dem letzten Merge auflisten: `git log --no-merges --stat <letzter-merge>..origin/test`, flux-/bump-Commits ignorieren.
- Je Commit nach Pfaden einordnen:
  - nur `packages/*` oder ein eigener Dienst (`apps/sprachdienst` u. ä.): kein Port nötig, weil zentrio das Paket bzw. dasselbe Dockerfile mitbaut; im Bericht so begründen.
  - App-Teile in `apps/besichtigungs-app` → portieren. Hat der Commit in zentrio nur Wächter-Ausnahmen oder `neue-rechte`-Einträge mit „noch nicht übernommen“ angelegt, gehört zum Port auch das Entfernen dieser Ausnahmen (Text der Ausnahme sagt, wohin es stattdessen gehört).
- Portieren: `git merge --no-ff --no-commit origin/test` im Port-Worktree, dann je App-Datei `git show <commit> -- apps/besichtigungs-app/<datei> | sed 's#apps/besichtigungs-app/#apps/zentrio-app/#g' > p.diff && git apply -3 p.diff` (aus dem Repo-Root, nicht aus `apps/`, sonst „--3way outside a repository“). Migrationen als nächste zentrio-Nummer kopieren (§5), Migrations-Test mitnehmen und `MIGRATION`-Konstante umstellen.
- Danach volle Prüfkette (§7), EIN Merge-Commit mit Beschreibung des Nachzugs, Push auf den bestehenden PR-Zweig.

## 2. Datei-Level-Abgleich (eigener Worktree, nie im Haupt-Checkout)
- Jede Datei in eine Kategorie: GLEICH, VERALTET (zentrio-Blob kommt in der besichtigungs-Historie vor → besichtigungs-Fassung kopieren), ABWEICHEND (zentrio-eigene Änderung), NUR-B (kopieren), NUR-Z (zentrio-eigen, nie anfassen).
- ABWEICHEND per `git merge-file -L zentrio -L basis -L besichtigung <z> <basis> <b>` mergen; Basis = die per difflib ähnlichste historische besichtigungs-Fassung. `messages/de.json` per Schlüssel-Merge (zentrio-Werte gewinnen, neue Schlüssel dazu, `ensure_ascii=False`).
- `*.generated.ts` nicht mergen, sondern nach dem Abgleich neu erzeugen (`npm run ki:hilfe-texte`).
- Merge-Stand sofort als lokalen WIP-Commit sichern, damit Konfliktlösungs-Worker eigene Worktrees auf diesem Commit bekommen.
- Konfliktmarker zählen nur als `^<<<<<<< `/`^=======$`/`^>>>>>>> `.

## 3. Konflikte lösen (Regel je Hunk)
- Code/Logik/Bugfix: besichtigungs-Seite. zentrio-Eigenheiten behalten: `useFunktionen`/`FunktionsGate`/`src/config/funktionen.ts`, Pflichtenheft, Kalender-Typ-Ausblendung, `zentrio-*`-Helfer, Marke „Zentrio“.
- Filter, die zentrio auf geteilte Listen anwendet (z. B. `ohneArten` für nicht anlegbare Auftragsarten), VOR neuer Gruppierungs-/Sortierlogik aus besichtigung anwenden, nicht danach — sonst tauchen ausgeblendete Einträge in den neuen Gruppen wieder auf.
- Navigation: `seitenleiste.ts` ist in beiden Apps die einzige Quelle (Menü, Insel, Schnellmenü, Favoriten). Alte Listen (`nav-items.ts`, `island-nav-items.ts`, `nav-icons.tsx`, `useNavbarFavorites`) nicht wiederbeleben; zentrio-eigene Seiten dort eintragen.
- Häufigster Hunk-Typ: besichtigung holt Text per `t('…')`, zentrio hatte ihn neutral hartkodiert → `t()` übernehmen und den neutralen Text in `de.json` setzen. `de.json` in GENAU EINER Spur zentral neutralisieren; die Dateispuren liefern nur eine TSV-Liste `Schlüssel<TAB>Wunschtext`.
- Bei vielen Dateien thematische Spuren (Hilfe / Termine+Kunden / Angebote+Aufträge+Rechnungen / Umsatz+Stunden+KI / Shell+Navigation+Rechte / Rest), je Spur eigener Worktree, gemeinsamer Brief als Datei.

## 4. Begriffe neutralisieren (nur sichtbare Texte)
- Besichtigung→Termin (die→der), LKW→Fahrzeug (der→das), Umzug→Auftrag, Karton-Lieferung→Material-Lieferung, Belade-/Entladeadresse→Leistungsadresse 1/2, Umzugsdatum→Leistungsdatum, Umzugsgut→Auftragsgut. Schlüssel, IDs, Pfade, Bezeichner nie.
- Übernommene Tests, die angezeigte Namen erwarten, auf die zentrio-Labels aus `de.json` umstellen (z. B. Standard-Art `umzug` heißt „Auftrag“, `karton` „Material-Lieferung“), mit Kommentar, warum sie von der besichtigungs-Fassung abweichen.
- Auch hartkodierte Texte in `src/lib/*.ts` (Status-Board-Titel, Grund-Texte, KI-Hilfe-Wissen, Einführungen) prüfen: `grep -rln "Umzugsdatum\|Besichtigung geplant\|Beladeadresse\|Umzug\|LKW" src/lib` und gegen `de.json` angleichen — Tests, die die Lib-Konstante mit dem gerenderten Text vergleichen, werden sonst rot. Nur Treffer anfassen, die der Port neu hereinbringt (`git diff origin/test`), Altbestand bleibt.
- Geteilte Domain-Pakete liefern ohne Übersetzer Umzugsbegriffe. Der Wächter `__tests__/i18n/helfer-texte.test.ts` vergleicht `de.json` mit diesen Texten → in zentrio eine benannte Ausnahmeliste (`ZENTRIO_NEUTRAL`, Pfad → neutraler Text, wirft bei unbekanntem Pfad) statt den Vergleich abzuschalten.
- Namensraum `Touren`: der Wächter `einfuehrung-tour-texte` verlangt `de.json`-Touren wortgleich mit `src/lib/einfuehrungen/*.ts` → beide Quellen synchron ändern. Tour-Schritte, deren Ziel es in zentrio nicht gibt (zweite Termin-Adresse, Sprachwahl), aus Code UND `de.json` entfernen und die Folgeschritte neu nummerieren.
- Kette bug-bereiche ↔ `rechte-wirkung.ts` ↔ Icon-Map `RechteEditorVoll.tsx` matcht per exaktem String → alle drei gleich umbenennen.

## 5. Sprache, Migrationen, zentrio-eigene Seiten
- zentrio ist nur deutsch: `messages/en.json`, `ru.json`, Sprachwahl-Komponenten, `src/i18n/sprachen.ts`/`texte.ts` und Sprach-Gleichheits-Tests entfernen; übernommene Tests, die andere Sprachen importieren, auf `de` reduzieren. Neue Rechte-/Text-Schlüssel nur in `de.json` eintragen.
- Fehlende Migrationen als nächste zentrio-Nummer anlegen, Kopfzeile `-- <nr>_<name>.sql (MAG-…)` + `-- Dieselbe Migration wie apps/besichtigungs-app/drizzle/<datei>`. Texte in Tests/Doku, die die Nummer nennen (auch „Administratoren haben das aus <nr>“-Verweise auf ältere Migrationen), auf zentrio-Nummern umstellen.
- Portierte Tests lesen Migrationsdateien mit besichtigungs-Nummern oder sogar `apps/besichtigungs-app/drizzle/…`. Nach dem Abgleich prüfen und auf die zentrio-Datei mit gleichem Namensteil umstellen:
  `grep -rhoE "[0-9]{4}_[a-z0-9_]+\.sql" __tests__ | sort -u | while read f; do [ -f drizzle/$f ] || echo "FEHLT: $f"; done` plus `grep -rn "apps/besichtigungs-app/drizzle" __tests__` (nur Treffer anfassen, die nicht schon auf `test` so stehen).
- Wird während des Ports `origin/test` eingemergt und bringt neue zentrio-Migrationen, die eigenen noch nicht ausgelieferten Port-Migrationen per `git mv` HINTER die höchste test-Nummer schieben (Kopfzeile, Test-Verweise, Doku-Bereich mitziehen). Grund: ausgelieferte Nummern sind fix, nur unveröffentlichte dürfen wandern.
- Rot nach dem Einmergen von `test` mit Schema-Fehlern (`safeParse(...).success` false) in einer zentrio-Lib: meist hat ein geteiltes Paket ein neues Pflichtfeld bekommen, dessen App-Teil nur in besichtigung nachgezogen ist. `git log origin/test -- packages/<paket>/<datei>` zeigt den Commit; dessen App-Teile (Lib, Komponenten, Seiten, KI-Tools, Hilfe-Wissen, Einführungen, Tests) nach zentrio holen.
- zentrio-eigene Seiten (Pflichtenheft, Funktionen) brauchen alles, was die Wächter je Seite verlangen: Bereich in bug-bereiche, Eintrag in `src/lib/ai-tools/hilfe-wissen.ts`, Einführung in `src/lib/einfuehrungen/weitere.ts` + `Touren` in `de.json`, Seitentitel, Zeile in `docs/funktionsabdeckung.md`. Ihre Rechte in `src/lib/neue-rechte.ts` mit dem echten Einführungsdatum eintragen, wenn sie nach dem Grundbestand kamen.
- Neue Scheduler-Läufe aus besichtigung: `LAUF_NAMEN` in `scheduler-sperre.ts` + `instrumentation.ts` + Längentest im scheduler-sperre-Test.
- `src/lib/app-marke/manifest.ts` `STANDARD_NAME` = „Zentrio“ (PWA-Symbol/Favicon aus dem Firmenlogo kommt über `app-icon`-Route und Manifest mit).

## 6. Betriebs-Ebene (neue Dienste wie der Sprachdienst)
- zentrio hat kein k8s-Overlay: `k8s/base` IST das Kunden-Artefakt. Neue Deployments dort mit echten Kunden-Werten (replicas ≥ 1, `imagePullSecrets: harbor-pull`, nicht ghcr-pull), plus Service/NetworkPolicy in der kustomization; App-Deployment-Env (z. B. `SPRACHDIENST_URL`) setzen.
- Artefakt-Pinnung: `k8s/registry-vps/customer-deploy/kustomization.yaml` `images` (newName `registry.mag-tech.eu/zentrio/<dienst>`), Flux-Regex in `k8s/customer-vm/flux/oci-repository.yaml`, `lib/resource-patches.sh` (Ressourcen-Overrides + Validierung) samt Shell-Tests in `lib/__tests__/`.
- CI `.github/workflows/build-zentrio.yml`: Bau-Schritt mit `if: vars.AUSLIEFERUNG_VON_GITHUB == 'ja'` + `buildx-mit-cache.sh`, beide `kustomize edit set image`-Stellen ergänzen; neuen Schritt in `scripts/github-bau-pruefen.py` (`ERLAUBT_RELEASE` → schritte + gesperrt) eintragen und `.github/ci/__tests__/github-bau-pruefen-test.sh` laufen lassen.
- Compose: Dienst + Init-Container in `docker-compose.yml`, Speichergrenzen in min/mid/max/large; `docker compose -f … config` je Profil prüfen.
- Wächter-Skripte aus besichtigung (`k8s/base/__tests__/*`, `docker/__tests__/*`) als zentrio-Fassung anlegen und in das justfile-Rezept `test-deploy-scripts` einhängen.
- Fragt der Nutzer, ob eine Funktion eines Dienstes in zentrio da ist: die zugehörigen App-Dateien beider Apps per `diff <(grep -rlE '<muster>' apps/besichtigungs-app/src | …) <(… zentrio …)` vergleichen, Abweichungen begründen und die Freischalt-Kette nennen (Lizenzmodul → Firmen-Schalter → Dienst erreichbar → Klickweg).

## 7. Prüfen, committen, PR
- Erst die Jest-Basis auf `origin/test` laufen lassen (oder deren Fails notieren), dann den Port: so sind alle verbleibenden Fails eindeutig Port-Folgen. Typprüfung nur über `npm run typecheck` (ein `npx tsc` im nix-Wrapper prüft nichts). Lint gezielt per `npx eslint <geänderte Dateien>` in `apps/zentrio-app` — `npx next lint` mit Zusatzargumenten deutet sie als Projektordner („Invalid project directory“). Volle Läufe (Jest ~800 Suites) als `bg_run`, Fail-Liste gezielt nachlaufen lassen.
- Vorbestehende lens-Blocker (leere `catch`, `dangerouslySetInnerHTML`) und vom Merge mitgebrachte Fremddateien nicht im Port mitbeheben — belegen per `git diff --quiet origin/test -- <datei> && echo gleich` bzw. Zählen der Funde in `git show origin/test:<datei>`.
- Commit-Betreff: Der lokale Commit-Hook verlangt Conventional Commits → `feat(zentrio): <kurz> (MAG-<n>)`; Merge-Commits als `Merge origin/test in <zweig> (MAG-<n>)` mit Body, was nachgezogen wurde. Der PR-TITEL dagegen `MAG-<n>: <kurz>` ohne Typ. Issue vorher in der KI-Plattform anlegen (siehe SKILL.md, Projekt `zentrio`).
- `origin` ist GitHub (`MaG-TechOrg/mag-tech-monorepo`). Wird der SSH-Schlüssel abgewiesen, über HTTPS mit gh-Anmeldung pushen/fetchen: `git -c credential.helper='!gh auth git-credential' push https://github.com/MaG-TechOrg/mag-tech-monorepo.git HEAD:<branch>`.
- CI danach als `bg_run`-Schleife beobachten (`gh pr view <n> --json statusCheckRollup` bis keine Prüfung mehr läuft, dann Ergebnis mit `mergeStateStatus` ausgeben). `BLOCKED` bei allem grün heißt fehlende Review-Freigabe: nicht selbst mergen, dem Nutzer mit Link melden.
- Zeigt der PR `mergeable: CONFLICTING`, startet GitHub keine Checks: `origin/test` einmergen, Konflikte lösen (beide Seiten bei Registrierungslisten wie instrumentation/scheduler-sperre), App-Teile neuer test-Commits nach zentrio nachziehen (§1b), Migrationsnummern prüfen (§5), dann volle Prüfkette, Encoding-Prüfung, Push.
- Doku: `docs/status/JJJJ-MM-TT-<thema>.md` (je Nachzug ein Abschnitt + „So testest du es auf clusterapp“) + Block in `apps/zentrio-app/docs/STATUS.md`, `apps/zentrio-app/CHANGELOG.md`, Abgleich-Tabelle um eine Regel je Nachzug und den Migrations-Nummernbereich ergänzen; Bewertungen anpassen, wenn sie sich ändern (z. B. „bewusst nicht“ → übernommen).

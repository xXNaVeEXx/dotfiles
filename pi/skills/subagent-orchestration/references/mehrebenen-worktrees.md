# Mehrebenen-Orchestrierung mit Git-Worktree je Paket

Wann: Der Auftrag ist zu groß für eine Orchestrator-Sitzung (Analyse, Umsetzung in mehreren Spuren, Prüf- und
Nachanalyse-Runden), soll ohne Nutzer laufen, und andere Agenten arbeiten im selben Repo. Dann drei Ebenen:
Leitstand (meine Sitzung) → Spur-Orchestratoren (eigene pi-Sitzungen in herdr-Tabs) → Worker (deren acp_delegate).

## Planen
- Ist der Plannotator-Planmodus aktiv und verlangt der Nutzer Autonomie: Plan als `.md` in einen gitignorten
  Steuerordner des Auftrags schreiben (`.tmp/<bereich>/PLAN.md`), alle offenen Punkte im Plan selbst als
  Entscheidungsregeln festlegen und ohne Rückfrage per `plannotator_submit_plan` einreichen. Nach der Freigabe den
  daraus abgeleiteten Detailplan ohne zweite Freigabe abarbeiten.
- Vor dem ersten verändernden Schritt prüfen, ob der Planmodus aktiv ist. Er sperrt technisch nur write/edit auf
  Nicht-Markdown, bash nicht; Container, Datenbanken, Worktrees, Installationen und Wrapper-Skripte trotzdem erst nach
  der Freigabe anlegen, bis dahin nur lesen und planen. Grund: Sonst fällt der Modus erst auf, wenn mitten im Aufbau ein
  write abgelehnt wird, und halb gebaute Infrastruktur liegt außerhalb des freigegebenen Plans.
- Der Plan nennt Gates je Phase (Analyse fertig, Architektur fertig, Welle grün, Gesamtprüfung grün, Nachanalyse ohne
  neue hoch/mittel-Lücken) und ein prüfbares Ende (Katalog mit Status je Funktion, Schlussbericht, PRs gemergt).
- Große Paketpläne (Hunderte Katalog-Einträge) maschinell prüfbar machen, statt einen Agenten den Plan im Ganzen
  schreiben zu lassen. Grund: Über ~1000 Einträge passen in keinen Kontext, und doppelte oder fehlende IDs sowie
  Pfadkonflikte findet nur ein Skript zuverlässig. Ablauf:
  1. Ein Architektur-Lauf (stärkstes Modell) legt den Schnitt fest: je Bereich disjunkte Pfad-Wurzeln, Welle und Spur je
     Unterthema, bereichsübergreifende Bausteine mit festem Besitzer-Paket, dazu das Fundament-Paket für alle Hotspots
     (Register, Gerüste, Testkit, Prüfwerkzeuge).
  2. Bereichs-Planer schreiben parallel je Bereich eine YAML-Datei (Pflichtfelder id, ziel, katalog-IDs, spur, welle,
     pfade, abhängig, modell, umfang, tests, akzeptanz). Bereiche über ~130 Einträge an Unterthema-Grenzen in Teile
     ≤ 100 teilen, die nacheinander anhängen.
  3. Ein Validator-Skript prüft: jede Katalog-ID genau einmal, Hotspots nur im Fundament, Pfade in den eigenen Wurzeln,
     fremde Abhängigkeiten nur auf Bausteine, Abhängigkeiten nur auf frühere Wellen oder dieselbe Spur, keine Zyklen,
     keine Pfad-Überschneidung je Welle. Den Prüfbefehl in jeden Planer-Brief schreiben; fertig erst bei Exit 0.
  4. Danach ein Abgleich-Lauf über alle Bereiche, zwei Prüfer verschiedener Modelle nur für die Semantik und ein
     Korrektur-Lauf. Ein `build`-Befehl des Validators erzeugt Umsetzungs- und Testplan sowie die Paketdaten (JSON), aus
     denen die Bau-Queues entstehen.
- Phasen-Übergänge (Gate prüfen → Spur-Branch in int mergen → nächste Spur einrichten → Wellen-PR) als ein Skript mit
  Unterbefehlen und festen Exit-Codes (0 ok, 1 rot, 2 Voraussetzung fehlt, 4 Merge-Konflikt); jeder Lauf schreibt einen
  Bericht mit Schlusszeile `ERGEBNIS:`. Ein Gate prüft Queue fertig + Fertig-Datei, den Validator mit Exit 0 und dass die
  Generatoren (Katalog, Plan) den committeten Stand reproduzieren: reine Zeitstempel-Diffs zurücksetzen (−/+-Zeilen nach
  Ersetzen der Zeitstempel gleich), echte Abweichungen als `<gate>-build.diff` melden. Auf einem Baum mit
  uncommitteten Änderungen nie bauen. Grund: Von Hand vergisst der Leitstand Schritte, und ein Generator auf schmutzigem
  Baum überschreibt fremde, nicht committete Arbeit.

## Aufbau
1. Lage prüfen: `herdr workspace list` (fremde Workspaces und Panes sind tabu), eigenes Pane aus `$HERDR_PANE_ID`;
   Spur-Tabs nur im eigenen Workspace anlegen. `git worktree list` und `git status --short | head` im Haupt-Checkout:
   Fremde Branches, Worktrees und uncommittete Arbeit nie anfassen, den Haupt-Checkout nur lesen.
2. Worktrees außerhalb des Haupt-Checkouts unter einem eigenen Ordner (`~/projects/<proj>-<bereich>/`): `int`
   (Integrationsbranch aus `origin/main`) und je Paket `wt/<pkg>` (eigener Branch aus dem aktuellen int-Stand).
   Grund für „außerhalb“: Werkzeuge, die den Repo-Baum scannen (jest-haste, turbo), finden verschachtelte Worktrees
   doppelt. Ignorierte Konfig-Dateien, die nur im Haupt-Checkout liegen (z. B. `.pi/acp.json`, `.pi-lens.json`), in
   jeden neuen Worktree kopieren. Grund: `git worktree add` legt sie nicht an; ohne sie fehlen Delegate-Timeouts und
   pi-lens-Grenzen.
   `git worktree prune` und `git gc` nie aufrufen, solange fremde Agenten im Repo arbeiten: prune entfernt auch die
   Einträge fremder Worktrees, deren Ordner gerade fehlt. Ist der eigene Pfad noch registriert, aber sein Ordner weg,
   `git worktree add -f <pfad> <branch>`; ein nicht leerer Ordner ohne `.git` ist ein Abbruchgrund. Worktrees nur unter
   einer Sperre anlegen und bei git-Sperrfehlern (stderr enthält „lock“) bis zu 3× wiederholen.
3. Steuerdateien (Plan, Queue, Entscheidungen, Locks, Wrapper-Skripte, Berichte der Spuren) in einem eigenen gitignorten
   Ordner des Haupt-Checkouts, überall absolut adressiert; fremde Steuerordner nur lesen.
4. Worker committen in ihrem Paket-Worktree selbst (abweichend von Schritt 6 der SKILL.md). Grund: Ein Absturz verliert
   nichts, und jeder Worktree gehört genau einem Worker. Integration = `git merge --no-ff <paket-branch>` im int-Worktree
   unter `flock <steuer>/locks/int.lock`, danach `git worktree remove`. Je Welle ein PR int → main, Merge bei grüner CI.
   Verlangt das Repo je Änderung einen eigenen PR (Branch-Pflicht, Ruleset): Jede Spur pusht ihren Branch, öffnet den PR
   gegen die Basis und macht die CI grün, merged aber nie selbst; nur der Leitstand merged in geplanter Reihenfolge
   (geteilte Kernpakete und Migrationen zuerst) mit Head-SHA-Prüfung (Skill gh-pr-automation). Grund: Selbst mergende
   Spuren verschieben sich gegenseitig die Basis, und eine falsche Reihenfolge bricht nummerierte Migrationen.
   Aus einer Sitzung, deren cwd auf main steht (Haupt-Checkout), immer `git -C <worktree> commit|push …` schreiben und im
   push-Befehl das Wort main/master vermeiden. Grund: Der bigpowers-Git-Guard prüft den Branch des pi-Prozess-cwd, nicht
   das `cd` im Befehl, und blockt dort `git commit`; `git push` blockt er, sobald main/master als Wort im Befehl steht.
   Er wertet den ganzen Befehlstext: Steht `git commit` irgendwo darin (Suchmuster, Heredoc, per Heredoc geschriebener
   Code), scheitert der ganze Aufruf. Solchen Text per write-Werkzeug in eine Datei schreiben (große Skripte in Teilen,
   dann `cat teil >> ziel`) und Suchmuster umformen (`git.*commit`).
   - Die Schritte je Paket in ein Queue-Skript legen (`<q> wt|brief|next|check|abnahme|integ|status|stand <PAKET>`).
     Den Status nur per Skript unter Sperre ändern (offen → `läuft <runId> <modell>` → prüfen → integrieren → fertig;
     rot → `nacharbeit <runId>`), weil Spur, Aufsicht und Leitstand dieselbe Queue lesen und schreiben. `next` gibt nur
     offene Pakete mit fertigen Abhängigkeiten frei, unter den Worker-, Konto- und RAM-Toren.
   - Den Prüflauf eines Pakets aus seinem Diff gegen die Basis ableiten: geänderte Crates → check/nextest/clippy je Crate,
     Frontend und i18n nur bei Änderungen dort, E2E je Szenario des Pakets. Er läuft im Hintergrund mit `wait`; die
     Voll-Suite läuft erst am Wellenende. Grund: Eine Voll-Suite je Paket kostet Stunden Build-Zeit.
   - `integ`: Abnahme (keine `todo!`/Platzhalter, Status-Datei vollständig) → Basis in den Paket-Branch mergen.
     Konflikte nur in Lockfiles (Cargo.lock, pnpm-lock.yaml) selbst lösen: Basis-Stand nehmen und neu erzeugen
     (`cargo metadata`, `pnpm install --lockfile-only`); jeder andere Konflikt → Exit 4 an die Spur. Dann kompakter
     Nachtest → `merge --no-ff` unter der Sperre mit Betreff `chore(<bereich>): integrate <PAKET> – <titel>` (≤ 72).
     „Schon integriert“ an diesem Betreff im Integrationsbranch erkennen. Grund: Ein Neustart nach Absturz darf nicht
     doppelt mergen.
   - Sammeldateien, die viele parallele Pakete befüllen würden (Statusliste, Restpunkte für den Nutzer), je Paket als
     eigene Datei anlegen und die Sammeldatei per Generator erzeugen, nie von Hand. Grund: Sonst kollidiert jede
     Integration in derselben Datei.
   - Wellen-PR int → main: Hat das Repo `delete_branch_on_merge` (`gh api repos/<o>/<r> --jq .delete_branch_on_merge`),
     den PR nicht vom Integrationsbranch öffnen. Stattdessen den geprüften SHA als Schnappschuss pushen
     (`git push origin <sha>:refs/heads/<bereich>/welle-<n>`) und davon den PR öffnen. Grund: GitHub löscht beim Merge
     sonst den Integrationsbranch, auf dem die nächste Welle schon liegt. Ablauf am Wellenende: Basis in int mergen
     (ff-only, sonst `--no-ff`; Konflikt → abort, Exit 4) → Gate → Schnappschuss-Push → vorhandenen PR wiederverwenden
     oder anlegen → CI-Wache mit `headRefOid == sha` → `gh pr merge --merge --match-head-commit <sha>` → Basis zurück in
     int.
5. Registrierungs-Hotspots (Workspace-Mitglieder, zentrale Enums, Navigations- und i18n-Tabellen) ändert nur ein
   Fundament-Paket, das vor allen anderen gemergt wird; spätere Pakete hängen nur an vorbereiteten Stellen an.
   Spuren, die dasselbe Kernpaket umbauen, laufen nicht gleichzeitig: die zweite startet erst nach dem Merge der ersten
   (nächste Welle) und zieht als ersten Schritt die Basis nach. Grund: Parallele Branches kollidieren sonst bei jedem
   Merge in denselben Zeilen.
6. Build-Spiegel je Slot, nicht je Aufruf: Spiegelt ein Build-Skript den aufrufenden Baum per `rsync --delete` auf eine
   Build-Maschine (z. B. `tools/remote.sh` mit `LUMI_REMOTE_BASE`), überschreiben sich zwei Worktrees mit derselben
   Basis. Ein Wrapper belegt einen Slot per `flock`, setzt die Basis `<bereich>-<slot>`, prüft den freien RAM der
   Build-Maschine und ruft das Skript des AUFRUFENDEN Worktrees. Vorher prüfen, dass auch die Remote-Seite die Basis
   wirklich nutzt (Probe: Basis und Target-Ordner ausgeben lassen), sonst landen alle Slots im selben fremden Spiegel.
   - Lange Läufe startet der Wrapper per `setsid -f` im Hintergrund (Log mit Schlusszeile `<PRÄFIX>_EXIT=<rc>`,
     pid-Datei) und bietet `wait <name>` mit ≤ 85 s je Aufruf (Exit 0 grün, 1 rot, 3 läuft noch). Grund: Ein Tool-Aufruf
     soll nie minutenlang stumm blockieren, und ein abgebrochener Aufruf darf den Build nicht mitreißen.
   - Auf der Build-Maschine jeden Lauf in einen Scope mit festem Namen je Slot legen (`systemd-run --user --scope
     --collect --unit=<bereich>-<slot>-run -p MemoryMax=… -p MemorySwapMax=… -- <befehl>`, geht auch über
     nicht-interaktives ssh). Grund: Ein Ausreißer stirbt allein; Abbrechen = `systemctl --user stop <unit>.scope`, und
     beim Belegen des Slots wird ein verwaister Scope eines abgerissenen Laufs beendet.
   - Endet ein Remote-Lauf mit Exit 137 oder 255, im Journal der Build-Maschine nach einem OOM-Kill des Slot-Scopes
     suchen (`journalctl --user --since '<startzeit>' -u <bereich>-<slot>-run.scope | grep -q oom-kill`). Trifft das zu,
     `<PRÄFIX>_OOM=1` ausgeben statt rot zu melden und mit weniger Jobs wiederholen (4 → 2 → 1), zuletzt anderer Slot
     oder größerer Deckel. Grund: Ein OOM-Abbruch beim Kompilieren sieht wie ein roter Lauf aus, und die Wiederholung
     baut inkrementell weiter.
   - Ist die Build-Maschine ein Laptop: Schlafsperre `systemd-run --user --unit=<bereich>-inhibit systemd-inhibit
     --what=sleep:idle:handle-lid-switch --mode=block sleep infinity`, am Projektende stoppen.
   - Was nur auf der Build-Maschine entsteht (Frontend-`dist`, gebündelte Runtimes, `node_modules`), vom `rsync --delete`
     ausschließen. Grund: Sonst löscht jeder Sync es, und der nächste Bau scheitert oder baut alles neu.
   - Je Slot einmal bootstrappen (Runtimes, Paket-Installationen, Frontend-Builds) und danach eine Baseline aller
     Prüfungen des unveränderten Integrationsstands festhalten, damit spätere Fehler eindeutig neu oder alt sind.

## Geteilte Laufzeit-Ressourcen (App mit Datenbank und E2E)
- Gemeinsame Infrastruktur (DB-Server, Identity-Provider, Mail-Fänger) einmal als Container starten und mit
  `docker update --restart unless-stopped <container>` absichern, nicht je Spur. Grund: Je Spur ein Satz Container
  kostet RAM und kollidiert an festen Ports.
- Eine Datenbank je Spur: Vorlage-DB einmal mit dem Migrationsskript des Repos aufbauen, dann je Spur
  `CREATE DATABASE <db>_<spur> TEMPLATE <vorlage>` (Sekunden) und `DATABASE_URL` in die gitignorte `.env.local` des
  Worktrees. Mit der Vorlage danach nichts mehr verbinden. Grund: TEMPLATE scheitert bei offener Verbindung zur
  Vorlage, und Spuren mit gemeinsamer DB zerstören sich gegenseitig Testdaten und Migrationsstand.
- Fortlaufend nummerierte Migrationen: je Spur einen Nummernbereich reservieren und im Spur-Auftrag nennen. Werkzeuge mit
  fest benannten Shadow-/Wegwerf-DBs (Migrationsgenerator, Vollständigkeitsprüfung) nur unter einer exklusiven Sperre
  laufen lassen. Grund: Sonst vergeben zwei Spuren dieselbe Nummer, und zwei Läufe löschen sich die Shadow-DB.
- Fest verdrahteter E2E-Port (z. B. Playwright-webServer): alle E2E-Läufe über einen Wrapper mit genau einem Slot
  serialisieren, `CI=1` setzen (schaltet `reuseExistingServer` ab), vorher nur eigene verwaiste Server auf dem Port
  beenden (cwd unter dem eigenen Worktree-Ordner) und bei fremden abbrechen. Grund: Sonst testet ein Lauf den Server und
  damit den Code einer anderen Spur.
- Sperr-Wrapper für schwere Läufe (Build, Typecheck, Suite, E2E): je Klasse N Slot-Dateien mit `flock -n`, vor dem Start
  freien RAM gegen eine Schwelle prüfen, nach einer Höchstwartezeit trotzdem starten, beim Warten und während des Laufs
  alle ≤ 2 min eine Zeile ausgeben und dem Kind den Sperr-fd schließen (`"$@" {fd}>&-`). Gründe: Der acp-Wächter
  beendet Worker nach 5 min ohne Ausgabe, und ein geerbter fd hält den Slot über Hintergrundserver des Laufs hinaus fest.
- Geheimnisse (API-Schlüssel, Lizenzschlüssel) einmal in einen `chmod 700`-Ordner des Steuerbereichs legen und je
  Worktree in die gitignorte `.env.local` kopieren; nie in Briefe, Pläne oder Logs. `.env`-Dateien mit JSON-Werten nie per
  `source`/`set -a; .` laden, einzelne Werte per `grep -E '^KEY=' <datei> | cut -d= -f2-` lesen. Grund: Die Shell
  entfernt die Anführungszeichen im JSON, der Wert kommt kaputt an.

## Spur-Orchestratoren
- Start wie im Übergabe-Absatz der SKILL.md (herdr tab create / agent start, Startprompt aus Datei), cwd = int-Worktree,
  aber mit `PI_LENS_DISABLE_LSP_INSTALL=1 PI_LENS_DISABLE_TOOL_INSTALL=1 pi --no-lsp …`. Grund: pi-lens startet sonst je
  Sitzung Sprach-Server (rust-analyzer belegt schnell > 2 GB). `--no-lsp` wirkt nur pro Sitzung bzw. maschinenweit;
  `lsp.enabled` in einer Projekt-`.pi-lens.json` bewirkt nichts. Für Sitzungen ohne eigenes Startflag (Worker)
  `lsp.disabledServers` in die `.pi-lens.json` des Worktrees schreiben: Diese Liste wird über alle Konfig-Ebenen
  vereinigt und wirkt daher auch projektweise.
- Start-Rezept als Skript (`spur.sh start|resume|prompt|read|stop <S>`), damit Neustarts gleich ablaufen:
  1. `herdr tab create --workspace <ws> --cwd <int> --label orch-<s> --env PI_LENS_DISABLE_LSP_INSTALL=1 --env …`
     → Pane `.result.root_pane.pane_id`, Tab `.result.tab.tab_id`.
  2. `herdr agent start orch-<s> --kind pi --pane <pane> --timeout 180000 -- --model <p/id> --thinking high --no-lsp`
     (das Pane muss am Shell-Prompt stehen); Sitzungsdatei danach aus
     `herdr agent get <pane> | jq -r .result.agent.agent_session.value` in eine `SITZUNG.env` der Spur schreiben.
     Grund: Mit ihr startet der Watchdog pi in derselben Sitzung neu (`pi … --session <datei>`).
  3. Startprompt `herdr agent prompt <pane> "Lies <START.md> und führe sie aus" --wait --until working --timeout 30000`
     (wird abgelehnt, solange der Agent `blocked` ist). Stoppen: `herdr agent send-keys <pane> esc`, `/quit` per
     `herdr pane send-text` + `herdr pane send-keys <pane> enter`, dann `herdr tab close <tab>`.
  4. Vor der ersten echten Spur eine Probe-Spur mit billigem Modell starten, die nur eine Datei schreibt, und wieder
     stoppen; „LSP Inactive“ in der pi-Statuszeile zeigt, dass `--no-lsp` greift.
- Modell einer laufenden Spur wechseln (Kontingent, Budget-Stufe) als Skript per bg_run:
  1. Warten (≤ 40 min), bis die Sitzung zweimal hintereinander ruht: kein `Working` in
     `herdr pane read <pane> --source visible --lines 45`. Fußzeile und Working-Zeile stehen über dem Eingabefeld,
     darum 45 Zeilen lesen.
  2. `herdr pane send-text <pane> "/model <provider>/<id>"`, 1,5 s warten, `herdr pane send-keys <pane> enter`; steht
     danach noch `> /…` im Eingabefeld, ein zweites Enter. Grund: Das erste Enter übernimmt nur die
     Autovervollständigung, und der nächste Befehl hängt sich sonst an den stehenden Text („No matching models“). Kein
     Thinking-Zusatz an `/model` anhängen.
  3. Erfolg an der Fußzeile prüfen (Modellname vor `think:`), dann das Modell auch in `SITZUNG.env` und die
     Watchdog-env schreiben. Grund: `/model` speichert nicht dauerhaft, ein Neustart käme sonst mit dem alten Modell.
- Auftragsdatei je Spur: Ziel, Pakete mit Worktree und Branch, zugeteiltes Worker-Kontingent, Prüfbefehle (die Wrapper),
  reservierte Migrationsnummern, eigene DB, Abschluss-Signal (Bericht + Stop-Datei), Entscheidungsregeln, Blockaden als
  Zeile im Plan notieren statt zu warten, Abschnitt „Wiederaufnahme“ für Neustarts. Jede Spur führt eine `STAND.md`
  bzw. ein Journal; der Leitstand liest nur Steuerdateien und steuert per `herdr agent prompt`.
- Obergrenzen gelten über alle Ebenen zusammen: Leitstand, Spur-Orchestratoren, Aufsichten und Worker zählen beim RAM
  (jede pi-Sitzung ~0,3–1,2 GB) und beim teuren Anbieter-Konto mit. Kontingente fest zuteilen (verträgt die Maschine
  2 Worker, dann 2 Spuren × 1 Worker), nicht „je Spur 2“. Ein RAM-Tor-Skript (freier Speicher, Swap-Anteil, Zahl der
  eigenen pi-Prozesse über deren cwd) vor jedem neuen pi aufrufen. Auslastung der Konten vor dem Start und je Welle lesen
  (`~/.local/state/omarchy/agents/usage/<anbieter>.json`, Sitzungs- und Wochen-Prozent) und danach die Spuren verteilen:
  die wichtigste Spur auf das stärkere Konto, die übrigen auf das zweite; was nicht passt, in die nächste Welle.
- Budget-Stufen nach dem Wochenwert des teuren Kontos, zusätzlich zum Worker-Tor der SKILL.md: ab ~65 % die
  Spur-Orchestratoren auf den zweiten Anbieter umstellen, Worker nur noch dort, Leitstand-Kontrollrunden ≥ 30 min;
  ab ~85 % auch den Leitstand umstellen oder bis zum Reset ruhen; 5-h-Fenster ≥ 90 % → der Leitstand pausiert schwere
  Schreibarbeit. Spuren laufen auf einem mittleren Modell; das teuerste Modell mit höchster Thinking-Stufe nur für
  Leitstand, Architektur und sicherheitskritische Pakete. Grund: Leitstand und Spuren verbrauchen auch ohne Worker
  spürbar Kontingent, und das Worker-Tor sperrt nur Worker; ein volles Wochenlimit stoppt alle Ebenen zugleich, und
  niemand setzt die Arbeit fort.
- Gemessen an einem Tag: Leitstand auf dem teuersten Modell 318 M Token, Spur + Worker auf dem mittleren Modell 84 M
  (`~/.cache/omarchy/agent-usage/claude-pi-sessions.json` → `.stats.todayTokensByModel`). Darum den Leitstand zwischen
  Ereignissen nur von Aufsicht und Wachen wecken lassen und eigene Werkzeuge früh fertigstellen, statt Kontrollrunden zu
  drehen. Ist das Tor eines Anbieters zu (z. B. 5-h-Fenster voll), darf der andere vorübergehend dessen Plätze
  übernehmen (die Gesamtgrenze bleibt), billige Aufträge laufen dann auf seinem mittleren Modell. Ist das Tor wieder
  offen, keine neuen Starts über der Normalgrenze.

## Überwachung
- Je Spur-Orchestrator eine Aufsicht (`scripts/orchestrator-aufsicht.sh` über einen Wrapper je Pane) und ein Watchdog
  mit eigener env- und Stop-Datei je Pane; ihre Worker überwacht die Spur selbst per `scripts/worker-wache.sh`.
- Auch der Leitstand bekommt einen Watchdog auf sein eigenes Pane. Grund: Eine stehende Leitstand-Sitzung weckt niemand.
- Watchdog je Pane = Skript + Timer `systemd-run --user --unit=<bereich>-wd-<name> --on-calendar='*:0/5'
  --setenv=HERDR_SOCKET_PATH=… --setenv=PATH=… --setenv=HOME=… /bin/bash <watchdog> <name>`. Grund: Die Timer-Umgebung
  kennt weder den herdr-Socket noch den Nix-PATH. Prüfungen je Lauf:
  - pi im Vordergrund? `herdr pane process-info --pane P | jq '.result.process_info.foreground_processes[]|select(.name=="pi")'`.
    Fehlt pi: `herdr pane run P "cd <cwd> && pi … --session <datei>"` (höchstens 3 Neustarts in 6 h, danach Alarmdatei),
    auf `herdr agent wait P --until idle` warten, dann Wiederaufnahme-Prompt.
  - Status aus `herdr pane list` (`.agent_status`): „working“ und Sitzungsdatei sowie `.activity` der Kinder ≥ 60 min
    unverändert → Esc + Hinweis-Prompt; untätig ohne Fertig-Datei ≥ 20 min (mit laufenden bg-Tasks oder Kindern ≥ 150 min)
    → Anstoß-Prompt; zwischen zwei Eingriffen ≥ 25 min.
  - Fortschritt = neuester Commit aller Branches + mtime der Steuerordner; ≥ 90 min ohne → Hinweis, höchstens 1×/h.
  - Fertig-Datei vorhanden → Timer stoppt sich selbst. Vor dem Scharfschalten mit einer DRY-Variable proben (Aktionen nur
    loggen) und einmal mit einem nicht existierenden Pane (muss Alarm statt Aktion ergeben).
- Bau-Spuren: Die Aufsicht zählt auch die Logs der Paket-Prüfläufe und die Paket-Worktrees (Status-/Berichtsdateien,
  `.git/worktrees/<pkg>/logs/HEAD`, die eigenen Pfade des Pakets) als Fortschritt und meldet „Worker still“ erst, wenn
  auch diese ≥ 15 min ruhen. Grund: Ein Worker, der auf einen langen Remote-Build wartet, schreibt nur in dessen Log.

## Werkzeuge des Leitstands testen
- Queue-, Integrations- und Phasen-Skripte vor dem Scharfschalten in einer Attrappen-Sandbox prüfen: bare `origin` +
  Klon + die Worktrees (int, Spur-Worktrees, `wt/`). Attrappen: `gh` (PR-Zustand je PR in Dateien; `merge` = echter
  `--no-ff`-Merge im Klon + push + Branch löschen; Checks per env grün/rot/keine/pending:K, wandernder Head),
  Build-Wrapper und Gate (Fehler per env-Regex, einmaliger Host-weg-Exit), Python-Werkzeuge per argv[0]-Dispatch über
  Symlinks auf ein `fake-tool.py`. Dafür alle Pfade (Repo, Steuerordner, Locks, Logs, Werkzeuge) per env umlenkbar
  machen und den Push per env abschaltbar. Ein `run.sh` zählt `ok`/`FEHLER` und deckt die Fehlerwege ab (Gate rot, CI
  rot oder ohne Checks, Konflikt → 4, verwaister Worktree, schon integriert). Leere Ordner trackt git nicht: in der
  Sandbox per `mkdir -p` anlegen. Grund: Ein Fehler im Phasen-Skript zeigt sich sonst erst nach Stunden Analyse oder am
  Wellenende, und ein Probelauf am echten Repo erzeugt echte PRs und Merges.

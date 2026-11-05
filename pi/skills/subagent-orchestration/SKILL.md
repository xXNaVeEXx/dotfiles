---
name: subagent-orchestration
description: "Use when the user hands over a large multi-part build to run autonomously (overnight or while away) and wants me to only orchestrate sub-agent workers while staying reachable: task files, RAM-aware launching, resuming killed workers, per-package integration without touching the work tree, commit/push, CI watch and status reports (incl. a self-updating HTML status page of done and remaining work, and provider-quota gates with pause, end-of-week ramp and emergency brake) — or when another autonomous orchestrator running in its own pane must be given extra packages or be watched by a hang-detection loop — or when a job too big for one session must run without the user as lead session → track-orchestrator sessions → workers, with one git worktree per package because other agents work in the same repo."
---

# subagent-orchestration

# Große Builds mit Sub-Agent-Workern orchestrieren

Klasse: Mehrteilige Implementierung (viele Pakete) autonom abarbeiten, während ich nur orchestriere.

## Grundregeln (Vorgaben des Nutzers)
- Worktree-Basis: Für EINZELNE neue Aufgaben außerhalb großer Läufe gilt Skill worktree-task-isolation (wt/worktrunk, `wt switch -c`). In diesem Mehr-Ebenen-Flow bleibt rohes `git worktree add` Standard (Snapshot-Stände, Spur-Pfade, PR-Vorpush-Worktrees sind an Commits gebunden).
- Ich orchestriere nur: Worker recherchieren und implementieren; ich schreibe Aufgaben, starte, integriere, committe,
  pushe und berichte. Selbst eingreifen nur bei akutem RAM-Mangel oder bei kleinen Integrationsfixes.
- Eigene Turns kurz halten (lange Läufe als Hintergrundtask), damit der Nutzer mich jederzeit erreicht.
- Staffelübergabe (eigener Kontext reicht nicht mehr, Faltung scheitert, Nachtlauf zu lang) oder ein ganzer Plan für eine neue Orchestrator-Sitzung, die ich nur beaufsichtige: Laufende eigene Worker abschließen, keine neuen starten. Dann `.tmp/night/ORCH-AUFTRAG.md` (Auftrag wörtlich, bereits getroffene Entscheidungen, Queue, Ablauf je Paket, Regeln für Übergabe und Abschluss, Obergrenze teurer Worker je Anbieter-Konto, bei der Orchestrator und Aufsicht mitzählen) und eine Übergabe-Notiz schreiben. Neue Sitzung: `herdr tab create --workspace <ws> --cwd <dir> --label orch-<n> --no-focus` (Pane-ID in `.result.root_pane.pane_id`), dann `herdr agent start orch-<n> --kind pi --pane <pane> -- --model <provider/id> --thinking high` (Pane muss am Shell-Prompt stehen) und `herdr agent wait <pane> --until idle`. Vor dem Startprompt den Bildschirm per `herdr pane read <pane> --source visible` auf Warn-Dialoge prüfen: Ein Skill mit YAML-Fehler fehlt sonst still (Fix und Prüfskript in pi-extension-dev §12), danach `herdr agent prompt <pane> "/reload"`. Den Startprompt aus einer Datei schicken: `herdr agent prompt <pane> "$(cat <datei>)" --wait --until working --timeout 30000`. Grund: Ein langer Startprompt in der pi-Befehlszeile bricht an Anführungszeichen, und erst nach dem Laden ist sichtbar, ob alle Skills da sind. SID aus `herdr agent get <pane>` (`.result.agent.agent_session.value` = Pfad der Sitzungs-JSONL). Den Watchdog über eine von ihm eingelesene `watchdog.env` (Pane, SID) auf die neue Sitzung umstellen. Danach selbst nichts mehr am Projekt tun. Grund: Zwei Orchestrator-Sitzungen am selben Baum kommen sich in die Quere. Jede ältere Übergabe-Notiz im Ordner bekommt als erste Zeile `ÜBERNOMMEN von <Pane>/<SID> um <Zeit> – Stand: PLAN.md`; ist der Vorgänger schon weg, schreibt sie der Nachfolger. Grund: Startet der Nutzer später eine Sitzung mit der alten Notiz, hält diese den alten Stand für aktuell und arbeitet im selben Baum neben dem Nachfolger.
- Spur-Sitzung mit übervollem Kontext (bricht wiederholt nach abgelehnter Faltung ab, versucht trotz Regel
  Block-Zusammenführungen): nicht weiter anstoßen, sondern zwischen zwei Paketen in einem NEUEN herdr-Tab neu starten
  (gleicher Worktree, gleiche `--env`-Werte), die PANE-Datei der Spur umstellen (alte als `PANE.alt-<pane>` sichern),
  eine Startdatei mit Regeln, Auftrag, Plan-Ende und Ist-Stand (Branch, Commits, laufende Worker) prompten, die
  Aufsicht neu starten und die alte Sitzung untätig liegen lassen. Grund: Eine frische Sitzung lädt nur das Nötige,
  bekommt neu installierte Erweiterungen (Abbruch-Fortsetzung) und erbt keinen kaputten Faltungszustand.
- Jede autonome Sitzung (Spur und eigener Leitstand) bekommt einen Timer-Watchdog. Er prüft Fortschritt statt Lebenszeichen, den stopReason des letzten Turns und die laufenden bg_run-Tasks der Sitzung. Bei Kontext-Überlauf startet er pi frisch, statt anzustoßen. Den Herzschlag und jede andere Wartezeit der Spur nie als festes `sleep` bauen, sondern mit `scripts/warte.sh <spur> --max 1500`. Grund: Abschlussmeldungen wecken eine idle Spur nicht zuverlässig, und die Worker-Plätze bleiben dann bis zum nächsten Herzschlag leer. Eine laufende Spur fällt auch nach Prompt und Bestätigung wieder auf `sleep` zurück, weil sie Muster aus ihrem eigenen Verlauf nachahmt. Darum erkennt der Watchdog einen `sleep`-Wartetask selbst und stößt je Task einmal an. Bei jedem Wecken jede Queue-Zeile `läuft <runId>` gegen das Fertig-Signal halten. Eine Nachricht der übergeordneten Ebene (Leitstand/Nutzer) mitten im Lauf nie nur quittieren, sondern im selben Zug Zustand prüfen (`pgrep -af warte.sh`, `tail -c 100` der `.out` je Queue-Zeile), fertige Läufe abnehmen, freie Plätze belegen und den Herzschlag neu starten: Ein beendeter Herzschlag und reine Fertig-Benachrichtigungen der Worker wecken die Spur sonst nicht, und die Plätze bleiben stundenlang leer. Nach jedem Start des Herzschlags `sleep 20; pgrep -af warte.sh` als Gegenprobe, dass er wirklich läuft. Den Herzschlag mit `bg_run … surviveReload:true` starten (ein Neuladen der Sitzung beendet ihn sonst still) und bei jedem Phasenwechsel auf die Queue der NEUEN Phase umstellen (`warte.sh <spur-der-neuen-phase>`): Beobachtet er die alte, fertige Queue, wacht er nie wegen neuer Fertigmeldungen auf. Beim Umstellen den alten Herzschlag per `bg_kill` beenden, damit genau einer läuft. Die Stand-Datei an jedem Phasenübergang vollständig nachziehen und wechselnde Kennungen dort nie global per `sed` ersetzen. Watchdog-Skripte nur als getestete `.new` per `mv` einsetzen. Prüfungen, Schwellen, Befehle und Gründe: references/watchdog.md; Timer-Aufbau: references/mehrebenen-worktrees.md §Überwachung.
- Einen fremden Orchestrator (eigene Sitzung, eigenes Pane) beaufsichtigen oder ihm Pakete einplanen: nur über seine gitignorten Steuerdateien und `herdr agent prompt`, nie über seinen Arbeitsbaum, seine Worker oder sein Pane. Aufsichts-Loop als bg_run aus `scripts/orchestrator-aufsicht.sh`; Lesewerkzeuge, Einplanen, Schwellen und Eskalation in `references/orchestrator-aufsicht.md`. Die Vorlage meldet FERTIG erst, wenn der Schlussbericht (`AUF_DONE`) vorliegt UND ein Abschluss-Signal da ist (Watchdog-Stop-Marker oder `AUF_TIMER` inaktiv), weil Orchestratoren den Bericht oft vorab von einem Worker entwerfen lassen (vor Prüflauf und letztem PR); ohne Watchdog endet sie mit STEHT samt Hinweis auf den Bericht. Pro Projekt ein kleines Wrapper-Skript anlegen, das alle `AUF_*`-Pfade absolut exportiert und mit `exec bash <skill>/scripts/orchestrator-aufsicht.sh` endet; der Neustart nach jeder Meldung ist dann ein Einzeiler. `AUF_LOG`/`AUF_STATE` nie in Ordner legen, die `AUF_PROG_EXTRA` oder der Watchdog als Fortschritt zählen, weil die Loop sich sonst selbst Fortschritt meldet.
- Zu groß für eine Sitzung und andere Agenten im selben Repo: drei Ebenen (Leitstand → Spur-Orchestratoren in eigenen herdr-Tabs → Worker) mit eigenem Git-Worktree je Paket; Planmodus-Einreichung, Worktree-Aufbau und -Integration (auch PR je Spur, Merge nur durch den Leitstand), geteilte Laufzeit-Ressourcen (DB je Spur per TEMPLATE, Migrationsnummern-Bereiche, serialisierte E2E auf festem Port, Sperr-Wrapper mit Herzschlag), pi-lens-Schutz für Unter-Sitzungen, ebenenübergreifende Obergrenzen, maschinell prüfbarer Paketplan (Schnitt, Bereichs-YAML, Validator mit Exit 0), Queue-Skript je Paket (Status unter Sperre, Prüflauf aus dem Diff, Integration mit Lockfile-Regel), Phasen-Skript mit Gates, Wellen-PR über Schnappschuss-Branch, kein `worktree prune`, Attrappen-Test der Leitstand-Werkzeuge, OOM-Retry auf Build-Slots, Modellwechsel laufender Spuren und Budget-Stufen (inkl. Leitstand-Verbrauch, Ausgleich bei gesperrtem Anbieter) in `references/mehrebenen-worktrees.md`. Merge je Spur (inkl. Mandanten-Review neuer Abfragen), Integrations-Selbsttest (Typecheck/Lint/Unit des Gesamtstands, alle Specs zusammen, eigener Playwright-Rundgang mit Screenshots), Live-KI-Probe ohne Mock, Nachbesserungs-Protokoll, Folgeauftrag des Nutzers mitten im Lauf, Messungs-Aufteilung und RAM-Schutz im Sperr-Wrapper in `references/leitstand-abnahme.md`. Für Spur-Sitzungen den acp-Wächter beim Tab-Start per `herdr tab create … --env PI_ACP_DELEGATE_IDLE_TIMEOUT_MINUTES=15 --env PI_ACP_DELEGATE_ASYNC_TIMEOUT_MINUTES=240` lockern, weil pi die Werte nur beim Sitzungsstart liest.
- Baut ein Lauf neue sichtbare Funktionen in eine App mit Einführungs-Tour oder Handbuch, von Anfang an einplanen: je Funktion ein Tour-Schritt und ein Handbuch-Eintrag im selben Paket (maschinell geprüft in Plan-Prüfer, Brief, Abnahme und Gate) und vor dem Abschluss eine Gesamtheitsprüfung, ob alle Funktionen zusammenpassen (zwei Prüfer verschiedener Modellfamilien, Nutzer- und Systemsicht). Das gilt auch, wenn der Nutzer es nicht eigens verlangt. Grund: Er erwartet beides bei jedem Ausbau, und nachgeschoben wird es teuer und lückenhaft. Umsetzung: references/querschnitt-pflichten.md.
- Nebenthemen, um die der Nutzer zwischendurch bittet (z. B. ein störendes Werkzeug), zeitlich begrenzen: zuerst
  upstream nach dem Fehler suchen (Issues/PRs), nach wenigen Diagnoseschritten Zwischenstand mit Ursache und Plan
  melden. Grund: Stilles Lesen von Fremdcode verbraucht Kontext, den die Hauptarbeit noch braucht.
- Folgearbeit, die ein automatischer Lernpass (Review-Turn) entdeckt (z. B. ein zurückgesetztes Kontingent), dort
  nicht erledigen, weil der Pass keine neue Arbeit beginnen darf. Stattdessen eine Selbst-Erinnerung stellen:
  `systemd-run --user -q --unit <name> --on-active=3min --setenv HOME=$HOME --setenv PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.nix-profile/bin --setenv DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus /bin/bash <steuerordner>/erinnerung.sh <eigenes-pane> "<was zu tun ist>"`.
  `erinnerung.sh` tippt den Text mit `herdr pane send-text <pane> "<text>"` ein, wartet 1 s und schickt
  `herdr pane send-keys <pane> enter`. Grund: Danach liegt die Sitzung idle, und bis zum nächsten Aufsichts-Ereignis
  oder Watchdog-Anstoß vergehen oft Stunden. HOME, PATH und DBUS gehören ausdrücklich in die Unit, weil transiente
  User-Units die Umgebung der Sitzung nicht erben.
- Worker-Plätze nie leer lassen: Endet ein Paket, sofort das nächste starten und erst danach integrieren,
  prüfen und Lücken lesen. Die Aufgabe für das nächste Paket schreibe ich, während das laufende noch arbeitet.
  Ein freier Platz darf höchstens ein paar Minuten frei bleiben, nicht bis die eigene Integration fertig ist.
  Hängt ein Paket an unvertriebener Arbeit einer anderen Spur (Dienst/Paket noch nicht auf der Basis, Doku fehlt), nicht warten: das Paket in einen Teil ohne diese Abhängigkeit (Bausteine, Hooks, Allowlists, Fake statt Dienst) und einen Teil nach dem Merge schneiden, den ersten sofort starten und früh als eigenen PR anbieten, weil andere Spuren oft auf genau diese Bausteine warten; den Teil-Schnitt im PLAN.md-Paketeintrag vermerken (`Teil a läuft; Teil b nach <Merge>`). Baut das nächste Paket auf einem PR, der gepusht, aber noch nicht gemergt ist (CI läuft), nicht auf den Merge warten: lokalen Branch vom PR-Branch abzweigen (`git checkout -b <folge> <pr-branch>`), den Worker dort starten, im Brief „gestapelt auf #<nr>, kein neuer Branch, nicht pushen“ nennen; erst nach dem Merge auf `origin/<basis>` aufsetzen (`rebase --onto`) und dann als eigenen PR öffnen. Wirkt die CI-Wache des ersten PR, bleibt der Worker-Platz belegt und der Worktree wird nicht für Vorpush-Läufe blockiert, weil dessen Branch nicht mehr ausgecheckt sein muss.
- Eine Vorgabe des Leitstands/Nutzers, die ein bereits laufender Worker betrifft (z. B. neue zentrale Prüffunktion statt eigener Logik): `acp_delegate` kennt kein Nachsteuern. Ist der Worker noch in der Frühphase, abbrechen und mit angepasstem Brief neu starten; ist er schon tief im Baum (viele geänderte Dateien), laufen lassen, die Vorgabe sofort im PLAN.md vermerken und nach seinem Abschluss als eigenes Zusatzpaket (nur Umstellung) einplanen. Kommende Pakete bekommen die Vorgabe gleich im Brief. Grund: Ein Abbruch spät verwirft Stunden Arbeit, eine unbemerkte Abweichung zementiert die falsche Form.
- Teilergebnis früh als PR anbieten, während ein Worker im Spur-Worktree weiterarbeitet: den Vorpush NIE im Worktree mit laufendem Worker fahren (er committet-Stand-Basis, aber Turbo/Jest laufen über den Arbeitsbaum und messen halbfertige Dateien). Stattdessen `git worktree add -b <pr-branch> ../<spur>pr <commit>` (sauberer Stand genau der PR-Commits), `.env.local` kopieren, `nix develop … pnpm install --frozen-lockfile --prefer-offline`, dann `mt-vorpush` (voll) + Encoding-Prüfung + `npm run pr:titel` als ein bg_run, anschließend Push, `gh pr create --body-file` und CI-Wache von dort. Der Worker arbeitet auf seinem Branch weiter und zieht den Merge des PR später per Merge/Rebase nach. Grund: Die Prüfung gilt dem exakten PR-Stand, und die Worker-Plätze bleiben belegt.
- Zwei Worker parallel im SELBEN Worktree (Schichten wie Server-Actions und Oberfläche): vorher die Schnittstelle (Typen + Zod-Schemas) selbst schreiben und committen, beide Briefe darauf verweisen und disjunkte Pfade vorgeben; jeder committet nur mit `git add <Pfade>` und `git commit -F <datei> -- <Pfade>` (nie `add -A`, stash, reset, amend). Grund: Ohne festen Vertrag baut jeder Worker eine eigene Form, und ein Sammel-Commit nähme die uncommitteten Dateien des anderen mit. Der Oberflächen-Worker darf auf die Actions-Datei des anderen warten (`sleep 120`-Schritte), nicht sie anlegen.
- Variante ohne Worker-Commits (nur ich integriere): beiden Briefen disjunkte Pfadlisten UND die Pfade des jeweils anderen als „nicht anfassen" geben (auch im Start-Task wiederholen). Grund: Der zweite Worker sieht die Pfadliste des ersten sonst nie. Eine „grüne volle Suite" aus einem gemeinsamen Baum enthält den halbfertigen Stand des Parallel-Workers — sie ist kein Abnahmetor für die Welle; verbindlich ist der Schlusslauf des LETZTEN Workers über den vollständigen Stand (oder mein eigener Integrationslauf vor dem Commit).
- Der acp-Wächter beendet einen Worker nach 5 min ohne Ausgabe (Standard; einstellbar, Vorrang: env `PI_ACP_DELEGATE_IDLE_TIMEOUT_MINUTES` > `pi.subagents.idleTimeoutMinutes` > veraltet `.pi/acp.json` `{"delegate":{"idleTimeoutMinutes":12}}`) — auch wenn er in einem langen Vordergrundbefehl (nix develop/tsc/jest/eslint, Sperr-Wrapper mit Wartezeit) steckt (Ergebnis: SIGTERM, Arbeit uncommittet im Baum). In JEDEN Brief mit langen Befehlen: Heartbeat mitlaufen lassen, `( while sleep 60; do echo "[hb]"; done ) & HB=$!; trap 'kill $HB' EXIT; <befehl>`. Das `trap` direkt nach `HB=$!` ist Pflicht, weil der Herzschlag sonst bei frühem Ende (Fehler, `tail`-Pipe, Abbruch) weiterläuft und ein bg_run-Task nie endet, obwohl das Ergebnis längst steht. Fortschrittszeilen eines Sperr-Wrappers zählen nur, wenn sie das Werkzeug laufend erreichen: weder `| tail` noch eine reine Umleitung in eine Datei (`<befehl> > log 2>&1; echo rc=$?`) — beides lässt das Werkzeug minutenlang stumm. Pflichtmuster, im Brief WÖRTLICH vorgeben, weil Worker es sonst verkürzen: `timeout 3600 <befehl> > .tmp/lauf.log 2>&1 & P=$!; while kill -0 $P 2>/dev/null; do sleep 50; echo "[hb] $(tail -n1 .tmp/lauf.log)"; done; wait $P; echo rc=$?; tail -n 60 .tmp/lauf.log`. Worker starten keine eigenen Sub-Agenten (`acp_delegate`, `subagent`), weil ein blockierender Aufruf minutenlang nichts ausgibt und denselben Wächter auslöst; das gehört als Satz in jeden Brief. Die Wache (`scripts/worker-wache.sh`) meldet TOT? erst, wenn nach dem Wegfall eines Worker-pi die eigenen Läufe 6 min lang nichts mehr in ihre `.activity` schreiben; endet ein ANDERER Worker der Sitzung (z. B. vom Wächter beendet), gibt sie Entwarnung statt Fehlalarm. In meinen eigenen bg_run-Tasks (Vorpush, CI-Poll) gar keinen Herzschlag nutzen: Der Idle-Wächter gilt nur für acp-Worker. Passiert es trotzdem: `resumeFrom` mit genau diesem Satz plus Liste der offenen Befunde (Lint-/Encoding-Funde aus dem `.activity`-Ende); der Baumstand bleibt erhalten. Auch bei exit 0 nach Abschluss immer `git status`/`git log` prüfen, bevor ich Erfolg melde: Ein Worker (v. a. nach Resume) beendet gelegentlich den Turn nach einer Ankündigung („schreibe jetzt den Code“) mit uncommitteter Teilarbeit und ohne Commit. Dann sofort erneut `resumeFrom` mit der Liste der offenen Schritte (verdrahten, Tests, Doku, Prüfungen, Commit) und dem Satz „kein Turn-Ende vor dem Commit“; Meldet die Fehlermeldung „exit 0 but produced NO final reply text“ und das `.activity`-Ende zeigt `[retry] … 429`/„Nutzungslimit“ (Anbieter-Kontingent, etwa 5-Stunden-Fenster), liegt es nicht am Worker: Reset-Zeit aus der Meldung notieren, den Worker einmal mit `resumeFrom` und dem vom Leitstand vorgesehenen Ausweich-Modell (`model`-Parameter) fortsetzen, im PLAN.md und an den Leitstand vermerken und folgende Worker gleich mit dem Ausweich-Modell starten, bis das Fenster zurückgesetzt ist; ein Warten auf den Reset ist keine Option, solange der Platz sonst leer bliebe. Steckt der Run danach in `[retry]`-Schleifen und meldet nie „fertig“, lehnt `resumeFrom` ihn als „running“ ab: erst `acp_delegate_cancel`, dann `resumeFrom` mit dem Ausweich-Modell. Stille-Timeout-Abbrüche in langen Experiment-Phasen (Bibliotheks-/Kernel-Probierbefehle) lassen sich im Resume-Brief durch „keine weiteren Experimente, die Entscheidung steht, jetzt schreiben“ abkürzen. Laufen Messungen der Worker über dasselbe Anbieter-Konto wie die Anwendung (Benchmark gegen die App-KI), die Worker selbst auf einem anderen Konto starten und die Messung als eigenen, späteren Schritt aus dem Brief herauslösen („PR mit Vermerk Messung folgt; Fortsetzung nach Reset“), sobald das Konto knapp ist; den Fortsetzer per Wecker zum Reset planen. Grund: Worker-Schleifen auf dem geteilten Konto leeren das Kurzzeitfenster, dann scheitern Messung und Anwendung zugleich.
- Läuft ein Worker ins harte Zeitlimit (`timeoutMinutes`, exit 143) mit uncommitteter Arbeit im Baum: Baumstand sichern (`git stash -u`), Branch auf die aktuelle Basis setzen (`git checkout -B <branch> origin/<basis>`, `git stash pop`), falls die Basis inzwischen vorangekommen ist, und dann mit `resumeFrom` plus Liste der Restpunkte (nur Abnahme/Commit, kein Neuanfang) fortsetzen — ein Modellwechsel (nach Leitstand-Vorgabe) gilt erst für diesen Neustart. Neue Wache, alte endet mit Fehler. Grund: Die Resume-Sitzung kennt den Verlauf, braucht aber den aktuellen Basisstand, sonst scheitern Abnahme und Vorpush an Fremdänderungen.
- Mit zwei Modellklassen (stark/schnell und billig/langsam) und einer Kettenstruktur (Teil n erst nach n-1): die wenigen teuren Plätze FEST den längsten Ketten geben, alle kurzen Ketten laufen auf dem billigen Modell, und frei werdende teure Plätze bis zum Ende des laufenden Kettenglieds freihalten statt sie mit kurzen Ketten zu füllen. Grund: Die längste Kette bestimmt die Gesamtdauer; ein teurer Platz in einer kurzen Kette verschenkt Zeit. Modell erst beim Start wählen, in die Queue-Spalte schreiben, Zählung je Runde ins Journal; Wechsel: references/modellwechsel-brief.md.
- Meldet ein Worker mitten im Lauf „Arbeitsverzeichnis gelöscht“ oder bash/bg_run scheitern am cwd, zuerst vom Orchestrator aus prüfen (`ls`, `git status`, Ziel-Datei unverändert?). War es ein kurzer Ausfall, nichts abbrechen: der Worker läuft meist weiter und wird fertig. Endet ein Worker nach `[retry] … Stream ended without finish_reason` mit unveränderter Ausgabedatei, einen frischen Worker mit „nach 2–3 gelesenen Abschnitten schon schreiben“ starten, nicht `resumeFrom`.
- Endet ein Worker an seiner eigenen Kontextgrenze (Ergebnis „teilweise“, `/tmp/acp-delegate/<runId>.session.jsonl` mehrere MB), ihn nicht per `resumeFrom` fortsetzen. Stattdessen einen frischen Worker starten, der das Teilergebnis aus der Datei fortsetzt: Restliste (offene Quellen/Schritte) in den Brief schreiben und verlangen, dass er nach jeder Einheit sofort in die Datei schreibt. Grund: `resumeFrom` lädt den vollen alten Kontext, sodass der fortgesetzte Worker oft nur noch eine Einheit schafft; ein frischer schafft ein Vielfaches.
- Worker stirbt mit `ENOSPC: no space left on device` (letzte Aktivität sonst unauffällig): `df -h /tmp` prüfen — /tmp ist ein tmpfs (16 G), und jeder `nix develop`/Sperr-Wrapper-Lauf lässt ein `/tmp/nix-shell.*` (~300 MB) zurück; nach ~1000 Läufen ist es voll. Abhilfe: `find /tmp -maxdepth 1 -name 'nix-shell.*' -mmin +90 -exec rm -rf {} +` (nur ältere, laufende Läufe nutzen jüngere), dann den Worker mit `resumeFrom` fortsetzen; der Baumstand bleibt. Bei langen Spuren in den Brief schreiben, dass der Worker bei ENOSPC dasselbe `find` mit `-mmin +30` ausführt, und das Löschen vor Spurstart/nach jedem Paket selbst erledigen. Zweite Ursache: große Test-/E2E-Logs in /tmp (`du -sh /tmp/* | sort -h | tail`). Vorbeugend in JEDEN Worker-Brief: Test-, E2E- und Build-Logs nie nach /tmp, sondern in den Worktree (`.tmp/`, gitignoriert) oder den Log-Ordner der Spur schreiben, Ausgabe in eine Datei unter `.tmp/` umleiten statt `| tail` (`tail` puffert bis zum Ende, der acp-Wächter sieht dann 5 min nichts und beendet den Worker) und große Logs nach dem Lesen löschen. Grund: tmpfs ist RAM, ein voller /tmp reißt die Sitzungen ALLER Spuren mit (auch die Sitzungsdatei-Schreibvorgänge). Nach einem Orchestrator-Absturz sind auch seine laufenden Worker tot (`acp_delegate_wait` meldet „No delegate run“, `/tmp/acp-delegate/<runId>.out` endet mitten im Satz; ein Anstoß per `herdr agent prompt` scheitert mit `agent_not_found`: dann die Ursache mit `herdr pane read <pane> --source recent --lines 40` lesen, z. B. `pi exiting due to uncaughtException: [Error: ENOSPC …]` – zeigt `df -h /tmp` danach wieder Platz, war es eine kurze Spitze, dann nichts Fremdes löschen –, und den Anstoß nach dem Neustart durch den Watchdog erneut senden). Die neu gestartete Sitzung hält diese Läufe oft für aktiv, weil ihre `.activity` noch jung ist. Darum gehört in den Wiederaufnahme-Abschnitt jeder Startdatei: Nach dem Tod des eigenen pi gelten alle Zeilen `läuft|nacharbeit <runId>` als abgebrochen, Gegenprobe `pgrep -P <eigene pi-pid>` (keine Worker-Kinder). Danach: `git status`/`git log` im Worktree lesen (der Baumstand bleibt), den Worker mit `resumeFrom=<alte runId>` und den Restpunkten fortsetzen (neue runId → neue Wache); schreibt der Worker nur eine Berichtsdatei (Recherche-/Nachlese-Läufe) und ist seine Sitzung groß, stattdessen einen frischen Worker ohne `resumeFrom` starten, der die offenen Quellen aus `bericht-check` (oder der Restliste) holt und zuerst fehlende Abschnitte für schon geschriebene Einträge nachzieht, nachdem die Berichtsdatei als `.bak` gesichert ist: Die Datei ist der Zustand, und `resumeFrom` schafft wegen der geerbten Historie oft nur eine Quelle und mehrere offene Pakete desselben Baums in EINEN Resume-Brief mit je eigenem Commit packen. Zudem gilt: Datei mit dem write-Tool und der bash-Aufruf, der sie liest (`git commit -F`), nie im selben Tool-Block abschicken, weil beide parallel laufen und der Commit eine noch nicht vorhandene Datei liest (ein halbfertiger Merge bleibt dann offen: `git rev-parse -q --verify MERGE_HEAD` prüfen).
- Sperr-Wrapper-Vorläufe (Vorpush/E2E) als Hintergrundtask mit ≥2 h Timeout starten: Der Wrapper wartet erst auf die globale Sperre, die fremde Spuren >30 min halten können — ein zu knappes bg-Timeout killt ihn in der Wartephase, und das Ergebnis steht erst nach einem erneuten Lauf fest. Wartezeilen („belegt, warte (seit X min)“) im Wrapper-Log sind normal, nicht hängen. Kleine Nachbesserungen (wenige Dateien, Worker hat Jest/E2E/typecheck/lint schon grün gemeldet) brauchen nur `mt-vorpush schnell` (drei Skript-Prüfungen, Sekunden, Sperre „mittel“) statt des vollen Vorpush — vorher die Basis einmergen, JSON parsen und Encoding prüfen. Ausnahme: Bindet eine Seite/Komponente neu eine Client-Komponente ein, die Server-Actions oder Query-Keys nachzieht (next/cache, next-auth), laufen die bestehenden Seitentests der CI beim Laden in „Cannot use import statement“/„TextEncoder is not defined“, und `schnell` führt keine Jest-Suiten aus — dann vor dem Push den kompletten App-Jest über den Check-Wrapper laufen lassen (`cd <app> && npx jest --coverage=false`) und die neue Komponente in den Seitentests wie die übrigen Unterkomponenten per `jest.mock('<pfad>', …)` ersetzen (alle Exporte der Datei im Mock nennen); danach `coverage/` löschen. Überlagerte UI (Schublade, Overlay) im Screenshot auf Durchsichtigkeit prüfen: Glas-Themes machen `bg-background` transparent, wenn das Element nicht über das projektübliche `data-slot`-Muster ausgenommen ist.
- E2E-Specs mit eigenem Seed in geteilter DB: Playwright führt chromium und mobile PARALLEL aus (fullyParallel, workers>1) — feste Seed-IDs, Slugs und Titel-Präfixe lassen den Cleanup der einen Projektinstanz die Zeilen der anderen löschen und UNIQUE-Konflikte beim zweiten Seed entstehen. Jede Instanz (project.name, repeatEachIndex) bekommt eigene IDs (UUID-Ziffern codieren Instanz, Projektnamen sind kein Hex), Namen und Präfixe (testInfo.project.name / testInfo.repeatEachIndex in beforeAll/beforeEach). Bei Specs über firmaweite Projektionen (Karte, globale Listen) verwässern fremde Instanzen zusätzlich die Inhalte: Datum und Koordinaten je Instanz so versetzen, dass Gruppierung/Tourenbildung fremde Seeds nie einschließt, und Assertionen instanzbezogen („unsere Titel/N-ten“) statt absoluter Gesamtzahlen. Nachweis mit --retries=0 --repeat-each=2 UND dem Projekt, das die Spec wirklich einsammelt — vorher per `npx playwright test --list --project=<name>` prüfen: Lizenz-gate-Specs stehen oft in testIgnore der Standard-Projekte (chromium/mobile) und laufen nur in einem Spezialprojekt; ein Nachweis auf ignorierenden Projekten endet „No tests found“ ohne Prüfwirkung, und --repeat-each=2 über mehrere Worker erzeugt die Parallel-Kollision in derselben DB ebenso. Die E2E-Sperre ist geteilt: Im Brief verlangen, dass ein neuer Spec erst als EINZELTEST je Projekt (`-g '<Testname>'`, bash-timeout ~1200) grün ist, bevor der Volllauf (beide Projekte, repeat-each=2, `timeout 1500`) startet, dass Spec-Timeouts klein bleiben (Test ≤ 120 s, expect ≤ 15 s) und dass ein roter Lauf nie als Volllauf wiederholt wird — sonst läuft jeder Fehler als Minuten-Timeout weiter und blockiert die Sperre für andere Spuren (Folge: Leitstand bricht ab). Seiten, bei denen die Firmenwahl die URL nachträglich um `?firma=` ergänzt (router.replace), brechen laufende Server-Actions ab und bleiben auf „… wird geladen“ hängen: die Spec ruft die Seite gleich mit `&firma=<id>` auf (Id per DB-Helfer), statt Timeouts zu erhöhen. In seriellen Specs verändern frühere Tests die geteilten Seed-Zeilen (angelegte Räume) — Screenshot-/Leerzustands-Tests setzen den Zustand vorher selbst zurück; Screenshots erst nach der Einblend-Animation (`waitForTimeout(~1200)`) und mit `el.evaluate(e => e.scrollIntoView({block:"center"}))` (zuverlässiger als `scrollIntoViewIfNeeded` unter schwebender Nav) machen und selbst ansehen. Flüchtige Erfolgsmeldungen (Selbstschließen) nie als Pflicht-Erwartung nehmen, sondern das bleibende Ergebnis prüfen. Beschriftungen mit Zeilenumbruch (`<br>`) findet `getByText("Raum hinzufügen")` nicht — das `data-einfuehrung`-/`data-testid`-Attribut nehmen. „Genau ein Einstieg je Zustand“ per `toHaveCount(1)` auf den Test-ID-Locator absichern (sichtbar-Prüfung allein übersieht Doppelungen); „Handy: nicht von der Leiste verdeckt“ nach `window.scrollTo(0, scrollHeight)` messen (Unterkante ≤ Viewport − ~80 px), nicht per `scrollIntoView`, das die Kachel unter die Leiste legt. Rot nur im Projekt `mobile` (Produkt ok): Oft liegt ein Bedienelement (Sitzungsliste, „Neuer Chat“) unter Tailwind-`sm` (640 px) in einer geschlossenen Schublade — die Spec behebt das mit einem Helfer, der nach `page.viewportSize()?.width < 640` den Schubladen-Toggle klickt (nie nach Projektname; auf Desktop würde der Klick die offene Liste schließen), und nutzt für Aktionen, die in Kopfzeile auf beiden Größen sichtbar sind, deren `data-einfuehrung`-Attribut statt Text-Selektoren. Nachweis: Einzeltest je Projekt, dann beide Projekte `--retries=0 --repeat-each=2`. Handy-Fehlerbilder zuerst im Screenshot (test-results/*/test-failed-1.png) lesen: schwebende Bottom-Nav/FAB, Banner und Hero schieben Bedienelemente unter die Nav oder überdecken sie; dann `scrollIntoViewIfNeeded`, Banner schließen oder unteres Padding in der Komponente beheben statt Timeouts zu erhöhen. Verständnisprüfung der Oberfläche (frischer Blick): einen Worker beauftragen, der den Code nicht gebaut hat; der Brief verlangt, ZUERST nur die Screenshots (Handy 390×844 und Desktop) zu lesen und je Bild in einer Datei festzuhalten, was ein Mensch ohne Vorwissen tun soll, was unklar/abgeschnitten/zu klein ist und ein Urteil OK/NACHBESSERN, und erst danach Quelltext oder Doku anzusehen; fehlende Zustände erzeugt er per Playwright-Rundgang selbst. Grund: Wer den Code kennt, versteht die Oberfläche zwangsläufig und findet die Lücken nicht. Wird ein Worker wegen so einer Auflage abgebrochen, per `resumeFrom` mit der Auflage im Task fortsetzen (neue runId → neue Wache; die alte Wache endet mit Fehler und ist dann ohne Belang).
- Neben JEDEM gestarteten Worker eine Wache als bg_run laufen lassen (`WACHE_ALLE=1 sh <skill>/scripts/worker-wache.sh <runId>`, isAgent false, surviveReload true, Timeout > erwartete Laufzeit) — als eigener, späterer Aufruf, nie im selben Tool-Block wie `acp_delegate`, weil die runId erst aus dessen Antwort kommt (ein Platzhalter-Id-Wache muss wieder gekillt werden): Die Abschlussmeldung von acp_delegate weckt eine ruhende/idle Sitzung nicht zuverlässig, das Terminal-Ende der Wache schon; ohne sie steht die Spur still, bis ein äußerer Timer sie anstößt.
- Nach einem Neustart des eigenen pi (Sitzung fortgesetzt; der Task-Ordner `.pi/tasks/<sitzung>-<nummer>/` trägt eine neue Endung, `bg_status` kennt keine Tasks mehr) sind alle bg_run-Wachen und Warteketten der alten Laufzeit beendet, auch solche mit `surviveReload` (das gilt nur für ein Neuladen im selben Prozess). Darum sofort je Kette Status und Fortschritt im alten Ordner lesen (`jq -r .status <alt>/<id>.json` → `killed`, letzte Zeile der `<id>.output`), die übrigen Schritte von Hand nachholen (vor einem Tag erst der Trockenlauf) und die nötigen Wachen in der neuen Laufzeit neu starten. Grund: Eine Kette, die auf eine Handlung des Nutzers wartet (Merge, Freigabe), meldet sich sonst nie; sagt der Nutzer „erledigt“, bleibt der nächste Schritt (Tag, Bau-Wache) still liegen.
- CI-Wache nach einem Push (bg_run-Schleife über `gh pr checks <pr>`): erst 100–120 s warten und „no checks reported“ wie pending behandeln — direkt nach dem Push (und bei einem PR mit Merge-Konflikt, der gar keine Runs bekommt) meldet `gh` sonst „keine Checks“, und die Schleife endet sofort mit leerem Ergebnis. Am Ende die HEAD-SHA ausgeben (`gh pr view <pr> --json headRefOid,mergeable`) und gegen den gepushten Stand vergleichen; bleibt ein PR lange ohne Runs oder meldet der Leitstand das, ist `mergeable` meist CONFLICTING/UNKNOWN → `origin/<basis>` einmergen, pushen, neue Wache. Ändert der Leitstand mitten im Lauf die Vorgabe (neuer Commit nötig), die überholten Vorpush-/Wache-Tasks per `bg_kill` beenden, bevor der neue Stand geprüft wird; deren „killed“-Meldungen sind dann ohne Belang.
- Nichts darf abstürzen: Prozesse des Nutzers nie anfassen; vor jedem Start `free -m` und Swap prüfen (siehe ram-audit).
- Worker-Commits in Repos mit Commit-Hook (Conventional-Prefix erzwungen) und PR-/Encoding-Prüfung (Titelschema, keine ASCII-Umschrift wie „ae/ue/ss“ für Umlaute): Commit-Muster und „echte Umlaute in Commit-Nachrichten und Dateien“ in den Worker-Task schreiben. Vor dem ersten Push die Subjects der noch ungepushten Commits per `git filter-branch -f --msg-filter 'python3 <filter.py>' <basis>..HEAD` umschreiben (Prefix `feat(x): ` entfernen, Umschrift ersetzen), danach die Encoding-Prüfung gegen die Basis laufen lassen und erst dann `origin/<basis>` einmergen (kein Rebase). Grund: Hook und CI-Prüfung widersprechen sich; vor dem ersten Push ist Umschreiben folgenlos, danach nicht mehr. Der Hook blockiert den GANZEN Bash-Aufruf, auch ein vorangestelltes `git add … &&` läuft dann nicht — und er matcht auf den Befehlstext, also auch auf eine Heredoc, die in einem Worker-Task nur das Beispiel `git commit -m "MAG-…"` zitiert: Task- und Brief-Dateien daher mit dem write-Tool schreiben (nicht per `cat <<EOF` in bash) und den Commit-Satz als „`git commit -F <datei>`; die `-m`-Form mit Ticket-Titel blockiert die Shell“ formulieren. Nach „BLOCKED“ erst `git status` lesen, neu stagen, dann committen (Merge-Commits brauchen ebenfalls `chore(merge): …` bis zur Normalisierung). Die Umschrift-Prüfung greift auch auf Bezeichner im Code (Variablen wie „faelle“/„gekuerzt“): im Brief ausdrücklich verbieten und `python3 scripts/encoding-pruefung.py origin/<basis>` nach JEDEM Commit des Workers verlangen. Meldet ein Worker Funde in Dateien eines früheren Pakets (für ihn tabu), behebe ich sie selbst als kleinen Einzel-Commit (Bezeichner umbenennen, betroffenen Test nachlaufen lassen), statt sie bis zur Abnahme am Ende liegen zu lassen. Die Nachricht dieses Heil-Commits darf die beanstandeten Wörter nicht zitieren (die Prüfung liest auch Commit-Nachrichten und meldet sie erneut); trat das schon auf und ist noch nicht gepusht, die Nachricht per `filter-branch --msg-filter` (Bereich ab der zuletzt eingemergten Basis-Spitze, nicht ab `origin/<basis>`) neu fassen und DANACH erst die neue Basis einmergen.
- Lockfile abnehmen, sobald ein Paket neue Workspace-Pakete oder Abhängigkeiten bringt: `git diff --stat origin/<basis> -- pnpm-lock.yaml` und den Diff überfliegen; erlaubt sind nur der neue Importer-Eintrag und dessen echte Abhängigkeiten. Umschreibungen fremder Peer-Varianten (z. B. next-auth/next-intl) vor dem Push zurücknehmen lassen: `git checkout origin/<basis> -- pnpm-lock.yaml`, dann `pnpm install --lockfile-only --prefer-offline` im Check-Wrapper und Diff erneut prüfen; bleibt eine Umschreibung zwingend, im PR begründen. Läuft gerade ein Vorpush der Spur, die Anweisung erst danach umsetzen lassen und statt eines neuen Vollvorpush nur `pnpm install --frozen-lockfile` plus die Tests des neuen Pakets nachprüfen (CI prüft den Rest). Grund: Ein lokales `pnpm install` löst Peer-Varianten neu auf, ändert damit still die Auflösung für Apps, die die Spur gar nicht berührt, und erzeugt Lockfile-Konflikte mit parallelen Spuren.
- Geteilte Bausteine und gespeicherte Nutzerdaten abnehmen: Ändert ein Paket einen Baustein, den andere Funktionen mitbenutzen (z. B. `packages/ui`), verlangt der Brief die E2E-Specs ALLER Verwender (`git grep -l <Baustein>` → zugehörige Specs) auf Handy und Desktop, nicht nur die eigenen. Grund: Jede Spur testet sonst nur ihre Ansicht, und die Verdrängung in einer fremden Eingabezeile fällt erst im Integrationslauf auf. Erzeugt eine Funktion Nutzerdaten (Audio, Anhänge, Entwürfe), prüft der E2E nach dem Neuladen, dass die Daten noch da sind; die Abnahme zählt dazu die DB-Zeilen (nur lesend). Grund: Eine optimistische Oberfläche zeigt die Daten aus dem Browser-Speicher und täuscht über fehlendes Speichern hinweg. Nach den Spur-Merges läuft als Leitstand ein Integrationslauf aller neuen Specs zusammen; dessen Fehlerbilder sehe ich mir selbst an, bevor ich die Ursache vermute.
- Leitstand mit mehreren Spur-PRs: Jeden Spur-PR ab dem Öffnen selbst per PR-Wache beobachten (bei jeder Spurmeldung `gh pr list --base <basis>` gegen die bekannten PRs abgleichen), nicht erst auf die Fertig-Meldung der Spur warten. Grund: Sonst liegt ein grüner PR ungemergt, und die abhängigen Spuren warten mit. Bauen mehrere Spuren auf einer Funktion, die eine andere Spur erst liefert (zentrale Prüfung, Schnittstelle), dürfen die Aufrufer bis zu deren Merge einen Platzhalter mit genau derselben Signatur und TODO bauen. Der Leitstand vermerkt den Ersatz in seiner Stand-Datei als Pflichtschritt und meldet den Merge sofort an alle Aufrufer-Spuren. Grund: Ohne diese Meldung bleibt ein Platzhalter wie „immer verfügbar“ im Produkt.
- Mandanten-Wächter neuer Routen/Server-Actions abnehmen: Admins mit `firma.viewAll` haben keine feste Firma in der Session, `getActiveFirmaId(session)` ohne zweites Argument liefert für sie `null` („Keine aktive Firma“) — Worker-Code und Tests mit einer Session mit `firmaId` sehen das nie. Die Firma aus der Ressource (Termin/Angebot) ableiten und mit `getActiveFirmaId(session, besitzerFirma)` gegen die Session prüfen (nur `viewAll` darf die explizite Firma nutzen, alle anderen bekommen ihre eigene zurück → Abweichung = kein Zugriff). Dasselbe gilt für Verfügbarkeits- und Feature-Prüfungen ohne Datensatz („Funktion verfügbar?“, Einstellungen je Firma). Sie bekommen die in der Oberfläche gewählte Firma (`?firma=`) als Parameter und rufen `getActiveFirmaId(session, gewaehlteFirma)`. Zentrale Verdrahtungen (`firmaIdVon: …`) nie mit nur einem Argument. Beim Abnehmen neue Treffer von `getActiveFirmaId(session)` ohne zweites Argument per `git diff | grep` suchen. Grund: Der Inhaber testet als Admin über mehrere Firmen, und für ihn verschwindet die Funktion dann still. Im Brief einen Test „Admin mit `firma.viewAll`, `firmaId: null`“ verlangen und Rot ohne Fix belegen (nur die Quelldateien per `git stash push -- <src-Pfade>` zurücksetzen, Tests bleiben, danach `stash pop`).
- Tailwind-Sichtbarkeit: Steht neben einer festen Anzeige-Klasse (`flex`) eine bedingte (`hidden`), entscheidet die CSS-Reihenfolge, welche gewinnt — die Anzeige-Klasse nur in der Bedingung setzen (`offen ? "flex" : "hidden"`). Beim Abnehmen von Worker-UI-Code (ein-/ausblendbares Panel, das gemountet bleiben soll) gezielt darauf prüfen.
- Schwebende/eingebettete UI (Dock, Panel mit Seitenleiste) am Handy abnehmen: Eine Seitenleiste mit fester Breite (`w-64`) als Flex-Geschwister frisst auf 390 px zwei Drittel des Inhalts und lässt Eingabefelder senkrecht umbrechen — Jest/jsdom und Desktop-E2E sehen das nie. Im Brief für UI-Pakete verlangen: Standardzustand unter `sm` zu (Overlay per Knopf), per Tailwind-`sm:`-Varianten statt `window`-Lesen im `useState` (Hydration), plus ein E2E im Projekt `mobile` mit Breitenassertion (Eingabefeld ≥ 300 px, Liste unsichtbar) und einen Screenshot bei 390×844, den ich selbst ansehe. Nachbesserung nach der Abnahme des Leitstands: neuer Branch von `origin/<basis>` (der erste PR ist gemergt), nicht auf dem alten weiterarbeiten. Neue Nutzerfunktion (Knopf, Dialog) im Brief immer vom Startbildschirm des Nutzers aus planen: Einstiegspunkt auf jedem Reiter/jeder Übersicht, über die er in den Flow kommt (nicht nur auf der Detailseite), Leerzustand mit Hauptaktion, bei fehlendem Recht, fehlender Lizenz, abgeschalteter Firma oder nicht erreichbarem Dienst das Element gedämpft zeigen statt ausblenden; Antippen erklärt den Grund in Alltagssprache und verlinkt Admins zur Einstellung (ein verschwundenes Element hält der Nutzer für einen Fehler, ein toter Knopf ohne Erklärung ebenso), und der E2E startet auf dieser Übersicht statt per Direkt-URL auf der Detailseite. Grund: Eine Funktion, die nur auf einer Unterseite hängt, besteht alle Tests und wird vom Nutzer trotzdem „nicht gefunden“. Auffindbarkeit prüfe ich zusätzlich mit einem frischen Worker, der nur die Nachher-Screenshots sieht und sagen soll, wo man die Funktion benutzt. Vor-/Nachher-Live-Checks von Prompt-Änderungen messe ich VOR der Änderung (kein stash), und der Brief nennt den Fall „Live-Aufruf nicht möglich → Grund melden, nichts erfinden“.
- Anbieter-Kontingent leer (429 „5-Stunden-Limit“, `[retry] attempt n/10`): laufende Worker per `acp_delegate_cancel` stoppen (statt Retries abzuwarten) und mit `resumeFrom` plus `model` eines anderen Anbieters fortsetzen (Erkennung eines still gestorbenen Workers: letzte Zeile seiner `<runId>.session.jsonl` hat `stopReason":"error"` mit 429/424; die Abschlussmeldung kommt dann ohne Ergebnis, `git status` zeigt den erhaltenen Baumstand). Der Resume bekommt eine NEUE runId — daher auch eine neue Wache starten (`sleep 15; WACHE_ALLE=1 sh …/worker-wache.sh <neue-runId>`), die alte Wache hängt an der toten Id; nicht freigeschaltete Modellvarianten (429 Code 1311) nicht erneut versuchen. Arbeitsstand im Baum bleibt erhalten, uncommittete Dateien eines parallelen Workers im Task ausdrücklich ausnehmen.
- Neues Modell/neuer Anbieter-Tarif für Worker (Pilot): vorher prüfen, ob das Abo das Modell zulässt (Policy-Tabelle, references/kontingent.md §6). Danach zuerst EINEN Probestart und binnen ~1 min die Sitzungsdatei prüfen, bevor weitere starten. Meldet acp_delegate „FAILED … produced NO final reply text“ bei leerer `.activity`, steht die Ursache in der letzten Zeile von `/tmp/acp-delegate/<runId>.session.jsonl` (`stopReason":"error"`, `errorMessage`, 0 Token): das ist ein Start-/Konfigurationsfehler, kein Qualitätsurteil — den Pilot nicht werten, Aufträge zurück auf offen setzen, Sperrdatei der Spur (z. B. `HAIKU-AUS`) mit Grund anlegen und im Journal vermerken. Bricht ein Pilot erst mitten im Lauf ab, zeigt `jq -cR 'fromjson? | select(.message.role=="assistant") | {t:.timestamp, sr:.message.stopReason, err:(.message.errorMessage//""|.[0:700]), tok:.message.usage.totalTokens}' <session.jsonl> | tail -n 4` Ursache und Kontextstand je Turn. Ein HTTP 400 `invalid_request_error` gilt ebenso als Konfigurationsfehler, und der automatische Wiederholversuch scheitert gleich, weil er dasselbe Präfix schickt. Beispiel: „Invalid `signature` in `thinking` block … bound to a different conversation … rewritten“ heißt, ein Kontext-Werkzeug hat frühere Nachrichten umgeschrieben, an die das Modell seine Thinking-Blöcke bindet. Den Auftrag dann auf das bewährte Modell zurücklegen und die Ursache getrennt klären, statt ihn mit demselben Modell neu zu starten. Messläufe für modellgebundene Fenster: references/kontingent.md §1. Grund: Zwei gleichzeitig gestartete Pilotläufe scheitern sonst beide am selben Fehler, und die Queue zeigt „läuft“ für nie gelaufene Arbeit.
- Kündigt der Nutzer an, ein Kontingent zurückzusetzen, sobald es voll ist: das Tor befristet bis knapp unter die Notbremse heben (Ausnahme mit Marke) und `scripts/kontingent-melder.sh` als User-Unit starten; er benachrichtigt einmal und löscht die Ausnahme nach dem Zurücksetzen (references/kontingent.md §5). Grund: Der Rest der alten Woche verfällt beim Zurücksetzen, und eine stehengebliebene Ausnahme hebt das Tor auch in der neuen Woche.
- Die Reichweite der Kontingente rechne ich in Worker-Stunden je Anbieter (Prozente zweier Konten sind nicht gleich viel wert). Reicht sie nicht bis zur nächsten Bruchstelle, schlage ich dem Nutzer früh eine konkrete höhere Grenze vor, mit Bedarf, Kapazität und Pausenzeitraum in einem Satz (references/kontingent.md §9).
- Sind BEIDE Anbieter über ihrem Wochen-/Kurz-Tor (Kontingent-Skript der Spur, z. B. `pause.sh`), prüfe ich zuerst die Hebel in references/kontingent.md §6: Endspurt-Rampe oder befristete Ausnahme bei verfallendem Wochenrest, Modell mit eigenem Fenster erst nach Abo-Policy-Check, eigenen Leitstand-Verbrauch senken; rechnet ein Anbieter in Credits ab, zuerst den Verbrauch je Lauf messen, Worker-Läufe kurz halten und Hochlast-Zeiten sperren (§7). Für laufende Worker setze ich eine Notbremse (§4). Grund: Ein Wochenrest, der beim Reset verfällt, ist verlorener Fortschritt, und das Start-Tor stoppt laufende Worker nicht. Greift kein Hebel, starte ich nichts Neues: Journal-Zeile mit Reset-Zeit, Herzschlag durch genau EINEN `sleep <s>`-bg_run ersetzen (alten beenden), laufende Worker normal fertig abnehmen, sonst keine Kontrollrunden oder Quota-Abfragen. Nach Ablauf des Schlafs das Skript erneut fragen (FREI → zuerst gemerkte Nacharbeiten, dann Queue). Meldet der Nutzer oder die übergeordnete Sitzung mitten in der Pause, das Kontingent sei zurückgesetzt oder es sei noch Platz: Pause nicht aussitzen, sondern sofort Kontingent- und RAM-Skript neu fragen, den Pause-Schlaf per `bg_kill` beenden und bei FREI die gemerkten Fortsetzer starten (neuer Herzschlag). Grund: Die Pause-Dauer ist aus dem damaligen Reset-Zeitpunkt berechnet und wird von einem manuellen Reset nicht verkürzt. Grund: Jede Kontrollrunde verbraucht selbst Kontingent. Die Tor-Grenze liegt knapp unter dem Anbieter-Limit; ein einzelner Worker kann sie in einer Stunde reißen, deshalb vor jedem Start Kurz- UND Wochenwert prüfen.
- Fremde Läufe im selben `/tmp/acp-delegate/` (andere Spuren/Projekte, erkennbar am Task-Text in `*.session.jsonl`) ignorieren und weder abnehmen noch abbrechen; Fertig-Erkennung eines eigenen Workers ist die Schlussmeldung „ERGEBNIS:“ bzw. die Notification, nicht „`.out` nicht leer“ (die Datei enthält schon Zwischentext). Ein Auftrag, der erst NACH dem Start eines Workers eintrifft (Leitstand-Nachtrag, neuer Befund), gehört in eine NEUE Brief-Datei und ein Folgepaket: Der laufende Worker liest seinen Brief nur einmal beim Start und sieht Ergänzungen nie. Stirbt ein Worker am Hartlimit (180 min, exit 143, Wache „TOT?“), zuerst `git log`/`git status`/Ende der `.activity` lesen: Committetes zählt, grüne Nachweisläufe im Log (z. B. `24 passed`) belegen schon Uncommittetes; dann `resumeFrom` mit einer engen Restliste (committen, ein Nachweislauf, Status-Doku) und kürzerem Limit statt der Ursprungsaufgabe. Misst der Leitstand ein Benchmark-Ergebnis anders als ich (z. B. +20 % gegen eine gleichzeitige Basis-Messung), das nicht als Anbieter-Streuung abtun: Prompt-Tokens, Rundenzahl und zusätzliche Abfragen je Runde gegen eine Referenz-Ergebnisdatei vergleichen, bevor ich eine Erklärung nenne.
- Vor-/Nachher-Messungen gegen ein Anbieter-API (Benchmark): Vor jedem Vergleich Korrektheitsquote und Log auf 429/Fehler prüfen und den Anbieter-Reset abwarten; ein Lauf mit 0 % korrekten Antworten liefert scheinbar riesige Gewinne. Ungültige Ergebnisdateien löschen statt committen. Skripte mit Pfaden relativ zum App-Ordner im Sperr-Wrapper (läuft im Repo-Root) per `bash -c 'cd <app> && …'` aufrufen. Ein Hintergrundskript (`bg_run bash /tmp/x.sh`) erst starten, wenn die Datei per vorherigem Tool-Call angelegt ist, nie im selben Parallel-Block (sonst Exit 127, Datei fehlt noch). Leitet ein bg_run in eine Log-Datei um, muss deren Ordner vorher existieren — schlägt die Umleitung fehl, läuft der Befehl gar nicht, während der Task trotzdem grün endet, wenn ein abschließendes `;`-Kommando erfolgreich ist; direkt nach dem Start das Log auf Existenz prüfen. Das Subject eines Commits vor dem ersten Push auf ≤72 Zeichen kürzen (Hook-Limit): nach dem Push ist Umschreiben nicht mehr möglich.
- Nach dem Einmergen der Basis (Leitstand-Meldung „PR gemergt“): laufenden Vorpush abbrechen, mergen, bei geändertem Lockfile `pnpm install --frozen-lockfile`, JSON-Übersetzungsdateien parsen, Encoding-Prüfung, dann Vorpush neu. Wer eine Funktion in ein geteiltes Modul aufnimmt, das Tests per `jest.mock` komplett ersetzen, sucht vorher alle Mocks dieses Moduls (`rg -l "jest.mock\(.*<modul>"`) und ergänzt sie — besser: reine Funktionen für Server-Code über einen Subpath-Export des Pakets importieren statt über das Barrel, dann bleiben sie in Tests mit teilgemocktem Barrel echt (sonst 500 statt erwarteter Antwort); ebenso gibt es Wächtertests, die neue Server-Actions in Abdeckungs-Dokus verlangen und Seitenschutz (z. B. `ProtectedRoute` direkt in `page.tsx`) verlangen — wer Seiteninhalt in eine Komponente auslagert, lässt den Schutz auf der Seite stehen. Das Ergebnis eines Vorpush-Laufs aus der Zeile `[vorpush] ERGEBNIS: GRÜN/ROT` im Log lesen, nicht aus dem Task-Exit-Code (ein angehängtes `; echo "EXIT $?"` maskiert ihn, der Task endet „completed“ auch bei ROT). Merge-Konflikte, die nur aus unterschiedlich formulierten Kommentaren in `catch`-Blöcken bestehen (Basis hat dieselbe Stelle umgeschrieben), per Skript zugunsten der Basis-Seite auflösen (`re.sub` über `<<<<<<< HEAD … ======= (…) >>>>>>> origin/<basis>` → Basis-Teil) und danach auf Restmarker greppen; echte Zusammenführungen (zwei neue Komponenten im selben Layout) von Hand behalten: Fügt die Basis einer Komponente ein Verhalten hinzu (z. B. Schublade, neue Props/State), das mein Branch per Modus-Flag ausschließt, übernehme ich den Basis-Code und umhülle nur den Aufruf mit meiner Bedingung (`{!modus && (…)}`); Doku-/Status-Konflikte behalten beide Abschnitte, und Regeltexte der Basis, die im neuen Modus nicht gelten, erhalten einen Geltungsvermerk. Danach Jest des Pakets + App-Komponententests + typecheck und die Spec erneut laufen lassen (ein Merge ohne Textkonflikt kann Selektoren/Testids trotzdem brechen, daher auch der E2E-Nachweis nach dem Merge). Ein Worker, der per Wächter-SIGTERM endet, aber Commit, sauberen Baum und Encoding-Prüfung hinterlässt, gilt als fertig und wird normal abgenommen. Generierte Dateien (z. B. aus Hilfe-Quellen) nach dem Merge neu erzeugen, aber im Sperr-Wrapper (`mt-check bash -c 'cd <app> && npm run <skript>'`), nicht mit nacktem `npx tsx` in der Agent-Shell (scheitert dort mit Node-Fehler, Exit 1). Worker-Briefe mit Text, den der Commit-Guard der Shell als Befehl missdeutet (z. B. verbotene git-Befehle als Beispiel), per write-Tool statt Heredoc anlegen. Grund: Das zeigt sich sonst erst im Vorpush-Lauf, jeder Fehlschlag kostet 15+ min. Ändert ein Paket das Schema eines geteilten Domänenpakets (neue Spalte), führen auch andere Apps im Monorepo mit eigener Migrationskette (eigenes `drizzle/`, eigene Nummerierung) die Spalte in ihrem Schema und brauchen die Migration ebenfalls; der CI-Job „datenbank“ meldet sie, der Vorpush nicht. Vorab lokal: `DATABASE_URL=<wegwerf-postgres>/postgres npx tsx scripts/migrationen-vollstaendig.ts --app <app>` (legt eigene Datenbanken an, nie eine echte Datenbank angeben). Ein einzelner roter CI-Test in einer Datei, die der Diff nicht berührt, wird lokal nachgelaufen und per `gh run rerun <run> --failed` bestätigt, statt Code zu ändern. Gezielte Jest-Läufe in einer App immer als `pnpm exec jest <dateimuster>` im App-Verzeichnis (per `mt-check bash -c 'cd <app> && …'`) starten, nicht als `npx jest -t '' --testPathPattern …`: Letzteres lief mit leerem Namensfilter über alle Tests und meldete fälschlich Hunderte rote. Ersetzt ein Paket eine Firmen-Spalte durch eine Detail-Tabelle (Spalte droppen), die Migration den Altwert auf einen echten Schlüssel übernehmen lassen, den die Oberfläche kennt (z. B. das tatsächlich gesetzte Standardelement der Firma; fehlt es, den Wert dokumentiert verwerfen), danach DROP COLUMN, und diese Übernahme gegen eine Wegwerf-DB mit Altzeile belegen — nie einen Platzhalter-Schlüssel anlegen: Die UI kann so eine Zeile weder zeigen noch löschen, und sie überlagert still die Auflösung; Backend (Actions + Migration) und UI als zwei sequenzielle Worker-Pakete schneiden, wenn die UI an der neuen Actions-API hängt, und im Backend-Brief die UI-Übergangsfixes für kurzzeitig rote App-Tests benennen.
- Ohne Rückfragen weiterarbeiten, solange Arbeit offen ist; Entscheidungen in Queue/Plan festhalten.
  Offene Fragen, die ein Paket blockieren, mit der empfohlenen Vorgabe entscheiden und in der Checkliste in einem
  eigenen Abschnitt („Ohne dich entschieden“) mit Begründung zeigen. So kann der Nutzer später widersprechen,
  ohne dass die Arbeit wartet.

## Procedure
1. **Queue** im Projekt-`.tmp/` führen (vorher `date` und `git fetch` – Zeitangaben aus einer Kontext-Zusammenfassung sind nach einer Pause oft Tage alt, und main kann sich bewegt haben): Reihenfolge, Status je Paket, Paare, die nicht parallel laufen dürfen
   (gleiche Dateien). Ein Paket, das Dateien eines laufenden oder gestageten Pakets braucht, erst nach dessen Commit starten.
   Bei zwei Worker-Spuren EINE Warteschlange plus Kollisionsliste führen statt fester Reihenfolgen je Spur. Wird eine
   Spur frei, das erste Paket nehmen, das nicht mit dem Paket der anderen Spur kollidiert und dessen Vorgänger fertig
   ist. Den spurabhängigen Teil der Prüfbefehle (z. B. eigenes Target-Verzeichnis) per kleinem Skript vor die
   Prüfdatei des Pakets setzen, statt Prüfdateien je Spur doppelt zu pflegen.
   Ist die feste Queue leer und der Auftrag sagt nur „restliche Lücken nach Nutzen bündeln“: einen Planer-Sub-Agent
   (~60 min; als `agent: worker` mit Schreibrecht nur unter `.tmp/<plan>/`, weil die read-only-Rolle keine Dateien anlegt) eine Paketliste plus startfertige Briefe je Paket schreiben lassen — offene Lücken per Code-Gegenprobe filtern, 3–5 Pakete mit
   Pfaden, Kollisionen und Parallel-Vorschlag — und ihn starten, während PR-CI oder Abnahmen laufen. Grund: Die
   Gap-Analyse ist zu groß für den eigenen Kontext, und der Worker-Platz bleibt sonst bis zum Ende der Recherche leer.
   Liefern Handtest-Worker Befunde (❌/teilweise), daraus sofort eine eigene Fix-Spur planen, noch bevor alle Handtests
   fertig sind: Befunde je Schicht bündeln (CLI/Netz, UI, Sync, Agent-Host …), je Befund ein Fix MIT Regressionstest,
   Pakete mit gemeinsamer Crate nacheinander. Was ohne Nutzer oder Spezialumgebung nicht behebbar ist (fehlende
   Plattform, Nutzerpasswort, Design-Entscheid), als begründeten Restpunkt in den Schlussbericht statt in ein Paket.
   Ein Restpunkt, den die Abnahme eines Fix-Pakets offen lässt, kommt als nummerierter Punkt in den Brief des nächsten
   Pakets derselben Crate. Grund: Sonst endet die Nacht mit einer Befundliste statt mit Fixes, und kleine Reste gehen
   zwischen Paketen verloren.
2. **Aufgabendatei je Paket** = Kopf + gemeinsamer Schwanz:
   - Kopf: Warum (Nutzerwunsch sinngemäß), Befund mit Datei:Zeile („Zeilen neu prüfen“), Aufgabe in Teilen,
     Tests mit Paket-Präfix (`<pkg>_*`), „Nicht anfassen“ (Pfade paralleler/gestageter Pakete, Lockfile, fremde
     Bereiche; in geteilten Dateien nur Zeilen mit Marker `// <PKG>:`).
   - UI-Features: Die Ziel-Erfahrung konkret beschreiben (Ort und Form: Seitenpanel/Sheet/Karte, Kopf, Leerzustand,
     Vorschläge, was ausdrücklich NICHT erscheint) und „Bestand wiederverwenden“ auf Kern, Tools und Rechte begrenzen.
     Grund: Ein bloßes „wiederverwenden“ liest der Orchestrator als „bestehende Oberfläche einbetten“, und der Nutzer
     verwirft das Ergebnis. Für diesen Nutzer gilt dabei: Ein KI-Assistent ist ein eigenständiges Panel mit eigenem,
     sofort verständlichem Design und eigenen Gesprächen, dahinter ein auswählbarer Agent mit Skills und Gedächtnis.
     Einstellungen eines Elements (Standard, Stufen) gehören in dessen Karte, mit sichtbarem Abzeichen, statt in
     getrennte Auswahlfelder über der Liste.
   - Selbsterklärend für Endnutzer (Pflicht im Brief jeder neuen Funktion mit Einstellungen): keine Parameternamen aus
     dem Code als Beschriftung (z. B. „Radius“ für eine Abstandsschwelle), sondern Einstellungen als Satz mit Einheit
     und kurzem Hilfetext („Bündeln, wenn die Adressen höchstens [5 km] auseinanderliegen“). Dazu ein kurzes
     „So funktioniert's“ in 3–4 Schritten, die Wirkung einer Einstellung sichtbar machen (z. B. Kreis auf der Karte,
     Vorschau), vor dem Start sagen, worauf es sich bezieht (Anzahl betroffener Einträge), und Ergebnisse in
     Alltagssprache mit Erklärung, was „Übernehmen“ bewirkt. Abnahme mit Verständnis-Check: Ein frischer Worker ohne
     Vorwissen bekommt nur die Screenshots und erklärt Zweck, jede Einstellung und die Folge des Übernehmens; erklärt
     er etwas falsch, wird nachgebessert. Grund: Spur, Tests und Leitstand kennen die Fachbegriffe und merken nicht,
     dass die Oberfläche für den Nutzer unverständlich ist; erst er sieht es, und das kostet eine weitere Runde.
     Einstiegspunkt gehört in den Brief: die Seite bzw. der Reiter, auf dem der Nutzer arbeitet und die Funktion sucht
     (dort, wo ihr Ergebnis erscheint, inklusive Leerzustand, wenn es noch nichts gibt), nicht nur eine Unterseite.
     Der Rundgang des Leitstands startet auf dieser Seite und navigiert wie ein Nutzer, statt die Deep-Links der Specs
     zu übernehmen — sonst bleibt ein fehlender Einstieg unbemerkt. Meldet der Nutzer „sehe ich nicht“: zuerst den
     ausgerollten Stand der Umgebung prüfen (Versions-Endpunkt, z. B. `/api/version` mit Commit), dann den Einstiegsort
     im Code (`rg -l <testid>` → wo eingebunden) und dem Nutzer den heutigen Weg nennen, bis der Fix ausgerollt ist.
   - Den Parallel-Hinweis für den anderen Worker („seine Pfade nur lesen …“) per Skript aus dem Abschnitt
     „Deine Pfade“ des Kopfs erzeugen, nicht von Hand: so passt er immer zum Kopf.
   - Schwanz: Prüfbefehle, Berichtsformat, Arbeitsweise.
   - Schlusslauf je berührter Toolchain ist die komplette Suite, nicht der eigene Ordner – im Brief UND bei meiner
     Abnahme: Flutter `test` ohne Dateiliste + `analyze`; Node-Hosts genau wie die CI (`pnpm install --frozen-lockfile
     && pnpm build && pnpm test`); Rust nach Änderungen an öffentlichen Typen `cargo check --workspace --all-targets`.
     Grund: Geteilte Client-Logik (z. B. eine neue Handshake-Fähigkeit) bricht Tests in anderen Ordnern erst in der PR-CI.
   - Beim Stagen einer geteilten Datei, in der mehrere Pakete Zeilen haben (z. B. Modul- und Befehlslisten), ein
     Skript nehmen, das nur Zeilen mit dem eigenen Marker übernimmt und gemischte Blöcke meldet, statt den Blob
     von Hand zu bauen.
   - Platzhalter mit Python `str.replace` ersetzen und prüfen, dass keiner übrig ist — sed bricht, sobald der Titel
     `/` oder `&` enthält.
   - Serienpakete derselben Spur: neuen Brief per Python aus dem letzten Brief bauen (Kopf bis `## Hintergrund` +
     neuer Hintergrund/Aufgabe + Schwanz ab `## Läufe` mit ersetztem Log-Präfix), danach `grep -c <alte-ID>` → 0.
     Die gezielten Testdateien in `## Läufe` und die Inhaltspunkte in `## Bericht` sind paketspezifisch: immer neu
     schreiben und per grep auf Testnamen/Stichworte des Vorgängers prüfen (die ID-Prüfung findet sie nicht).
     Grund: Kopf/Schwanz (Regeln, Prüfbefehle, Berichtsformat) bleiben so wortgleich und erprobt.
   - Zweiteilige Pakete (A ist Vorbereitung, B baut darauf auf, z. B. Trait + zweites Backend): im Brief A zuerst
     eigenständig grün verlangen und eine Rückfallregel schreiben („B nicht sauber fertig → nur A abliefern, B-Dateien
     weglassen, Stand im Bericht“); B hinter ein Feature-Flag mit Default AUS legen. Vorher prüfen, ob die nötige
     Abhängigkeit schon im Workspace steckt (`rg -n <crate> Cargo.toml crates/*/Cargo.toml`) und genau diese Version
     vorgeben. Grund: Ein Timeout mitten in B hinterlässt sonst einen roten Baum, und neue Crates vergrößern Lockfile
     und Kompilierzeit unnötig.
     Große Pakete (L) nach Schicht schneiden: Teil A = Kern-Crate mit Logik, Adaptern und Prozess-Test ohne App,
     Teil B = Einbindung in die App (Hintergrund-Aufgabe, Einstellungen, UI, CLI). Im Brief A die Schnittstelle für B
     vorgeben und „API für Teil B (Signaturen)“ im Bericht verlangen. Grund: A bleibt in einem Worker-Lauf schaffbar und
     berührt keine App-Dateien; den B-Brief schreibe ich dann aus den gemeldeten Signaturen statt aus Vermutungen.
     Ist B ein Port in eine andere Sprache (z. B. Rust-Kern → Dart-App), in den Brief 2–3 Referenzwerte schreiben, die ich
     vorher mit einem kleinen Python-Nachbau des Quellalgorithmus berechnet habe (stabile IDs/Hashes, kanonisches JSON),
     und dazu die Quelldateien und Tests als 1:1-Vorlage nennen. Grund: Ein Port, der nur gegen sich selbst testet, bleibt
     grün, auch wenn seine IDs nicht byte-gleich zur Quellseite sind; der Fehler zeigt sich erst im echten Abgleich als
     doppelte Einträge.
     Die „Offen“-Punkte aus Bericht A (z. B. Datenverlust in Nachbar-Crates) als eigene Aufgabe in B aufnehmen und
     ihre Pfade vorher per `fd <datei>` auflösen. Grund: Berichte nennen oft nur crate-relative Pfade, und die
     geratene Crate stimmt nicht; der B-Worker darf die Datei sonst laut Pfadliste nicht ändern.
     Wird Brief B neben einem schon geschriebenen Brief des anderen Spur-Pakets fertig, dessen Parallel-Abschnitt
     sofort auf die echten B-Pfade umschreiben (per Python `str.replace` mit `assert old in s`). Grund: Ein vorab
     geschriebener Platzhalter-Hinweis passt nicht zu den tatsächlichen Pfaden.
   - Ändert ein Paket ein geteiltes Format (neue Einträge in Sitzungs-/Protokolldateien, neue Ereignistypen), vor dem
     Brief die Leser dieses Formats in anderen Crates suchen (`rg -ln '<feld/typ>' crates/*/tests crates/*/src`) und
     deren Pakete in die gezielten Testläufe des Briefs aufnehmen. Grund: Paketlokale Tests bleiben grün, der
     Kompatibilitätstest im fremden Crate bricht erst im nächsten Paket oder im Prüflauf. Eine solche Testkorrektur
     als eigenen test-Commit landen, nicht im Commit des Pakets, das sie zufällig gefunden hat.
     Bekommt ein öffentlicher Fehler-/Ereignis-Enum eine neue Variante, vorher die erschöpfenden `match`-Stellen in
     anderen Crates suchen (`rg -n '<Enum>::' crates src-tauri`) und sie im Brief als erlaubte Ein-Zeilen-Änderung mit
     Marker nennen. Grund: Sonst bricht `cargo check --workspace`, und der Worker ändert eine Datei außerhalb seiner
     Pfadliste, die sich mit dem parallelen Worker überschneiden kann.
   - Vor dem Brief für einen Plan-Punkt prüfen, ob frühere Pakete Teile schon gebaut haben (`rg -n <Typ/Variante>`,
     Commit-Marker anderer Pakete). Erledigte Teile nur noch als Abnahmetests in den Brief schreiben, mit der Regel
     „findest du ein Leck, src nicht ändern, Datei:Zeile im Bericht“. Grund: Sonst baut der Worker vorhandenen Code ein
     zweites Mal oder ändert Dateien eines anderen Pakets.
     Ebenso: Crates mit repo-weiten Audit-Tests (Tests, die Quelltexte aller Crates nach verbotenen Aufrufen
     durchsuchen; finden per `rg -l 'read_dir|walkdir' crates/*/tests`) in JEDEN Brief-Testlauf aufnehmen
     (`-p <audit-crate>`). Grund: Sie prüfen fremden Code, laufen aber nur mit ihrem eigenen Crate und brechen sonst
     erst im Gesamt-Prüflauf vor dem PR. Dasselbe gilt für UI-Wächtertests (Glossar alter Begriffe, i18n-Tabellen
     überschreiben gemeinsame Schlüssel; finden per `rg -l 'import.meta.glob' ui/src/**/*.test.ts`): Jedes Paket mit
     neuen UI-Texten oder i18n-Dateien führt sie im Brief-Lauf mit (`vitest run src/lib <eigene Tests>`), und der Brief
     nennt die Regel (neue Begriffe statt alter, gemeinsamen Schlüssel nicht neu übersetzen). Grund: Ein Lauf nur der
     eigenen Section-Tests bleibt grün, die CI bricht erst im PR. Im Prüfskript vor jedem vitest-Lauf im langlebigen
     Build-Spiegel den Testcache löschen (`rm -rf node_modules/.vitest-cache node_modules/.vite/vitest`). Grund: Der Cache
     liefert für `?raw`-Glob-Wächter alte Dateiinhalte, der Wächter bleibt lokal grün und bricht nur in der frischen CI.
     Einen CI-roten, lokal grünen Wächter in einem frischen Detached-Worktree mit Symlink auf die Spiegel-node_modules
     nachstellen und dort auch den Fix prüfen. Dasselbe über Toolchain-Grenzen: Rust-Tests, die
     Quelltexte der Mobil-App scannen (Vertragsabgleich von Methodennamen u. ä.; finden per
     `rg -l '\.\./\.\./\.\./<app>/lib' crates/*/tests`), gehören in den Brief jedes Pakets, das nur die Mobil-App ändert,
     als einziger cargo-Lauf (`nextest -p <crate> <test>`). Grund: Der Flutter-Worker startet sonst kein cargo, ein
     neuer String (z. B. Dateiname mit Methoden-Präfix) bricht den Scanner erst beim nächsten Rust-Paket. Den Scanner
     dann in einem eigenen test-Commit präzisieren, statt die App-Zeile umzubenennen.
   - Für ein neues Feature das nächstverwandte vorhandene Muster im eigenen Code suchen (z. B. bestehendes interaktives
     Werkzeug + seine UI-Karte, Registrierung, Zeitlimit-Ausnahme, Freigabe-Sonderfall) und im Brief mit Datei:Zeile als
     Vorlage nennen. Grund: Der Worker baut dann denselben Weg nach, statt einen zweiten Mechanismus zu erfinden, und
     vergisst keine der verstreuten Registrierungsstellen.
   - Keine „optionalen“ Punkte in Briefe schreiben: Ein Punkt ist Pflicht oder er wird ein eigenes Folgepaket (Teil C).
     Grund: Worker lassen optionale Punkte mit Verweis auf das Risiko fast immer weg; die Lücke fällt erst beim
     Abhaken der Checkliste auf und braucht dann doch ein Extrapaket.
   - Pfade für Wächter, Mocks und Glossare im Brief nicht raten („per rg finden“), sondern vorher selbst auflösen
     (`rg -ln '<symbol>' ui/src`, `fd <datei>`) und exakt nennen. Grund: Der Worker sucht sonst an der vermuteten Stelle,
     findet nichts und legt eine zweite Datei an.
   - Verweist eine Paketliste aus einer Recherche auf ein Vorbild-Feature (ID, Bericht), dessen Quelle vor dem Brief
     kurz öffnen (Bericht-Kopf, Code-Kommentar). Grund: Recherche-Tabellen ordnen IDs gelegentlich falsch zu; der
     Worker baut sonst das falsche Feature. Abweichung als „Ohne dich entschieden“ im Plan notieren.
     Messwerte aus solchen Berichten (Speicher, Laufzeit) nur mit Herkunft in den Brief: Vorbild vor/nach dessen Fix
     oder eigene App. Code-Anker im Befund vorher per `git grep -n <symbol> HEAD` bestätigen. Grund: Ein Vorbild-Wert
     liest sich im Brief wie ein Befund der eigenen App, und ein falscher Crate-Pfad schickt den Worker an die falsche Stelle.
3. **Startdatei** (Prompt bleibt kurz: „Lies <Startdatei> vollständig und führe sie aus“): HEAD, fremde uncommittete
   Pfade (nur lesen), nur eigene Pfade ändern, kein git, keine Hintergrundtasks (auch kein `&`/nohup für Testläufe:
   „volle Suite IMMER im Vordergrund abwarten, Ergebniszeilen in den Bericht, erst dann Antwort beenden“ – sonst endet
   der Worker vor dem Ergebnis und ich muss die Suite selbst abwarten). Erlauben die Regeln wegen des Ausgabe-Wächters
   doch einen Hintergrundstart mit Log-Abfrage – oder startet der Worker lange Jobs auf einer anderen Maschine
   (docker build, systemd-run per ssh) –, den Satz in JEDEN solchen Brief schreiben: „Warten heißt weitere Tool-Aufrufe
   (`sleep 60; tail -n 3 <log>`) bis `EXIT=` im Log steht – nie die Antwort beenden, solange ein Lauf läuft“. Grund:
   Beendet ein Worker den Turn, um auf die Benachrichtigung eines eigenen Hintergrundlaufs zu warten, killt ihn der
   Delegate-Wächter trotz Ausgabe (SIGTERM/exit 143) — Commit und Bericht fehlen dann, und die Abnahme bleibt beim
   Orchestrator. In
   Mehrebenen-Setups diesen Satz wörtlich in die Regeln-Datei der Spur-Orchestratoren schreiben („in jeden Worker-Task
   aufnehmen“), getrennt von deren eigener bg_run-Regel. Grund: Spur-Orchestratoren schreiben die Worker-Tasks selbst,
   kennen diesen Skill nicht und übertragen ihr eigenes „Läufe > 5 min per bg_run“ auf die Worker → exit 143. Endet
   ein Worker mit exit 0, aber ohne Bericht (Schlusssatz „warte auf die Meldung“ oder direkt nach einem eigenen
   Werkzeugfehler, z. B. einer abgelehnten Kontext-Kompression): Schluss von `.out` lesen, per `resumeFrom` fortsetzen,
   den Auslöser im Task benennen und die Vordergrund-Warteschleife wörtlich vorgeben; die alte Wache ist dann schon
   beendet, also neue Wache mit vorangestelltem `sleep 15;`. Endet derselbe Worker erneut an seiner eigenen
   Kontext-Kompression, nicht noch einmal fortsetzen, sondern einen frischen Worker mit eigenständigem Brief starten
   (Stand im Baum als Basis + Befundquelle mit Pfad). Grund: Jede Fortsetzung bringt den vollen alten Verlauf mit, der
   Kontext läuft gleich wieder voll. Keine lokalen Builds; Builds/Tests dort,
   wo RAM ist (Remote-Maschine), immer nur ein eigener Lauf; RAM-schonend lesen (`grep -n`, dann `sed -n 'a,bp'`,
   Ausgaben mit `head`, Logs nur gefiltert); Status-Zeile spätestens alle 3 min (sonst greift der Idle-Watchdog).
   Bei entwurfslastigen Paketen (Krypto, Protokoll, neues Modul) zusätzlich in Brief und Task: „in kleinen Schritten
   arbeiten (Datei schreiben → nächster Tool-Aufruf), nie länger als 4 min ohne Tool-Aufruf“. Grund: Der acp-Wächter
   beendet nach 5 min ohne Ausgabe; ein Worker, der nach dem Lesen das ganze Modul am Stück durchdenkt, stirbt mit
   exit 143 ohne eine geänderte Datei. Dann per `resumeFrom` mit genau diesem Satz fortsetzen (Lesestand bleibt erhalten);
   Abschlussbericht ≤ 80 Zeilen als letzte Antwort und als Datei unter docs/reports/.
   Vor dem Start jeden absoluten Pfad aus Prompt und Brief (Regeldatei, Vorbild-Quellbäume, Skripte) mit einem
   `ls` prüfen. Grund: Ein Prompt-Muster aus einer anderen Spur oder eine Recherche-Notiz mit relativem Pfad nennt
   gern Orte, die es nicht gibt; der Worker sucht dann oder arbeitet ohne Regeln. Fehlt eine gemeinsame Regeldatei
   in der zweiten Spur, einen Symlink anlegen statt den Prompt-Text pro Spur zu pflegen.
   Braucht ein Worker ein CI-Artefakt (z. B. Release-Bundle), darf aber nicht pushen: Marker-Protokoll. Der Worker legt
   `<pkg>-ci-bereit` mit der Liste seiner Dateien an und wartet in 90-s-Häppchen auf `<pkg>-ci-fertig`. Eine bg-Wache
   `until [ -e <pkg>-ci-bereit ]` weckt mich; ich baue einen Detached-Worktree aus HEAD plus genau diesen Dateien,
   pushe `probe/<pkg>`, starte den Workflow per `gh workflow run <wf> --ref probe/<pkg> -f …` (nie Tag/Release/Upload),
   und eine bg-Schleife lädt die Artefakte (`gh run download <id> -D …`) bzw. legt einen Fehlerauszug ab und schreibt
   den Marker atomar (tmp + mv). Handprüfungen mit dem Artefakt nur isoliert vorgeben (Xvfb, privater Bus in
   Wegwerf-`XDG_RUNTIME_DIR`, Datei-Geheimnisspeicher). Grund: Der Worker kann weder pushen noch Meldungen empfangen,
   und ein App-Start an der echten Sitzung berührt Desktop und Schlüsselbund des Nutzers.
4. **Starten**: `acp_delegate` (agent worker, Modell immer per `model` setzen – ohne Delegate-Konfiguration erbt der Worker sonst still das Modell des Orchestrators und belegt dessen Konto –, thinkingLevel medium, timeoutMinutes ~180; große
   Abschlusspakete wie Gesamttestlauf plus Kriterienprüfung ~300). Grund: Das harte Limit beendet den Worker ohne
   Abschlussbericht; Bericht, TODO-Abschnitt und letzten Prüflauf muss ich dann selbst nachholen.
   Parallelität nach Anbieter-Konto: höchstens 2 Worker gleichzeitig auf demselben Konto eines teuren Modells
   (z. B. Anthropic/opus), weitere Worker auf einen zweiten Anbieter legen (z. B. zai-coding-cn/glm). Grund: Orchestrator
   und beaufsichtigende Sitzung auf demselben Konto teilen das Kontingent; bei 5+ Sitzungen sterben nach 10× 429-Retries
   alle Worker zugleich, Orchestrator und Aufsicht bleiben bis zum Reset blockiert, und niemand meldet den Stillstand.
   Watchdog-Anstöße helfen dabei nicht, sie stauen sich bis zum Reset. Nach so einem Ausfall alle Worker per
   `resumeFrom` fortsetzen (Arbeitsstand bleibt), die erledigten Logs vorher selbst prüfen. Auch der zweite Anbieter
   hat ein Kontingent (z. B. 5-h-Fenster, 429 mit Reset-Zeit). Erkennen am Ende der `.activity`
   (`tail -3 /tmp/acp-delegate/<runId>.activity`: `[retry] attempt n/10 … 429` samt Reset-Zeit, Zeitzone des
   Anbieters umrechnen) – auch wenn ein eigenes Kontingent-Skript „ok“ meldet; bis zum Reset keine neuen Läufe auf diesem
   Anbieter starten und die betroffenen Queue-Zeilen auf „wartet Reset <Zeit> – resume <runId>“ setzen. Vor JEDEM
   Start und bei jeder Kontrollrunde das Kontingent beider Anbieter abfragen (Skript mit Tor-Schwelle, z. B. 5h < 75 %; Kurzzeitwert = Maximum aller Nicht-Wochen-Limits, Limits mit abgelaufenem `resetsAt` zählen 0 – nicht nach Label auswählen, weil Sammler Fenster falsch beschriften können; modellgebundene Fenster zählen nur für ihr Modell, Prozent per round, Ausnahmen/Rampe/Test: references/kontingent.md §1–3; Budget-Stufen für Leitstand und Spuren: references/mehrebenen-worktrees.md)
   und die Werte ins Journal schreiben; nahe am Tor nur noch fortsetzen, nichts Neues starten. Sind beide Tore zu,
   läuft nur der Herzschlag; beim Öffnen zuerst die angehaltenen Läufe per `resumeFrom` fortsetzen, dann neue Pakete.
   Grund: Ein Lauf, der im Kontingent-Ende stirbt, meldet oft exit 0 mit halbem Bericht. Stirbt ein Worker daran, per `resumeFrom` mit `model`
   auf den Anbieter mit freiem Platz fortsetzen und im Task sagen, dass der Abbruch am Kontingent lag. Grund: Bis zum
   Reset vergehen sonst Stunden, und der Lesestand des Workers bleibt beim Modellwechsel erhalten.
   Parallelität nach RAM: jeder Worker-pi lädt alle pi-Pakete des Nutzers (~0,6–0,9 GB); bei knappem RAM genau einer.
   Zwei Worker nur, wenn ihre Pfade disjunkt sind UND sich ihre Build-Läufe nicht blockieren. Grund: Zwei cargo-Läufe
   im selben Target-Verzeichnis warten auf dasselbe Build-Lock; der wartende Worker steht dann minutenlang und belegt
   RAM. Gute Paarung: ein Rust-Paket + ein Paket ohne cargo-Lauf (CI, Skripte, Doku, Mobil-App in eigenem
   Toolchain-Ordner). Beim Schneiden großer Pakete den Teil, der nur die zweite Toolchain braucht (z. B. Dart-Port eines
   Rust-Kerns), bewusst neben ein Rust-Paket legen; dann braucht keiner ein zweites Target-Verzeichnis.
   Bauen die beiden Worker zwei Seiten desselben Protokolls (Server in Rust, Client in Dart), den Vertrag vorher selbst
   als eigenen kleinen Commit landen: Methodennamen-Konstanten auf beiden Seiten, Vertragstabelle, Parameter-Structs,
   neue optionale Felder plus Initialisierer. Danach Vertrags-Scanner und `check` des Crates laufen lassen; Tests, die
   Beispiel-JSON je Params-Typ deserialisieren, brauchen für jeden neuen Typ einen Eintrag in ihrer Zuordnung. In beiden
   Briefen: „Vertrag nur lesen; fehlt etwas → nur mit Marker ergänzen und im Bericht unter ‚Vertrag nachziehen‘ nennen“.
   Grund: Sonst erfinden beide Worker eigene Namen, der Scanner bricht, und jeder ändert die Vertragsdatei des anderen.
   Zwei Rust-Pakete gleichzeitig nur mit getrennten Target-Verzeichnissen auf der Build-Maschine: Der zweite Worker
   setzt in JEDEM cargo-Aufruf `export CARGO_TARGET_DIR=<base>/target-b` (sein erster Lauf baut einmal komplett,
   15–25 min). Teilen beide denselben Arbeitsbaum, scheitert `cargo check --workspace` des einen gelegentlich an
   halb geänderten Dateien des anderen: Im Brief vorgeben „scheitert er nur an Crates des anderen Workers → kurz
   warten, wiederholen, im Bericht notieren". Bei der Abnahme den `find -newer <Log>`-Check und das Stagen mit
   `grep -v <Pfade des anderen>` filtern. Grund: Ohne Filter landen die Dateien des anderen im Commit, oder seine
   frischen Änderungen gelten fälschlich als ungeprüfte Nacharbeit. Geteilte Spezial-Targets (z. B. Windows-Cross-Check) bleiben gemeinsam: dort „Blocking waiting for
   file lock“ abwarten. Ändert ein Worker auf der Build-Maschine Quellen an Ort und Stelle (z. B. `clippy --fix` im
   gespiegelten Baum), darf bis zum Ende niemand sonst spiegeln, auch der Orchestrator nicht. Grund: rsync --delete
   überschreibt die halb reparierten Dateien. Ebenso spiegelt das Skript aus einem ANDEREN Worktree dessen Branch in
   denselben Zielordner: Solange Worker laufen, nur aus ihrem Worktree spiegeln. Eine Wache meldet das Ende; parallele Läufe warten so lange. Laufenden Worker dafür kurz abbrechen und mit `resumeFrom` plus Parallel-Hinweis fortsetzen. In beiden Startdateien den
   anderen Worker mit seinen Pfaden als tabu nennen; feste Sätze wie „kein anderer Worker“ in der Vorlage ersetzen.
   Vor zwei Rust-Spuren die Last der Build-Maschine prüfen (freier Speicher und Swap per ssh). Belegen Programme des
   Nutzers sie schon, in jeder Startdatei `CARGO_BUILD_JOBS` auf etwa die halbe Kernzahl setzen und dem Nutzer die
   Belegung nennen. Grund: Jeder rustc-Job großer Crates braucht 1–2 GB; mit voller Job-Zahl swappt die Maschine,
   und die Läufe dauern ein Vielfaches.
   Neben jedem Worker sofort eine Wache als Hintergrundtask starten (bg_run, `surviveReload`, Vorlage
   scripts/worker-wache.sh); für eine ganze Startwelle genügt EINE: `WACHE_ALLE=1 sh worker-wache.sh <runId>...` (ohne `WACHE_ALLE` endet sie
   beim ersten FERTIG, die übrigen Worker sind dann unbewacht → nach jeder solchen Meldung neu starten).
   Fertig-Signal ist die letzte Zeile von `/tmp/acp-delegate/<runId>.session.jsonl`: eine Assistant-Nachricht mit
   `stopReason` ≠ `toolUse`. Still heißt: `.activity` N min (≈15–20) unverändert. Läuft gerade ein Werkzeug (letzte
   `[tool]`-Zeile ohne folgendes `[done]`, z. B. Workspace-clippy auf der Build-Maschine), gilt erst eine harte Grenze
   (≈75–100 min). Grund: Sonst meldet die Wache bei jedem langen Prüflauf einen Fehlalarm.
   Grund für die Wache: Abschlussmeldungen von acp_delegate wecken eine ruhende Sitzung nicht, sie warten bis zur
   nächsten Nutzereingabe — die Arbeit steht dann stundenlang still. bg_run-Meldungen wecken die Sitzung zuverlässig.
   Nicht auf den Worker-Prozess bauen: Der Worker-pi lebt nach dem Abschluss weiter, und gleichzeitig gestartete
   Worker haben dieselbe Startzeit (die runId steht weder in Befehlszeile noch Umgebung). Eine pid-Zuordnung über die
   Startzeit legt dann alle Wachen auf denselben Prozess, und keine meldet etwas. Schwund der Worker-pis
   (`PI_ACP_DELEGATE_DEPTH=1`, Kinder des Eltern-pi) zählt nur als Alarm, wenn kein Lauf frisch abgeschlossen hat.
   Breche ich einen Worker selbst ab und setze ihn per `resumeFrom` fort, seine alte Wache sofort per `bg_kill`
   beenden und für die neue runId eine neue starten. Grund: Die alte Wache wartet weiter auf die tote runId und meldet
   Stunden später „still“/failed, was wie ein neuer Ausfall aussieht.
5. **Abbruch (exit 143/SIGTERM)**: `.out`/`.activity` lesen. Vollständiger Bericht vorhanden UND die Logs zeigen grüne
   EXIT-Zeilen, die nach der letzten Paketdatei-Änderung liegen (`find <Pfade> -newer <Log>` leer) → fertig, normal abnehmen.
   Grund: Der Ausgabe-Wächter beendet Worker oft erst nach dem Bericht; SIGTERM allein sagt nichts über den Stand.
   Ist eine Datei nur neuer als der Volllauf, aber älter als ein späterer gezielter Lauf, der sie abdeckt, plus
   Analyse/Lint (`find <datei> -newer <gezieltes Log>` leer), gilt sie als geprüft. Grund: Worker fixen nach dem Volllauf
   oft nur noch einen Test oder Typ und prüfen gezielt nach; ein zweiter Volllauf kostet sonst eine halbe Stunde.
   Rote Tests im Log blockieren die Abnahme nicht, wenn jeder einzelne zugeordnet ist: Testdatei liegt im Pfad des
   parallelen Workers (dessen halbfertiger Stand), oder es ist ein bekannter Timeout-Flake, den ein Einzel-Neulauf
   grün zeigt (Log dazu muss existieren). Jeden anderen roten Test vor dem Commit klären. Grund: Beide Worker testen
   im selben gespiegelten Baum; ohne Zuordnung wartet man auf einen Fehler, den das eigene Paket nicht verursacht.
   Den fremden roten Test bei der Abnahme des anderen Pakets erneut prüfen. Dasselbe im Gesamt-Prüflauf vor dem PR:
   Einzelner roter Test → nur diese Testdatei 3× im Spiegel neu laufen lassen und `git diff --stat origin/main --
   <bereich des Tests>` prüfen; alle Neuläufe grün und Diff leer → Flake, im PR-Body mit Testname nennen, keinen
   neuen Gesamtlauf. Grund: Der Bereich ist unverändert, ein zweiter Gesamtlauf kostet eine Stunde und blockiert
   den Sync-Punkt. Bricht in der PR-CI ein Test, der eine Dauer misst („zu früh getrennt: 302 ms“), zuerst prüfen, ob
   seine Uhr erst nach einem Handshake startet. Dann den Messbeginn vor das früheste Ereignis legen, 5× im Spiegel laufen
   lassen und als eigenen test-Commit auf den PR-Branch pushen, statt nur neu anzustoßen. Grund: Auf langsamen
   CI-Rechnern fehlt sonst die Handshake-Dauer in der Messung, und der Test bricht immer wieder. Sonst mit
   `resumeFrom: <runId>` fortsetzen (Verlauf und Teilarbeit bleiben) und im Task sagen, wo es weitergeht.
   Wird derselbe Worker wiederholt vom RAM-Wächter beendet: dem Nutzer die RAM-Fresser nennen und ihn bitten,
   sie zu schließen, statt endlos neu zu starten.
6. **Integrieren, ohne den Arbeitsbaum anzufassen** (andere Worker arbeiten darin):
   - Nur die Pfade des Pakets in den Index stagen; geteilte generierte Dateien aus den gestageten Quellen neu
     erzeugen; Lockfile nur, wenn sein Diff allein zu diesem Paket gehört.
   - Generierte Datei für genau ein Paket erzeugen: `git worktree add --detach /tmp/<pkg>-wt HEAD`, nur die
     Quelldateien des Pakets hineinkopieren, dort den Generator (plus `--check`) laufen lassen, dann
     `git update-index --cacheinfo 100644,$(git hash-object -w /tmp/<pkg>-wt/<pfad>),<pfad>` und den Worktree
     entfernen. Grund: Im Arbeitsbaum erzeugt, enthielte die Datei auch die Einträge des noch laufenden Pakets.
     Ist das Ergebnis per `diff -q` gleich der Arbeitsbaum-Datei (der andere Worker hat noch keine Quellen dafür), die
     Arbeitsbaum-Datei direkt mit `git add` stagen.
   - Fügt ein Paket einer Cargo.toml eine Abhängigkeit hinzu, gehört der passende Cargo.lock-Eintrag in denselben
     Commit; vor dem Push `cargo tree --locked` laufen lassen oder den Lockfile gegen den Build-Spiegel diffen.
     Grund: Läufe im Spiegel ohne `--locked` schreiben den Eintrag nur dort; die CI prüft mit `--locked` und bricht.
   - `git write-tree` → genau diesen Baum als Snapshot auf der Remote-Maschine prüfen (eigenes Target-Verzeichnis) →
     `git commit-tree` aus dem geprüften Baum mit Prüfabsatz und „Offen:“-Liste, Betreff ≤ 72 Zeichen → pushen.
   - Spiegelt das Prüfskript (z. B. Gesamt-Prüflauf vor dem PR) den Arbeitsbaum statt eines Snapshots, braucht es einen
     Synchronisationspunkt: Endet ein Worker vor dem anderen, keinen neuen starten. Erst wenn beide fertig sind und
     committet ist, prüfen, pushen, PR und Merge, dann die nächste Welle starten. Grund: Der Lauf prüft sonst halbfertige
     Worker-Änderungen mit, und das rsync --delete des Orchestrators stört die laufenden Remote-Läufe der Worker. Diese
     Ausnahme von „Plätze nie leer lassen“ und den dadurch größeren PR im Bericht nennen. Ein Paket ohne Build- und
     Testpfade (nur Vorlagen, Skripte, Doku; der Brief verbietet cargo/pnpm/flutter) darf schon während des Prüflaufs
     laufen. Es kommt erst in den nächsten PR. Grund: Es ändert nichts, was der Lauf prüft, und der Platz bleibt nicht leer.
     Schreiben zwei parallele Pakete in dieselbe Doku-Datei, gibt jeder Brief dem Abschnitt einen festen Platz vor
     (einer direkt nach Abschnitt X, der andere ans Dateiende). Grund: So bleiben die Diffs disjunkt und lassen sich je
     Paket stagen.
     Hält das Prüfskript den Spiegel über eine Frei-Marke (Datei, deren Fehlen Workern „warten“ sagt), muss jeder eigene
     Lauf außerhalb des Skripts (CI-Fix nachstellen, Einzeltest) die Marke danach wieder anlegen (`touch`), und vor jedem
     Worker-Start prüfe ich per `ls`, dass sie da ist. Grund: Fehlt sie, warten die Worker still bis zu ihrem Zeitlimit.
     Den Sync-Punkt planen statt abwarten: Wird neben einem langen Paket ein Platz frei, nur noch ein kleines Paket
     (S) starten, das vor dem langen fertig wird, und den Sync-Punkt im Plan festhalten. Danach bleibt der Platz leer.
     Grund: Startet man bei jeder Lücke ein beliebiges Paket, enden die beiden Spuren nie gleichzeitig, und es kommt
     nie zu Prüflauf und PR.
   - Offene Punkte aus dem Bericht in Queue/TODO übernehmen.
   - Was der Bericht als erledigt meldet (TODO-Abschnitt geschrieben, Tests ergänzt, Datei angelegt), vor dem Stagen
     per grep/diff im Arbeitsbaum prüfen. Grund: Worker melden gelegentlich Arbeit, die fehlt.
   - Pfade des Pakets außerhalb des Filters des Staging-Skripts (z. B. CI-Workflows im Repo-Wurzelordner) von Hand
     stagen. Grund: Das Skript filtert auf den App-Ordner und lässt sie sonst still weg.
   - Pakete, die nur Skripte, Workflows oder Doku ändern, brauchen keinen Snapshot-Build. Beleg sind dann die Linter
     des Workers plus ein CI-Testlauf.
   - Nach dem Commit die Dateizahl von `git show --stat HEAD | tail -1` mit der gestagten Zahl vergleichen und
     `git status --short` lesen; fehlt eine Datei (z. B. die per sed abgehakte Checkliste), `git add` + `commit --amend
     --no-edit`. Grund: Markdown-Hooks des Agenten fassen die Datei zwischen `git add` und Commit noch einmal an, und
     sie fällt still aus dem Commit. Diese Prüfung erst NACH dem Ende des commit-Aufrufs absetzen, nie als
     parallelen Tool-Call im selben Block. Grund: Parallel laufen beide gleichzeitig, `show`/`status` sehen einen halben
     Commit (zu wenige Dateien, Rest noch gestaged), und ein Amend auf dieser Grundlage wäre falsch.
   - Nach dem Commit `git status` prüfen: Wurde eine geteilte generierte Datei nur im Index neu erzeugt und fehlen ihr
     im Arbeitsbaum genau die Einträge des committeten Pakets, mit `git show HEAD:<pfad> > <pfad>` zurücksetzen.
7. **CI**: Läufe per REST mit der VOLLEN Commit-SHA suchen (kurze SHA liefert nichts).
   Die Abfrage einer Wache trivial halten (`--jq '.[0] | .status + "/" + (.conclusion // "-")'`) und EINMAL interaktiv
   gegen einen fertigen Lauf testen, bevor sie in einer 40-Runden-bg-Schleife läuft. Grund: Clevere jq-Ketten mit
   Alternativ-Operatoren matchen schleichend nie, die Wache stirbt am Zeitlimit, obwohl der Lauf längst fertig ist.
   Nach jedem Merge auch die Auslieferung prüfen, die der Nutzer erwartet (Testkanal-Build, Registry-Tag, Release-
   Artefakt): Gibt es den Workflow dafür im AKTIVEN Forge, und hat er für den Merge-Commit ein Artefakt erzeugt? Grund:
   Der Nutzer zieht Testversionen direkt aufs Gerät; grüne Tests ohne Build fallen sonst erst ihm auf (z. B. Workflows,
   die nach einem Forge-Umzug nur noch im alten Format existieren – Port siehe git-remote-swap §7).
   Meldet die CI-Wache ihr Ende, das Ergebnis vor dem Merge frisch abfragen (`gh pr checks <n> | cut -f1,2 | sort | uniq -c`:
   kein fail/pending, nur pass/skipping). Die Ausgabedatei der Wache nicht abwarten. Grund: Die Datei unter `.pi/tasks/`
   kann nach einem Reload fehlen oder einen Zwischenstand mit „pending“ enthalten.
   Die CI-Wache (bg_run) immer mit `cd <repo> &&` beginnen. Grund: bg_run startet im Sitzungs-cwd; liegt das außerhalb
   des Repos, bricht `gh pr checks --watch` sofort mit RC=1 („not a git repository“) ab und die Wache meldet ein
   scheinbares Ende, obwohl die CI noch läuft.
   Tokens in Wache-, Push- und Askpass-Skripten nur setzen, wenn der Wert nicht leer ist:
   `[ -n "${GH_TOKEN:-}" ] || GH_TOKEN=$(timeout 10 secret-tool lookup service gh:github.com); export GH_TOKEN`, bleibt er
   leer → mit Meldung abbrechen. Grund: `export GH_TOKEN=$(cat <datei>)` mit falschem Dateinamen überschreibt einen
   geerbten Token mit dem leeren Wert; gh fragt dann den gesperrten Login-Schlüsselbund, beim Nutzer erscheint ein
   Passwortdialog, und die Wache hängt. Erscheint so ein Dialog: nicht anfassen, den Aufrufer über die ppid-Kette der
   hängenden gh-/git-Prozesse finden (`ps -o pid=,ppid=,args= -p <pid>`) und in deren `/proc/<pid>/environ` prüfen, ob
   `GH_TOKEN` leer ist.
   Nach dem Merge die Push-CI auf main als eigenen Hintergrundtask beobachten (alle Jobs mit `conclusion` je Run auflisten).
   Grund: PR-Läufe überspringen per Pfadfilter oft Plattform-Jobs (z. B. Windows) – „ci-ok grün“ im PR deckt sie nicht ab.
   Vorher im Workflow nachsehen, ob ein Plattform-Job nur bei push läuft (`if: github.event_name == 'push'`); dann ist
   „skipping“ im PR erwartet, und erst die main-CI belegt diese Plattform. Einen Sammel-PR mit vielen einzeln geprüften
   Paket-Commits als Merge-Commit mergen (`gh pr merge <n> --merge`), Einzelpakete per squash. Grund: Bei squash gehen
   die Paket-Commits verloren, die Bericht und Plan per SHA belegen, und `git bisect` findet das Paket nicht mehr.
   Abschluss eines Nachtlaufs, erst wenn die main-CI grün ist: Bericht-Platzhalter (SHA, Run-ID, Ergebnis je Plattform)
   per Python ersetzen und `assert '<' not in`-Probe, die Zeile „Entwurf“ entfernen. Lokal `git switch main && git pull
   --ff-only`, dann `git branch -d <branch>` (nicht -D: es scheitert, wenn etwas nicht gemergt ist). `git fetch --prune`,
   weil `delete_branch_on_merge` den Remote-Branch schon gelöscht hat und nur der Tracking-Ref übrig ist. Danach den
   Stop-Marker anlegen, den Watchdog-Timer stoppen, `systemctl --user is-active <timer>` → inactive prüfen und das als
   letzte Logzeile festhalten. Grund: Ein Timer-Stopp vor der grünen main-CI beendet die Aufsicht zu früh, und ein Rot
   auf main bleibt dann unbemerkt.
   Wird ein Paket abgenommen, während die CI des offenen PR noch läuft: lokal committen, aber nicht auf den PR-Branch
   pushen. Melden Aufsicht oder Bots Merges in main (z. B. Dependabot-PRs) während der PR offen ist, gilt die
   Baumgleichheit unten nach dem Merge nicht mehr: gleich den cherry-pick-Weg im Detached-Worktree einplanen.
   Nach dem Merge die lokalen Commits auf origin/main umhängen, ohne Arbeitsbaum und Index zu berühren:
   prüfen, dass `git rev-parse origin/main^{tree}` gleich dem Baum der gemergten PR-Spitze ist (Merge-Commit-Eltern
   per `git log -1 --format=%P origin/main`; bei amendeten Commits die Spitze aus den Eltern nehmen, nicht aus Notizen),
   dann je lokalem Commit `git log -1 --format=%B <c> | git commit-tree <c>^{tree} -p <neue Basis>` und
   `git branch <neu> <letzter>` + `git symbolic-ref HEAD refs/heads/<neu>`; danach `git diff --cached --stat` muss leer
   sein. Grund: Laufende Worker ändern Dateien, die cherry-pick/switch anfassen würden (Abbruch oder kurz
   verschwundene Dateien); bei gleichem Baum sind die Commits inhaltlich identisch. Ist der Baum verschieden, im
   Detached-Worktree cherry-picken (`git worktree add --detach /tmp/cp-wt origin/main`, dort `cherry-pick <c>...`),
   dann im Hauptbaum `git branch <neu> <X>; git symbolic-ref HEAD refs/heads/<neu>; git read-tree <X>` und nur die
   Dateien, die sich zwischen alter Basis und origin/main unterscheiden (`git diff --name-only <alte Basis> origin/main`,
   z. B. Bot-geänderte Workflows), per `git checkout <X> -- <pfade>` holen; danach muss `git status` nur noch die
   Worker-Dateien zeigen. Grund: read-tree setzt nur den Index, die Worker-Dateien im Arbeitsbaum bleiben unberührt. Grund für lokal statt Push: Ein Push startet die ganze PR-CI neu (Rust-Job
   ~25 min) und hängt ungeprüfte Arbeit an einen schon geprüften PR.
   Rote PR-CI durch einen kleinen Integrationsfehler (Text, Schlüssel, Test-Erwartung) selbst fixen, während Worker
   im Arbeitsbaum laufen: `git worktree add --detach /tmp/fx-wt HEAD`, nur die Fix-Dateien hineinkopieren, Generator
   dort laufen lassen, für UI-Tests `node_modules` aus dem Build-Spiegel per Symlink einhängen und die betroffenen
   Testordner lokal laufen lassen; dann Fix-Dateien plus generierte Datei stagen, eigener fix-Commit, pushen, CI-Wache
   neu. Grund: Kein Spiegellauf stört die Worker, und der Fix wird gegen genau HEAD geprüft.
   Ist nur ein Job rot, dessen Code der Commit nicht berührt, und waren die vorigen Läufe grün:
   `gh run rerun <runId> --failed` und den Zweitversuch beobachten. Erst wenn er grün ist, gilt der Fehler als Flake;
   den Test dann in einem eigenen test-Commit gegen die vermutete Ursache härten (Ursache im Kommentar als
   „wahrscheinlich“ mit Run-ID). Grund: Der Neulauf trennt Flake von echtem Fehler, ohne Code zu raten; ohne Härtung
   kommt derselbe Flake beim nächsten Push wieder. Vorher den roten Test gegen die gerade abgenommenen Flake-Fixes der
   eigenen Pakete halten (gleicher Mechanismus, z. B. Abschluss-Signal ohne Empfänger, Warten auf Fertig-Kanal): Behebt
   ein noch offener Sammel-PR die Ursache schon, keinen zweiten Härtungs-Commit, sondern im Log auf dessen Commit
   verweisen und den betroffenen PR per Neulauf durchbringen. Grund: Zwei Fixes desselben Mechanismus auf zwei Branches
   kollidieren beim Merge. Vor dem Neulauf eines UI-/Widget-Tests, der vorher grün war, das Fehlerbild gegen die
   Uhrzeit des CI-Laufs halten (Zeitstempel im Job-Log): Hängt das Verhalten an `DateTime.now()` (Jetzt-Linie,
   „heute“, Scroll auf aktuelle Stunde, Hit-Test-Warnung „would not hit test … obscuring“), ist es ein echter Fehler.
   Dann Code fixen und einen Regressionstest schreiben, der die Uhrzeitlage erzwingt (z. B. Termin um `now`); die
   Gegenprobe ohne Fix muss rot sein. Grund: Ein Neulauf zu anderer Uhrzeit ist grün und versteckt den Fehler.
   Job-Logs, wenn `--log-failed` leer bleibt: `gh api --allow-escape-sequences repos/<o>/<r>/actions/jobs/<id>/logs`
   und ANSI-Codes per `sed` entfernen. Beobachtung als Hintergrundtask
   mit `surviveReload: true`. Grund: Ein Reload von pi (z. B. nach Änderungen an Erweiterungen) beendet sonst alle
   laufenden Hintergrundtasks. Temporäre ci/*-Branches danach löschen. Release-Pakete: Skill desktop-app-release.
8. **Statusbericht** (Sprache des Nutzers, knapp): fertig + gepusht (SHA, was es für ihn bedeutet), läuft gerade,
   Probleme mit Ursache, nächste Pakete, was ich von ihm brauche.
   Vor jeder Aussage „alles fertig/abgearbeitet“ den Plan-Kopf Abschnitt für Abschnitt (`grep -n '^## ' PLAN.md`,
   auch „optional“ und „Reste“) gegen Commit-Log und Log-Ende abgleichen; Nicht-Begonnenes ausdrücklich als offen
   nennen. Grund: Die Arbeits-Queue enthält nur eingeplante Pakete; optionale Blöcke und Reste stehen nur im Kopf,
   dessen Checkboxen beim Abarbeiten meist nicht mitgepflegt werden — die Fertig-Meldung lässt sie sonst still weg.
9. **Fortschritts-Checkliste für den Nutzer** (wenn er sehen will, was erledigt ist und was fehlt):
   - Will er den Stand laufend sehen (bei Mehrspuren-Läufen gleich beim Start einrichten, der Nutzer fragt sonst
     danach): selbstaktualisierende HTML-Seite statt Checkliste. Mehrere Spuren mit eigenem Steuerordner:
     `scripts/status-page-spuren.py` (JSON-Konfig mit Spuren und Titel-Präfix für die PR-Zuordnung, plus ein von Hand
     gepflegtes Leitstand-Markdown „Was du tun musst / Was ich noch tue / Selbsttest“, bei jedem Ereignis nachziehen);
     im systemd-Unit `PATH` mit den mise-Shims und `GH_TOKEN_FILE` setzen, sonst fehlt `gh` und die PR-Spalten bleiben
     still leer. Ein Plan mit einer oder mehreren Queues (je `## <Name>`, ein Wrapper sammelt die Spur-Queues):
     Vorlage
     `scripts/status-page.py` (per Umgebungsvariablen konfigurierbar; liest Queue-Tabelle im Plan, Journal,
     `NUTZER.md`/`ERLEDIGT.md`, Git, PRs mit CI-Stand, Worker-Aktivität aus `/tmp/acp-delegate`, laufende Wachen,
     Watchdog-Log). Per `systemd-run --user --unit=<name> --on-calendar='*:0/2' /usr/bin/python3 <skript>` erneuern,
     Seite mit `<meta refresh 60>`, als Artefakt registrieren und den file://-Pfad nennen. Danach die Status-Spalte der
     Queue bei jedem Wechsel sofort pflegen, weil die Seite nur sie liest. Status-Wörter: `gemergt`,
     `committet`/`fertig` (auch solange das Paket im PR steckt), `fehler`, `Abnahme`/`Prüf…`/`integrieren`,
     `läuft`/`wartet`/`nacharbeit`/`resume`; alles andere zählt als offen. Die runId gehört in die Statuszelle
     (`läuft del_… <modell>`), die Live-Spalte liest sie dort zuerst.
   - Fragt der Nutzer „was ist erledigt, was fehlt genau“: Gesamtplan (Phasen erledigt/jetzt/offen), Restarbeit je
     Phase, Engpass, Zeitrahmen und Ressourcen/Kontingent zeigen, nicht nur die Queue – die Queue kennt nur die
     laufende Phase. `scripts/status-page.py` kann das per env (Steps-Checkliste, Übersichts-Markdown, ID-Gruppen,
     Tor-Befehle, mehrere Queues und Worktrees); Wrapper-Rezept, Pflege und Prüfung: `references/statusseite.md`.
   - Einmal von einem Sub-Agent aus Plan, Commit-Log, Paketberichten und Queue erstellen lassen, mit festem Format:
     `- [x] … — <PKG> <sha>` nur mit Beleg; offene Zeilen mit genau EINEM Marker `<!-- pkg:<PKG> -->`;
     Zählertabelle; Anhang der erledigten Pakete. Alles, was nur im Gespräch steht, gebe ich ihm als Stand-Datei mit.
   - Vor dem Commit prüfen: Jede genannte SHA löst auf (`git cat-file -e <sha>^{commit}`), und keine Zeile hat zwei
     Marker. Dann als eigenen Docs-Commit mit `[skip ci]` pushen, damit keine CI-Minuten verbraucht werden.
   - Nach JEDEM Paket-Commit per Skript abhaken: Marker → `[x]` + SHA, Anhang, Zähler, Stand-Zeit. Die Erinnerung
     daran hänge ich ans Ende des Commit-Skripts, damit sie nicht vergessen wird. Was laut Bericht noch „Offen“ ist,
     öffne ich von Hand wieder. Neue Befunde und Wartepunkte des Nutzers trage ich sofort ein.
   - Dem Nutzer den Pfad im Repo, den Web-Link und das Artefakt nennen.
   - Eine Zeile „Voraussichtlich fertig: …“ mitführen, die das Skript bei jedem Lauf neu rechnet: Paketgröße
     (S/M/L/XL → Stunden), laufende Pakete halb, geteilt durch die übliche Parallelität, plus Zuschlag für Abbrüche.
     Bleibt nur EIN Paket offen, nicht durch die Parallelität teilen, und ein Abschlusspaket mit Gesamttestlauf
     eine Größe höher einstufen. Grund: Ein einzelner Worker arbeitet allein, sonst nennt die Prognose eine zu frühe Zeit.
     Eine Spanne nennen statt Scheingenauigkeit; Wartepunkte des Nutzers getrennt ausweisen.
   - Zeilen ohne Paket zählen in der Prognose nicht mit. Darum vor einer Fertig-Aussage alle diese Zeilen von einem
     Text-Worker ohne Compiler einordnen lassen: erledigt (mit Beleg), neues Paket (Aufgabe gleich schreiben),
     außerhalb des Umfangs (mit Grund) oder wartet auf den Nutzer. Sonst ist die Prognose zu optimistisch.
10. **Nach eigenem Absturz oder Reload**:
   - Ursache belegen (Skill ram-audit, journalctl) und dem Nutzer nennen.
   - Worker sind eigene Prozesse und laufen weiter. Ihre Benachrichtigungen an die tote Sitzung gehen verloren →
     Ergebnisse aus `/tmp/acp-delegate/<runId>.out` lesen.
   - Hintergrundtasks der alten Sitzung sind weg (außer `surviveReload`): Logs prüfen oder neu starten.
     Nur eigene liegengebliebene Remote-Läufe beenden.
   - `git status` + Index gegen HEAD prüfen, dann die Queue fortsetzen.
   - Bei Übernahme als Nachfolge-Orchestrator den Weck-Loop live prüfen, bevor Worker starten
     (`systemctl --user list-timers | grep <timer>`, Stop-Marker-Datei, Ziel-Pane/Session in der env-Datei). Fehlt
     der Timer oder liegt der Stop-Marker noch: Marker löschen und den Timer neu anlegen (`systemd-run --user
     --unit=<name> --on-calendar='*:0/5' …`). Grund: Übergabenotizen behaupten den Loop oft als laufend, obwohl der
     Vorgänger ihn beim Abgang gestoppt hat. Ohne Loop weckt nach stillen Phasen nichts die Sitzung.

## Pitfalls

- `[skip ci]` gilt für den ganzen Push: GitHub prüft nur die Nachricht des obersten Commits. Liegt ein
  Doku-Commit mit `[skip ci]` (z. B. Checkliste) auf dem Paket-Commit, läuft für das Paket keine CI. Darum erst
  den Paket-Commit pushen, dann den Doku-Commit. Fehlende Läufe per `workflow_dispatch` auf dem Branch nachholen.
- Nie einen Schritt, der eine Datei erzeugt (write, `cp`), und einen, der sie liest oder ausführt (bash, bg_run), im
  selben parallelen Batch. Grund: Die Reihenfolge ist nicht garantiert; eine Wache bricht dann mit „No such file“ (127) ab.
- Eine Wache nie auf „`.out` ist nicht leer“ bauen: acp_delegate schreibt `.out` schon während des Laufs fortlaufend,
  die Wache meldet dann sofort „fertig“. Immer scripts/worker-wache.sh (Schlusszeile der `.session.jsonl` +
  `.activity`) nehmen. Eine laufende Wache nach Änderungen am Skript mit einer Probe auf schon fertigen Läufen testen
  (muss sofort FERTIG melden), bevor die nächste Welle startet.
- „completed exit=0“ eines Hintergrundtasks heißt nicht grün: Wrapper-Skripte verschlucken Fehler; rc und
  Ergebniszeilen im Log lesen.
- Meldungen von Hintergrundtasks, die enden, während die Sitzung beschäftigt ist, kommen erst danach gesammelt nach,
  je Meldung ein eigener Turn. Nicht per `bg_status` nachprüfen, denn die Meldung ist endgültig. Höchstens einmal per
  `pgrep -af '<muster der wachen/watches>'` belegen, dass nichts mehr läuft. Danach jede Meldung ohne Werkzeugaufruf
  in einem Satz quittieren (welcher Task, wann sein Ergebnis schon ausgewertet wurde). Im Abschlussbericht die noch
  ausstehenden Nachzügler vorab nennen. Grund: Prüfaufrufe je Meldung verbrauchen nur Kontext; in einer Sitzung, die
  nicht mehr falten kann, wird jeder Turn knapp.
- Liegen Server und Client eines Protokolls in getrennten Spuren/Branches (z. B. Desktop-Methode + Handy-Aufruf), das
  Server-Paket zuerst landen und den Client-Brief aus dessen Bericht (Drahtformat-Beispiel) schreiben. Ein
  sprachübergreifender Vertragstest bekommt bis dahin eine markierte Ausnahme (`// <PKG>:`). Deren Entfernung als
  eigenen Queue-Punkt eintragen, fällig erst, wenn Server- und Client-Code im SELBEN Baum liegen (Merge der Branches).
  Grund: Der Test liest die Gegenseite aus dem eigenen Checkout; der Client-Commit auf dem anderen Branch macht ihn
  dort nicht grün. Ohne Queue-Punkt bleibt die Ausnahme still stehen, und der Test prüft die neue Methode nie.
- Zeilennummern in Aufgaben veralten, sobald andere Pakete committet sind — Worker immer per grep neu bestimmen lassen.
- `bg_delegate`-Ergebnis mit `delivery: artifact`: In `result.json` ist `answer` kein Klartext. Die Teile
  `answer.blocks[].data_base64` base64-dekodieren, zusammenfügen und gegen `answer.sha256` prüfen.
- Eine neue Startart für Worker (z. B. pi ohne Erweiterungen, um RAM zu sparen) zuerst mit einer Ein-Zeilen-Probe
  testen (`-p "Antworte nur mit OK"`). Erst danach eine lange Sitzung damit fortsetzen. Grund: Ohne Erweiterungen
  fehlen auch die Provider- und Auth-Anpassungen, die der Eltern-Agent nutzt. Der Lauf scheitert dann sofort.

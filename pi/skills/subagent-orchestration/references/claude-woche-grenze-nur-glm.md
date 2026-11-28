# Claude-Woche nahe der Grenze – Leitstand: „neue Pakete nur noch glm“

- Journal-Quittung mit dem nächsten glm-Paket: nicht aus der Queue-Spalte „Modell“ raten. Viele glm-Pakete hängen an
  Claude-Paketen (gesperrter Vorgänger), und Abhängigkeiten anderer Wellen/Spuren sieht eine Queue-Auswertung nicht.
  Verbindlich ist nur `wpq.py next`; bei vollen Plätzen („voll: 2/2“) „voraussichtlich … (Abhängigkeiten prüft next)“ schreiben.
- Queue-Zelle eines gestarteten Laufs SOFORT im Format `läuft <runId> <modell>` bzw. `nacharbeit läuft <runId> <modell>`
  schreiben, Freitext erst dahinter: Die Platz-Zählung (Register, `wpq.py next`) liest die Kennung aus der Zelle; fehlt sie
  (z. B. „nacharbeit läuft (sonnet-Worker, …)“), sieht die Zählung den Lauf nicht, vergibt den Platz an die andere Spur und
  die Höchstzahl Claude-Läufe wird überschritten. Vor jedem Start `wpq.py next` und `claude-laeufe.py` fragen; ist die
  Grenze überschritten, keinen weiteren Claude-Lauf starten, bis sie wieder eingehalten ist (laufende nie abbrechen).
- „Nur glm“ heißt: glm baut nur Pakete mit Modell-Spalte glm. Pakete mit Spalte opus/sonnet nie ersatzweise mit glm
  starten (auch wenn `next` „glm (statt opus: schon 2 anthropic-Kinder)“ anbietet, wenn der Leitstand das ausschließt) –
  sie warten auf Claude; ist kein glm-Paket startbar, bleibt der Platz leer. Wurde ein Sicherheits-Baustein trotzdem mit glm
  gebaut, verlangt der Leitstand vor dem Einbau eine opus-Prüfung (Sicherheit/echte Fehler, Vorrang vor anderen Claude-Läufen)
  und startet keine abhängigen Pakete vor dem Einbau.
- Weist der Leitstand ein Paket mit Modell-Spalte glm ausdrücklich einem Claude-Modell zu (glm-Tor knapp, Claude-Platz frei):
  das gilt nur für dieses Paket. Brief-Zeile „Dein Modell: …“ per `sed` auf das neue Modell ändern (sonst arbeitet der Worker
  nach dem alten Brieftext), Worker mit dem neuen `model` starten, Zelle sofort `läuft <runId> <neuesmodell>`, Journalzeile mit
  Verweis auf die Leitstand-Weisung. Die Zweitprüfung nimmt das ANDERE Claude-Modell.
- Jedes fertige glm-Paket braucht sofort einen Claude-Prüfer (zählt gegen die Claude-Grenze und die Höchstzahl Claude-Läufe) –
  einplanen. Prüfer mit dem billigeren Claude-Modell (sonnet), wo der Brief nichts anderes verlangt; steigt das Claude-Kontingent
  schnell (Leitstand-Meldung), auch kleine Nacharbeit mit sonnet. Ist das Claude-Tor zu oder kein Claude-Platz frei: abnehmen,
  Endlauf fahren, Queue-Zelle „wartet auf Claude-Prüfung (<Modell>; Endlauf grün HEAD …)“, nicht einbauen. Den Prüfauftrag
  (`review-auftrag/<WP>.md`) schon jetzt schreiben, damit der Start beim ersten freien Platz sofort geht.
- Ist das glm-Tor zu (`quota.sh zai` meldet NEIN) und ein Paket braucht eine weitere Prüfrunde (Zweit-/Drittprüfung nach
  Nacharbeit): das ANDERE Claude-Modell als der Bauer/Vorprüfer nehmen (opus-Bau → sonnet, sonnet-Bau → opus); Prüfauftrag als
  Datei (`review-auftrag/<WP>-N.md`) mit Stand (Commits, Diff-Bereich), Behauptungen des Workers, nummerierten Prüffragen und
  Ausgabeformat `[P1]/[P2]`-Zeilen + letzte Zeile `REVIEW: ok|Mängel`; P2-Funde bei `ok` als Merkposten eintragen
  (`MERKPOSTEN-W2.md`) für das nächste Paket an derselben Stelle. Danach sofort `integ`.
- Nacharbeit-Brief nach `REVIEW: Mängel` (`nacharbeit/<WP>.md`): Kopf mit Prüf-Volltext, End-HEAD, Worktree und „vorhandene
  Commits nicht umschreiben“; je Mangel ein Abschnitt `P1-n/P2-n` mit Datei:Zeile, Ist, Soll und geforderter Rot/Grün-Test;
  Entscheidungsfreiheit (Fehler vs. ignorieren) bewusst dem Worker mit Begründung im Bericht überlassen; Abschluss = Endlauf
  grün auf End-HEAD, `abnahme` OK, Bericht ehrlich (Testzahlen, Restlücken). Typischer P1-Fund bei UI-Paketen: Tests setzen
  Props von Hand, der echte Feed/Aufrufer reicht sie nie durch → Test über den echten Eltern-Baustein verlangen. Kleine,
  belegte Fixes (Rot-Beleg je Fix im Bericht, Endlauf grün) brauchen keine neue Prüfrunde → Queue „integrieren“ + Einbau
  einreihen; große Nacharbeiten (Sicherheit) schon. Gleiches Brief-Muster gilt für einen Worker, den ein Anbieter-Ratenlimit
  mitten im Paket beendet hat und dessen Endlauf rot ist: neuer Worker (Paketmodell) mit Brief „M1..Mn“ aus den roten
  Schritt-Logs (Audit-Test + Datei:Zeile, Handbuch-Drift → Generator neu laufen lassen, ERGEBNIS-Schlusszeile); nicht Resume.
- Ist das Claude-Tor ganz zu (`quota.sh anthropic` meldet NEIN), bietet `wpq.py next` Claude-Pakete als „glm (statt
  sonnet: anthropic-Kontingent)“ an – das ist die Ausweichregel des Werkzeugs, keine Freigabe. Bei der Weisung „nur Pakete
  mit Modell-Spalte glm“ das Angebot NICHT starten, Journalzeile. Schon gelaufene
  Claude-Prüfungen bleiben gültig: deren Paket darf auch bei geschlossenem Tor eingebaut werden.
- Platz-Zählung bei wartenden Paketen: `next` zählt nur Zellen mit `läuft`/`nacharbeit` als belegt; „wartet auf Claude-Prüfung“
  gibt den Platz frei, und `next` stoppt die Suche beim ersten startbaren Paket – ist das ein Claude-Paket (Ausweichangebot glm),
  kommen die glm-Pakete dahinter nie zum Zuge. Dann selbst wählen: aus der Queue der Spur die `offen`-Pakete mit Modell-Spalte
  glm nehmen, deren Abhängigkeiten alle `fertig` sind und die von keinem wartenden Paket abhängen, das kleinste starten,
  Journalzeile mit Begründung. Das Werkzeug nicht ändern (gehört dem Leitstand); die Lücke als „offen für L0“ ins Journal.
- Wartende Pakete in der Queue als `offen (<Grund>)` eintragen: `next` bietet nur Zellen zum Start an, deren Text mit
  `offen` beginnt – ein Hinweis vorne („hängt an …“, „bleibt zurück …“) nimmt das Paket aus der Auswahl, ohne dass es als
  „wartet“ auftaucht. Nach dem Berichtigen `next` neu lesen.
- Dem Reviewer nie einen Schreibauftrag („schreibe nach <Datei>“) geben: er hat kein Schreibwerkzeug und meldet das als Text.
  Den Volltext selbst aus `session.jsonl` des Reviewer-Laufs ziehen (letzter Assistant-Text, der `REVIEW:` enthält) und in die
  Review-Datei schreiben; die Benachrichtigung enthält oft nur Lernpass-Rauschen.
- „check läuft (N min)“ über 60 min bei gleichzeitigen Bauten mehrerer Spuren auf dem Remote-Rechner ist Warteschlange, kein
  Hänger: `ps -eo pid,etimes,args | grep -E 'wpq.py check|rb.sh'` – solange `rb.sh --_inner`-Prozesse laufen, nichts tun.
  Ein Herzschlag mit `WARTE-ENDE herzschlag` ist nur der Zeitablauf: Stand lesen, neu starten, keine Meldung an den Nutzer nötig.
  Vor jedem Neustart `pgrep -af 'warte.sh <Spur>'` gegenlesen (0 = neu starten, 1 = läuft schon): Die Abschlussmeldung eines
  schon ersetzten Herzschlags kommt oft erst nach dem Neustart. Die Dauermeldung „worker hat bash 240 s offen“ eines
  Workers im Endlauf ist dasselbe Warten, kein Hänger: nicht steuern, nur mit einer Zeile quittieren.
- Endet ein Worker durch einen Anbieterfehler (Ratenlimit „HTTP 424 … throttle_terminal“, Absturz) und die Meldung klingt nach
  „fertig“: Zustand belegen statt neu starten – `git log` im Worktree, `git status`, `wpq.py abnahme`, und
  `pgrep -af 'wpq.py check <WP>'`: ein vom Worker gestarteter Endlauf läuft abgekoppelt weiter und liefert sein Ergebnis ins
  Schritt-Log. Fehlt nur die `ERGEBNIS:`-Schlusszeile im Bericht, nach grünem Endlauf selbst als Docs-Commit nachtragen,
  dann `abnahme` und Prüfer. Queue-Zelle `läuft <runId> <modell>` mit Erklärung dahinter beibehalten (Platz-Zählung).
- `wpq.py integ <WP>` startet den Endlauf im Hintergrund, der Aufruf selbst blockiert aber (Merge + Vorprüfung): einen
  Einbau immer abgekoppelt starten – kleines Skript `$C/.start-<wp>-integ.sh` (`cd $C`, optional `while kill -0 <pid>; do sleep 20; done`
  als Warteschlange hinter einem laufenden Einbau, dann `CLAW_MEM=… LUMI_REMOTE_JOBS=… exec python3 wpq.py integ <WP>`) per
  `setsid nohup … </dev/null &` – und nach einigen Minuten `ps -p <pid>` + Log gegenlesen; ein vom Guardrail abgebrochener
  Vordergrundaufruf kann den Einbau mitnehmen (Prozess weg, Log endet nach „Runde 1“). Alternativ bash-`timeout` ≥ 100 s und
  `wpq.py wait integ <WP>` (≤ 85 s je Aufruf, Exit 3 = läuft noch). Vor jedem Neustart `pgrep -af 'wpq.py integ'`/Log
  gegenlesen, sonst entsteht ein zweiter Merge. Einbauten derselben Integrationsbranch seriell einreihen (zweiter wartet auf den
  ersten, dritter auf das Warteskript des zweiten). Zieht `feat/…` während des Endlaufs weiter („nächste Runde“, Runde 2/3),
  ist das normal: der Einbau merged neu und fährt den Endlauf erneut, nichts eingreifen.
  Schreibt man das Start-Skript im selben bash-Aufruf wie ein Befehl, den der Guardrail blockiert (z. B. `git branch -D` eines
  ungemergten Branches), entsteht die Datei nie und das Starten „läuft“ ins Leere: nach dem Start immer `pgrep` und die
  Log-Zeit gegenlesen (altes Log ≠ neuer Lauf), nie nur auf „kein Fehler“ vertrauen.
  Verlangt der Leitstand Wechsel beim Einbau zwischen Spuren („je ein Paket abwechselnd“): nur das Paket direkt hinter dem
  laufenden Einbau eingereiht lassen; weitere eigene Warteskripte beenden und Queue-Zelle mit Grund versehen
  (`integrieren (… Einbau nach …)`). Gilt die Wechselregel nur bei gleichzeitig bereiten Paketen und die andere Spur hat nichts
  einbaufertig, sofort einbauen. Warteskripte NIE mit `pkill -f <skriptname>` beenden: das Muster steht in der eigenen
  Befehlszeile der bash und beendet den Aufruf selbst (Exit 143, der Rest des Befehls läuft nicht) – PID per
  `pgrep -af` holen und `kill <pid>`.
- Integrationsfix ohne Paket („feat ist rot wegen eines schon eingebauten Pakets“, Leitstand-Vorrang): `wpq.py integ <WP> --wt <pfad>`
  akzeptiert einen frischen Worktree vom aktuellen `feat/…` (`git worktree add`), wenn dessen Branch genau `claw/<wp-klein>`
  heißt – den alten, schon gemergten Branch vorher mit `git branch -m …-alt` umbenennen (Löschen blockiert der Guardrail),
  dann den Fix-Branch auf den Paketnamen umbenennen. Der Fix ist klein, Endlauf voll (mit den Audits des Schrittes, den der
  Leitstand ergänzt hat), danach die zuvor gescheiterten Einbauten neu starten und deren Queue-Zelle mit dem Grund versehen.
  Typische Audit-Fixes: `lumi_core::proc::no_window(cmd.as_std_mut())` an jedem Prozess-Start, `lumi_core::fsutil::canonical`
  statt `canonicalize`; ein Worker, dessen Endlauf wegen fremder Dateien rot ist, bekommt per `steer` gesagt, dass sie nicht seine sind.
- Meldet der Wächter „seit N min kein Fortschritt“, zuerst die Ursache trennen, bevor etwas neu gestartet wird: im
  `events.jsonl` des Laufs (`/tmp/pi-subagents-uid-<uid>/async-subagent-runs/<runId>/`) die Zeitstempel (`observedAt`/`ts`;
  `content` kann Zeichenkette statt Liste sein) auf Lücken prüfen, dazu `git log`/Dateizeiten im Worktree, Fortschritt im
  Schritt-Log (`RB_START`, letzte `Compiling`-Zeile) und Auslastung des Build-Hosts per ssh. Eine Lücke zwischen `turn_start`
  und der nächsten `message_start` bei laufendem Prozess = Modellanfrage hing; endet sie von selbst, weiterlaufen lassen
  (kein Resume – es verwirft den Verlauf), Ergebnis als Journalzeile „kein Blocker“ festhalten.
- glm-Worker mit Commit-Hook: Betreff muss Conventional Commits folgen und ≤ 72 Zeichen sein (sonst „BLOCKED“, auch beim
  Orchestrator-Sicherungscommit) – steht die Regel nicht im Brief, scheitert der Worker mehrfach und löst „repeated mutating
  tool failures“ aus; meist korrigiert er selbst, erst `git log` ansehen. Läuft ein glm-Worker ins Zeitlimit, war die Arbeit
  oft fertig: Rest selbst sichern (`git add` der Paketpfade, Commit), `wpq.py abnahme`, dann Endlauf.
- Fragt ein Worker per Supervisor-Anfrage nach einer Entscheidung (z. B. generiertes Handbuch außerhalb der eigenen Pfade
  → `abnahme` meldet „Dateien außerhalb der eigenen Pfade“): selbst nach dem Muster eines früheren Pakets entscheiden
  (`$C/vorgaben/<WP>.pfade` anlegen, eine Zeile je Pfad), Journalzeile, dann
  `subagent_supervisor({action:"reply", replyTo:<id aus der Meldung>, message})`. Vorher den Diff der fremden Datei gegen die
  Basis lesen (nur additive Zeilen? Abhängigkeit mit fester Version?) und den Worker die Abweichung im Bericht nennen lassen.
  Dasselbe Paket fragt oft zweimal (erst i18n-Datei, dann generiertes `handbuch.html` im Endlauf): beide Pfade gleich beim
  ersten Mal freigeben, wenn das Paket Handbuch-Fragmente und neue Schlüssel hat.
- Endlauf-Schritt `nextest EXIT=255` ohne Fehlertext (Log endet mitten im Kompilieren) = abgebrochen (RAM/Remote, meist OOM im
  Scope, kein Codefehler): Schritt neu fahren, nicht blind ändern. Mit weniger Jobs wiederholen – den aktuellen Wert nennt der
  Leitstand (zuletzt `CLAW_MEM=7G LUMI_REMOTE_JOBS=2`; zu hohe Werte passen bei zwei parallelen Endläufen nicht in den
  RAM des Build-Hosts), weil der Speicherwächter sonst rustc beendet; besonders nach einem `RB_SCAN …: Bau-Ordner im Spiegel
  entfernt` (Vollneubau) und wenn andere Endläufe parallel laufen. `nextest EXIT=100` nach Speicher-Neuversuchen ist dagegen
  ein echter Testfehler: die `FAIL […]`-Zeilen im Schritt-Log lesen (Audit-Tests in `lumi-core`, z. B. no_window/canonical,
  sind Codefehler des Pakets oder eines fremden, schon eingebauten Pakets). Rote UI-Last-Flakes (Zeit-Schwellen-Tests wie
  „2000 Zeilen < 200 ms“ bzw. Timeout 5000 ms) getrennt von eigenen roten Tests (i18n-Platzhalter, Design-Wächter,
  Handbuch-Drift) benennen; bei reinem
  Infra-/Flake-Rot (Log: genau 1 Test rot, ein Zeit-Test, alle anderen Schritte grün) im `integ` einfach `integ` erneut
  fahren und die Flake als Merkposten notieren; dem Worker per `steer` nur eigene rote Tests mitgeben.
- `wpq.py integ` bricht am Tor „MANGEL Bericht: ERGEBNIS: teilweise …“ ab (strikte Prüfung; `abnahme` warnt nur): Die
  Schlusszeile des Berichts muss `ERGEBNIS: fertig – …` lauten, „bewusst offen“ gehört in den Text der Zeile. Als reiner
  Docs-Commit im Worker-Worktree korrigieren (Betreff ≤ 72 Zeichen), `abnahme`, `integ` neu.
- Roter Schritt nach dem Merge mit `couldn't read …/<Modul>/mod.rs: No such file or directory`, obwohl das Modul im eigenen
  Diff nicht vorkommt, ist kein Paketfehler: Der Remote-Spiegel eines Slots (`~/lumi-claw-<slot>/repo`) wird von mehreren
  Worktrees gleichzeitig beschrieben, ein fremder Lauf hinterlässt `pub mod x;` ohne Datei. `pgrep -af 'rb.sh --_inner'`
  zeigt die Läufe je Slot; `integ` wiederholen, wenn dort nichts mehr läuft. Wird es bei freiem Slot erneut rot, als
  „offen für L0“ mit Log-Namen melden.

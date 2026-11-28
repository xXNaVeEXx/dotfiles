# Claude-Woche nahe der Grenze – Leitstand: „neue Pakete nur noch glm“

- Journal-Quittung mit dem nächsten glm-Paket: nicht aus der Queue-Spalte „Modell“ raten. Viele glm-Pakete hängen an
  Claude-Paketen (gesperrter Vorgänger), und Abhängigkeiten anderer Wellen/Spuren sieht eine Queue-Auswertung nicht.
  Verbindlich ist nur `wpq.py next`; bei vollen Plätzen („voll: 2/2“) „voraussichtlich … (Abhängigkeiten prüft next)“ schreiben.
- „Nur glm“ heißt: glm baut nur Pakete mit Modell-Spalte glm. Pakete mit Spalte opus/sonnet nie ersatzweise mit glm
  starten (auch wenn `next` „glm (statt opus: schon 2 anthropic-Kinder)“ anbietet, wenn der Leitstand das ausschließt) –
  sie warten auf Claude; ist kein glm-Paket startbar, bleibt der Platz leer. Wurde ein Sicherheits-Baustein trotzdem mit glm
  gebaut, verlangt der Leitstand vor dem Einbau eine opus-Prüfung (Sicherheit/echte Fehler, Vorrang vor anderen Claude-Läufen)
  und startet keine abhängigen Pakete vor dem Einbau.
- Jedes fertige glm-Paket braucht sofort einen Claude-Prüfer (zählt gegen die Claude-Grenze und die Höchstzahl Claude-Läufe) –
  einplanen. Prüfer mit dem billigeren Claude-Modell, wo der Brief nichts anderes verlangt. Ist das Claude-Tor zu: abnehmen,
  Endlauf fahren, Queue-Zelle „wartet auf Claude-Prüfung“, nicht einbauen.
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
  belegte Fixes brauchen keine neue Prüfrunde, große Nacharbeiten (Sicherheit) schon.
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
  Die Abschlussmeldung eines schon ersetzten Herzschlags kommt oft erst nach dem Neustart: nicht noch einmal starten, sondern
  `pgrep -af 'warte.sh <Spur>'` gegenlesen (genau einer läuft).
- `wpq.py integ <WP>` startet den Endlauf im Hintergrund, der Aufruf selbst blockiert aber (Merge + Vorprüfung): einen
  Einbau immer abgekoppelt starten – kleines Skript `$C/.start-<wp>-integ.sh` (`cd $C`, optional `while kill -0 <pid>; do sleep 20; done`
  als Warteschlange hinter einem laufenden Einbau, dann `CLAW_MEM=… LUMI_REMOTE_JOBS=… exec python3 wpq.py integ <WP>`) per
  `setsid nohup … </dev/null &` – und nach einigen Minuten `ps -p <pid>` + Log gegenlesen; ein vom Guardrail abgebrochener
  Vordergrundaufruf kann den Einbau mitnehmen (Prozess weg, Log endet nach „Runde 1“). Alternativ bash-`timeout` ≥ 100 s und
  `wpq.py wait integ <WP>` (≤ 85 s je Aufruf, Exit 3 = läuft noch). Vor jedem Neustart `pgrep -af 'wpq.py integ'`/Log
  gegenlesen, sonst entsteht ein zweiter Merge. Einbauten derselben Integrationsbranch seriell einreihen (zweiter wartet auf den ersten).
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
- Endlauf-Schritt `nextest EXIT=255` ohne Fehlertext (Log endet mitten im Kompilieren) = abgebrochen (RAM/Remote), kein
  Codefehler: Schritt neu fahren, nicht blind ändern. Mit weniger Jobs wiederholen (`CLAW_MEM=9G LUMI_REMOTE_JOBS=2`, bei
  großem Crate ggf. `CLAW_MEM=7G`), weil der Speicherwächter des Build-Hosts sonst rustc beendet und der Wrapper es nicht
  erkennt; besonders nach einem `RB_SCAN …: Bau-Ordner im Spiegel entfernt` (Vollneubau) und wenn andere Endläufe parallel
  laufen. Rote UI-Last-Flakes (Zeit-Schwellen-Tests wie „2000 Zeilen < 200 ms“ bzw. Timeout 5000 ms) getrennt von eigenen
  roten Tests (i18n-Platzhalter, Design-Wächter) benennen; bei reinem Infra-/Flake-Rot (Log: genau 1 Test rot, ein
  Zeit-Test, alle anderen Schritte grün) im `integ` einfach `integ` erneut fahren und die Flake als Merkposten notieren; dem
  Worker per `steer` nur eigene rote Tests mitgeben.
- `wpq.py integ` bricht am Tor „MANGEL Bericht: ERGEBNIS: teilweise …“ ab (strikte Prüfung; `abnahme` warnt nur): Die
  Schlusszeile des Berichts muss `ERGEBNIS: fertig – …` lauten, „bewusst offen“ gehört in den Text der Zeile. Als reiner
  Docs-Commit im Worker-Worktree korrigieren (Betreff ≤ 72 Zeichen), `abnahme`, `integ` neu.
- Roter Schritt nach dem Merge mit `couldn't read …/<Modul>/mod.rs: No such file or directory`, obwohl das Modul im eigenen
  Diff nicht vorkommt, ist kein Paketfehler: Der Remote-Spiegel eines Slots (`~/lumi-claw-<slot>/repo`) wird von mehreren
  Worktrees gleichzeitig beschrieben, ein fremder Lauf hinterlässt `pub mod x;` ohne Datei. `pgrep -af 'rb.sh --_inner'`
  zeigt die Läufe je Slot; `integ` wiederholen, wenn dort nichts mehr läuft. Wird es bei freiem Slot erneut rot, als
  „offen für L0“ mit Log-Namen melden.

# Kontingent: Tor-Skript, Ausnahmen, Endspurt, Notbremse, Pause, Verbrauch messen, Reichweite

Gilt für lange autonome Läufe auf Abo-Konten (z. B. anthropic + zai-coding-cn). Ziel: Fortschritt ohne den Nutzer
leerlaufen zu lassen, und kein Wochenrest verfällt ungenutzt.

## 1. Tor-Skript (`quota.sh [-v|-e] <anbieter|modell>`)
- Quelle: `~/.local/state/omarchy/agents/usage/<anbieter>.json` (`.limits[]` mit label, percent 0..1, resetsAt).
  Jeder Sammler schreibt in eigenem Takt (gemessen ≈ 5 min bis ≈ 15 min). Den Takt aus dem Abstand zweier
  Änderungszeiten (`stat -c %y`) bestimmen und die Datei nie öfter abfragen.
- Exit 0 bedeutet, dass ein Start erlaubt ist. `-v` gibt eine Zeile für Journal und Statusseite aus.
  `-e` gibt 0 aus oder die epoch, ab der der Anbieter frei ist. Pause-Skripte rechnen mit dieser Zahl.
  `-e` muss Sperren verketten: Endet der greifende Grund (z. B. das Kurzfenster) in einem zweiten (z. B. der
  Hochlast-Sperre, §7 Punkt 3), gilt das Ende des zweiten. Sonst plant die Spur Fortsetzer für eine Zeit, zu der der
  Anbieter noch gesperrt ist. Gegenprobe: `<PREFIX>_NOW=<frei-ab-epoch> quota.sh -v <anbieter>` muss frei melden.
- Fehlt der Reset oder liegt er in der Vergangenheit, liefert `-e` jetzt + 1 h. Grund: `date -d "-"` ergibt heute
  00:00, und die Pause wäre sofort vorbei.
- Kurzwert = Maximum aller Nicht-Wochen-Fenster des Kontos. Kein einzelnes Label herauspicken, denn Sammler
  beschriften Fenster teils falsch (z. B. das 5-h-Fenster als „Monthly“). Abgelaufenes `resetsAt` zählt 0.
  Vorher prüfen, welche Fenster die Datei wirklich enthält (`jq -c '[.limits[].label]'`). Liefert der Sammler kein
  Kurzfenster, meldet das Tor kurz = 0 % und schützt es nicht; dann die Parallelität dieses Anbieters in der
  Startdatei deckeln.
- Modellgebundene Fenster erkennt man am Label: Es beginnt nicht mit Session, Weekly oder Monthly und endet auf
  „ Weekly“, „ Session“ oder „ Monthly“ (z. B. „<Modell> Weekly“). Sie zählen nur für ihr Modell. Das Feld `title`
  taugt nicht als Merkmal, weil manche Sammler es überall setzen.
- Ein Modell mit eigenem Fenster bleibt trotzdem an das Konto-Tor gebunden, bis ein Messlauf zeigt, dass es nicht
  auf das Gesamt-Wochenlimit zählt. Erst dann die Freigabe-Datei `<modell>-separat` anlegen. Den Messlauf gibt man
  der Spur als ausdrückliche Einmal-Ausnahme: genau ein Auftrag, die Notbremse gilt weiter. Grund: Sonst sperrt das
  Konto-Tor genau den Lauf, der die Trennung belegen soll. Ablauf:
  1. Die Grundlast des Kontos vorher aus zwei Ablesungen mit einigen Stunden Abstand rechnen (Prozent je Stunde).
     Den Anstieg des Kontowerts während des Laufs gegen diese Grundlast werten.
  2. Den Auftrag so groß wählen, dass er mehrere Prozentpunkte bewegt, denn die Usage-Werte haben nur ganze Prozent.
     Er muss aber in das Kontextfenster des Modells passen (Policy-Eintrag, §6 Punkt 2; z. B. 200K statt 1M): weniger
     Quellen und Lesegrenzen (offset/limit) in den Brief schreiben. Nach den ersten Turns den Kontextstand prüfen
     (`usage.totalTokens` der letzten Assistant-Zeilen der Sitzung). Grund: Große Erstlesungen füllen ein kleines
     Fenster in wenigen Turns, und der Lauf endet, bevor er messbar verbraucht.
  3. Eine Messwache als bg_run daneben starten. Sie schreibt Konto- und Modellwert bei jeder Änderung ins Log, mit
     der Änderungszeit der Usage-Datei. Erreicht der Kontowert die Schwelle, ab der der Leitstand blockiert wäre,
     endet sie mit Alarm, und der Lauf wird abgebrochen. Das Laufende erkennt sie am stopReason ≠ toolUse der
     letzten Assistant-Zeile plus ≥ 60 s Ruhe. Danach wartet sie mindestens einen Schreibtakt des Sammlers plus
     Puffer und schreibt dann die Schlusswerte. Proben mit einer Test-Usage-Datei und eigenem Log-Pfad per env
     fahren, sonst landen Probewerte im echten Log.
  4. Auswertung: Ohne Mitzählen steigt der Kontowert um Grundlast × Laufdauer. Steigt der Modellwert um mehrere
     Punkte und der Kontowert höchstens um diese Grundlast plus 1 Punkt Rundung, die Freigabe-Datei anlegen. Steigt
     der Kontowert deutlich mehr, zählt das Modell mit. Kein Ergebnis gibt es, wenn sich der Modellwert nur um 1–2
     Punkte bewegt hat, weil ein mitzählender Anteil dann unter der Rundungsgrenze von 1 Punkt liegen kann; ein
     Punkt mehr am Konto passt dann zur Rundung wie zu einem kleineren, mitzählenden Modellfenster. Ebenso kein
     Ergebnis, wenn der Lauf mit einem Fehler abbricht (SKILL.md, Pilot) und der Modellwert sich nicht bewegt hat.
     Ohne Ergebnis keine Freigabe-Datei; der nächste Messlauf muss größer sein.
- Prozent mit `round` bilden, nicht mit `floor`. Grund: 0.58·100 = 57.99…, und ein Tor bei 58 % wirkt dann offen.
- Die Schwellen kommen aus env-Variablen, die Uhrzeit ebenfalls (`<PREFIX>_NOW`, Standard `date +%s`). Test: Skript
  in einen Temp-Ordner kopieren, `HOME` auf künstliche Usage-JSONs zeigen lassen und diese Fälle mit erwartetem
  Exit-Code prüfen: frei, Kurzwert zu, Woche zu, abgelaufener Reset, Modellfenster, Ausnahme gültig und abgelaufen,
  Rampe, Hochlast (§7), Kurzfenster endet in der Hochlast (`-e` = deren Ende). Änderungen erst als `.new` gegen die
  Tests fahren (Testskript nimmt die Quelle aus env), dann per `mv` einsetzen, weil Timer und Spuren das Skript
  jederzeit aufrufen.

## 2. Befristete Ausnahmen (`quota-override`)
- Format je Zeile: `<anbieter> <kurz|woche> <schwelle> <bis-epoch> <grund>`. Die Zeilen verfallen von selbst,
  niemand muss sie zurücksetzen. Den Grund zusätzlich ins Entscheidungs-Log schreiben.
- Einsatz: Ein Wochenrest verfällt bald, und der Nutzer braucht das Konto in dieser Zeit nicht (z. B. nachts). Dann
  bis zum Morgen eine höhere Schwelle setzen.
- Gibt der Nutzer für den Rest der Woche eine höhere Grenze frei (§9 Punkt 5), läuft die Zeile bis zum
  Wochenwechsel (`bis-epoch` = Reset der Woche); danach gilt der Standard ohne Rückbau.
- Hängt das Ende der Ausnahme an einem Ereignis statt an einer Uhrzeit (z. B. ein angekündigtes Zurücksetzen), den
  Grund mit einer eindeutigen Marke beginnen. Ein Melder löscht dann genau diese Zeile, sobald das Ereignis eintritt
  (§5); der Ablauf bleibt als Sicherheitsnetz.

## 3. Endspurt-Rampe
- In den letzten N h vor dem Wochen-Reset (z. B. 12) steigt das Wochen-Tor linear vom Normalwert bis zu einer
  Endspurt-Decke, z. B. 95 % beim günstigen und 90 % beim teuren Konto. `-e` liefert dann den Zeitpunkt, an dem die
  Rampe den Ist-Wert übersteigt, nicht den Reset. Die Pause endet also früher.
- Grund: Das normale Tor hält den Rest für den Nutzer frei. Kurz vor dem Reset braucht er ihn nicht mehr, und danach
  ist er verfallen.
- Das teuerste Modell mit eigenem Fenster bekommt keine Rampe (Decke 0 = aus).

## 4. Notbremse (Timer)
- Das Start-Tor sperrt nur neue Läufe. Laufende Worker verbrauchen weiter (gemessen: 4 Läufe ≈ 7 % Woche pro
  Stunde) und reißen sonst das Anbieter-Limit. Folge wären 429-Fehler mitten im Lauf und halbe Berichte.
- Ablauf: Ein Timer läuft alle 5 min (`systemd-run --user --on-calendar='*:0/5'`, HOME/PATH/DBUS setzen). Ist die
  Woche ≥ Decke (z. B. 96 % / 94 %) UND läuft ein Worker dieses Anbieters in einer Spur-Queue, schickt er dem
  Spur-Orchestrator einen Prompt mit diesen Schritten:
  1. Worker per `acp_delegate_cancel` stoppen.
  2. Status auf „Nacharbeit nach Reset (resume <runId>)“ setzen.
  3. Bis zum Reset nichts starten.
  4. Nach dem Reset zuerst `resumeFrom` ausführen.
- Den Abbruch erledigt die Spur selbst, nie der Leitstand, denn die Worker gehören der Spur.
- Grenzen:
  - höchstens 3 Anstöße je Anbieter und Reset, mindestens 20 min Abstand;
  - Sperrdatei `bremse-<anbieter>-<reset-epoch>` und eigenes Log;
  - `--dry` sowie Test-env (Usage-Ordner, Queue-Liste) für Tests.
- Die Decke so legen, dass dem Nutzer bis zum Reset ein Rest bleibt (3–4 %). Diesen Rest in der Meldung nennen.

## 5. Pause
- Das Pause-Skript prüft alle Anbieter, auch Pilot-Modelle, außer es gibt eine Sperrdatei wie `<MODELL>-AUS`.
- Ist ein Anbieter frei, gibt es FREI aus, endet mit Exit 1 und löscht PAUSE.
- Sonst schreibt es `PAUSE` = `<bis+900> <grund>` und endet mit Exit 0. Dabei gilt: bis = frühestes Freiwerden + 2 min,
  höchstens 6 h.
- Aufsicht und Watchdog lesen die PAUSE-Datei und wecken in der Pause nicht. Aktiv bleiben nur Neustart und HÄNGT.
  Der Herzschlag zählt ab Pausenende.
- Die Weckaufgabe der Spur in der Pause ist eine Shell-Schleife, kein `sleep` bis `bis`: Sie fragt alle 5 min das
  Tor-Skript für jeden Anbieter und endet, sobald einer frei ist. Deckel ist `bis`, z. B.
  `timeout <sek> bash -c 'until quota.sh <anbieter1> || quota.sh <anbieter2>; do sleep 300; done'` oder
  `warte.sh <spur> --max <sek> --quota <a1>,<a2>` (endet zusätzlich, wenn ein Worker fertig ist). Grund:
  Kontingent wird oft früher frei als berechnet (der Nutzer setzt es zurück oder stockt auf, ein Fenster läuft
  früher ab). Weil Aufsicht und Watchdog in der Pause schweigen, bliebe es sonst bis zum Deckel ungenutzt. Die
  Schleife kostet keine Tokens; ein Weckruf der Spur je Prüfung bezahlt dagegen jedes Mal ihren ganzen Kontext.
- Meldet der Nutzer, dass er ein Kontingent zurückgesetzt oder erhöht hat, so vorgehen:
  1. Usage-JSON prüfen (Änderungszeit, Prozent, neues `resetsAt`). Sie erneuert sich nur im Takt ihres Sammlers
     (§1). Ist sie älter als die Nachricht, eine Erneuerung abwarten.
  2. `quota.sh -v` laufen lassen.
  3. Die Spur sofort anstoßen: Pause beenden (Pause-Skript → FREI) und die Weckaufgabe beenden. Danach nach der
     Startdatei weiterarbeiten: zuerst die Fortsetzer der Teil-Läufe, Platzgrenzen und Hochlast-Sperre beachten.
  4. Ein Reset kann das Wochenfenster verschieben. Endspurt-Rampe, Termine und Übersicht mit dem neuen `resetsAt`
     nachziehen.
- Kündigt der Nutzer an, dass er ein Kontingent zurücksetzen wird, sobald es voll ist, so vorgehen:
  1. Das Wochen-Tor dieses Anbieters per Ausnahme (§2) bis knapp unter die Notbremse heben (z. B. 85 → 92 % bei
     Notbremse 96 %), Grund mit Marke (z. B. `[L0 <Datum Zeit>]`), Ablauf etwa ein Tag. Grund: Beim Zurücksetzen
     verfällt der Rest der alten Woche, er soll vorher verbraucht werden.
  2. `scripts/kontingent-melder.sh` in den Steuerordner kopieren und als eigene User-Unit starten (Aufruf, Probe-
     Benachrichtigung und Testfälle im Skriptkopf). Er benachrichtigt den Nutzer genau einmal, wenn die erhöhte
     Schwelle erreicht ist. Springt danach `resetsAt`, löscht er die Zeile mit der Marke und endet. Grund: Endet er
     schon nach der Meldung, hebt die Ausnahme das Tor bis zu ihrem Ablauf auch in der neuen Woche.
  3. Die Spur braucht keinen Prompt: Das Tor schließt, das Pause-Skript läuft, und die Weckschleife mit `--quota`
     weckt sie nach dem Zurücksetzen.
  4. Die Aufgabe des Nutzers an erster Stelle in Übersicht und `NUTZER.md` nennen (references/statusseite.md, Pflege).
  5. Nach dem Zurücksetzen prüfen: `KM-ENDE` im Melder-Log, die Marke fehlt in `quota-override`, die Spur läuft
     wieder. Danach Schritt 4 des Ablaufs oben (Rampe, Termine, Übersicht nach dem neuen `resetsAt`).

## 6. Hebel prüfen, bevor pausiert wird
Zuerst die Reichweite rechnen (in Worker-Stunden je Anbieter: §9): Ein volles Kurzfenster kostet „Credits je
Kurzfenster / Credits je Woche“ der Woche (z. B. 12 000 / 60 000 = 20 %; Rabattzeiten ändern das Verhältnis nicht,
weil beide Fenster gleich abrechnen). Daraus folgt, wann das Wochen-Tor schließt. Vorher in der Startdatei der Spur
prüfen, ob eine Ausweichregel jede noch offene Arbeitsart auf den anderen Anbieter verlagern darf, sobald nur dort
Plätze frei sind. Den Zeitpunkt in die Übersicht für den Nutzer schreiben. Grund: Fehlt die Regel, steht die Spur
beim Schließen des Tors still, obwohl der andere Anbieter frei ist.
Die Ausweichregel muss in beide Richtungen wirken: Das Modell eines Auftrags erst beim Start gegen die aktuellen Tore
wählen und erst dann in die Queue schreiben (`läuft <runId> <modell>`); offene Zeilen behalten ihr Grundmodell.
Grund: Eine beim Ausweichen umgeschriebene offene Zeile wartet nach dem Umschlagen der Sperre auf den nun gesperrten
Anbieter, obwohl ihr Grundmodell wieder frei ist. Beim Wecken deshalb offene Zeilen prüfen, deren Modell gerade
gesperrt ist, und sie auf das freie Modell zurückstellen.
Bedingte Grenzen (z. B. „solange Anbieter A gesperrt ist, bis zu 4 Läufe bei B“) zusätzlich in den Ablauf jeder
Kontrollrunde der Startdatei schreiben, nicht nur in den Regelabschnitt, und in jedem Phasen-Brief wiederholen, der
eine neue Queue anlegt: Grenzen je Anbieter, Ausnahmen nur bei NEIN des anderen Tors, dazu der Satz „Modell erst beim
Start wählen, die Modell-Spalte ist nur das Grundmodell“. Grund: Die Spur rechnet sonst mit der Grundgrenze weiter,
die ihr Journal Runde für Runde wiederholt. Trägt eine neue Queue nur ein Grundmodell (z. B. weil der andere Anbieter
beim Anlegen gesperrt war), folgt die Spur dieser Spalte wörtlich und startet nach dem Umschlagen weiter alles auf
diesem Anbieter. Beim Wecken nach einem Reset, beim Umschlagen eines Kurzfensters (frei oder voll) und zu Beginn
einer Sperre die laufenden Worker je Anbieter gegen die Grenze samt Ausnahmen halten (`grep -n -i ausnahme
<START.md>`). Liegt die Zahl darunter (Auftrag offen) oder darüber, die Spur mit Verweis auf die Regel anstoßen:
laufende Worker nie wegen der Grenze abbrechen, nur die nächsten Starts umlenken.

Danach diese Reihenfolge einhalten und die gewählten Hebel als selbst verfallende Regeln umsetzen:
1. Verfallender Wochenrest: Endspurt-Rampe, Nachtausnahme.
2. Anderes Modell mit eigenem oder billigerem Fenster: Zuerst prüfen, ob das Abo das Modell zulässt
   (`rg -n '<modell-id>' ~/.pi/agent/npm/node_modules/pi-background-tasks/dist/src/core/anthropic-attribution.js`).
   Ohne Policy-Eintrag endet jeder Lauf nach Millisekunden. Der Eintrag nennt auch das Kontextfenster. Danach einen
   Pilot mit genau einem Lauf starten (§1).
3. Weitere angemeldete Konten: `~/.pi/agent/auth.json` und den Login-Status der CLI prüfen. Bezahl-APIs nie ohne
   Freigabe des Nutzers nutzen.
4. Eigenen Verbrauch senken: Der Leitstand auf dem teuersten Modell ist meist der größte Verbraucher. Er soll nur bei
   Ereignissen wach werden. Schalter einer solchen Sparstufe:
   - Die Watchdog-Frist für „wartet mit Weckruf“ hochsetzen (z. B. 150 → 480 min).
   - Die Aufsicht meldet einen Pausenbeginn nur als Meilenstein und endet nicht, denn die Spur wacht per
     `warte.sh --quota` selbst auf.
   - Wecken bleibt bei Problemen, beim Herzschlag und zu Terminen.
   - Bei Credit-Abrechnung erst messen, dann Läufe kürzen (§7).
   Den Rückbau nicht dem eigenen Wecken überlassen, sondern als transienten Timer zum Reset planen:
   `systemd-run --user --unit=<name> --on-calendar='<JJJJ-MM-TT HH:MM>' /bin/bash -c "sed -i 's/^<KEY>=<wert> .*/<KEY>=<alt>  # Rückbau <zeit>/' <env-datei>"`.
   Der Watchdog liest die env-Datei bei jedem Lauf neu. Den Timer per `systemctl --user list-timers` prüfen und
   in STAND.md notieren. Grund: Eine vergessene Sparstufe lässt den Leitstand nach dem Reset stundenlang zu
   selten wach werden.
5. Spätere Termine (z. B. einen Test zum Endspurt) per Timer an das eigene Pane schicken. Dazu genügt
   `systemd-run --user --on-calendar='<JJJJ-MM-TT HH:MM>' bash -c 'herdr pane send-text <pane> "<text>"; herdr pane
   send-keys <pane> enter'`, ein tagelanger `sleep`-bg_run ist nicht nötig. Den Termin in STAND.md notieren.
   Im Text keine Kennungen nennen, die bis dahin wechseln können (Task-ID der Aufsicht, runIds), sondern sagen, wie
   man sie dann findet (z. B. „laufende Aufsicht per bg_status“). Grund: Der Text ist ab dem Anlegen eingefroren.
- Meldung an den Nutzer: was jetzt läuft, wann die Bremse greift, wie viel Rest ihm bleibt und wann der nächste
  Weckruf kommt.

## 7. Verbrauch messen und senken (Abrechnung in Credits)
Gilt, wenn ein Anbieter je Token-Art unterschiedlich abrechnet (z. B. z.ai Coding Plan: Credits =
(Input·a + Cache-Lesung·b + Output·c)/10000, Faktoren je Modell und die Credits je Fenster und Tarif in der
Tarif-Doku des Anbieters).
1. Messen, bevor Schwellen oder Parallelität geändert werden. Die Worker-Sitzungen enthalten je Aufruf die Usage
   (`.timestamp` ist ISO-UTC); RAM-schonend erst je Zeile filtern, dann summieren:
   ```bash
   jq -cR --arg p zai-coding-cn --arg von <ISO-UTC> --arg bis <ISO-UTC> \
     'fromjson? | select(.message.usage and .message.provider==$p and .timestamp>=$von and .timestamp<$bis)
      | .message.usage | [.input, .cacheRead, .output]' /tmp/acp-delegate/*.session.jsonl \
   | jq -s '{n: length, input: (map(.[0])|add), cache: (map(.[1])|add), output: (map(.[2])|add)}'
   ```
   `-R` mit `fromjson?` ist Pflicht: Laufende Sitzungen enthalten halb geschriebene Zeilen, und ein einziger
   Parse-Fehler bricht den Strom über alle Dateien ab. Credits ausrechnen und gegen die Prozent-Änderung des
   Fensters in der Usage-JSON halten → Credits je Prozentpunkt → Tarif bestätigen. Hochlast und Nebenzeit getrennt
   messen, denn der abgerechnete Anteil an der Nominal-Formel kann deutlich vom Rabatt in der Doku abweichen. Passt
   ein Abschnitt nicht, liegt es meist an Rabattzeiten oder an weiterem Verbrauch am Konto (Leitstand, andere
   Sitzungen). Wirkung einer Sparregel als Ertrag je Prozentpunkt (fertige Einheiten je Fenster-Prozent) vor und
   nach der Regel belegen.
2. Läufe kurz halten. Bei langen Tool-Schleifen machen Cache-Lesungen meist über 80 % der Credits aus, denn jeder
   Aufruf liest den ganzen bisherigen Kontext erneut. Die Kosten eines Laufs wachsen damit etwa quadratisch mit
   seiner Länge, mehrere kurze Läufe kosten weniger als ein langer. Darum die Arbeit je Worker-Lauf deckeln
   (z. B. ≤ 20 Quellen oder Einheiten) und danach einen frischen Fortsetzer ohne `resumeFrom` starten. Er bekommt
   nur die Restliste, erfragt offene Einheiten bei einem Prüfskript, liest die Ergebnisdatei nicht ganz
   (Gliederung per `grep -n '^#'`, Einfügestellen per offset/limit) und meldet „teilweise (x/y)“ oder „fertig“.
   Die Queue-Zeile im selben Schritt auf die runId des Fortsetzers umstellen. Grund: Der Leitstand prüft Hänger je
   runId aus der Queue (references/orchestrator-aufsicht.md §4 Punkt 5); mit der alten runId sieht er nur den
   beendeten Lauf, und ein Hänger des Fortsetzers fällt nicht auf.
3. Hochlast-Preise meiden. Kostet ein Anbieter zu festen Zeiten mehr (z. B. z.ai werktags 14–18 Uhr UTC+8),
   sperrt das Tor-Skript neue Läufe dieses Anbieters im Fenster, mit Vorlauf (≈ 30 min, weil ein Lauf weit über
   seinen Start hinaus verbraucht). Laufende Worker nicht abbrechen. `-e` liefert das Fensterende, `-v` nennt die
   Sperre. In der Endspurt-Rampe gilt keine Hochlast-Sperre, weil der Rest sonst verfällt. Schalter per env: aus,
   Zeitzone als POSIX-TZ (z. B. `CST-8`), Vorlauf in Minuten. Testfälle mit fester Uhrzeit (`<PREFIX>_NOW`): im
   Fenster, im Vorlauf, knapp vor dem Vorlauf, Fensterende, Wochenende, Schalter aus, anderer Anbieter unberührt,
   Rampe ohne Sperre. Die älteren Tests mit Schalter aus fahren, sonst hängen sie von der Uhrzeit ab.
4. Die neuen Regeln in die Start-Datei der Spur schreiben, der laufenden Spur per Prompt mitteilen und mit den
   Messwerten ins Entscheidungs-Log eintragen. Beim nächsten Wecken prüfen, ob die Spur sie anwendet, weil laufende
   Spuren auf Muster aus ihrem eigenen Verlauf zurückfallen. Gilt die Regel bei jedem Start (z. B. Modellgrenzen,
   feste Plätze für lange Ketten), zusätzlich eine Regelwache als `bg_run` ohne Auto-Wecken starten
   (`triggerOnCompletion: false`, `surviveReload: true`):
   - Sie liest alle 2 min die Queue und bewertet nur neu gestartete Läufe (runIds gegen die bisher gesehene Menge).
     So zählen Läufe, die vor der Regel gestartet wurden, nicht als Verstoß.
   - Für Ausnahmen fragt sie das Tor des anderen Anbieters ab (z. B. `quota.sh <anbieter>` Exit ≠ 0 → höhere Grenze).
   - Beim ersten Verstoß stößt sie die Spur mit Regel und Zahlen an, beim zweiten weckt sie den Leitstand per Prompt
     und endet mit Exit ≠ 0. Sie endet auch bei DONE der Spur oder nach einer Frist bis zum nächsten eigenen Wecken.
   - Vorher mit Test-Queue, DRY-Schalter (Prompt nur ins Log), Schlaf 1 s und per env erzwungenem Torzustand testen:
     erlaubter Wechsel, erster Verstoß, kein neuer Lauf, zweiter Verstoß, Ausnahme bei gesperrtem Tor, DONE.
   Grund: Der Leitstand schläft zwischen seinen Kontrollen, ein Rückfall fiele erst Stunden später auf; ein
   Weckruf je Prüfung kostet dagegen jedes Mal seinen ganzen Kontext.

## 8. Konto, das auch die Anwendung des Nutzers bedient
Bedient dasselbe Abo die KI der Anwendung, die der Nutzer gerade testet (z. B. die App-KI auf dem Testcluster),
verbrauchen Worker und Messskripte SEIN Kontingent mit.
1. Worker dieses Anbieters deckeln (höchstens 2 parallel, nach einem frischen Reset besser einer) und KI-Messskripten
   ein Aufrufbudget mit Abbruch bei 429 geben. Grund: Mehrere Worker plus Live-Proben leeren ein Kurzzeit-Fenster
   (5 h) in wenigen Stunden; dann meldet die Anwendung dem Nutzer „ausgelastet“, obwohl sein Test nichts damit zu tun
   hat. Zählt dazu, dass die Benchmarks der Worker selbst die Anwendungs-KI rufen: Worker, die messen, laufen besser
   auf dem anderen Konto (Nutzerfreigabe: bei vollem z.ai Anthropic-Modelle für Worker nutzen), damit nur die
   Messaufrufe das geteilte Konto belasten.
2. Bei 429 die Meldung ganz lesen: Fenster (5 h, Woche, Monat) und Reset-Zeit stehen im Text, oft in der Zeitzone des
   Anbieters (z. B. UTC+8) → in Ortszeit umrechnen, Wecker auf Reset + wenige Minuten stellen. Ein Worker in
   `[retry]`-Schleifen gegen 429 verbraucht nur Zeit: abbrechen und nach dem Reset per `resumeFrom` fortsetzen.
3. Den Nutzer sofort informieren, dass die Anwendungs-KI bis zur genannten Uhrzeit nicht antwortet. Laufende Worker,
   deren Arbeit nicht warten kann, auf ein anderes Konto umsetzen (`resumeFrom` mit Ausweich-Modell, Brief ohne
   Messung, PR mit Vermerk „Messung folgt“). Arbeit, die das Anwendungsmodell selbst messen muss, bis zum Reset parken
   und den Fortsetzer per Wecker zum Reset planen. Messungen nicht auf ein anderes Modell ausweichen lassen: Die
   Vorher-/Nachher-Zahlen sollen das Modell zeigen, das der Kunde nutzt, und mit früheren Messungen vergleichbar
   bleiben; ein Abo-Login des Agenten ist zudem kein API-Schlüssel für die Anwendung.
4. Stirbt ein Worker am Limit und ist nur noch der Abschluss offen (Restdatei der App-Kopie nachziehen, Doku,
   Commit, Vorpush, PR), diesen Abschluss als Orchestrator selbst erledigen, statt Stunden auf den Reset zu warten.
   Vorher `git status`/`git diff` lesen und die Worker-Aussagen am Diff prüfen. Grund: Der Abschluss ist eine kleine
   Integrationsarbeit; das Warten blockiert sonst die nachfolgende Freigabe. Ist mehr als der Abschluss offen, den
   Baumstand als Zwischenstand-Commit sichern, die Basis einmergen und den Worker mit `resumeFrom` auf dem anderen
   Konto fortsetzen.

## 9. Reichweite in Worker-Stunden (Anbieter vergleichen, Grenze anheben lassen)
Prozentwerte zweier Konten sind nicht gleich viel wert (gemessen z. B. 1 % ≈ 1–1,5 Worker-Stunden am einen,
≈ ¼ Worker-Stunde am anderen Konto). Für Prognosen, für „reicht das Kontingent?“ und für die Frage, welcher Anbieter
mehr verbraucht, darum in Worker-Stunden rechnen:
1. Ablesungen sammeln: Jede `quota.sh -v`-Zeile mit Uhrzeit (`date`) in STAND.md oder das Journal schreiben; der
   Reset-Zeitpunkt zählt als Ablesung mit 0 %. Grund: Die Usage-JSON hat keine Historie, ohne notierte Ablesungen
   fehlt die Rechengrundlage.
2. Verbrauch je Worker-Stunde: Zwischen zwei Ablesungen die Worker-Stunden je Anbieter zählen (laufende Worker ×
   Stunden, genauer aus Start und Ende der Läufe im Journal, Modell aus der Queue-Zeile). Punkte je Worker-Stunde =
   Δ% ÷ Worker-Stunden, getrennt für Woche und Kurzfenster. Der Kontowert enthält Leitstand und andere Sitzungen
   desselben Kontos; darum als Spanne angeben (ganzer Anstieg / Anstieg ohne geschätzten Leitstand-Anteil).
3. Restbedarf: offene Einheiten × Worker-Minuten je Einheit plus die Folgeschritte der Phase. Minuten und Prozent je
   Einheit getrennt je Modell aus den letzten Abschlüssen nehmen. Grund: Ein langsameres Modell braucht je Einheit
   leicht doppelt so lange und kann je Einheit mehr Prozent seines Kontos kosten, als seine Laufzeit vermuten lässt.
4. Kapazität bis zur Sperre je Anbieter = (Grenze − Ist) ÷ Punkte je Worker-Stunde. Beim Anbieter mit kleinem
   Kurzfenster zusätzlich die nutzbaren Fenster bis zur Wochengrenze zählen (Fenster-Enden, Hochlast-Sperre §7
   Punkt 3) und den kleineren Wert nehmen. Daraus Sperrzeitpunkt je Anbieter und Pausenbeginn (alle gesperrt)
   ableiten und in die Übersicht schreiben. Abschnittsweise rechnen: bis zum nächsten Umschlagen eines Kurzfensters
   mit der laufenden Modellverteilung, danach mit der Verteilung, die die Ausweichregel dann vorgibt (volles
   Kurzfenster → der andere Anbieter trägt mehr Plätze); den Verbrauch des Leitstands auf seinem Konto je Stunde
   dazurechnen. Nach jeder neuen Ablesung die Prognose prüfen; liegt sie daneben, Übersicht und Meldung sofort
   korrigieren und dem Nutzer den Grund nennen. Grund: Eine Prognose mit fester Modellverteilung unterschätzt den
   teuren Anbieter, sobald das Kurzfenster des billigen voll ist.
5. Reicht die Kapazität nicht bis zum Phasenende oder einer sinnvollen Bruchstelle, den Nutzer früh fragen, nicht
   erst beim Sperren: eine konkrete Grenze vorschlagen (z. B. Wochen-Tor 75 statt 55) und die Rechnung in einem Satz
   nennen (Bedarf, Kapazität mit alter und neuer Grenze, Pausenzeitraum ohne Erhöhung). Grund: Die Wochenreserve
   gehört dem Nutzer, und ohne Zahlen kann er nicht abwägen. Seine Freigabe als Ausnahme bis zum Wochenwechsel
   eintragen (§2), mit `quota.sh -v` prüfen und im Entscheidungs-Log vermerken; die Endspurt-Rampe beginnt dann beim
   neuen Wert. Bleibt eine Pause absehbar, zusagen, dass ich mich vor ihrem Beginn melde, und sicherstellen, dass
   mich vorher etwas weckt (Ende der Aufsicht, Termin per Timer nach §6 Punkt 5).
6. Tempo gegen Verbrauch abwägen: Die Menge bis zur Sperre hängt nicht vom Tempo ab, wohl aber, welcher Anbieter die
   Arbeit trägt. Verfällt der Rest des billigen Anbieters mit jedem Kurzfenster und reicht seine Wochenreserve noch
   für weitere Fenster, die Parallelität am teuren Anbieter nicht erhöhen: Jede zusätzliche Laufstunde lässt ein
   weiteres Fenster des billigen Anbieters mitarbeiten und schont die Reserve des teuren. Erhöhen erst, wenn die
   Reserve des billigen Anbieters bis zum voraussichtlichen Ende verplant ist oder ein fester Termin drängt.
7. Fragt der Nutzer, welcher Anbieter mehr verbraucht: zuerst die Prozente nennen, dann in Worker-Stunden je Prozent
   übersetzen und die Unterschiede nennen, die den Vergleich verzerren (Wochenbeginn, Größe des Kurzfensters,
   Leitstand auf demselben Konto).
8. Prognosen nur aus diesen Messwerten schreiben und die Grundlage (Zeitraum, Worker-Zahl, Δ%) in STAND.md
   festhalten. Eine geschätzte Aussage in Übersicht oder Meldung, die sich so nicht belegen lässt, sofort ersetzen.
   Grund: Der Nutzer entscheidet über Grenzen und Pausen nach diesen Zahlen.

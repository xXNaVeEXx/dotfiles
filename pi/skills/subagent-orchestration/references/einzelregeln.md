# Einzelregeln (aus SKILL.md ausgelagert)

## Folgearbeit aus einem automatischen Lernpass (Review-Turn)
Dort nicht erledigen, weil der Pass keine neue Arbeit beginnen darf. Stattdessen eine Selbst-Erinnerung stellen:
`systemd-run --user -q --unit <name> --on-active=3min --setenv HOME=$HOME --setenv PATH=/usr/local/bin:/usr/bin:/bin:$HOME/.nix-profile/bin --setenv DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/$(id -u)/bus /bin/bash <steuerordner>/erinnerung.sh <eigenes-pane> "<was zu tun ist>"`.
`erinnerung.sh` tippt den Text mit `herdr pane send-text <pane> "<text>"` ein, wartet 1 s und schickt `herdr pane send-keys <pane> enter`.
Grund: Danach liegt die Sitzung idle, und bis zum nächsten Aufsichts-Ereignis oder Watchdog-Anstoß vergehen oft Stunden.
HOME, PATH und DBUS gehören ausdrücklich in die Unit, weil transiente User-Units die Umgebung der Sitzung nicht erben.

## Teilergebnis früh als PR anbieten, während ein Worker im Spur-Worktree weiterarbeitet
Den Vorpush NIE im Worktree mit laufendem Worker fahren (Turbo/Jest laufen über den Arbeitsbaum und messen halbfertige Dateien).
Stattdessen `git worktree add -b <pr-branch> ../<spur>pr <commit>` (sauberer Stand genau der PR-Commits), `.env.local` kopieren,
`nix develop … pnpm install --frozen-lockfile --prefer-offline`, dann `mt-vorpush` (voll) + Encoding-Prüfung + `npm run pr:titel`
als ein bg_run, anschließend Push, `gh pr create --body-file` und CI-Wache von dort. Der Worker arbeitet auf seinem Branch weiter
und zieht den Merge des PR später per Merge/Rebase nach. Grund: Die Prüfung gilt dem exakten PR-Stand, und die Worker-Plätze bleiben belegt.

## Worker in einem frisch angelegten Worktree starten
Den Worker (`acp_delegate` mit `cwd` = Paket-Worktree) erst aufrufen, wenn das Anlegen des Worktrees zurück ist, also in einem
eigenen Tool-Block. Grund: Im selben parallelen Block läuft der Start, bevor der Ordner existiert. Er scheitert sofort mit
„spawn …/node ENOENT“, weil Node einen fehlenden `cwd` wie ein fehlendes Programm meldet; das sieht nach kaputtem Node aus.
Gibt ein Skript die Startschritte aus (Worktree anlegen, dann Worker starten), schreibt es diese Reihenfolge in die Ausgabe
und in die Spur-Anleitung.

## Spur meldet „Worker-Werkzeug fehlt“ und startet nichts
Spuren sind angewiesen, nicht still auf einen anderen Startweg auszuweichen. Fehlt ihr Standard-Startwerkzeug (z. B. nach einem
pi-Update), halten sie korrekt an und warten auf eine Entscheidung, die ohne Leitstand nie kommt. Als Leitstand zuerst prüfen, ob
eine andere Spur schon einen funktionierenden Ersatzweg nutzt (Journal nach `subagent`/`Fallback` durchsuchen, Werkzeugzählung in
ihrer Sitzungs-JSONL per jq). Dann der wartenden Spur genau diesen Weg ausdrücklich freigeben, per `spur.sh prompt`, mit dem
vollständigen Aufruf: `subagents_enable`, dann `subagent({agent:"worker", async:true, cwd, model, options:{timeoutMs}, task})`.
Danach muss die Spur die runId in die Queue eintragen (`läuft <runId> <modell>`), weil die globale Platzzählung nur Queue-Zeilen sieht.
Hinweise in die Freigabe schreiben: Der Herzschlag (`warte.sh`) erkennt Ersatz-Läufe nicht als fertig. Die Fertigmeldung kommt
als Benachrichtigung des Ersatzwerkzeugs, und der Herzschlag dient nur noch als Takt. Die Freigabe in ENTSCHEIDUNGEN protokollieren.
`timeoutMs` = Brief-Timeout in Minuten × 60000 setzen (ohne den Wert greift ein kurzes Standardlimit).

## Globale Worker-Obergrenze bei jedem Leitstand-Wecken gegenprüfen
Die Platzzählung liest die Queue-Spalte „Status“ per Muster. Spuren schreiben dort Freitext („nacharbeit läuft <runId> sonnet“,
„review läuft <runId> opus (abnahme OK, …)“ für Prüfer-Worker). Ein Muster, das ein Schlüsselwort am Zellenanfang verlangt, zählt
solche Zeilen nicht, und eine Spur startet einen Worker über die Grenze. Darum zählt das Muster jede Zelle, die irgendwo
`läuft|nacharbeit` UND eine Lauf-Kennung (8 Hex-Zeichen) UND einen Modellnamen enthält, z. B.
`\|[^|]*\b(läuft|nacharbeit)\b[^|]*\b[0-9a-f]{8}\b[^|]*\b(sonnet|opus)\b[^|]*\|\s*$`. Die Lauf-Kennung ist Pflicht, weil
Zustandsnotizen wie „nacharbeit nötig (Review opus teilweise)“ oder „endlauf läuft (HEAD <sha>)“ sonst fälschlich zählen.
Das Muster mit positiven und negativen Beispielzeilen und dem Selbsttest prüfen und danach die Live-Zählung gegen die echten Läufe halten.
Bei jedem Wecken die tatsächlich laufenden Worker gegen die Grenze halten, und zwar aus dem Lauf-Register statt aus der Queue:
`jq -r 'select(.state=="running") | (.steps[0].model // .model) + " " + .cwd' /tmp/pi-subagents-uid-*/async-subagent-runs/*/status.json`
listet jeden laufenden Ersatz-Worker mit Modell und Worktree (Aktivität = mtime `output-0.log`); für `acp_delegate` die `.out`/`.activity`
je Queue-Zeile. Grund: Eine Status-Zelle kann eine fremde 8-Hex-Kennung tragen (Commit-SHA des fertigen Workers statt runId des Prüfers)
oder das Modell vor der Kennung nennen; das Muster zählt sie dann nicht, nur das Register zeigt den Lauf. Jeden laufenden Lauf ohne passende
Queue-Zeile über den `cwd` dem Paket zuordnen und dessen Zelle berichtigen.
Häufigste Ursache einer Überschreitung: Die Spur startet zwei Läufe im selben Turn (z. B. Nacharbeit und Review), zählt aber nur einmal davor.
In Spur-Anleitung und Hinweis darum festhalten: vor jedem einzelnen Start neu zählen (`wpq.py next`), nie zwei Starts ohne Zählung dazwischen.
Bei Abweichung die Queue-Zeile per `wpq.py status <WP> "<kanonisch>"` berichtigen,
das Muster nachziehen und die Spur auf das Kopfzeilen-Format hinweisen. Laufende Worker über der Grenze nicht abbrechen, wenn RAM/Swap
reichen (`free -m`), weil sonst Stunden Arbeit verloren gehen. Der nächste Start wartet dann von selbst, bis die Zählung wieder unter der Grenze liegt.

## Fortschrittszahlen in Bericht und Statusseite nur aus der Live-Zählung übernehmen
Die Zahl „fertig X von Y“ je Spur bei jedem Wecken aus der Queue zählen (`grep -c '| fertig' QUEUE.md` gegen `grep -c '^| LC-WP'`) und genau
diese Zahl in Statusseiten-Kopf, STAND und Nutzerbericht schreiben. Nie die letzte gemeldete Zahl um gerade gesehene Integrationen erhöhen:
Journalzeilen „integriert“ sind in der Zählung meist schon enthalten, das Hochzählen im Kopf meldet dann ein Paket zu viel. Ist eine frühere
Meldung falsch gewesen, sie im nächsten Bericht ausdrücklich berichtigen und in STAND vermerken. Grund: Der Nutzer liest die Zahlen als
Fortschrittsmaß, und eine stille Korrektur nach unten sieht wie verlorene Arbeit aus.

## Build-Rechner fällt mitten im Lauf aus (Integration rot mit „server … not responding“/Timeout)
Ein roter Prüf- oder Integrationsschritt mit Verbindungsfehler ist kein Paketfehler. Zuerst den Host prüfen:
`tailscale status | grep <host>` (zeigt „offline, last seen Nm ago“, also den Ausfallzeitpunkt) und `timeout 15 ssh -o BatchMode=yes
-o ConnectTimeout=8 <host> uptime`. Dann im Build-Wrapper nachsehen, ob er schon auf einen Ersatz-Host ausweicht (Erreichbarkeitsprobe vor
der Host-Wahl); laufende Neuversuche der Spur nicht abbrechen. Ist der Ersatz-Host der eigene Rechner, Last und RAM/Swap im Blick
behalten (`uptime`, `free -m`), weil dort auch Sitzungen und Worker laufen. Den Ausfall dem Nutzer als einzigen Handgriff melden
(Host einschalten/ins Netz bringen) und in die Nutzer-Liste und den Kopf der Statusseite schreiben. Grund: Ein ausgeschalteter oder
schlafender Rechner lässt sich aus der Ferne nicht reparieren, und ohne Meldung bleibt die Bauzeit unbemerkt langsamer.

## Rückfrage eines Ersatz-Workers (`subagent`) beantworten
Der Worker fragt über `contact_supervisor`; die Leitstand- oder Spur-Sitzung sieht eine Benachrichtigung „subagent_supervisor_request“ mit `replyTo`-ID.
Der Worker wartet nur wenige Sekunden und arbeitet dann mit seinem angekündigten Ersatzweg weiter; die Frage gilt danach als „withdrawn“.
Schon der erste Tool-Block der Leitstand-Sitzung kommt in der Regel zu spät. Darum gleich `steer` als eigentlichen Antwortweg einplanen:
(1) im ersten Block die `vorgaben/<WP>.pfade` lesen bzw. anlegen (`[ -f f ] && cat f || printf … > f`, nie doppelt anhängen, weil oft die
Spur dieselbe Freigabe schon eingetragen hat), ENTSCHEIDUNGEN-Zeile schreiben und parallel `subagent_supervisor({action:"reply", replyTo, message})` versuchen;
(2) meldet die Antwort „withdrawn by the child“, sofort `subagent({action:"steer", id:<runId>, message, options:{index:0}})` mit derselben
Entscheidung senden. Ist in der Leitstand-Sitzung `subagent` noch nicht aktiv, zuerst `subagents_enable` (Werkzeug erst im nächsten Turn nutzbar).
Grund: Eine Entscheidung, die der Worker nie sieht, führt zu zwei verschiedenen Annahmen im selben Baum.
Danach die Spur des Workers per `spur.sh prompt` informieren, falls sie die Freigabe nicht selbst schon angelegt hat, damit sie nicht doppelt entscheidet.
Meldet `steer` „child completed before consuming steering“, ist der Worker fertig: seine Abschlussmeldung lesen, nicht erneut steuern.

## Abnahme: gespeicherten Endlauf gegen HEAD und Fix-Commits halten
`wpq.py wait check <WP>` zeigt das zuletzt gespeicherte Ergebnis, auch wenn danach noch Fix-Commits kamen (z. B. clippy-Korrekturen nach einem
roten ersten Lauf). Vor „grün“ oder „rot“ `WPQ_HEAD` mit `git rev-parse --short HEAD` im Worktree vergleichen; weicht es ab, den Endlauf neu
als bg_run fahren, statt Nacharbeit zu verlangen oder den alten Lauf zu glauben. Bei Worker-Meldungen „nextest lief vor den letzten Commits“
hängt die Entscheidung am neuen Endlauf, nicht am Bericht.

## Reviewer-Subagent liefert „Nichts gespeichert“ statt Befunden
Startet die Spur einen Reviewer (`subagent`, Agent `reviewer`) kurz nach einem automatischen Lernpass, übernimmt er dessen Anweisungen aus dem
geerbten Verlauf und antwortet mit „nichts zu speichern“. Ein einfaches „Das ist ein Code-Review“ im Task und `context:"fresh"` haben das
nicht verhindert. Ergebnis ist leer, also nie als „keine Mängel“ lesen. Abhilfe: nach dem ersten Leerlauf nicht wiederholen, sondern die
Stichprobe selbst machen (Diff-Statistik, Katalog-ID → Test, `grep` je neue öffentliche Funktion auf Aufrufer außerhalb der Gruppe, Werkzeug-Diff lesen)
und das im Journal als Eigenprüfung vermerken; den Reviewer erst beim nächsten Paket in einem Turn ohne Lernpass davor starten.
Nicht verdrahtete Bausteine (kein Aufrufer außerhalb von Modul und Tests) gehören mit Konsument in den Schlussbericht.

## Exklusive Paket-Pfade werden nie gebaut (Modul-Scan scheitert an Namensform, eine handgeschriebene Sammeldatei fehlt, ein erzeugtes Sammelartefakt muss neu, oder die eigene Crate braucht Abhängigkeiten)
Vier Formen derselben Plan-Lücke: (a) ein gemeinsames Werkzeug (Modul-Scan) lehnt die Namensform neuer Ordner ab, (b) ein Bereich hat gar
keinen Scan, sondern eine von Hand gepflegte Sammeldatei (`mod.rs` mit Befehls-Enum), die nicht zu den exklusiven Pfaden des Pakets gehört,
(c) ein aus Fragmenten erzeugtes Sammelartefakt (z. B. Handbuch-HTML) muss neu erzeugt werden, weil Drift-Tests sonst rot sind,
(d) das Paket braucht neue Abhängigkeiten in der `Cargo.toml` seiner eigenen Crate, die Abnahme-Klassifizierung kennt aber nur die Quellpfade.
(a) Die Werkzeug-Erweiterung klein und rückwärtskompatibel halten (Namen abbilden, echten Pfad behalten), statt Pfade der Pakete umzubenennen,
weil Abnahme-Tests und Exklusiv-Pfade so gültig bleiben. (b) Den Anschluss genau wie bei der ersten gleichartigen Freigabe erlauben: nur
Modul-Zeile, Enum-Varianten mit Doku und `run`-Zeilen, neue Zwischen-`mod.rs` so, dass Folgepakete nur Zeilen anhängen. (c) Nur über den
Generator erzeugen, nie von Hand, eigener Commit; bei Konflikten beim Einbauen neu erzeugen statt Hunks zu mischen. (d) Freigeben, wenn die
Projektregeln Abhängigkeiten in der eigenen Crate erlauben; `Cargo.toml` fremder Crates und die Workspace-`Cargo.toml` bleiben Rückfragen,
weil dort parallele Pakete kollidieren.
Ablauf: (1) Zusatzfreigabe als `vorgaben/<WP>.pfade` (Kommentarzeile mit Grund und Präzedenz), (2) Worker mit eigenem Commit für den
Anschluss und Testfall beauftragen und im Bericht als Abweichung vermerken lassen, (3) Entscheidung in ENTSCHEIDUNGEN, (4) Folgepakete derselben
Gruppe nacheinander starten (nicht parallel), jeweils mit gleichartiger Freigabe, Änderungen an der Sammeldatei nur additiv.
Kehrt dieselbe Freigabe bei jedem Paket wieder (typisch bei (c) und (d)), sie der Spur schon bei der ersten Rückfrage als stehende Regel geben:
Die Spur legt die `.pfade` beim Start des Pakets an und schreibt sie in den Brief. Grund: Sonst scheitert jedes Folgepaket an derselben Hürde,
jede Rückfrage kostet einen Turn, und parallele Pakete erzeugen an derselben Sammeldatei Merge-Konflikte.

## Faire Vergabe knapper Worker-Plätze über mehrere Spuren
Teilen sich Spuren eine globale Obergrenze (z. B. höchstens 2 Claude-Worker), belegt sonst die Spur, die zuerst `next` fragt,
jeden frei werdenden Platz. Die andere Spur verhungert, weil ihr Herzschlag bis zu einer Stunde schläft. Die Regel gehört ins
Queue-Werkzeug (`next`): Hat die fragende Spur schon einen Worker, und wartet eine Spur derselben Welle ohne laufenden Worker und
ohne PAUSE mit startbarem Paket, gibt die fragende Spur den Platz ab. „Wartet“ heißt dabei: Ihr Herzschlag lebt (`pgrep -f "warte.sh <spur>"`).
Die wartende Spur wird per `spur.sh prompt` geweckt, mit einem Zeitstempel-Lock höchstens alle 10 Minuten. In der Attrappen-Testreihe
die Lebend-Prüfung per Umgebungsvariable steuern (z. B. `WPQ_LEBT=W1-C`, aktiv nur im Testmodus) und das Wecken abschalten
(`WPQ_NO_WECK=1`). Grund: Sonst sieht der Sandkasten die echten Herzschläge des Rechners, und alte Tests werden zufällig rot.

## Spur meldet einen kleinen Rest „offen für Leitstand“ (z. B. fehlender Anschluss in einer gesperrten Sammeldatei)
Aufsichtsberichte und das PLAN-Log bei jedem Wecken nach „offen für L0“/„offen für Leitstand“ durchsuchen. Den Rest nicht selbst
einbauen (der Leitstand baut nicht) und nicht liegen lassen. Die Spur bekommt ihn per `spur.sh prompt` als kleinen Integrationsfix zurück,
ohne eigenen Worker. In die Nachricht gehören: die genauen Zeilen, die Reihenfolge zu laufenden Integrationen (nach dem gerade laufenden
Einbau und vor dem nächsten Paket, das dieselbe Datei berührt), die Prüfung über den Build-Wrapper (check + betroffene Tests), ein eigener
Commit mit Paket-ID, Push und der Verweis auf die frühere gleichartige Freigabe. Die Entscheidung kommt in ENTSCHEIDUNGEN. Beim nächsten
Wecken im Spur-Journal prüfen, ob der Commit auf dem Integrationszweig liegt. Grund: Solche Reste gehen in Berichten sonst unter, bis ein
späteres Paket an der fehlenden Verdrahtung scheitert.

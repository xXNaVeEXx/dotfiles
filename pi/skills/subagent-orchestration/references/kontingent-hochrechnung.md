# Kontingent hochrechnen, Pause fahren, nach dem Wochenwechsel wieder anlaufen (Leitstand)

Die Kontingent-Wache meldet erst, wenn die Wochengrenze erreicht ist. Dann stehen die Spuren schon, oft für Tage, und der Nutzer
hätte Stunden vorher entscheiden können. Darum bei jedem Leitstand-Wecken hochrechnen.

## Ablauf Hochrechnung
1. Bei jedem Wecken einen Messpunkt in die Stand-Datei schreiben: Uhrzeit, Wochenwert in Prozent, Summe der fertigen Pakete aller Spuren
   (Live-Zählung aus der Queue). Den Messpunkt als eigene, wiedererkennbare Angabe schreiben („Messpunkt: N Pakete fertig, X %“),
   damit die nächste Runde ihn ohne Nachrechnen findet.
2. Die Raten immer über die längste verfügbare Strecke bilden: vom ersten Messpunkt der Woche (oder seit dem letzten Wochenwechsel
   bzw. Ende einer Pause) bis jetzt, nicht aus dem letzten Abstand allein. Zwei Raten: Prozentpunkte je Stunde und Prozentpunkte je
   fertigem Paket. Grund: Der Verbrauch je Stunde schwankt stark mit der Tageszeit und der Phase (nachts oft weniger als die Hälfte,
   weil mehr eingebaut als gebaut wird); eine Rechnung aus wenigen Stunden verschiebt den Zeitpunkt um einen halben Tag.
3. Die Rücksetzzeit nicht annehmen, sondern aus der Limits-Datei des Anbieters lesen (`resetsAt`, UTC in Ortszeit umrechnen).
4. Drei Zahlen ableiten:
   - Pakete bis zur Grenze: (Grenze − aktueller Wert) ÷ Punkte je Paket. Das ist die verlässlichste Zahl, weil die Rate je Paket
     über Tag und Nacht fast gleich bleibt.
   - Zeitpunkt, an dem die Grenze erreicht wird: (Grenze − aktueller Wert) ÷ Punkte je Stunde. Als Spanne von ein bis zwei Stunden nennen,
     nie als feste Uhrzeit.
   - Endstand, wenn der Rest der Welle durchläuft: aktueller Wert + offene Pakete × Punkte je Paket.
5. Liegt der Zeitpunkt deutlich vor dem Wochenwechsel (mehr als etwa ein Tag Pause), dem Nutzer sofort als Entscheidung vorlegen,
   in einfachen Worten und mit Zahlen:
   - Grenze lassen: Pause ab wann bis wann, wie viele Pakete bleiben liegen.
   - Grenze anheben, damit die Welle fertig wird: als Zahl den errechneten Endstand plus etwa fünf Punkte Puffer nennen, auf volle fünf
     gerundet, und dazu, wie viel ihm für eigene Arbeit bleibt. Nie den Endstand selbst als Grenze anbieten: Er ist eine Schätzung,
     und eine Grenze genau darauf hält die Spuren kurz vor dem Ziel an.
   - Eigene Zahl.
   Dazu sagen, was ohne Antwort gilt (die bestehende Grenze).
6. Die Frage zusätzlich in die Nutzer-Liste (Datei für offene Nutzerpunkte) und in den Kopf der Statusseite schreiben, mit Datum.
7. Die Grenze nie selbst ändern. Sie ist eine Vorgabe des Nutzers über sein eigenes Kontingent.
8. Bei jedem weiteren Wecken die Hochrechnung mit dem neuen Messpunkt nachziehen – alle drei Zahlen und damit auch die angebotene
   Anhebung. Verschiebt sich der Zeitpunkt um mehr als ein paar Stunden oder reicht die zuvor angebotene Grenze nicht mehr für den
   Rest, die alte Angabe im Bericht ausdrücklich berichtigen („vorher gerechnet: …, jetzt nötig: …“) und den Eintrag in der Nutzer-Liste
   um einen Nachtrag ergänzen, statt einen zweiten Eintrag anzulegen. Grund: Antwortet der Nutzer später auf eine alte Meldung mit der
   alten Zahl, bleibt die Welle trotz Zustimmung unfertig. Solange die Antwort aussteht, die offene Frage in jedem Bericht in einem
   Satz wiederholen (mit der aktuellen Zahl und dem Standard ohne Antwort), weil der Nutzer meist nur den letzten Bericht liest.
9. Nennt der Nutzer später eine Grenze, die nach der aktuellen Rechnung nicht für den Rest reicht, sie umsetzen und im selben Bericht
   sagen, wie viele Pakete damit voraussichtlich liegen bleiben.
10. Sofort neu rechnen, wenn der Leitstand selbst zusätzliche Läufe anordnet (Prüfpflicht wieder eingeführt, Nachprüfung, Nacharbeit
    mit starkem Modell): Jeder solche Lauf zählt wie ein eigenes Paket. Grund: Die Rate je Paket stammt aus der Zeit ohne diese Läufe;
    die Grenze kommt dann Stunden früher als angesagt.

## Grenze rückt näher: rechtzeitig auf den freien Anbieter umstellen
Zeigt die Hochrechnung, dass die Grenze in wenigen Stunden erreicht ist (Faustwert: früher, als ein großes Paket samt Prüfung und
Nacharbeit dauert), nicht auf die Wache warten. Das gilt genauso kurz nach einer Anhebung durch den Nutzer: Der neue Abstand ist oft
in einem halben Tag aufgebraucht.
1. Vor dem Senden prüfen, ob diese Runde die Anweisung schon geschickt hat: letzte Zeile der Stand-Datei und die jüngsten
   Quittungen in den Journalen der Spuren lesen. Grund: Nach einer Kontextverdichtung mitten in der Runde fehlt die Erinnerung an die
   eigenen Schritte, und eine zweite gleiche Anweisung erzeugt doppelte Quittungen und Rückfragen. Dasselbe gilt für Übersicht,
   Nutzer-Liste und Statusseite: erst lesen, dann nur das Fehlende nachziehen.
2. Jede Spur anweisen: keine neuen Pakete mit dem knappen Anbieter (die wartenden beim Namen nennen), neue Pakete nur mit dem freien
   Anbieter; der knappe nur noch für Pflicht-Prüfer (mit dem günstigeren Modell, wo der Auftrag das starke nicht verlangt) und für
   Laufendes. Quittung im Journal verlangen. Grund: Ein mitten im Lauf pausierter Worker kostet beim Fortsetzen erneut den vollen Kontext.
3. In der Queue zählen, wie viele Pakete der freie Anbieter laut Modell-Spalte überhaupt bauen darf, und dessen eigenen Wochenwert
   gegen seine Grenze halten. Beides im Bericht nennen, damit klar ist, wie lange die Umstellung trägt.
4. Neuen Eintrag in die Nutzer-Liste: aktueller Wert, Spanne bis zur Grenze, bisheriger Fortschritt, und was der Nutzer tun kann
   (Kontingent zurücksetzen und Bescheid sagen, Grenze ändern, nichts tun = Pause bis zum Wochenwechsel).
5. In der Übersicht den ganzen Kontingent-Absatz neu schreiben, nicht nur die Kopfzeile: Verlaufswerte von heute, geltende Grenze je
   Anbieter, was bei Erreichen passiert. Grund: Die Kopfzeile wird jede Runde erneuert, die Absätze darunter veralten unbemerkt um
   Tage (alte Grenze, alte Vorhersage, altes Modell), und der Nutzer liest auf einer Seite widersprüchliche Zahlen.
6. Im Bericht die Bitte wiederholen, beim Zurücksetzen Bescheid zu sagen, und sagen, was ohne Zurücksetzen geschieht.

## Grenze erreicht: Pause fahren
1. Die Wache nennt Wert, Tor und Pausenende. Antwortet der Nutzer bis dahin nicht, gilt der angekündigte Standard – keine weitere Rückfrage.
   Das Pausenende der Wache gegen die Aussage des Tor-Skripts halten („frei ab …“): Ist die Endspurt-Rampe abgeschaltet (Rampen-Höchstwert
   = Wochengrenze), gilt die Rücksetzzeit und nicht „Rücksetzzeit minus Rampenfenster“. Grund: Sonst wachen die Spuren Stunden zu früh
   vor einem noch geschlossenen Tor auf.
2. Pause mit dem einen Pausen-Befehl des Projekts setzen (Pausen-Datei je Spur, Leitstand-Weckabstand auf einen Tag, Timer für das Ende).
3. Jede Spur schriftlich anweisen, mit vier Punkten: keine neuen Starts (auch keine Prüfer und keine Nacharbeit); der laufende Worker
   läuft zu Ende und wird noch abgenommen, eingebaut und gepusht; braucht der Endlauf einen neuen Worker, liegen lassen und in der
   Queue vermerken; danach genau ein langer Herzschlag bis zum Pausenende. Eine Quittung im Journal mit der Reihenfolge nach der Pause
   verlangen. Grund für das Fertigbauen: Ein halbfertiger Worktree über mehrere Tage veraltet gegen den Integrationszweig, und der
   wenige Rest kostet kaum Kontingent.
4. Arbeiten die Spuren mit zwei Anbietern und ist nur einer an der Grenze, prüfen, ob der andere allein weiterarbeiten kann: Laufen die
   Spur-Sitzungen selbst auf dem gesperrten Anbieter, oder braucht jedes Paket des freien Anbieters eine Prüfung durch den gesperrten,
   ruht der freie mit. Das dem Nutzer mit Grund sagen und die Umstellung („freier Anbieter baut und trägt die Spur-Sitzungen, der
   gesperrte prüft später in Schüben“) als Möglichkeit anbieten, aber nicht selbst einschalten.
5. Die alten Aufsichten enden durch die Pause von selbst oder werden beendet; mit dem langen Pausen-Takt neu starten. Diese
   Endmeldungen (auch „killed“ für selbst beendete Aufgaben) sind erwartet: dem Nutzer je Meldung höchstens zwei Sätze schreiben,
   keine neue Runde fahren.
6. Übersicht, Nutzer-Liste, Stand-Datei und Statusseite auf „Pause von … bis …“ stellen; im Bericht sagen, was noch fertig wird,
   was sich verschiebt und dass eine höhere Grenze sofort weiterlaufen ließe.
7. Ist beim Überschreiten der Grenze nur noch der Abschluss offen (Gesamttest, Antrag, kleine Nacharbeit ohne neue Worker), die
   Pausen-Mechanik nicht einschalten: Sie hielte auch die Spur-Sitzungen an, die den Abschluss tragen. Stattdessen keine neuen
   Worker und Prüfer des betroffenen Anbieters starten, Nacharbeit von den bestehenden Spur-Sitzungen selbst erledigen lassen, die
   Entscheidung festhalten und dem Nutzer anbieten, alles bis zum Wochenwechsel ruhen zu lassen.

## Nutzer hebt die Grenze an, während die Pause läuft
Alles in einem Zug umstellen und erst danach berichten; die Pause hat mehrere Teile, und jeder vergessene hält eine Spur an.
1. Schwelle im Tor-Skript ändern (Wochengrenze und Rampen-Höchstwert auf den neuen Wert, Kommentar mit Datum und Vorgabe; Sicherung,
   `.new`, `bash -n`, `mv`). Prüfen, dass keine Umgebungsdatei den alten Wert überschreibt, und das Tor frisch fragen.
   Die Grenze anderer Anbieter bleibt, wenn der Nutzer nur einen genannt hat.
2. Pause vollständig abbauen: Pausen-Befehl „aus“, Pausen-Dateien je Spur löschen, den Ende-Timer stoppen. Grund: „aus“ stellt oft
   nur den Weckabstand zurück; liegengebliebene Pausen-Dateien halten die Platzvergabe an, und der Timer feuert Tage später ins Leere.
3. Jede Spur wecken, in einem Text: Pause aufgehoben, neue Grenze und aktueller Wert; frühere Einschränkungen, die nur wegen der
   nahenden Grenze galten, ausdrücklich aufheben (die Spur hält sie sonst weiter ein); langen Pausen-Herzschlag beenden, normalen
   starten; zuerst offene Prüfungen und Nacharbeiten, dann neue Pakete; Sparregel für die knappen Punkte (bauen mit dem freien
   Anbieter, der knappe prüft); Worker-Obergrenze unverändert; Quittung mit dem ersten Start.
4. Pausen-Aufsichten beenden, Aufsichten im Normaltakt und eine neue Kontingent-Wache auf die neue Grenze starten.
5. Entscheidung protokollieren, Messpunkt schreiben, Übersicht und Statusseite umstellen, die Frage in der Nutzer-Liste als erledigt
   kennzeichnen, Übergabe-Notiz um die neuen Hintergrundaufgaben ergänzen.
6. Nach etwa einer Minute die Quittungen lesen. Meldet eine Spur dabei einen eigenen Halt („offen für L0“, z. B. voller
   Zwischenspeicher), ihn sofort beheben und die Spur ausdrücklich freigeben: Sie wartet sonst trotz aufgehobener Pause.
7. Im Bericht: neue Grenze, aktueller Wert und Abstand, was gestartet ist, was noch ohne Quittung ist. Kündigt der Nutzer ein
   Zurücksetzen des Kontingents an, um Bescheid bitten, damit die Wache auf die neue Woche gestellt wird.
8. Ab dem Messpunkt des Wiederanlaufs neu hochrechnen und bei jedem Wecken nachziehen; rückt die neue Grenze näher, nach dem
   Abschnitt „Grenze rückt näher“ handeln.

## Pausenende: erst messen, dann wecken
- Ein Pausenende vor dem Wochenwechsel (z. B. Beginn einer Endspurt-Rampe, die das Tor anhebt) gilt nur, wenn das Kontingent dann
  wirklich unter dem Tor liegt. Der Nutzer verbraucht dasselbe Kontingent mit eigener Arbeit; steht die Woche am Pausenende bei 100 %,
  scheitert jede Anfrage von Leitstand und Spuren mit einer Drosselungs-Meldung des Anbieters oder des Proxys (HTTP 429/424), und die
  Watchdogs stoßen stundenlang vergeblich an.
- Erkennen: Der Abbruchgrund im Watchdog-Text nennt eine Rate-Limit- oder Drosselungs-Meldung, und der Wochenwert steht am oder über
  dem Tor. Das ist kein Fehler der Sitzung und keiner der Kontextverdichtung: nichts nachforschen, nichts umbauen, bis zum
  Wochenwechsel warten. In die Übergabe-Notiz schreiben, damit ein Nachfolger nicht danach sucht.
- Beim Setzen der Pause deshalb den Wecker für das Ende an den Messwert binden (Wache mit Startzeit = Pausenende, die nur bei freiem
  Tor weckt), nicht an die Uhrzeit allein.
- Nach dem Wochenwechsel läuft nichts von selbst wieder an. Reihenfolge im ersten Lauf:
  1. Kontingent messen (Wert muss zurückgesetzt sein; die Limits-Datei kann noch den alten Wert zeigen, das Mess-Skript zählt).
  2. Lage prüfen: Queue-Zählung, letzte Journalzeilen, Lauf-Register (kein hängender Lauf), Integrationszweig = Remote, Pane-Zustand je Spur.
  3. Abgelaufene Pausen-Dateien entfernen, Leitstand-Weckabstand prüfen (der Ende-Timer sollte ihn zurückgestellt haben).
  4. Jede Spur ausdrücklich wecken, auch wenn ihr Watchdog läuft: Nach mehreren vergeblichen Anstößen sperrt der Watchdog weitere
     (Schutz gegen Abbruch-Schleifen) und die Spur bleibt liegen. Im Wecktext sagen: neue Woche, die Abbrüche waren das volle
     Kontingent, normal nach Plan weiter, Grenze und Worker-Obergrenze wie zuvor, Prüfschritte unverändert Pflicht.
  5. Aufsichten im Normaltakt und die Kontingent-Wache neu starten, die Wache mit der Rücksetzzeit der neuen Woche (alte + 7 Tage,
     gegen die Limits-Datei prüfen).
  6. Erledigte Kontingent-Frage in der Nutzer-Liste als erledigt kennzeichnen, Übersicht und Statusseite umstellen, neuen ersten
     Messpunkt der Woche schreiben.
  7. Nach ein bis zwei Minuten prüfen, ob jede Spur quittiert und gestartet hat; im Bericht offen sagen, welche Spur noch nicht
     gestartet hat und wer die Worker-Plätze gerade belegt.
- Die Quittungen der Spuren gegenlesen: Nach einer langen Pause schleichen sich Regelfehler ein (z. B. Prüfer mit demselben Modell wie
  der Worker angesetzt). Sofort mit einem Satz berichtigen.

## Nutzer sagt, das Kontingent sei wieder da
1. Sofort frisch beim Anbieter messen (Mess-Werkzeug mit Erzwingen-Schalter, nicht die Limits-Datei lesen) und erst dann antworten.
   Grund: Die Limits-Datei ist ein Zwischenspeicher, und der Anbieter setzt den Verbrauch manchmal mitten in der Woche zurück. Wer
   den alten Wert zitiert, widerspricht dem Nutzer mit einer veralteten Zahl und muss ein zweites Mal gefragt werden.
2. Mit jedem vorhandenen Zugang messen (Agenten-Token und Login des Anbieter-Werkzeugs); stimmen beide überein, gilt der Wert.
   Danach den Zwischenspeicher über den regulären Aktualisierungs-Befehl nachziehen und das Tor-Skript erneut fragen.
3. Prüfen, warum die eigene Messung alt war. Häufig steigt die eigene Probe früh aus, sobald der Login des Anbieter-Werkzeugs wieder
   gültig ist, und überlässt die Messung einem anderen Dienst mit längerem Takt.
4. Im Bericht sagen: neuer Wert, Abstand zur unveränderten Grenze, Rücksetzzeit, und was damit wieder erlaubt ist (neue Worker,
   nächste Welle). Eine Kontingent-Wache auf die Grenze neu aufsetzen, bevor wieder Worker starten. Galt vorher eine Einschränkung
   wegen der nahenden Grenze („nur der freie Anbieter baut“), sie bei den Spuren ausdrücklich aufheben.

## Voller Zwischenspeicher (/tmp) hält eine Spur an
Spuren dürfen dort nichts Fremdes löschen und melden den Zustand; der Leitstand räumt, aber nur Belegbares.
1. Messen: `df -h /tmp`, die größten Ordner (`du -sh /tmp/* | sort -h | tail`), Zahl und Summe der alten Shell-Umgebungen
   (`find /tmp -maxdepth 1 -name 'nix-shell.*' -mmin +120 -user "$(id -un)"`).
2. Benutzung belegen: aus Umgebung und Arbeitsordner aller eigenen Prozesse die genannten Ordner sammeln
   (`{ for p in /proc/[0-9]*; do tr '\0' '\n' < $p/environ; readlink $p/cwd; done; } 2>/dev/null | grep -o '/tmp/nix-shell\.[A-Za-z0-9]*' | sort -u`).
   Die Fehlerumleitung gehört um die ganze Schleife, weil die Eingabe-Umleitung vor dem Befehl scheitert und sonst Hunderte
   Fehlerzeilen kommen. Löschliste = alte Ordner ohne die benutzten (`grep -vxFf`), als Datei ablegen, Form jeder Zeile per Muster prüfen.
3. Die Benutzungsprüfung unmittelbar vor dem Löschen wiederholen, dann `xargs -d '\n' rm -rf -- < liste`. Lauf-Register der
   Unter-Agenten, Zwischenspeicher anderer Werkzeuge und fremde Arbeitsordner bleiben, auch wenn sie groß sind.
4. Ergebnis messen, die Spur mit dem neuen Wert freigeben, Zeile in die Stand-Datei.

## Hinweise
- Die Rate je Paket schwankt mit der Modellmischung (starkes Modell für Prüfer und lange Pakete kostet ein Mehrfaches).
  Stehen im Rest viele Pakete mit starkem Modell oder mehrstufige Sammelpakete (ein Paket, mehrere lange Läufe), sie als mehrere
  Pakete zählen und den Endstand als Spanne angeben.
- Am Anfang einer Welle ist die Rate je Paket noch nicht belastbar: Die ersten großen Pakete verbrauchen mit Prüfung und Nacharbeit
  viele Punkte, bevor eines fertig ist. Dann nur mit Punkten je Stunde rechnen und das im Bericht so sagen.
- Kurzzeitfenster und Wochenfenster getrennt betrachten; fehlt die Messung des Kurzzeitfensters, das im Bericht sagen statt 0 % zu melden.
- Der Wochenwert ist der Verbrauch des ganzen Kontos, nicht der eigenen Arbeit. Im Bericht trennen: „durch dieses Vorhaben von X auf Y,
  der Rest anderer Verbrauch“, sonst wirkt ein voller Zähler wie ein Fehler der Orchestrierung.
- Zeitstempel in Stand-Datei und Berichten per `date` holen, nicht schätzen – auch im eigenen Lauf nach einer langen Pause.
- Zählbefehle am Ende einer Runde, die bei null Treffern mit Exit 1 enden (`grep -c`), mit `|| true` abschließen.
  Grund: Sonst sieht die ganze erfolgreiche Runde wie ein Fehler aus.

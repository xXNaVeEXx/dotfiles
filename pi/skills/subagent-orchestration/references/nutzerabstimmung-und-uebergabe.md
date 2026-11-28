# Nutzerabstimmung und Übergabe (Orchestrator)

## Knappe Antwort des Nutzers, während mehrere Fragen offen sind
Antwortet der Nutzer mit einem kurzen Satz („mach das auch“, „ist gemergt“), während mehrere Entscheidungen bei ihm liegen:
1. Die Antwort nur auf die Frage beziehen, die ihr Wortlaut eindeutig trifft, und nur diese ausführen.
2. Jede andere offene Frage bleibt offen; dort gilt weiter der gebaute Stand.
3. In der nächsten Meldung beides ausdrücklich sagen: „Ich habe das als Ja zu <X> gelesen. <Y> ist weiter offen, bis dahin bleibt es wie heute.“
Grund: Eine still mitgedeutete Zustimmung ändert Verhalten (oft Geld- oder Statuslogik), das der Nutzer nie bestellt hat; die offene
Rückmeldung kostet ihn einen Satz, eine falsche Deutung einen Rückbau.

## Arbeitsbereich nach dem Merge für ein Folgepaket wiederverwenden
Ist der Zweig eines Arbeitsbereichs gemergt, keinen neuen Worktree anlegen, sondern prüfen und umschalten:
1. `git fetch origin && git status --short` (muss leer sein).
2. `git diff --stat <alter Kopf> origin/<basis>` ist leer → nichts Eigenes fehlt auf der Basis.
3. `git switch -c <neuer-zweig> origin/<basis>`; dem Worker im Brief Zweig, Ausgangs-Commit, Datenbank und Port nennen.
Grund: Der Bereich hat schon `node_modules`, eigene Datenbank und Port; ein neuer Worktree kostet Installation und RAM.
Ist der Diff NICHT leer, liegt dort ungemergte Arbeit: erst klären, nicht umschalten.

## Gutachten meldet „Text sagt A, Code tut B“
Vor dem Korrektur-Brief entscheiden, welche Seite sich ändert:
1. Per Suche alle Aufrufer des Code-Wegs auflisten. Teilt er sich den Weg mit einem anderen Ablauf (z. B. derselbe Auswahl-Helfer für
   Büro-Druck und automatische Mail)?
2. Wenn ja: den Text an den Code anpassen (alle Sprachen, Hilfe, Regel-Doku, App-Kopien) und einen Test ergänzen, der das tatsächliche
   Verhalten festhält. Den Code nur ändern, wenn der Nutzer das strengere Verhalten bestellt hat.
3. Im Brief die Begründung nennen und alte Status-/Verlaufsdateien ausdrücklich vom Umschreiben ausnehmen.
Grund: Eine strengere Regel nur für einen der Abläufe lässt beide auseinanderlaufen; der Nutzer sieht dann zwei verschiedene Ergebnisse
für dieselbe Einstellung.

## Erklär- oder Testanleitung für den Nutzer abnehmen
Eine von einem Worker gebaute Anleitungsseite (HTML, Handbuch, Test-Leitfaden) ist erst fertig, wenn der Orchestrator sie selbst gegengelesen hat:
1. Text aus der Datei ziehen und GANZ lesen; Bildschirmfotos in hell, dunkel und Handy-Breite ansehen.
2. Jeden genannten Knopf- und Kartentext in der Sprachdatei der App suchen; jede Zahl („bis zu N“, Wartezeiten, Versuche) auf die
   Konstante im Code zurückführen.
3. Jede Aussage über das Testsystem („dort ist X eingerichtet / nicht eingerichtet“) mit einer echten, nur lesenden Abfrage belegen
   (Skill mag-tech-cluster-ops) und die Seite danach berichtigen.
4. Nach Geheimnissen suchen (Schlüssel-Muster), externe Adressen auflisten, Arbeitsbaum auf ungewollte Änderungen prüfen.
5. Bei der Übergabe alles, was nur aus Code oder Hilfe hergeleitet und nicht im Browser durchgespielt wurde, als Vorbehalt je Probe nennen.
Grund: Der Nutzer testet genau nach dieser Seite; eine falsche Voraussetzung („Konto fehlt“) lässt ihn schon eingerichtete Dinge
neu anlegen oder einen funktionierenden Ablauf für kaputt halten.

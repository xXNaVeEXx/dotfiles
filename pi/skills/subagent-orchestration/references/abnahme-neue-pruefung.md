# Neue Prüfung eines Workers abnehmen (CI-Schritt, Wächter, Lint-Regel)

Gilt, wenn ein Worker eine zusätzliche Prüfung liefert, die bei jedem PR Laufzeit kostet.
Der Worker begründet sie mit einem Zugewinn („findet, was bisher niemand findet“). Genau diesen Zugewinn belege ich selbst.

## Ablauf
1. **Alle Wächter-Aufrufe selbst nachfahren.** Die Liste aus den Workflow-Dateien ziehen (`grep -rn '__tests__/.*\.sh\|\.py' .github/workflows/`),
   nicht die Zählung aus dem Bericht übernehmen. Jeden Aufruf einzeln mit `rc=` protokollieren, Log in den Orchestrator-Ordner.
   Grund: Worker fahren meist nur die Wächter ihres eigenen Themas; ein Seiteneffekt auf einen fremden Wächter fällt sonst erst in der CI auf.
2. **Die neue Prüfung echt laufen lassen** (kein Attrappen-Modus) und Dauer sowie Speicher notieren. Diese Zahl ist der Preis je PR,
   den der Nutzer für seine Entscheidung „behalten oder nicht“ braucht.
3. **Differenz-Probe.** Eine Störung einbauen, die NUR die neue Prüfung sehen kann (z. B. ein Name, der nur im Stand eines einzelnen
   Kunden oder nur in einem erzeugten Zwischenstand vorkommt). Auf demselben Stand die bisherige UND die neue Prüfung fahren.
   Erwartet: bisherige grün, neue rot mit benannter Fehlerstelle (Fehlercode und Datei notieren).
   Grund: Eine Störung, die auch die bisherige Prüfung findet, belegt nur „wird rot“, nicht den Zugewinn.
4. **Aufräumen belegen.** Störung zurücknehmen (`git checkout -- <datei>`), danach `git status --porcelain` leer und HEAD unverändert.
   Erzeugnisse eines Kunden- oder Zwischenbaus, die die Prüfung anlegt, gehören nie in einen Commit.
5. **Ergebnis in Worten melden:** Zahl grün von Zahl gesamt, Preis je PR, Ergebnis der Differenz-Probe, und was die Prüfung bewusst
   nicht abdeckt (z. B. kein voller App-Bau, weil zu lang).

## Roter Wächter beim Nachfahren
Erst als Altbestand melden, wenn BEIDES belegt ist:
- `git diff --stat origin/<basis>...HEAD -- <ordner des wächters und der geprüften dateien>` ist leer, und
- kein Workflow ruft ihn auf (`grep -rn '<name>' .github/` ohne Treffer).

Dann nicht selbst reparieren, sondern dem Nutzer als eigenen Punkt vorlegen (eigenes Issue), mit der erwarteten und der gefundenen Zahl.
Ist eine der beiden Bedingungen nicht erfüllt, ist es ein Fund des eigenen Zweigs und geht als Nacharbeit an den Worker.

## Aufteilung langer Abnahme-Läufe
Mehrere kurze Skripte nacheinander als eigene bg_run-Aufgaben (Wächter, übrige Wächter, Differenz-Probe) statt eines langen.
Grund: Ein Abbruch kostet dann nur einen Teil, und die Differenz-Probe verändert den Baum und darf nie parallel zu einem anderen Lauf
im selben Worktree stehen.

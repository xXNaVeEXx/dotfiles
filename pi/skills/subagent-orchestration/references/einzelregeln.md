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

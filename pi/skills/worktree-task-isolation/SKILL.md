---
name: worktree-task-isolation
description: "Stehende Konvention: jede neue Codier-Aufgabe startet in einem eigenen git-Worktree über worktrunk (wt switch -c) statt im Haupt-Checkout, damit parallele Agenten sich nicht in die Quere kommen; inkl. Merge/Aufräumen mit wt. Use when a new coding task, feature, fix, refactor, or experiment begins in a git repo, or when finishing/cleaning up worktree-based work."
---

# worktree-task-isolation

# Neue Aufgaben IMMER im eigenen Worktree (worktrunk / wt)

Stehende Nutzer-Konvention: Jede neue Codier-Aufgabe (Feature, Fix, Refactor, Experiment) startet in einem EIGENEN git-Worktree — nie im Haupt-Checkout. Der Nutzer will das nicht mehr erinnern müssen. Werkzeug dafür: worktrunk (`wt`, installiert unter ~/.local/bin/wt, aarch64-musl-Binary, Repo: github.com/max-sixty/worktrunk, Doku: worktrunk.dev).

## Wann dieses Skill
- Beginn JEDER neuen Codier-Aufgabe in einem git-Repo (auch „kurze" Fixes)
- Aufräumen/Zusammenführen nach Abschluss

## Verfahren (Agent-Fluss, KEINE Shell-Integration nötig)
```bash
cd <repo> && wt switch -c <kurzer-kebab-name>     # Branch + Worktree anlegen
# Output enthält: "✓ Created branch <name> from <base> and worktree @ <PFAD>"
# Pfad aus der Output-Zeile parsen; Default-Template: ../<repo>.<branch> (Sibling)
cd <pfad>                                          # dort arbeiten, committen
wt list                                            # Übersicht; @ = aktuell, + = andere
wt merge <name>                                    # am Ende: squash/rebase/merge in Ziel-Branch
wt remove <name>                                   # Worktree + Branch aufräumen (nach Merge)
```
- `wt switch -c` im Haupt-Checkout ausführen; danach alle Arbeit im Worktree-Pfad (auch Sub-Agents: deren `cwd` auf den Worktree-Pfad setzen — ein Writer pro Worktree).
- Branch-Namen: kurz, kebab-case, aufgabenbezogen (kein Ticket-Geraffel im Namen).
- `wt switch pr:123` checkt einen PR-Branch direkt in einen Worktree aus.
- `wt -C <pfad> …` wenn man nicht cd-en will.

## Ausnahmen (kein eigener Worktree nötig)
- Rein lesende Inspektion (read/grep/diff/status) im Haupt-Checkout.
- Aufgabe betrifft ausdrücklich den aktuell ausgecheckten Branch UND der Haupt-Checkout ist sauber.
- Nutzer ordnet etwas anderes an; Home bleibt grundsätzlich repo-frei.

## Stolperfallen
- Ohne Shell-Integration druckt `wt switch` nur „Cannot change directory" — der Worktree-Pfad steht trotzdem in der ✓-Zeile; diesen parsen, nicht die Warnung.
- Parallel-Agenten im selben Repo: NIE zwei Writer in denselben Worktree-Pfad; Haupt-Checkout bleibt frei (deshalb existiert diese Konvention).
- Build-Ordner (target/, node_modules/) liegen je Worktree frisch leer — bei teuren Builds `wt step --copy-ignored` nutzen (CoW auf btrfs, billig). Für einen kurzen Typecheck oder Test in einem JS-Monorepo reichen Symlinks auf den Haupt-Checkout: `ln -sfn ../<repo>/node_modules node_modules`, je Paket mit eigenen `node_modules` dasselbe mit relativem Pfad. Voraussetzung ist ein unverändertes Lockfile gegenüber dem Haupt-Checkout. Die Symlinks nie stagen, also gezielt Pfade `git add`. LSP- und pi-lens-Funde, die vor dem Verlinken entstanden sind („Cannot find module“), sind Altlasten. Gültig ist erst ein Lauf von `tsc --noEmit` danach.
- Viele parallele Worktrees = viele Builds = RAM beachten (Skill ram-audit); lieber sequenziell mergen als alles gleichzeitig bauen.
- `wt remove` löscht den Branch nur, wenn gemerged — ungemergte Arbeit vorher committen/mergen oder explizit entscheiden.
- wt liegt in ~/.local/bin — auf Maschinen ohne das im PATH Binary-Pfad direkt angeben oder nachinstallieren (Prebuilt: GitHub Releases *-aarch64-unknown-linux-musl.tar.xz, sha256 prüfen).

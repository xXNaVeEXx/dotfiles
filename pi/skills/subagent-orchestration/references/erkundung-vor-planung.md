# Erkundung vor der Planung (Scout-Fächer)

Gilt, wenn der Nutzer eine neue Funktion übergibt, ich nur orchestrieren soll und es noch keinen Plan gibt. Ziel: Die Architektur-Entscheidung auf belegte Fakten stützen, ohne den eigenen Kontext mit Code-Lektüre zu füllen.

## Ablauf

1. **Vorbereiten (selbst, kurz).** Status-Datei der App und die einschlägigen Skills lesen. Worktree vom Remote-Stand der Zielbasis anlegen (Skill worktree-task-isolation, `--base origin/<ziel>`). Arbeitsordner `.tmp/<auftrag>/` im Worktree anlegen (Erkundung, Plan, Briefe, Logs).
2. **Geheimnisse des Nutzers ablegen.** Nennt der Nutzer eine Datei mit einem Schlüssel und liegt sie nicht am genannten Ort im Repo, am gleichnamigen Ort im Home nachsehen, bevor ich frage. Die Datei nach `.tmp/<auftrag>/` kopieren, `chmod 600`, per `git check-ignore` belegen, dass der Ort ignoriert ist. Nur Größe und Präfix prüfen, den Inhalt nie ausgeben. Worker bekommen den Pfad, nie den Wert. Dem Nutzer den Fundort melden.
3. **Scouts entlang der offenen Entscheidungen schneiden**, nicht entlang der Ordner. Üblich sind drei bis fünf:
   - **Einbau und Auslieferung:** Wie kommt Code dieser Art wirklich ins Produktivsystem (eigenes Image je Kunde, gemeinsamer Kanal, Freischaltung je Mandant)? Grund: Eine Ortsvorgabe des Nutzers („im Kunden-Ordner“, „als Paket“) trägt nur, wenn der Auslieferungsweg sie stützt. Sonst ist die Architektur vor der Planung zu klären.
   - **Je betroffenem Fachbereich einer** (Datenmodell, Status-Modelle, Quelle der Wahrheit für Beträge und Zustände, Regeln des Repos dazu).
   - **Bestehendes, das nicht vermischt werden darf:** Inventar der vorhandenen Lösung mit ähnlichem Namen oder Anbieter, belegte Namen, Tabellen, Routen, ENV. Ergebnis: Namensraum-Vorschlag und Abgrenzungsregeln.
   - **Querschnitt:** Rechte, Einstellungen, Übersetzungen, Tour und Handbuch, Testmuster, Migrationsnummern, Paritätsprüfungen zu App-Kopien.
4. **Jeden Scout-Auftrag eigenständig schreiben.** Scouts starten ohne meinen Kontext. Pflichtteile: Worktree-Pfad und „nichts ändern“, ein Absatz Hintergrund (was gebaut werden soll und warum), nummerierte Fragen, die Start-Dokus und Regeldateien beim Namen, „volle Pfade mit Zeilennummern“, und ein festes Schlussformat: Faktenliste mit Belegen, Risiken, konkrete Einhängepunkte (Datei und Funktion), bei Architekturfragen zwei bis drei Optionen mit Empfehlung.
5. **In EINEM Aufruf parallel starten:** `subagent({workflow:"parallel", async:true, cwd:<worktree>, args:{tasks:[{agent:"scout", task:"…"}, …]}})`. Scouts lesen nur, deshalb dürfen alle denselben Worktree nutzen.
6. **Wartezeit nutzen, dann Turn beenden.** Unabhängige Kleinfakten selbst prüfen (Git-Host aus `git remote -v`, weil Projektregeln im Haupt-Checkout veraltet sein können). Dem Nutzer eine kurze Meldung geben: Worktree, Tabelle „welcher Scout klärt was“, nächster Schritt. Nicht pollen, die Fertigmeldung weckt die Sitzung.
7. **Nach den Ergebnissen:** Architektur entscheiden und begründen, `PLAN.md` und Paket-Briefe unter `.tmp/<auftrag>/` schreiben, bei parallelen Schichten zuerst die Schnittstelle committen, dann Worker starten. Offene Fragen, die nur der Nutzer entscheiden kann, mit Optionen und Empfehlung nennen, die übrigen Pakete aber schon starten.

## Fallen

- Scout-Fragen zu breit („schau dir die App an“) liefern Nacherzählungen. Jede Frage muss auf eine Entscheidung zielen, die ich danach treffe.
- Den Auftrag des Nutzers im Scout-Hintergrund vollständig wiedergeben, einschließlich seiner Abgrenzungen und Vorsichtshinweise (z. B. Doppelzählung, getrennte Systeme). Grund: Der Scout sucht sonst nicht nach den Stellen, an denen genau diese Vorgaben brechen.
- Verlangt der Auftrag „Status einstellbar“ oder „später dynamisch“, den Scout ausdrücklich fragen, ob die Werte heute fest oder konfigurierbar sind und wie eine Einstellung aussehen muss, die beides übersteht.

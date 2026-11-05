# Modellwechsel eines noch nicht gestarteten Laufs (Plan-Aufträge mit Modellvorgabe)

Steht das Modell im Auftragsbrief (Satz „Dein Modell: …“) und die Queue hat eine Modell-Spalte, und der geplante Anbieter hat keinen freien Platz (Obergrenze je Anbieter erreicht) oder ist gesperrt, aber ein anderer Anbieter hat Platz:

1. Platz-/Kontingentlage prüfen (Quota-Skript, RAM-Skript), nur wechseln, wenn der Ausweich-Anbieter frei ist und seine Obergrenze nicht überschritten wird.
2. Satz „Dein Modell: …“ im Brief per `sed -i` auf das neue Modell setzen und per `grep -c "Dein Modell: <neu>" <brief>` (Erwartung 1) gegenprüfen. Grund: Der Worker liest Brief UND Start-Task; widersprechen sich beide, wählt er Denkstufe/Arbeitsweise nach dem falschen Modell.
3. Modell-Spalte in der Queue anpassen, dann erst starten (`model`-Parameter passend zum Brief).
4. Wechsel mit Grund (Platzlage in Prozent) in die Entscheidungsdatei und ins Journal eintragen.
5. Teile derselben Kette (Teil n+1) tragen ihr eigenes „Dein Modell“; bei Wechsel der ganzen Kette alle Teil-Briefe mitziehen, sonst springt die Kette zurück.
6. Lange Ketten (viele Teile, strikt nacheinander) belegen einen Platz fast den ganzen Lauf: Sind die Plätze des teuren Anbieters von zwei langen Ketten belegt, die übrigen Ketten und Einzelläufe geschlossen auf den freien Anbieter legen, statt jeden Teil einzeln zu verschieben.
7. Belegung je Anbieter vor JEDEM Start aus der Queue zählen (`grep "| läuft" QUEUE.md`, getrennt nach Modellspalte), nicht aus dem Gedächtnis: Das Kontingent-Skript zählt keine laufenden Plätze, und ein gerade fertig gewordener Lauf kann einen Platz des anderen Anbieters vortäuschen. Wurde die Obergrenze doch überschritten, den frisch gestarteten Lauf sofort mit `acp_delegate_cancel` beenden, Brief und Queue auf den freien Anbieter umstellen (Schritte 2–4) und neu starten.

# Abnahme-Commit bei parallelen Planer-Läufen

- Mehrere Läufe schreiben gleichzeitig in verschiedene Dateien desselben Worktrees: je Abnahme nur die Datei des fertigen Laufs hinzufügen (`git add <pfad>/<BEREICH>.yaml`), nie den ganzen Doku-Ordner — sonst landen halbfertige Dateien laufender Worker im falschen Commit.
- Commit-Nachricht mit Zahlen vorab berechnen und als einfachen String übergeben; verschachtelte `$(…)`-Ersetzung in der Nachricht ging schon schief (Nachricht „(1 )“). Verfälschte Nachricht nie per amend/reset korrigieren (Historie bleibt unangetastet), sondern mit leerem Folge-Commit (`--allow-empty`) nachtragen.

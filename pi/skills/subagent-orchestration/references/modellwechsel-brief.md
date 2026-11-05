# Modellwechsel eines noch nicht gestarteten Laufs (Plan-Aufträge mit Modellvorgabe)

Steht das Modell im Auftragsbrief (Satz „Dein Modell: …“) und die Queue hat eine Modell-Spalte, und der geplante Anbieter hat keinen freien Platz (Obergrenze je Anbieter erreicht) oder ist gesperrt, aber ein anderer Anbieter hat Platz:

1. Platz-/Kontingentlage prüfen (Quota-Skript, RAM-Skript), nur wechseln, wenn der Ausweich-Anbieter frei ist und seine Obergrenze nicht überschritten wird.
2. Satz „Dein Modell: …“ im Brief per `sed -i` auf das neue Modell setzen und per `grep -c "Dein Modell: <neu>" <brief>` (Erwartung 1) gegenprüfen. Grund: Der Worker liest Brief UND Start-Task; widersprechen sich beide, wählt er Denkstufe/Arbeitsweise nach dem falschen Modell.
3. Modell-Spalte in der Queue anpassen, dann erst starten (`model`-Parameter passend zum Brief).
4. Wechsel mit Grund (Platzlage in Prozent) in die Entscheidungsdatei und ins Journal eintragen.
5. Teile derselben Kette (Teil n+1) tragen ihr eigenes „Dein Modell“; bei Wechsel der ganzen Kette alle Teil-Briefe mitziehen, sonst springt die Kette zurück.

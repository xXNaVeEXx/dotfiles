# Kontingent hochrechnen statt nur gegen die Grenze prüfen (Leitstand)

Die Kontingent-Wache meldet erst, wenn die Wochengrenze erreicht ist. Dann stehen die Spuren schon, oft für Tage, und der Nutzer
hätte Stunden vorher entscheiden können. Darum bei jedem Leitstand-Wecken hochrechnen.

## Ablauf
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

## Hinweise
- Die Rate je Paket schwankt mit der Modellmischung (starkes Modell für Prüfer und lange Pakete kostet ein Mehrfaches).
  Stehen im Rest viele Pakete mit starkem Modell oder mehrstufige Sammelpakete (ein Paket, mehrere lange Läufe), sie als mehrere
  Pakete zählen und den Endstand als Spanne angeben.
- Kurzzeitfenster und Wochenfenster getrennt betrachten; fehlt die Messung des Kurzzeitfensters, das im Bericht sagen statt 0 % zu melden.
- Nähert sich der Wert der Grenze, keine neuen langen Pakete mit starkem Modell mehr beginnen lassen, die sicher in die Pause laufen:
  Ein mitten im Lauf pausierter Worker kostet beim Fortsetzen erneut den vollen Kontext.

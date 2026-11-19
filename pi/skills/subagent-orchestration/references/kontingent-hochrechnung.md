# Kontingent hochrechnen statt nur gegen die Grenze prüfen (Leitstand)

Die Kontingent-Wache meldet erst, wenn die Wochengrenze erreicht ist. Dann stehen die Spuren schon, oft für Tage, und der Nutzer
hätte Stunden vorher entscheiden können. Darum bei jedem Leitstand-Wecken hochrechnen.

## Ablauf
1. Bei jedem Wecken einen Messpunkt in die Stand-Datei schreiben: Uhrzeit, Wochenwert in Prozent, fertige Pakete je Spur (Live-Zählung aus der Queue).
2. Aus zwei Messpunkten, die mindestens ein paar Stunden auseinanderliegen, zwei Raten bilden:
   Prozentpunkte je Stunde und Prozentpunkte je fertigem Paket.
3. Die Rücksetzzeit nicht annehmen, sondern aus der Limits-Datei des Anbieters lesen (`resetsAt`, UTC in Ortszeit umrechnen).
4. Zwei Zahlen ableiten:
   - Zeitpunkt, an dem die Grenze erreicht wird: (Grenze − aktueller Wert) ÷ Punkte je Stunde.
   - Endstand, wenn der Rest der Welle durchläuft: aktueller Wert + offene Pakete × Punkte je Paket.
5. Liegt der Zeitpunkt deutlich vor dem Wochenwechsel (mehr als etwa ein Tag Pause), dem Nutzer sofort als Entscheidung vorlegen,
   in einfachen Worten und mit Zahlen:
   - Grenze lassen: Pause ab wann bis wann, wie viele Pakete bleiben liegen.
   - Grenze auf den errechneten Endstand plus kleinen Puffer anheben: Welle wird fertig, so viel bleibt ihm für eigene Arbeit.
   - Eigene Zahl.
   Dazu sagen, was ohne Antwort gilt (die bestehende Grenze).
6. Die Frage zusätzlich in die Nutzer-Liste (Datei für offene Nutzerpunkte) und in den Kopf der Statusseite schreiben, mit Datum.
7. Die Grenze nie selbst ändern. Sie ist eine Vorgabe des Nutzers über sein eigenes Kontingent.
8. Bei jedem weiteren Wecken die Hochrechnung mit dem neuen Messpunkt nachziehen und nur melden, wenn sich der Zeitpunkt
   um mehr als ein paar Stunden verschiebt.

## Hinweise
- Die Rate je Paket schwankt mit der Modellmischung (starkes Modell für Prüfer und lange Pakete kostet ein Mehrfaches).
  Stehen im Rest viele Pakete mit starkem Modell, den Endstand als Spanne angeben.
- Kurzzeitfenster und Wochenfenster getrennt betrachten; fehlt die Messung des Kurzzeitfensters, das im Bericht sagen statt 0 % zu melden.
- Nähert sich der Wert der Grenze, keine neuen langen Pakete mit starkem Modell mehr beginnen lassen, die sicher in die Pause laufen:
  Ein mitten im Lauf pausierter Worker kostet beim Fortsetzen erneut den vollen Kontext.

# Pflichten für alle Pakete eines Laufs (Tour, Handbuch, Zustimmung, Gate-Handprüfung, Gesamtheitsprüfung)

Gilt, wenn eine Vorgabe jedes Paket betrifft statt eines einzelnen. Typisch: Jede neue sichtbare Funktion braucht einen
Schritt in der Einführungs-Tour und einen Handbuch-Eintrag, und am Ende wird geprüft, ob alle Funktionen zusammenpassen.
Dasselbe Muster gilt für Übersetzungen, Hilfetexte, Rechte je Funktion und vorhandene Zustimmungs-Schalter. Einzelne
Folgeaufträge während des Laufs: references/leitstand-abnahme.md §5.

## 1. Einplanen statt nachschieben
- Die Pflicht in jedes Paket legen, nicht als Schlusspaket anhängen. Grund: Ein Nachzügler-Paket kennt die einzelnen
  Funktionen nicht, arbeitet teuer nach und lässt Lücken; der Paket-Worker hat den Kontext gerade vor sich.
- Kommt die Vorgabe mitten im Lauf: kommende Pakete bekommen sie im Brief und im Plan-Prüfer, laufende Worker wie jede
  neue Vorgabe (SKILL.md, Regel zu Vorgaben für bereits laufende Worker).

## 2. An jeder maschinellen Stelle verankern
Eine Pflicht, die nur im Text steht, überliest der erste Worker. Darum an allen Stellen, die ein Paket durchläuft:
1. Plan-Prüfer: Pflichtfeld je Paket (z. B. `handbuch:` = Liste der neuen Eintrags-IDs oder `keine – <Grund>`); fehlt
   es, endet der Prüfer mit Fehler. Auch das Fundament-Paket, das das Register baut, füllt es bewusst
   (`keine – Grundgerüst`). Pakete mit `keine` dürfen keine Oberflächenpfade haben.
2. Worker-Brief: eigener Abschnitt „Handbuch und Tour (Pflicht)“ mit Pfad des eigenen Fragments, ID-Schema, Tour-Id und
   Prüfbefehl.
3. Prüflauf des Pakets: Kündigt das Paket IDs an, muss sein Prüfplan die passenden Tests enthalten (Tour- und
   Handbuch-Tests der Oberfläche, Katalog-Check nur für dieses Paket, z. B. `--wp <paket>`).
4. Abnahme: Jede angekündigte neue ID steht in einer Datei, die das Paket selbst geändert hat.
5. Gate je Bauabschnitt und Gesamttest: ein Schritt, der alle Touren (alt und neu) in der echten Oberfläche durchklickt,
   je Schritt ein Foto ablegt und je Fehlschlag `TOUR <tour> <nr> FEHLER <selector>` meldet.
- Jede Prüfskript-Änderung mit einem Testfall belegen, der gegen die alte Fassung rot und gegen die neue grün ist
  (references/watchdog.md §7).

## 3. Sammeldateien in Fragmente zerlegen
- Liegen Touren oder Handbuch in einer Sammeldatei (eine JSON mit allen Touren, eine Wissensbasis), schreibt jedes Paket
  eine eigene Fragment-Datei. Das Fundament-Paket baut ein Register, das alle Fragmente per Glob einliest (z. B. Rust per
  `build.rs`, das sie einbettet). Grund: An einer Sammeldatei kollidieren parallele Pakete bei jedem Merge.
- Neue IDs je Paket in einem eigenen Bereich (`H-<PAKET>-nnn`). Grund: Die fortlaufenden Nummern sind belegt, und zwei
  Pakete würden sonst dieselbe nächste Nummer vergeben. Eine doppelte ID ist ein Prüffehler.
- Bestehende Vollständigkeits-Tests (z. B. „jede Wissens-ID hat einen Tour-Schritt“) auf alte und neue Einträge
  ausdehnen.
- Teile ohne Tour-Mechanik (z. B. eine Handy-App ohne Tour-Markierungen) bekommen einen festgelegten eigenen
  Handbuch-Weg (Handbuch-Eintrag plus erklärender Schritt in einer Desktop-Tour), nicht `keine`.

## 4. Doppelbau früh verhindern
- Der Architekturplan bekommt einen Abschnitt „Zusammenspiel mit dem Bestand“. Ausgangspunkt: alle Katalog-Einträge, die
  es in der App schon ganz oder teilweise gibt oder die als „erweitern“ markiert sind. Je Eintrag: vorhandene Funktion
  behalten, erweitern, ersetzen oder zusammenführen, mit Grund und betroffenen Dateien.
- Den Bestand aus dem Code nehmen, nicht aus dem Katalog: Jede Zeile nennt echte Module und Dateien. Grund: Planer
  übernehmen sonst Namen aus den Vorbildern oder aus dem eigenen Neubau (ein Modul, das der Plan erst anlegt, steht als
  „vorhanden“ da; Modi, die es nicht gibt), und dann ist unklar, was behalten oder ersetzt wird.
- Auch Bestandsbereiche ohne Katalog-Treffer aufnehmen (Integrationen, Sicherung, Selbst-Update, Hilfe und Diagnose,
  Einrichtung, Konten, Datenschutz), jeden mit Entscheidung oder „unberührt, weil …“. Grund: Gerade diese doppeln neue
  Pakete still, etwa als zweite Sicherung oder zweite Diagnose.
- Lernweg der Touren: Im Code nachsehen, wo die Reihenfolge wirklich entsteht (Datendatei, Erste-Schritte-Modul, Leser),
  und dort den Einfügepunkt neuer Touren und einen Reihenfolge-Test festlegen. Die Anzeige-Komponente zeigt meist nur die
  gelieferte Folge. Neue Touren bekommen eine Spalte „Voraussetzung“. Grundlagen (Einstieg, Modelle, Freigaben) kommen
  vor den Funktionen, die darauf aufbauen.
- Bestandstouren, deren Funktion sich ändert, in der Welle anpassen, in der die verändernde Funktion ankommt, mit
  eigenem Paket oder Akzeptanzpunkt samt Tour-Id. Grund: Pauschal im Fundament angepasst, beschreibt die Tour etwas, das
  es noch nicht gibt. Gar nicht angepasst, lernen Neulinge den alten Ablauf.

## 5. Vorhandene Zustimmungs- und Datenschutz-Schalter
- Hat die App einen Schalter für Netz oder Datenweitergabe (z. B. ein Offline-Versprechen mit Schalter „Apps und
  Internet“), wird er im Plan zum einzigen Tor für jeden neuen Netzzugriff. Dazu gehören:
  - eine zentrale Prüfung als Fundament-Paket mit Test;
  - eine Regel in der Architektur und in jedem Worker-Brief;
  - in der Akzeptanz jedes Netz-Pakets ein Verweis auf diese Prüfung;
  - ohne Zustimmung ein Hinweis mit Weg zur Einstellung, aber kein Netzzugriff.

  Grund: Sonst baut jede neue Funktion ihren eigenen Netzweg (Kanäle, Browser, Websuche, Cloud-Modelle, Updates) und
  umgeht die Zusage an den Nutzer. Nachträglich muss man diese Netzwege in Hunderten Paketen suchen.

## 6. Handprüfung am Architektur-Gate und Korrekturrunde
Das Prüfskript des Gates prüft nur die Form. Die Handpunkte (§4 und §5) gibt der Leitstand an einen unabhängigen
Nur-Lese-Prüfer, der den echten Code liest. Grund: Die Plan-Prüfer im Lauf sehen den Plan, nicht den Bestand, und
übersehen genau diese Punkte.

1. Auftrag an den Prüfer:
   - Arbeitsordner und Plan-Dokumente mit Abschnitt und Zeile.
   - Den Bestand im Code abgleichen.
   - Stichprobe von 10 bis 15 Paketen mit Oberfläche, mit festem Zufallsstartwert: Haben sie Handbuch-Eintrag und
     Tour-Schritt? Steht „keine“ nur bei Paketen ohne Oberfläche?
   - Antwort höchstens 40 Zeilen. Die erste Zeile lautet genau `<GATE>-HANDPRÜFUNG: ok|Mängel`.
   - Höchstens 10 Mängel, je mit Datei:Zeile, Warum und Vorschlag, geordnet nach blockierend und nicht blockierend.
   - Am Ende ein Satz, wie die Stichprobe gezogen wurde.
2. Bei blockierenden Mängeln kein Merge. Die Korrekturrunde läuft in derselben Spur, wenn ihr Kontext klein ist, weil
   sie ihre Werkzeuge kennt. Sonst in einer frischen Spur. Die Spur bekommt:
   - die Befunde als Datei im Spur-Ordner;
   - einen Brief mit den verbindlichen Leitstand-Entscheidungen, die auch ins Entscheidungs-Log kommen;
   - eine neue Queue-Zeile;
   - den Auftrag für eine Antwortdatei mit einer Zeile je Befund: die Änderung mit Datei:Zeile oder der Grund, warum
     nichts geändert wurde, dazu die Paketzahl vorher und nachher je Welle.

   Nicht blockierende Mängel gleich mitbeheben lassen, solange die nächste Welle noch nicht läuft.
3. Eine fertige Spur wieder öffnen:
   1. Zuerst das Fertig-Signal (z. B. `DONE`) wegschieben.
   2. Stop-Marker und Zustandsdatei des Watchdogs löschen, dann den Watchdog-Timer mit demselben `systemd-run` neu
      anlegen wie beim Spurstart.
   3. Die Spur anstoßen und die Aufsicht neu starten.

   Grund: Watchdog und Aufsicht melden FERTIG, solange das Signal da ist. Ein transienter Timer, der sich bei
   FERTIG selbst stoppt, verschwindet samt Unit, und `systemctl start` meldet dann „Unit … not found“.
4. Danach das Gate-Skript erneut laufen lassen und genau diese Befunde nachprüfen lassen. Eingaben sind die Befund- und
   die Antwortdatei, die erste Zeile lautet `<GATE>-NACHPRÜFUNG: ok|Mängel`. Höchstens 3 Runden.

## 7. Gesamtheitsprüfung vor dem Abschluss
- Eigenes Gate nach dem letzten Bauabschnitt, vor Nachanalyse und Abschluss.
- Zwei read-only Prüfer aus verschiedenen Modellfamilien, damit nicht beide dieselben blinden Flecken haben:
  - einer aus Nutzersicht: App unter Xvfb, alle Touren, Handbuch, Einstellungen;
  - einer aus Systemsicht: Architektur, Code, Datenflüsse.
- Fragen an beide:
  - Gibt es Funktionen doppelt?
  - Hat jede Information genau eine Datenquelle?
  - Laufen Abläufe über Bereichsgrenzen durch?
  - Sind Begriffe in allen Sprachen einheitlich?
  - Ist es sicher, und läuft jeder Netzzugriff über die Zustimmung?
  - Widersprechen sich Einstellungen?
  - Ergibt die Folge der Touren einen Lernweg?
- Höchstens 3 Runden (Befund → Nachbesserung → Nachprüfung). Das Ergebnis steht als Bericht im Repo
  (z. B. `docs/<lauf>/GESAMTPRUEFUNG.md`); erst damit ist das Gate erfüllt.

## 8. Nachziehen und melden
- Im selben Turn ändern: Plan (Definition of Done, Phasen, Schritte), Briefe und Vorlagen, Leitstand-Regeln,
  Entscheidungs-Log und Statusseite.
- Dem Nutzer in Alltagssprache melden, an welchen Stellen geprüft wird und dass er nichts tun muss. Mängel einer
  Gate-Prüfung so erklären, dass ihre Folge für ihn sichtbar wird (z. B. „neue Funktionen könnten ohne Zustimmung ins
  Netz gehen“).

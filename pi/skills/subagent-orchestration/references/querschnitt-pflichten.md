# Pflichten für alle Pakete eines Laufs (Tour, Handbuch, Gesamtheitsprüfung)

Gilt, wenn eine Vorgabe jedes Paket betrifft statt eines einzelnen. Typisch: Jede neue sichtbare Funktion braucht einen
Schritt in der Einführungs-Tour und einen Handbuch-Eintrag, und am Ende wird geprüft, ob alle Funktionen zusammenpassen.
Dasselbe Muster gilt für Übersetzungen, Hilfetexte oder Rechte je Funktion. Einzelne Folgeaufträge während des Laufs:
references/leitstand-abnahme.md §5.

## 1. Einplanen statt nachschieben
- Die Pflicht in jedes Paket legen, nicht als Schlusspaket anhängen. Grund: Ein Nachzügler-Paket kennt die einzelnen
  Funktionen nicht, arbeitet teuer nach und lässt Lücken; der Paket-Worker hat den Kontext gerade vor sich.
- Kommt die Vorgabe mitten im Lauf: kommende Pakete bekommen sie im Brief und im Plan-Prüfer, laufende Worker wie jede
  neue Vorgabe (SKILL.md, Regel zu Vorgaben für bereits laufende Worker).

## 2. An jeder maschinellen Stelle verankern
Eine Pflicht, die nur im Text steht, überliest der erste Worker. Darum an allen Stellen, die ein Paket durchläuft:
1. Plan-Prüfer: Pflichtfeld je Paket (z. B. `handbuch:` = Liste der neuen Eintrags-IDs oder `keine – <Grund>`); fehlt
   es, endet der Prüfer mit Fehler. Ausgenommen ist nur das Fundament-Paket, das das Register baut.
2. Worker-Brief: eigener Abschnitt „Handbuch und Tour (Pflicht)“ mit Pfad des eigenen Fragments, ID-Schema und
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

## 4. Doppelbau früh verhindern
- Der Architekturplan bekommt einen Abschnitt „Zusammenspiel mit dem Bestand“. Ausgangspunkt: alle Katalog-Einträge, die
  es in der App schon ganz oder teilweise gibt oder die als „erweitern“ markiert sind. Je Eintrag: vorhandene Funktion
  erweitern oder neu bauen, mit Grund und betroffenen Dateien.
- Diese Tabelle und den Lernweg der Touren prüft der Leitstand am Architektur-Gate selbst. Grund: Paket-Worker sehen nur
  ihr Paket und bauen sonst eine zweite Fassung einer vorhandenen Funktion.

## 5. Gesamtheitsprüfung vor dem Abschluss
- Eigenes Gate nach dem letzten Bauabschnitt, vor Nachanalyse und Abschluss.
- Zwei read-only Prüfer aus verschiedenen Modellfamilien, damit nicht beide dieselben blinden Flecken haben: einer aus
  Nutzersicht (App unter Xvfb, alle Touren, Handbuch, Einstellungen), einer aus Systemsicht (Architektur, Code,
  Datenflüsse).
- Fragen: Gibt es Funktionen doppelt? Hat jede Information genau eine Datenquelle? Laufen Abläufe über Bereichsgrenzen
  durch? Sind Begriffe in allen Sprachen einheitlich? Ist es sicher? Widersprechen sich Einstellungen? Ergibt die Folge
  der Touren einen Lernweg?
- Höchstens 3 Runden (Befund → Nachbesserung → Nachprüfung). Das Ergebnis steht als Bericht im Repo
  (z. B. `docs/<lauf>/GESAMTPRUEFUNG.md`); erst damit ist das Gate erfüllt.

## 6. Nachziehen und melden
- Plan (Definition of Done, Phasen, Schritte), Briefe und Vorlagen, Leitstand-Regeln, Entscheidungs-Log und Statusseite
  im selben Turn ändern. Dem Nutzer in Alltagssprache melden, an welchen Stellen geprüft wird und dass er nichts tun
  muss.

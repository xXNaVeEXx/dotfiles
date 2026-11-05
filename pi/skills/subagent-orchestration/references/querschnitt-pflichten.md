# Pflichten für alle Pakete eines Laufs (Tour, Handbuch, Zustimmung, Gate-Handprüfung, Gesamtheitsprüfung)

Dieses Dokument gilt, wenn eine Vorgabe jedes Paket betrifft und nicht nur ein einzelnes. Typisch: Jede neue sichtbare Funktion braucht einen Schritt in der Einführungs-Tour und einen Handbuch-Eintrag. Am Ende wird geprüft, ob alle Funktionen zusammenpassen.

Dasselbe Muster gilt für Übersetzungen, Hilfetexte, Rechte je Funktion und vorhandene Zustimmungs-Schalter. Einzelne Folgeaufträge während des Laufs: references/leitstand-abnahme.md §5.

## 1. Einplanen statt nachschieben
- **Die Pflicht in jedes Paket legen**, nicht als Schlusspaket anhängen.
  - Grund: Ein Nachzügler-Paket kennt die einzelnen Funktionen nicht. Es arbeitet teuer nach und lässt Lücken. Der Paket-Worker hat den Kontext gerade vor sich.
- **Die Vorgabe kommt mitten im Lauf:**
  - Kommende Pakete bekommen sie im Brief und im Plan-Prüfer.
  - Laufende Worker bekommen sie wie jede neue Vorgabe (SKILL.md, Regel zu Vorgaben für bereits laufende Worker).

## 2. An jeder maschinellen Stelle verankern
Eine Pflicht, die nur im Text steht, überliest der erste Worker. Darum gehört sie an alle Stellen, die ein Paket durchläuft:

1. **Plan-Prüfer:** Pflichtfeld je Paket, z. B. `handbuch:` mit der Liste der neuen Eintrags-IDs oder `keine – <Grund>`.
   - Fehlt das Feld, endet der Prüfer mit Fehler.
   - Auch das Fundament-Paket, das das Register baut, füllt es bewusst (`keine – Grundgerüst`).
   - Pakete mit `keine` dürfen keine Oberflächenpfade haben.
2. **Worker-Brief:** eigener Abschnitt „Handbuch und Tour (Pflicht)“ mit dem Pfad des eigenen Fragments, dem ID-Schema, der Tour-Id und dem Prüfbefehl.
3. **Prüflauf des Pakets:** Kündigt das Paket IDs an, muss sein Prüfplan die passenden Tests enthalten. Das sind die Tour- und Handbuch-Tests der Oberfläche und der Katalog-Check nur für dieses Paket (z. B. `--wp <paket>`).
4. **Abnahme:** Jede angekündigte neue ID steht in einer Datei, die das Paket selbst geändert hat.
5. **Gate je Bauabschnitt und Gesamttest:** ein Schritt, der alle Touren (alt und neu) in der echten Oberfläche durchklickt. Er legt je Schritt ein Foto ab und meldet je Fehlschlag `TOUR <tour> <nr> FEHLER <selector>`.

Jede Prüfskript-Änderung mit einem Testfall belegen, der gegen die alte Fassung rot und gegen die neue grün ist (references/watchdog.md §7).

## 3. Sammeldateien in Fragmente zerlegen
- **Jedes Paket schreibt eine eigene Fragment-Datei.** Das gilt, wenn Touren oder Handbuch in einer Sammeldatei liegen (eine JSON mit allen Touren, eine Wissensbasis).
  - Das Fundament-Paket baut ein Register, das alle Fragmente per Glob einliest, z. B. in Rust per `build.rs`, das sie einbettet.
  - Grund: An einer Sammeldatei kollidieren parallele Pakete bei jedem Merge.
- **Jedes Paket schreibt nur sein eigenes Fragment** und nennt es mit vollem Pfad in der Akzeptanz.
  - Per Skript zählen: „Pakete, die ein fremdes Fragment als Schreibziel nennen: 0“ (Lese-Verweise zählen nicht) und „ohne vollen Fragmentpfad: 0“.
  - Grund: Ein Zusatz-Schritt „im selben Fragment wie Paket X“ bringt die Kollision zurück. Bei einem bloßen Dateinamen rät der Worker den Ort.
- **Neue IDs je Paket in einem eigenen Bereich** (`H-<PAKET>-nnn`). Eine doppelte ID ist ein Prüffehler.
  - Grund: Die fortlaufenden Nummern sind belegt, und zwei Pakete würden sonst dieselbe nächste Nummer vergeben.
- **Bestehende Vollständigkeits-Tests auf alte und neue Einträge ausdehnen**, z. B. „jede Wissens-ID hat einen Tour-Schritt“.
- **Teile ohne Tour-Mechanik** (z. B. eine Handy-App ohne Tour-Markierungen) bekommen einen festgelegten eigenen Handbuch-Weg, nicht `keine`.
  - Jedes solche Paket bekommt einen Handbuch-Eintrag und einen Schritt in einer Desktop-Tour, die seine Seite erklärt.
  - Darf es den Fragment-Pfad der Tour nicht schreiben, übernimmt das sein Desktop-Gegenstück per Akzeptanzpunkt.
  - Beleg im Plan ist eine Zählung „Pakete ohne Schritt: 0“.
  - Grund: Einen Weg, den nur der Text vorgibt, speisen nur die wenigen Pakete, die ohnehin Tour-Pfade schreiben.

## 4. Doppelbau früh verhindern
- **Der Architekturplan bekommt einen Abschnitt „Zusammenspiel mit dem Bestand“.**
  - Ausgangspunkt sind alle Katalog-Einträge, die es in der App schon ganz oder teilweise gibt oder die als „erweitern“ markiert sind.
  - Je Eintrag steht dort eine Entscheidung: vorhandene Funktion behalten, erweitern, ersetzen oder zusammenführen, mit Grund und betroffenen Dateien.
- **Den Bestand aus dem Code nehmen, nicht aus dem Katalog.** Jede Zeile nennt echte Module und Dateien.
  - Grund: Planer übernehmen sonst Namen aus den Vorbildern oder aus dem eigenen Neubau. Dann steht ein Modul, das der Plan erst anlegt, als „vorhanden“ da, oder es tauchen Modi auf, die es nicht gibt. Unklar bleibt, was behalten oder ersetzt wird.
- **Auch Bestandsbereiche ohne Katalog-Treffer aufnehmen:** Integrationen, Sicherung, Selbst-Update, Hilfe und Diagnose, Einrichtung, Konten, Datenschutz. Jeder bekommt eine Entscheidung oder „unberührt, weil …“.
  - Grund: Gerade diese Bereiche doppeln neue Pakete still, etwa als zweite Sicherung oder zweite Diagnose.
- **Lernweg der Touren:**
  1. Im Code nachsehen, wo die Reihenfolge wirklich entsteht (Datendatei, Erste-Schritte-Modul, Leser). Die Anzeige-Komponente zeigt meist nur die gelieferte Folge.
  2. Dort den Einfügepunkt neuer Touren und einen Reihenfolge-Test festlegen.
  3. Die Sortier-Regel des Lesers ausschreiben: Sortierschlüssel, Platz der Bestandstouren und Präfix-Bereiche, getrennt für neue Touren und für Anhänge an Bestandstouren.
  4. Vorher per Skript zählen, welche Präfixe die Pakete schon verwenden.

  Der Reihenfolge-Test prüft genau diese Regel und lehnt nichts ab, was sie erlaubt. Grundlagen (Einstieg, Modelle, Freigaben) kommen vor den Funktionen, die darauf aufbauen.
- **Die Lernweg-Tabelle im Plan bekommt eine Spalte „Voraussetzung“.**
  - Im Produkt steht die Voraussetzung dort, wo der vorhandene Leser schon Text trägt, z. B. als erster Satz im Kopftext der Tour. Sie wird kein neues Feld im Datenvertrag.
  - Grund: Ein neues Vertragsfeld ändert die erzeugten Typen in allen Schichten. Ohne diese Festlegung verlangt der Plan ein Feld, das der Leser nicht kennt.
  - Zahlen wie die Anzahl der Bestandstouren aus der Tabelle zählen und an allen Stellen gleich schreiben.
- **Bestandstouren, deren Funktion sich ändert, in der Welle anpassen, in der die verändernde Funktion ankommt.** Das geschieht mit eigenem Paket oder Akzeptanzpunkt samt Tour-Id.
  - Grund: Pauschal im Fundament angepasst, beschreibt die Tour etwas, das es noch nicht gibt. Gar nicht angepasst, lernen Neulinge den alten Ablauf.

## 5. Vorhandene Zustimmungs- und Datenschutz-Schalter
- **Der Schalter wird im Plan zum einzigen Tor für jeden neuen Netzzugriff.** Das gilt, wenn die App einen Schalter für Netz oder Datenweitergabe hat, z. B. ein Offline-Versprechen mit dem Schalter „Apps und Internet“. Dazu gehören:
  - eine zentrale Prüfung als Fundament-Paket mit Test;
  - eine Regel in der Architektur und in jedem Worker-Brief;
  - in der Akzeptanz jedes Netz-Pakets ein Verweis auf diese Prüfung;
  - ohne Zustimmung ein Hinweis mit Weg zur Einstellung, aber kein Netzzugriff.

  Grund: Sonst baut jede neue Funktion ihren eigenen Netzweg (Kanäle, Browser, Websuche, Cloud-Modelle, Updates) und umgeht die Zusage an den Nutzer. Nachträglich muss man diese Netzwege in Hunderten Paketen suchen.
- **Ort des Tors:** in der untersten gemeinsamen Schicht, neben dem vorhandenen Schalter und auf ihm aufgebaut (ein Schalter, eine Quelle). Die Leitstand-Entscheidung nennt Modul und Abhängigkeitsrichtung ausdrücklich.
  - Grund: Ohne Ortsangabe landet das Tor im Hauptmodul des Neubaus. Tiefere neue Module (Kanäle, Browser, Medien) können es dann wegen eines Abhängigkeitszyklus nicht nutzen, und der Prüftest ist ab dem ersten Tag rot.
- **Der Prüftest „kein Netzzugriff am Tor vorbei“** durchsucht nur die neuen Pfade.
  - Er sucht echten Verbindungsaufbau (Client bauen, verbinden, Browser starten), nicht jede Erwähnung eines Typs.
  - Bestandscode bleibt außen vor, wenn er den Schalter schon prüft.
  - Ausnahmen stehen als Liste mit Grund im Test.
- **Den Netz-Baustein (Akzeptanzpunkt und Lese-Verweis) bekommen nur Pakete mit echtem Netzzugriff.**
  - Jedes davon bekommt einen Test mit ausgeschaltetem Schalter. Mit Oberfläche: „Hinweis mit Weg zur Einstellung“. Ohne Oberfläche: „Fehler ‚blockiert‘, kein Verbindungsversuch“.
  - Die Zahl der Netz-Pakete per Skript aus dem Plan zählen.
  - Grund: Pauschal an alle Pakete gehängt, sagt der Baustein nichts mehr. Ohne Schalter-aus-Test je Paket ist die Zusage nicht belegt.
- **Was als Netzzugriff zählt:** Produktcode (App, Kommandozeile, Bibliotheken), der ausgehende Verbindungen aufbaut.
  - Nicht dazu zählen nur lokale Arbeit, nur eingehendes Lauschen (etwa ein LAN-Dienst mit eigenem Schalter) und Werkzeuge außerhalb des Produkts (CI, Release). Das steht dann als ein Satz im Paket.
  - Grund: Ohne Regel markieren Planer nach Stichworten wie „Download“ oder „Medien“. Es entstehen Fehl- und fehlende Markierungen in beide Richtungen.
- **Schalter-aus-Tests schalten nie den globalen Schalter um.**
  - Das Tor bekommt eine Naht für einen eigenen Schalter, also einen Konstruktor für einen isolierten Schalter. Der Test-Helfer nimmt diesen.
  - Kennt eine Komponente nur das globale Tor, hält der Helfer für seine Lebensdauer eine prozessweite Test-Sperre. Alle Tests mit globalem Schalter nehmen diese Sperre.
  - Grund: `cargo test` lässt die Tests eines Test-Binärs parallel in Threads laufen, nur nextest trennt Prozesse. Ein umgeschalteter globaler Zustand macht lokale Läufe zufällig rot, während CI grün bleibt.
- **Die Naht genau festlegen:**
  - Das Tor besitzt seinen Schalter (geteilt, z. B. über `Arc`). So kann ein Helfer Schalter und Tor zusammen herausgeben; mit einer Leihgabe geht das nicht.
  - Es gibt genau eine Test-Sperre. Sie liegt in der untersten Schicht neben dem Schalter und übersteht einen abgestürzten Test (vergiftete Sperre weiterverwenden). Sie wird nie verschachtelt genommen.
  - Naht und Sperre stehen nur hinter `cfg(test)` oder einem Test-Feature, das nur Dev-Abhängigkeiten aktivieren. Ein Quelltext-Test prüft, dass kein Produkt-Crate das Feature einschaltet.
  - Bausteine derselben Schicht, die den Test-Helfer wegen eines Zyklus nicht nutzen können, bekommen eine Variante mit übergebenem Tor.
- **Der Brief-Generator bindet den Architektur-Abschnitt zum Tor automatisch ein.** Das geschieht, wenn das Schlüsselwort des Abschnitts im Lese-Verweis oder in der Akzeptanz des Pakets steht.
  - Er nimmt die erste `## `-Überschrift mit dem Wort und kürzt auf höchstens 40 Zeilen.
  - Solange der Abschnitt im Integrationsstand fehlt, setzt er eine kurze Ersatzregel ein.
  - Folge: Das Schlüsselwort nur bei betroffenen Paketen verwenden und den Abschnitt allein verständlich und kurz halten.
  - Zusätzlich gehört die Regel als eine Zeile in die gemeinsame Regeldatei aller Worker.

## 6. Handprüfung am Architektur-Gate und Korrekturrunde
Das Prüfskript des Gates prüft nur die Form. Die Handpunkte (§4 und §5) gibt der Leitstand an einen unabhängigen Nur-Lese-Prüfer, der den echten Code liest. Grund: Die Plan-Prüfer im Lauf sehen den Plan, nicht den Bestand, und übersehen genau diese Punkte.

1. **Auftrag an den Prüfer:**
   - Arbeitsordner und Plan-Dokumente mit Abschnitt und Zeile.
   - Den Bestand im Code abgleichen.
   - Stichprobe von 10 bis 15 Paketen mit Oberfläche, mit festem Zufallsstartwert: Haben sie Handbuch-Eintrag und Tour-Schritt? Steht „keine“ nur bei Paketen ohne Oberfläche?
   - Antwort höchstens 40 Zeilen. Die erste Zeile lautet genau `<GATE>-HANDPRÜFUNG: ok|Mängel`.
   - Höchstens 10 Mängel, je mit Datei:Zeile, Warum und Vorschlag, geordnet nach blockierend und nicht blockierend.
   - Am Ende ein Satz, wie die Stichprobe gezogen wurde.
2. **Bei blockierenden Mängeln kein Merge.** Die Korrekturrunde läuft in derselben Spur, wenn ihr Kontext klein ist, weil sie ihre Werkzeuge kennt. Sonst läuft sie in einer frischen Spur. Die Spur bekommt:
   - die Befunde als Datei im Spur-Ordner (die Prüfer-Ausgabe ohne Markerzeilen des Kontext-Proxys);
   - einen Brief mit den verbindlichen Leitstand-Entscheidungen, die auch ins Entscheidungs-Log kommen. Führt eine Entscheidung ein neues gemeinsames Bauteil ein, nennt sie dessen Ort und Abhängigkeitsrichtung (§5);
   - eine neue Queue-Zeile;
   - den Auftrag für eine Antwortdatei mit einer Zeile je Befund. Die Zeile nennt die Änderung mit Datei:Zeile oder den Grund, warum nichts geändert wurde. Dazu kommt die Paketzahl vorher und nachher je Welle.

   Zahlen in der Antwort (Paketanzahl, Zählungen „ohne X: 0“) lässt die Spur per Skript aus dem Plan zählen. Grund: Handzahlen weichen zwischen den Abschnitten ab, und die Nachprüfung findet den Widerspruch. Nicht blockierende Mängel gleich mitbeheben lassen, solange die nächste Welle noch nicht läuft.
3. **Eine fertige Spur wieder öffnen:**
   1. Zuerst das Fertig-Signal (z. B. `DONE`) wegschieben.
   2. Stop-Marker und Zustandsdatei des Watchdogs löschen. Dann den Watchdog-Timer mit demselben `systemd-run` neu anlegen wie beim Spurstart.
   3. Die Spur anstoßen und die Aufsicht neu starten.

   Grund: Watchdog und Aufsicht melden FERTIG, solange das Signal da ist. Ein transienter Timer, der sich bei FERTIG selbst stoppt, verschwindet samt Unit, und `systemctl start` meldet dann „Unit … not found“.
4. **Danach das Gate-Skript erneut laufen und nachprüfen lassen**, beides parallel. Der Prüfer startet die Plan-Werkzeuge dann nicht selbst, weil sie dieselben Ausgaben schreiben. Er zählt mit eigenen Einzeilern. Eingaben sind die Befund- und die Antwortdatei und der Diff seit dem Stand vor der Korrektur. Die erste Zeile lautet `<GATE>-NACHPRÜFUNG: ok|Mängel`.
   - Der Prüfer ordnet jeden alten Befund als erledigt, teilweise oder offen ein.
   - Er sucht neue Fehler, die die Korrektur selbst eingeführt hat, etwa Abhängigkeitszyklen, pauschal verteilte Bausteine oder widersprüchliche Zahlen.
   - Er zählt die Behauptungen der Antwort nach.
   - Für jede Markierung (z. B. Netz) zieht er zwei Stichproben mit festem Startwert: markierte Pakete (wirklich betroffen?) und unmarkierte, deren Text nach dem Merkmal klingt (fehlt die Markierung?).

   Teilweise erledigte und neue blockierende Befunde gehen in die nächste Runde, mit eigener Befunddatei, eigenem Brief und eigener Queue-Zeile.

   Auch eine Nachprüfung mit `ok` löst eine letzte Runde aus, wenn ihre nicht blockierenden Punkte Pakete der ersten Welle betreffen. Grund: Deren Worker-Aufträge entstehen nach dem Merge aus dem Plan, und ein Fehler dort zieht sich in alle späteren Pakete.

   Höchstens 3 Runden. Nach der letzten Runde prüft der Leitstand selbst: Er zählt die Belege der Antwort per Skript nach und lässt einen schmalen Prüfer nur über den Diff dieser Runde laufen (die offenen Punkte und neu eingeführte Fehler). Was dann noch offen ist, entscheidet er selbst.
5. **Restbefunde nach der letzten Runde, die einzelne Pakete betreffen, kommen in eine Paket-Vorgabe.** Der Leitstand schreibt sie in eine Datei je Paket (z. B. `vorgaben/<PAKET>.md` mit Quelle, Regel und Grund), nicht in den Plan.
   - Der Brief-Generator bindet sie vor der Akzeptanz als eigenen Abschnitt „Vorgaben des Leitstands (gehen dem Plan vor)“ ein.
   - Enthält die Vorgabe das Schlüsselwort eines Pflicht-Abschnitts (z. B. Netz), kommt auch dieser Abschnitt in den Brief.
   - Ist der Brief schon geschrieben, ihn neu erzeugen.
   - Die Entscheidung je Befund steht im Entscheidungs-Log, auch wenn sie „bleibt so, weil …“ lautet. Bei Markierungen gilt: lieber eine zu viel als eine Lücke.
   - Den Generator-Test um zwei Fälle erweitern: mit Vorgabe ist der Abschnitt da, ohne Vorgabe fehlt er. Der Test muss gegen die alte Fassung rot sein.
   - Grund: Eine vierte Plan-Runde kostet eine Spur-Runde samt Nachprüfung. Eine Notiz nur im Entscheidungs-Log erreicht den Worker nicht.

## 7. Gesamtheitsprüfung vor dem Abschluss
- Eigenes Gate nach dem letzten Bauabschnitt, vor Nachanalyse und Abschluss.
- Zwei Nur-Lese-Prüfer aus verschiedenen Modellfamilien, damit nicht beide dieselben blinden Flecken haben:
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
- Höchstens 3 Runden (Befund → Nachbesserung → Nachprüfung).
- Das Ergebnis steht als Bericht im Repo (z. B. `docs/<lauf>/GESAMTPRUEFUNG.md`). Erst damit ist das Gate erfüllt.

## 8. Nachziehen und melden
- **Im selben Turn ändern:** Plan (Definition of Done, Phasen, Schritte), Briefe und Vorlagen, Leitstand-Regeln, Entscheidungs-Log und Statusseite.
- **Auf der Statusseite nur Belegtes behaupten.** Eine Änderung, deren Test noch läuft, als „sobald der Test grün ist“ schreiben und nach dem Ergebnis nachziehen.
  - Grund: Der Nutzer liest die Seite als Tatsachenstand.
- **Dem Nutzer in Alltagssprache melden**, an welchen Stellen geprüft wird und dass er nichts tun muss.
  - Mängel einer Gate-Prüfung so erklären, dass ihre Folge für ihn sichtbar wird, z. B. „neue Funktionen könnten ohne Zustimmung ins Netz gehen“.

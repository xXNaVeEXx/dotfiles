---
name: parity-gap-audit
description: Feature-Paritäts-Audit der eigenen App gegen Open-Source- oder Closed-Source-Vorbilder per Researcher-Sub-Agents — Stand-Größe messen und flach klonen, Doku über llms.txt spiegeln und je Researcher als abzuhakende Quellenliste vorgeben, Gliederung des Vorbilds übernehmen, Researcher-Paare mit verschiedenen Sichten, strukturierte Briefs (Funktionsinventar, Abgleich gegen LC/LX-Doku, priorisierte Lückenliste, Top-5), Konsolidierung als GAP-ANALYSE-Doku-Commit. Use when geprüft werden soll, ob die eigene Software alle Funktionen von Vorbildprojekten oder -produkten (z. B. pi, DeepSeek Harness, T3 Code, OpenClaw, Hermes, Grok Bot) abbildet, ein neuer Bereich die volle Funktionsabdeckung mehrerer Vorbilder bekommen soll oder ein Folge-Audit nach größerem Ausbau ansteht.
---

# Feature-Paritäts-Audit eigener Software gegen Open-Source-Vorbilder

Klasse: Prüfen, ob die eigene App die Funktionen eines oder mehrerer Open-Source-Vorbildprojekte
vollständig abbildet — als Erst-Audit („welche Features brauchen wir") oder als Zweit-Runde nach
größerem Ausbau („was fehlt jetzt noch"). Kernidee: Je Vorbild EIN Researcher-Sub-Agent mit
strukturiertem Brief; der Orchestrator konsolidiert nur.

## Procedure
1. **Vorbilder lokal bereitlegen:** Je Projekt einen flachen Klon (spart Platte/RAM):
   `git clone --depth 1 --branch <tag> https://github.com/<org>/<repo> .tmp/vorbilder/<kurzname>`.
   Vorher die Größe des STANDS messen, nicht die des Repos: `curl -s https://api.github.com/repos/<o>/<r> | jq .size`
   (KB) zählt die ganze Historie. Was ein flacher Klon wirklich lädt, zeigt die Blob-Summe des Tags:
   `curl -s 'https://api.github.com/repos/<o>/<r>/git/trees/<tag>?recursive=1' | jq '([.tree[]|select(.type=="blob")|.size]|add), .truncated'`
   (`.truncated` muss false sein). Grund: Große Projekte haben oft viele GB Historie, aber einen Stand unter 1 GB; der
   flache Klon reicht dann. Den Tag (letzter stabiler Release) festlegen und in jeden Brief schreiben, damit alle
   Researcher denselben Stand prüfen. Ist auch der Stand zu groß: `--filter=blob:none --sparse`, danach
   `git sparse-checkout set <ordner…>` je Teilsystem. Grund: Ein Blob-Filter ohne Sparse-Checkout spart nichts, weil
   der Checkout alle fehlenden Blobs des Stands nachlädt.
   Vorher `free -m` prüfen; Klone sind RAM-neutral, Analyse-LLMs nicht (RAM-Regeln des Rechners gelten).
   Folge-Audit: die alten Klone liegen lassen und frisch daneben klonen (eigener Ordner mit Datum). Dann
   `diff -rq --exclude=.git <alt> <neu> | wc -l` je Vorbild. So weiß jeder Researcher, was seit dem letzten Audit
   dazukam, und Abschnitt G (siehe 3) wird belegbar. Umfang je Paket messen
   (`find <pkg>/src -name '*.ts' | xargs cat | wc -l`), um den Schnitt in Schritt 3 festzulegen.
   **Doku als Quellenliste:** Hat das Vorbild eine Doku-Seite, deren `llms.txt` holen (`<doku-basis>/llms.txt` listet
   alle Seiten mit Abschnitten). Viele Doku-Seiten liefern jede Seite auch als Markdown (URL + `.md`); einmal probieren.
   Die URLs je Researcher-Schnitt in `QUELLEN-<KÜRZEL>.txt` schreiben (eine URL je Zeile). Der Brief verlangt einen
   Abschnitt „Quellen-Abdeckung“, der jede Zeile abhakt (gelesen / nicht relevant + Grund). Grund: Ohne Liste lesen
   Researcher die Übersichtsseiten und übersehen Unterseiten; mit Liste ist die Abdeckung per Skript zählbar.
   Quellenlisten per Skript erzeugen (Doku-Seiten aus llms.txt, Code als Ordner und Dateifamilien, Doku-Kacheln A und
   Code-Kacheln B getrennt, Kacheln nach Umfang teilen) und vor der Vergabe jede Zeile gegen den Baum zählen. Grund:
   Eine Zeile mit 0 Treffern ist ein Fehler im Generator (z. B. falscher Trenner in Familienmustern), kein leerer Bereich,
   und der Researcher hakt sie sonst als „nicht relevant“ ab.
   **Gliederung des Vorbilds übernehmen:** Im Klon nach eigenen Vollständigkeits-Checklisten je Teilsystem suchen
   (`find <klon> -ipath '*completeness*' -o -iname '*checklist*' -o -iname 'taxonomy*'`) und die Abschnitte der
   `llms.txt` mit Seitenzahl auszählen. Die Researcher-Schnitte daran ausrichten; jeder bekommt seine Checklisten-Dateien
   als Pflicht-Prüfliste. Grund: Ein selbst erfundener Schnitt übersieht Teilsysteme, die man vom Vorbild nicht kennt.
   **Closed-Source-Vorbild** (Produkt ohne Code): Researcher A liest alle offiziellen Doku-Seiten der Quellenliste,
   Researcher B die Außensicht (Ankündigungen, Changelogs, Tests/Reviews, quelloffene Nachbauten auf GitHub). Belege als
   `D:<url>`. Nur Verhalten übernehmen, keinen Code (Lizenz); was nur Nachbauten zeigen, als „unbestätigt“ markieren.
   Außensicht-Quellen vorab sammeln: `web_search` mit 3–4 Abfragen je Aufruf und verschiedenen Winkeln (Launch-Post +
   News des Herstellers, Guide-/Playbook-Index, einzelne Doku-Themen wie Secrets/Routinen, Partner-Supportseiten,
   Hands-on-Reviews, Vergleiche mit den anderen Vorbildern, YouTube „what's new“ + Transkript-Seiten), `numResults` 10.
   Die Treffer nach Gruppen (offiziell · Presse · Anleitungen · Reviews · Vergleiche · Video) in eine URL-Datei mit
   `#`-Kommentaren schreiben, dann den Abruf als Hintergrundlauf in Textdateien; Fehlschläge einzeln per
   `fetch_content` nachholen. Grund: Eine einzige Suchabfrage liefert fast nur die Herstellerseite; Changelog-Details
   und Schwächen stehen in Reviews und Video-Transkripten.
2. **Vergleichsbasis benennen:** Die EIGENE Funktions-/Integrations-Doku mit stabilen IDs
   (z. B. FEATURES.md mit LC-Nummern, INTEGRATION_TODO.md mit LX-Nummern). Absolute Pfade in den Brief.
3. **Je Vorbild einen Analyse-Delegate** (async, 45–60 min Timeout, große Code-Kacheln bis ~150 min), Brief self-contained.
   Rolle: researcher für Berichte, die in einem Zug per Heredoc entstehen; worker mit der Regel „nur die eigene
   Berichtsdatei schreiben, kein git/Build/Netz“ für große Inventare, die inkrementell wachsen und nachgearbeitet werden.
   Grund: researcher hat kein write/edit, und Nacharbeit wie Abschnitte ergänzen oder `[~]`→`[x]` braucht edit.
   Brief-Inhalt:
   - Repo-Pfad (lokal geklont) + 1 Satz Architektur-Kontext
   - Vergleichsbasis-Pfade der eigenen App + Hinweis auf Symbole (✅ umgesetzt / ➖ bewusst nicht)
   - Geforderte Report-Struktur: A) Funktionsinventar (je 1 Zeile) · B) abgedeckt mit ID-Verweis ·
     C) **LÜCKEN mit Priorität hoch/mittel/niedrig + 1 Satz Begründung** (Kernergebnis!) ·
     D) bewusst nicht umgesetzt (stichpunktartig, trägt der Grund noch?) · E) Top-5-Empfehlungen ·
     beim Folge-Audit zusätzlich F) teilweise/abweichend umgesetzt · G) neu im Vorbild seit dem letzten Audit.
     Lücken mit fester Nummer `<KÜRZEL>-C1…`, damit die Konsolidierung darauf verweisen kann.
   - Regel: nur Belegbares, keine Spekulation; Sprache des Nutzers (hier Deutsch); Belege als `V:<pfad>` (Vorbild)
     und `L:<pfad>` (eigene App).
   - Große Monorepos (mehrere 100k Zeilen) nach Teilsystemen schneiden: EIN Researcher je Teilsystem (z. B. Kern-CLI,
     Modell-/Agent-Pakete, Server+Web, Mobil+Fernzugriff, Laufzeit, UI). Gemeinsames (Ziel, Überblick über die eigene
     App, Regeln, Berichtsformat) in EINE Datei `COMMON-AUDIT.md`. Je Researcher ein kurzer Brief: Kürzel,
     Berichtspfad, Vorbild-Pfade, Abgrenzung zu den anderen Kürzeln, Gegenstücke der eigenen App, nummerierte Prüfliste.
     Grund: Ein Researcher für ein ganzes Monorepo schafft im Zeitlimit nur die Oberfläche.
   - Soll ein Bereich die volle Funktionsabdeckung eines Vorbilds bekommen, je Vorbild bzw. Teilsystem ZWEI Researcher
     parallel mit verschiedenen Sichten statt einem: A = Doku-Sicht (Quellenliste vollständig), B = Code-Sicht
     (Quellbaum, Tests, Konfig-Schemata, CLI-Hilfe, Changelog). Die beiden auf verschiedene Modelle legen (ein teures,
     ein günstiges), auch wegen der Konto-Grenze für teure Worker. Die Konsolidierung vereinigt A und B je Funktion; was
     nur einer fand, bekommt eine Gegenprobe im Vorbild. Die Vertiefung (Schritt 4) gilt für flache Berichte zusätzlich.
   - Zeitregel in den Brief: „ab Minute 50 von 70 schreiben“. Den Bericht schreibt der Delegate selbst (researcher per
     cat-Heredoc, worker inkrementell per write/edit) in die Berichtsdatei und prüft danach mit `grep -c '^## '` die Zahl der Abschnitte. Die Antwort
     bleibt eine Kurzfassung von ≤ 12 Zeilen. Grund: Das harte Limit beendet ihn sonst ohne Bericht, und die
     `.out`-Datei enthält Plauderzeilen.
   - Tiefe ausdrücklich verlangen: jeden Prüfpunkt im Vorbild-Quellcode nachsehen, das eigene Gegenstück per `rg`
     suchen, die Suchorte in der Lückentabelle nennen, das Zeitbudget ausschöpfen. Grund: Ohne diesen Absatz liefern
     Researcher schon nach wenigen Minuten einen Bericht, der nur die Oberfläche abdeckt.
4. **Ergebnisse einsammeln** (Benachrichtigungen kommen automatisch, nicht pollen):
   - Je Bericht Laufzeit und Werkzeugaufrufe prüfen (`grep -c '^\[tool\]' /tmp/acp-delegate/<runId>.activity`).
     Blieb ein Researcher weit unter dem Zeitbudget, bekommt sein Teilsystem eine Vertiefung (siehe unten).
   - **Abnahme vor dem Commit**, auch wenn der Format-Checker OK meldet: (a) Teil-Quellen zählen
     (`grep -c '\[~\]'` in der Quellen-Abdeckung) – jede `[~]` bei einer Code-Sicht ist ein Nacharbeitsgrund;
     (b) Funktionszahl gegen Quellgröße halten (`wc -l` je Paket/Crate; als Faustwert grob ≥ 1 Eintrag je 1–2k Zeilen
     Nutzercode) – Sammel-Einträge über ganze Ordner sind zu grob; (c) 3 Einträge per
     `awk -v id="### <ID>" 'index($0,id)==1{p=1;print;next} p&&/^###? /{exit} p'` herausziehen und Konstanten/Pfade
     per `grep -n` im Vorbild gegenprüfen (Inhalt zählt; ±1 Zeile oder Nachbardatei im selben Ordner akzeptieren).
     Nacharbeit per `resumeFrom` desselben Laufs mit konkreter Liste (welche Quellen/Ordner, neue IDs ab letzter + 1,
     `[~]`→`[x]`, Checker bis OK). Riesige Ordner (Hunderte Dateien) über Register/Schemas/Exporte nach Methodengruppen
     erschließen lassen statt zeilenweise. Grund: Der Checker prüft nur Form und Abdeckungs-Haken; erst Zählung und
     Stichprobe zeigen, ob die Detailtiefe reicht, und die Nacharbeit verdoppelt typisch die Eintragszahl.
     Für die Zählung (b) die Sammel-Einträge finden: je Quelle Zeilen und Treffer im Bericht nebeneinander
     (`n=$(find <quelle> -name '*.ts' ! -name '*.test.ts' | xargs cat | wc -l); k=$(grep -c "<quelle>" <bericht>)`,
     sortiert nach n) – große Quellen mit wenigen Treffern gehören namentlich mit Zielzahl in die Nacharbeit.
     Ist eine Quelle ein Glob über viele Dateien (`cli*`, `kanban*`), zusätzlich je Datei zählen und die großen
     Dateien ohne einen einzigen Treffer listen (`for f in <quelle>; do n=$(wc -l <$f); k=$(grep -c "${f#*/<repo>/}"
     <bericht>); [ $n -ge 500 ] && [ $k -eq 0 ] && echo "$n $f"; done | sort -rn`); diese Liste geht wörtlich in die
     Nacharbeit. Grund: Die Summe je Glob sieht mit ein paar Treffern gedeckt aus, obwohl ganze Dateien mit
     Tausenden Zeilen fehlen.
     Springt die Eintragszahl nach einer Nacharbeit um ein Vielfaches (z. B. von 27 auf 750), Stichproben aus
     verschiedenen Bereichen ziehen (`grep '^### <ID>-F' <bericht> | awk 'NR%60==30'`) und nach Füllfeldern suchen
     (`grep -c 'Modul-Gruppe\|Top-Level-…-Modul\|ohne eigene Hilfebeschreibung'`, Grenzen wie „Z34: 2“, Belege nur
     auf Typ-Exporte). Gefunden: Fassung sichern und die zweite Nacharbeit auf Qualität legen (Handler lesen, Befehle
     mit Optionen/Defaults/Fehlertexten von Hand, reine Interna auf eine Zeile „intern – Zweck, gehört zu F<nnn>“
     kürzen, IDs behalten, Skripte nur zum Finden). Grund: Ein Worker, der auf eine Zielzahl gedrängt wird, erzeugt die
     Einträge sonst per Skript aus Registrierungen; Checker und Zählung melden dann OK ohne Inhalt.
     Selbst gesetzte Grenzen des Workers (z. B. „8 erlaubte rg-Suchen“) im Nacharbeits-Task ausdrücklich aufheben.
     Grund: Sonst bleiben die Lumi-Abgleiche „(Annahme)“, obwohl nichts sie begrenzt.
     Endet ein Lauf nach wenigen Minuten und wenigen Werkzeugaufrufen ohne Bericht oder ohne neuen Inhalt, steht am
     Ende der `.out` meist eine abgelehnte Kontext-Faltung (compress). Dann per `resumeFrom` fortsetzen mit: erst
     Zwischenstand schreiben, compress erst ab hoher Kontextlast, nur mit den gelisteten Bereichen, Zusammenfassungen
     klein, compress nie als einzigen Aufruf eines Schritts. Grund: Nach der Ablehnung endet der Turn des Workers, und
     der Lauf meldet trotzdem exit 0.
     Höchstens zwei Nacharbeiten je Bericht; bleiben danach Stellen flach (z. B. Belege nur `Datei:1`), abnehmen und
     die Stellen als Schwäche für die Konsolidierung notieren. Grund: Eine dritte Runde kostet mehr als gezieltes
     Nachlesen beim Zusammenführen. Ausnahme: Ist nach zwei Nacharbeiten ein großer Teil noch Skript-Füllung, den
     Zwischenstand committen und einen FRISCHEN Worker (kein resume) mit eigenständigem Kurzbrief nur für die
     Qualität des Restbereichs starten (Ursprungsauftrag als Regelquelle, ID-Bereich, Muster der Füllfelder mit
     grep-Zähler als Endbedingung = 0, Blöcke von ~25 Einträgen sofort schreiben). Grund: Ein resume schleppt den
     vollen Verlauf mit, der frische Worker schafft den Restbereich in einem Lauf.
     **Fortsetzer statt resume bei „ERGEBNIS: teilweise“ (Kontextgrenze):** Ein Worker, der nur einen Teil der Quellen
     schafft, wird NICHT per `resumeFrom` fortgesetzt (der geerbte Verlauf lässt ihn nur 1–2 Quellen schaffen, und die
     Sitzungsdatei des alten Laufs kann in `/tmp/acp-delegate` fehlen), sondern durch einen frischen Worker: Bericht als
     `.bak` sichern, Task = „Lies AUFTRAG-<ID>.md; der Bericht existiert teilweise – NICHT ganz lesen: offene Quellen
     liefert `bericht-check.py <ID>`, Gliederung und letzte IDs per `grep -n '^#'`, zum Einfügen nur die betroffenen
     Stellen mit offset/limit; ab der ersten offenen Quelle weiter, höchstens 20 Quellen, dann ERGEBNIS: teilweise
     (Quellen x/y) oder fertig“. Zusätzlich im selben Task alle vom Check gefundenen Mängel nennen (Belege jenseits
     Dateiende, `:1`-Belege, F-IDs ohne B-Zeile, `[~]`), große Dateien nur in Teilen ≤400 Zeilen. Grund: Jeder Aufruf
     bezahlt den ganzen bisherigen Verlauf erneut, die Kosten eines Laufs wachsen also quadratisch mit seiner Länge;
     kurze frische Läufe mit Quellenobergrenze sind billiger und enden nicht an der Kontextgrenze. Lange Quellenlisten
     (> ~40) von Anfang an auf mehrere Läufe mit dieser Obergrenze verteilen und in jedem Lauf B–H für die bisherigen
     F konsistent nachziehen lassen, damit jeder Zwischenstand abnehmbar ist. Die Obergrenze nach Zeilen statt nur nach Anzahl setzen: Eine einzelne
     Riesendatei (> ~10k Zeilen) frisst das ganze Laufbudget (ein Worker schaffte mit einer 18k-Zeilen-Datei nur 10 von 47
     Quellen). Solche Dateien im Auftrag als eigenen Lauf oder ganz am Ende der Liste vergeben. Läuft die Sitzung des
     Orchestrators selbst in einen Plattenfehler (ENOSPC in /tmp), sterben die Worker mit; danach je Bericht
     `bericht-check` ausführen, fehlende B-Zeilen im Fortsetzer zuerst nachziehen lassen und frisch ohne `resumeFrom` starten.
     Bei Läufen mit großem Quellvolumen schon im Erst-Prompt und in jedem Resume schreiben: „compress NICHT verwenden
     (höchstens >85 % Kontext), stattdessen nach 3–5 Quellen in den Bericht schreiben“. Grund: Kleine Zusammenfassungen
     unter dem Mindestmaß werden abgelehnt und beenden den Turn; ohne compress gibt es diesen Abbruch nicht.
     Verlangt der Auftrag Abschnitte B–G von Hand: „nicht per Generator-Skript aus Themen-Tabelle“ und „C–H nicht in
     einem Rutsch ohne Rücklesen“ ausdrücklich verbieten und in der Abnahme dieselbe Notiz mehrfach zählen
     (`grep -o '<notiz>' | sort | uniq -c | sort -rn | head`); mehr als ~3 Wiederholungen = Generator. Nach einem
     Session-Neustart des Workers (Resume) fehlen manchmal Berichtsteile auf der Platte, obwohl Edits Erfolg meldeten:
     im Resume-Prompt verlangen, Berichtsstand per `grep -c '^### '` zu prüfen und nach jedem Schreibschritt zu verifizieren.
     Dasselbe gilt, wenn ein resume sofort wieder an der compress-Ablehnung stoppt (wenige Tools, kein neuer Inhalt)
     oder Skript-Füllung liefert: Berichtsdatei im Baum sichern (`.bak`), nichts committen, frischen Worker mit
     Kurzbrief starten (Berichtsdatei als Basis, zu ersetzende ID-Bereiche, Endbedingung = grep der Floskel ergibt 0,
     0 `[~]`, bericht-check OK, neue IDs/Lücken ab letzter Nummer + 1). Grund: Der Verlauf des gescheiterten Laufs
     enthält den Ablehnungs-Zustand; ein frischer Kontext umgeht ihn.
     Diese Abnahme-Erfahrungen gleich in die Erst-Prompts späterer Läufe schreiben (Bestandsdatei nutzen, keine
     Suchgrenze, am Ende kein `[~]`, Einträge von Hand, Interna als Einzeiler, vorab Zeilen je Quelle zählen und jede
     Datei ≥ 500 Zeilen lesen, bei vielen Kleinquellen je Quelle Auth/Env/Katalog/Limits statt nur Manifest). Grund:
     Das spart die typische erste Nacharbeit; mit diesem Prompt bestand ein Lauf die Abnahme ohne Nacharbeit.
     Die Schlussmeldung des Workers auf Selbstauskünfte lesen („nur Docstrings“, „nicht jede Datei gelesen“,
     „per Skript erzeugt“, „teilweise“, „zu grob“): Solche Sätze sind direkter Nacharbeitsgrund, auch wenn der
     Checker OK meldet. Grund: Worker gestehen Lücken oft ehrlich im Text, während Form-Checker und Zählung sie nicht sehen.
     Läuft ein glm-Worker 30–40 min stumm (Bericht wächst nicht), liegt es meist an vielen parallelen read-Aufrufen:
     `acp_delegate_cancel`, dann `resumeFrom` mit „Quellen EINZELN lesen, nach je 2–3 sofort in den Bericht schreiben“.
     Bei der Dateiprüfung Testhilfen ausschließen (`! -name '*.test.*' ! -name '*test-utils*' ! -name '*.d.ts'`) und
     per Dateiname (`basename`) statt Pfad im Bericht suchen, weil Berichte Pfade oft als `{a,b}-x.ts` bündeln.
     Drei billige Skript-Prüfungen gehören vor die Stichproben: (1) Zeilenbelege `V:<pfad>:<a>-<b>` gegen die echte
     Dateilänge halten (Beleg jenseits des Dateiendes = erfunden oder verrutscht) und `:1`-Einzelbelege zählen;
     (2) `bericht-check` ausgeben lassen und die C-Zählung ansehen – steht dort `C hoch 0/mittel 0/niedrig 0` trotz „OK“,
     hat der Worker die Lücken in einem anderen Format (Liste statt `### <ID>-C### [prio]`) geschrieben, die G-Szenarien
     hängen dann an nichts; das ist Nacharbeit, kein Commit. Grund: Der Checker meldet OK, wenn nur die Form erfüllt ist,
     und Worker, die Abschnitte B–H am Ende per Skript „reparieren“, verschieben dabei Zeilenbelege.
     (3) Doppelte IDs je Abschnitt zählen: F-Zeilen `^| <ID>-F<n> ` im ganzen Bericht, Lücken-Überschriften
     `^### <ID>-C<n>` nur zwischen `## C` und `## D`
     (`awk '/^## C /{c=1} /^## D /{c=0} c && /^### /' <bericht> | grep -o '^### [^ ]*' | sort | uniq -d`).
     Grund: Ein Fortsetzer, der aus der Datei weiterarbeitet, hängt schon geschriebene Blöcke manchmal erneut an, und
     der Check zählt sie mit; Abschnitt G wiederholt die C-IDs absichtlich als Überschriften, eine Zählung über den
     ganzen Bericht meldet dort Fehlalarm. Zeigt `git status` einen schon committeten Bericht als geändert, ist das oft
     eine Bereinigung nach dem Commit, die nie committet wurde: ID-Zahlen von `git show HEAD:<pfad>` und Arbeitskopie
     vergleichen, Check auf der Arbeitskopie, dann die Datei einzeln committen. Vor der Konsolidierung dieselbe
     Zählung über alle Berichte fahren, weil doppelte IDs sonst als zwei Funktionen in den Katalog gehen.
     Einzelne Belege knapp jenseits des Dateiendes (höchstens ~3, Ende nur um wenige Zeilen drüber) selbst auf die echte
     Zeilenzahl kürzen (`sed -i 's#<pfad>:<a>-<b>#<pfad>:<a>-<wc -l>#'`, danach Beleg-Skript erneut) statt einen Worker zu
     starten. Grund: Der Eintragsinhalt stimmt, nur das Ende ist verrutscht; ein Lauf kostet mehr als der Fix.
     Reine Formmängel bei sonst fertigem Bericht (z. B. 10–30 Belege nur auf `:1`, einzelne `[~]`) als eigener kurzer
     Mängel-Worker beheben, nicht per resume und nicht selbst: Bericht als `.bak` sichern, Task = die betroffenen
     Berichtszeilen (aus `grep -nE 'V:[^ ,;)]+:1([^0-9-]|$)' <Bericht>`) plus die Regel „per `grep -n` auf das beschriebene
     Symbol suchen, `V:<pfad>:<von>-<bis>` eintragen, passt der Inhalt nicht zur Datei, den Eintrag aus der Quelle
     korrigieren“; Endbedingung = 0 Treffer der grep-Regel, Beleg-Skript ohne BAD, bericht-check OK, Timeout 90 min.
     Grund: Der Eintragsinhalt ist fertig, nur die Fundstellen fehlen; ein Kurzlauf kostet einen Bruchteil einer Nacharbeit.
     Ein Worker, dessen `.activity` seit Längerem still ist, dessen Prozess aber 100 % CPU mit wachsendem RSS zeigt
     (`ps -o pid,etime,pcpu,rss -p <pid>`), hängt im Prozess und nicht im Modell: `acp_delegate_cancel`, nach 2 min
     `kill -9 <pid>`, KEIN resume (es erbte den Hänger), sondern frischer Worker mit dem vorhandenen Bericht als Basis.
     **Katalog-Konsolidierung (Teile je Bereich in eine gemeinsame YAML):** Teil n erst starten, wenn Teil n-1 per
     Abnahmeskript (Prüfskript `check` Exit 0, Stichproben, Commit, Queue „fertig“) abgenommen ist, weil alle Teile
     dieselbe Datei erweitern. Im Task verbieten, die YAML per `yaml.dump` komplett neu zu schreiben (nur anhängen oder
     gezielt ändern), da das riesige Diffs erzeugt und Umformatierungen mitcommittet. Die Modellwahl erst beim Start
     treffen und in die Modellspalte der Queue schreiben; Style-Meldungen des Editors zu YAML (Zeilenlänge, Tippfehler)
     ignorieren, maßgeblich ist das Prüfskript. Endet ein Worker ohne Schlusszeile und seine `.activity` bleibt still,
     zuerst die YAML mit `python3 -c 'import yaml,sys;yaml.safe_load(open(sys.argv[1]))' <datei>` prüfen: Typische
     Ursache sind unmaskierte `"` innerhalb doppelt gequoteter Strings (deutsche Zitate stattdessen „…“ mit
     Schlusszeichen “). Selbst reparieren, `check` laufen lassen und die gemeldeten unzugeordneten F-IDs einem frischen
     Fortsetzer-Worker (ohne resumeFrom) als Liste geben. Vorher den stillen Worker mit `acp_delegate_cancel <runId>`
     beenden und prüfen, dass die Zahl der Projekt-`pi` im RAM-Tor sinkt: Ein „toter“ Worker kann als Prozess weiterlaufen
     und einen Platz belegen (dann `ps`/cwd prüfen, nur den eigenen Worker per `kill` beenden). Zählt das RAM-Tor alle `pi`-Prozesse mit cwd im Projekt,
     zählen Orchestrator-Sitzung und fremde Sitzungen mit (ein Worker weniger nutzbar): freie Plätze erst nach dem
     Ende eines Workers belegen, nichts Fremdes beenden. Beim Wechsel in diese Phase den Herzschlag auf die Queue der neuen
     Phase umstellen (siehe subagent-orchestration).
   - Sektionen C/E lesen. Jede hoch-Lücke selbst im eigenen Code bestätigen (`rg`, Zeilen lesen) und in der
     Konsolidierung als „im Code bestätigt“ kennzeichnen. Bewusste Architekturentscheide (anderer Standard, anderes
     Konzept) als fehlenden Hinweis einordnen, nicht als Kernlücke.
   - Lücken per Skript zählen: in Abschnitt C die Zeilen `| <KÜRZEL>-C<n>`; Priorität = erste Zelle, die genau
     hoch, mittel oder niedrig enthält. Grund: Eine Spaltensuche über die Kopfzeile bricht an `|` in Zellen.
   - **Vertiefung** (zweiter Researcher je flachem Erstbericht, parallel nach RAM-Lage): gemeinsame `VERTIEFUNG.md`
     mit Pflichtschritten: (1) Landkarte des Vorbilds, also jede Quelldatei bzw. jeder Ordner ab ~300 Zeilen mit
     Nutzerfunktion in eine Abdeckungstabelle („im ersten Bericht?“); (2) Gegenprobe jeder B-Zeile im eigenen Code
     (✅/◐/❌); (3) Gegenprobe jeder C-Lücke mit mehreren Suchbegriffen (bestätigt/verworfen/umgestuft);
     (4) Detailabweichungen je Kernfunktion (Optionen, Standardwerte, Grenzwerte, Fehlerfälle); (5) neue Lücken ab
     letzter Nummer + 1. Bericht `<KÜRZEL>2-bericht.md` mit sieben Abschnitten (A Abdeckung · B Gegenprobe abgedeckt ·
     C neue Lücken · D Gegenprobe Lücken · E Top-5 · F Detailabweichungen · G Suchprotokoll); Kopf mit Fazit „ändert
     die Vertiefung das Urteil?“. Der Prompt nennt Erstbericht, Schwerpunkte und das, was parallele Researcher prüfen.
     Umstufungen aus Abschnitt D in die Zählung übernehmen (roh und nach Gegenprobe). Grund: Erst die Gegenprobe
     findet viele weitere Lücken und korrigiert Prioritäten in beide Richtungen.
4a. **Abdeckung messen und nachlesen (vor dem Konsolidieren):** Per Skript je Bericht die Quellenliste in Dateien
   auflösen (Ordner rekursiv, Familien), Rauschen weglassen (i18n/locales, Fixtures, Testhilfen, generiert, json/lock,
   Changelogs), nur Dateien ab ~300 Zeilen Code bzw. ~150 Zeilen Doku. Dann in ALLEN Berichten ohne den Abhak-Abschnitt
   nach dem Pfad-Ende (letzte 2–4 Teile) suchen: unbelegt = kein Bericht nennt die Datei; Nennung in einem anderen
   Bericht zählt als abgedeckt; dünn = große Datei (≥ 1500 Z.), höchstens 2 Nennungen. Allerweltsnamen (index, utils,
   types) als `eltern/name` suchen; in Skill-Katalogen zählt nur SKILL.md, gesucht wird der Ordnername. Grund: Haken in
   der Quellen-Abdeckung beweisen keinen Inhalt; die Messung fand bei einer Erst-Runde 22 % unbelegte Zeilen, bei
   einzelnen Code-Berichten 44–73 %, bei Doku-Berichten fast 0 %.
   Für die unbelegten und dünnen Dateien Nachlese-Aufträge `<BERICHT-BASIS>-N<k>` erzeugen: eine Datei je Zeile mit
   Größe und Grund, ≤ 25k Zeilen bzw. ≤ 40 Dateien je Teil, Oberflächen-Code (Apps, Web-UI, TUI) getrennt mit größeren
   Teilen und Richtwert 1 Eintrag je 1000 Z. statt je 600, kleine Reste mit dem Nachbarteil zusammenlegen, Logik-Teile
   zuerst. Jede Datei höchstens einmal vergeben (Dateien aus vorhandenen Nachlese-Listen ausschließen); dann endet die
   Schleife „messen → nachlesen → messen“ sicher. Gegen Dubletten einen Suchindex aller bisherigen Einträge als TSV
   (ID, Bereich, Name, Was, Konfig, Belege) bereitstellen, den der Worker nur per `rg … | head` befragt. Neue Details
   zu bekannten Funktionen als eigener Eintrag mit `Ergänzt: <ID>`; das Extrakt-Skript stellt ihn direkt hinter sein Ziel
   (gleicher Bereich, kein Teilwechsel dazwischen), die Konsolidierung führt beide zu einem Katalog-Eintrag zusammen. Abnahme eines Nachlese-Teils: zusätzlich zu Check und Beleg-Skript drei zufällige `Ergänzt: <ID>`-Ziele je per `rg -n '^<ID>\t' FINDEX.tsv` gegenprüfen (jede ID genau 1 Treffer) und den Index vor jedem Start neu bauen, wenn er älter als ~60 min ist. Grund: Ein erfundenes oder veraltetes Ziel macht aus der Ergänzung einen Dublettenfund, den Check und Belegprüfung nicht sehen.
   Tiefen-Nachlauf bei grünem Check, aber dünnem Bericht (viele Dateien ≥500 Zeilen ohne Treffer): Todo-Liste im Format `Zeilen Pfad Treffer` erzeugen (absteigend nach Größe), je Lauf nur eine Scheibe (`head`/`tail -n +k`, ≈12–22 Dateien) an einen frischen Worker geben, vor jedem Lauf Bericht-Backup. Schafft ein Lauf weniger als die Hälfte (Kontext erschöpft, Worker nutzte trotz Verbot compress), Scheibe für den nächsten Lauf halbieren und die „x/N“-Zahl in der Schlusszeile gegen die Liste nachzählen (Selbstzählung ist unzuverlässig). Pitfall: Nachlese-/Fortsetzer-Worker hängen neue F-Einträge gern ans Dateiende (hinter G/H); der Check zählt F nur in Abschnitt A. Im Auftrag ausdrücklich „neue F-Einträge vor `## B`“ verlangen und bei der Abnahme `F in A` gegen `F gesamt` zählen (Abweichung = Block verschieben, Inhalt unverändert, vorher `.bak`).
   Pitfall: Ein Generator, der die Queue aus den Quellenlisten neu schreibt, löscht angehängte Nachlese-Zeilen. Er muss
   sie erhalten, und die Spur ändert Queue-Zeilen nur einzeln.
5. **Konsolidieren und festhalten:** Eine Doku-Datei `<projekt>/docs/reports/GAP-ANALYSE-<datum>.md`:
   Kopf mit konsolidierter, QUER über alle Berichte gedachter Nachzieh-Priorität (gleiche Themen
   verschiedener Vorbilder zusammenführen, z. B. „Agenten-Orchestrierung" statt 2× Einzelitem),
   danach die Berichte 1:1 (`cat` der Berichtsdateien, siehe Pitfall zu `.out`). Als docs-Commit pushen.

## Pitfalls
- Briefs müssen self-contained sein: Delegates sehen die Konversation NICHT. Vergleichsbasis ohne
  absolute Pfade → Agent ratet. Struktur nicht erzwingen → ausufernde Berichte ohne priorisierte Lücken.
- Berichte vor dem Konsolidieren sichern: bevorzugt die Berichtsdatei, die der Researcher selbst geschrieben hat.
  Fehlt sie, den Bericht aus `/tmp/acp-delegate/<runId>.out` übernehmen (/tmp ist flüchtig) und Statussätze vor
  dem ersten `## ` entfernen. Grund: Die `.out`-Datei enthält auch Plauderzeilen des Agenten, die sonst im
  Doku-Commit landen.
- Drei parallele Researcher sind ok, mehr nur nach RAM-Lage; Build-Worker nie parallel zum Audit starten.
- Keine Zahlen erfinden: Deckungs-% nur nennen, wenn ein Test-/Audit-Bericht sie belegt.

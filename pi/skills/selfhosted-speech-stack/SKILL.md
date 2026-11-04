---
name: selfhosted-speech-stack
description: Sprach-Features (Speech-to-Text, Text-to-Speech, Sprachende-Erkennung) mit selbst gehosteten Modellen auf RAM-knappen CPU-Servern planen und bauen — Modellauswahl über sprachspezifische Messungen, Gewichts-Lizenz getrennt vom Code prüfen, RAM und Latenz im Container mit Speichergrenze messen, Modelle je Server nur einmal im RAM, Auslieferungsweg vorab prüfen (Release ohne Handarbeit, keine ENV-Schalter), Laden bei Bedarf, VAD im Browser, Transkripte zentral, menschliche Sprechfassung statt Vorlesen. Use when voice messages, dictation, a spoken conversation mode or STT/TTS models must be chosen, sized for a small VPS, or integrated into an app or messenger.
---

# selfhosted-speech-stack

# Selbst gehostete Sprach-Features (STT/TTS) auf knappen Servern

Klasse: Sprachnachrichten, Diktat, Gesprächsmodus oder Vorlesen mit eigenen Modellen bauen, wenn der Zielserver nur CPU
und wenig RAM hat (Kunden-VPS, geteilt zwischen Mandanten) und die Nutzung kommerziell ist.

## 1. Anforderungen festhalten
- Sprachen, Hardware (nur CPU? RAM je Server, geteilt durch wie viele Mandanten, was belegt der Rest des Stacks
  schon?), Latenzziel (Sprachnotiz im Hintergrund vs. Gespräch in Echtzeit), kommerzielle Nutzung, Datenschutz
  (Audio bleibt beim Kunden).

## 2. Modelle auswählen
- Sprachspezifische Messungen statt englischer Ranglisten nutzen: Benchmarks mit WER je Zielsprache und CPU-Zeit je Clip,
  dazu Hardware-/Lizenz-Indizes. Quellen und aktuelle Auswahl: `references/modelle.md`.
- Die Lizenz der GEWICHTE getrennt vom Code prüfen (LICENSE im Modell-Repo). Grund: Viele bekannte TTS-Modelle haben
  MIT-Code, aber nicht-kommerzielle Gewichte.
- Sprachabdeckung je Modell ausdrücklich prüfen; viele kleine TTS-Modelle fehlen gerade Deutsch oder Russisch.
- Eine Laufzeit für alles bevorzugen (z. B. sherpa-onnx für STT, TTS und VAD): ein Prozess, ein Speicherbudget.

## 3. Messen, bevor festgelegt wird
- Auf x86 im Container mit harter Grenze messen (`docker run --memory <n>g --cpus <k>`), nicht nur auf dem
  Entwicklungsrechner. Grund: ARM/Metal und freie Kerne zeigen Latenzen, die die Kunden-VPS nie erreicht.
- STT: RSS im Leerlauf und als Spitze, Ladezeit, Latenz je Clip, CPU-s je Audio-s, WER je Sprache auf einem offenen
  Testset (z. B. FLEURS, CC-BY-4.0, ≥ 20 Clips je Sprache) plus Stille-Clips (richtig = kein Text).
- TTS: Zeit bis zum ersten Audio, RTF je Sprache, Verständlichkeit per Rundlauf TTS → STT (WER).

## 4. Architektur für knappe Server
- Die Modelle je Server nur einmal im RAM halten, geteilt zwischen den Mandanten; das ist sparsamer als je Mandant.
  Audio und Transkripte bleiben in der Mandanten-DB bzw. -Ablage; der Dienst speichert und loggt keine Inhalte.
- Vor der Architektur den Auslieferungsweg prüfen: Muss die Funktion nach einem normalen Release ohne Handarbeit beim
  Kunden laufen, zählt, wohin dessen GitOps-Auslieferung schreiben darf. Eine Flux-Kustomization je Mandant mit
  `targetNamespace` legt alles in den Mandanten-Namespace; eine Server-weite Komponente erreicht Bestandskunden dann nur
  über das Installationsskript. Dann den Dienst je Mandant mit dem Release ausliefern und die Modelle zur Laufzeit je
  Node teilen (Absprache über einen hostPath-Lock: ein Prozess lädt, die anderen leiten über einen Unix-Socket weiter).
  Einen Handgriff auf dem Server gibt es nicht, auch keinen einmaligen (Vorgabe des Nutzers): Jede
  Laufzeitvoraussetzung wie Ordner, Eigentümer und Rechte legt die Auslieferung selbst an — in Kubernetes per
  initContainer, in docker-compose per Init-Dienst (läuft als root, `depends_on: condition:
  service_completed_successfully`), und zwar in ALLEN Compose-Varianten. Grund: Sonst kippt die Architektur bei der
  ersten Frage zur Auslieferung, und Bestandskunden bekommen den Dienst nie; ein von Docker als root angelegter
  Bind-Ordner lässt den Dienst ohne Fehlermeldung an Lock und Socket scheitern.
- Eine Funktion, die nur auf genügend großen Servern Sinn hat (z. B. ein größeres Modell), bekommt eine Prüfung im Dienst
  (RAM über Minuten als Minimum, Container-Grenze, Platte, Kerne) UND einen aktiven, schließbaren Hinweis an Admins mit
  Link zur Einstellung, sobald die Prüfung „möglich“ ergibt; ein Badge nur in der Einstellungskarte findet niemand.
  Einstellung je Server, Zurückschalten sofort; das große Modell bei Bedarf in den geteilten hostPath laden
  (Prüfsumme fest im Code), die Speichergrenze im Manifest nur anheben (Grenze, keine Reservierung).
- Keine Schalter als ENV auf Kundenservern: Freischaltung je Mandant über Lizenzmodul plus Admin-Schalter, geprüft an
  EINER zentralen Stelle (Modulname als eine Konstante); feste interne Dienstadresse im Standard-Manifest; Zugriff nur
  über Netzwerkregel (dazu ein Token, wo Mandanten über das Netz zugreifen).
- Modelle erst bei Bedarf laden und nach Leerlauf entladen, je Modell höchstens eine Inferenz gleichzeitig
  (Warteschlange). Dazu zwei Profile: „standard“ und „sparsam“ (kleineres STT, sehr kleine TTS-Stimmen) für geteilte
  Server.
- OpenAI-kompatible Endpunkte (`/v1/audio/transcriptions`, `/v1/audio/speech`): Die App hängt an einer Schnittstelle
  und kann später gegen einen Cloud-Dienst getauscht werden.
- Sprachende-Erkennung (VAD) für einen Gesprächsmodus im Browser laufen lassen (Silero VAD über onnxruntime-web, Assets
  selbst ausliefern, kein CDN). Das kostet keinen Server-RAM.
- Bei parallelen Teams die Schnittstelle zuerst liefern und früh mergen: Interface, Zod-Schemas, deterministischer
  Fake für Unit-Tests, Fabrik „nicht konfiguriert → null“, eine zentrale Transkript-Tabelle je Audio-Medium. Ist die
  Funktion nicht verfügbar, das Bedienelement nicht ausblenden, sondern gedämpft zeigen; Antippen erklärt den Grund in
  Alltagssprache (Lizenz, Firma hat es ausgeschaltet, Dienst nicht erreichbar) und verlinkt Admins zur Einstellung.
  Grund: Ein verschwundenes Mikrofon hält der Nutzer für einen Fehler. Für E2E gegen einen Produktions-Build eine
  HTTP-Attrappe des Dienstes als Test-webServer bereitstellen. Grund: `next start` läuft mit NODE_ENV=production, und
  ein dort gesperrter Fake liefert in E2E nur null. Neue Tabellen gleich gegen die Wächter-Suiten des Repos prüfen
  (Verlaufs-Trigger oder Ausnahme).

## 4b. Nach dem Ausrollen live prüfen
1. Pod bereit? Bei 0 Pods sofort die Ereignisse der ReplicaSet lesen (Quota, fehlende Limits), nicht auf das
   Zeitlimit warten.
2. Rundlauf im Dienst-Pod ohne Datei-Kopie: ein kleines Node-Skript per stdin
   (`kubectl -n <ns> exec -i deploy/<dienst> -c <container> -- node - < probe.js`). Es erzeugt je Sprache mit
   `/v1/audio/speech` (`response_format: "wav"`) einen Satz und schickt das Audio als `FormData` an
   `/v1/audio/transcriptions`, misst beide Zeiten, die erkannte Sprache und die WER. Der erste Aufruf enthält das Laden
   der Modelle; erst die folgenden zeigen die normale Latenz. Ziffern statt Zahlwörtern („9“ statt „neun“) zählen
   nicht als Fehler.
3. Erreichbarkeit aus Sicht der App: im App-Pod die konfigurierte Adresse lesen (`printenv <DIENST_URL>`) und
   `/health` per `node -e "fetch(…)"` abfragen. Das prüft Dienstname, Port und Netzwerkregel in einem Schritt.
4. Freischaltung aus Sicht des echten Testnutzers prüfen, bevor er testet. Dazu seine Rolle kennen: Ein Admin über
   mehrere Firmen hat oft keine feste Firma in der Sitzung und wählt sie in der Oberfläche. Meldet die App „nicht
   verfügbar“, die Gründe der Reihe nach ausschließen: Lizenzmodul der Firma, Firmen-Schalter, Dienst aus dem App-Pod
   erreichbar, Firmenermittlung. Bleibt nur die Firmenermittlung, nimmt die Prüfung die gewählte bzw. die
   Datensatz-Firma nicht mit. Die Prüffunktion braucht dafür einen Parameter für die gewählte Firma; an Datensätze
   gebundene Ansichten wie ein geöffnetes Gespräch nutzen die Firma des Datensatzes. Der Hinweistext nennt den
   tatsächlichen Grund, nicht pauschal „nicht freigeschaltet“. Meldet der Nutzer kurz nach einem Rollout „nicht
   verfügbar“, zuerst die App-Logs nach `Failed to find Server Action … older or newer deployment` durchsuchen
   (`kubectl logs deploy/app --since=30m | grep -i "server action"`). Dann läuft bei ihm noch ein Tab mit der alten
   Fassung, dessen Server-Aufrufe ins Leere gehen; hart neu laden lassen.
5. Dauerhaftigkeit prüfen: eine Sprachnachricht senden, die Seite neu laden und den Player der ERSTEN Nachricht
   abspielen; dazu die DB-Zeilen für Anhang und Transkript zählen (nur lesend). Grund: Direkt nach dem Senden spielt
   der Player die Aufnahme ab, die noch im Browser liegt. Ob das Audio gespeichert wurde, zeigt erst das Neuladen.
6. Fehlermeldung eines Nutzers aus einem anderen Netz (VPN, Mobilnetz, „bei mir geht es“): zuerst klären, ob die
   Anfrage den Server erreicht hat. Dazu die Zeitleiste der Chat-Nachrichten mit Audio-Anhang der Sitzung in der DB
   lesen (nur lesend, Sitzung pseudonym per `left(md5(session_id::text),6)`) und daneben die App-Logs. Fehlt die
   Anfrage dort, weist der Browser ab: den Meldungstext über die Übersetzungsdatei zum Schlüssel und zur Code-Stelle
   zurückverfolgen und alle Bedingungen auflisten, die dorthin führen. Erst dann Ursache und Fix benennen. Grund: Netz-
   und Proxy-Probleme zeigen sich oft als abgebrochener Antwort-Strom, und die App gerät dann in Zustände (Nachladen im
   Hintergrund), die im eigenen WLAN nie auftreten. „Es wurde nichts gesprochen“: Zeitleiste aus drei Quellen legen —
   Chat-Nachrichten (Frage/Antwort-Zeitpunkte), Lauf-Kennzahlen (Dauer, Runden) und Zugriffs-Log des Sprachdienstes
   (`kubectl logs deploy/<sprachdienst> --timestamps`, je Zeile Pfad, Status, ms). Fehlt nach der Antwort jedes
   `/v1/audio/speech`, hat der Browser gar nicht erst gesprochen (Client-Zustand), sonst liegt es an Sprechfassung oder TTS.
   DB-Zeitstempel ohne Zeitzone sind UTC wie die Logs; nicht mit `AT TIME ZONE` umrechnen, sonst verrutscht die
   Zeitleiste um die Zonendifferenz.
7. Umschaltbares Modell live prüfen: Stand-Endpunkt im Dienst-Pod lesen, Wunsch setzen, Zustände bis zum Zielzustand
   verfolgen und dann eine Erkennung schicken; die Antwort nennt das benutzte Modell. Die Zustandsnamen vorher aus dem
   Code bzw. der ersten Antwort übernehmen und die Abfrage-Schleife bei jedem unbekannten oder Fehlerzustand beenden.
   Grund: Ein geratener Zielname lässt die Schleife bis zum Zeitlimit laufen, ohne dass die eigentliche Probe stattfindet.
   Den Speicher von außen messen (`kubectl top pod`), nicht nur aus dem Selbstbericht des Dienstes, und nach dem
   Zurückschalten den Abfall prüfen. Danach dieselbe Abfrage über den Weg der App prüfen, nicht nur am Dienst: im
   App-Pod den Endpunkt aufrufen und die Antwort durch das Schema der App schicken (oder die Server-Action per Skript),
   und die Karte in der Oberfläche als der echte Testnutzer ansehen. Grund: Eine Probe direkt am Dienst prüft nur den
   Dienst; scheitert das Schema der App an einem Feld (z. B. `null` statt Zahl), ist die Funktion für den Nutzer
   unsichtbar, obwohl der Dienst einwandfrei antwortet.

## 5. Fallen
- Die Sprache beim ersten Durchlauf nie fest vorgeben. Grund: Ein fester Sprachhinweis lässt Modelle auf Stille Text
  erfinden und macht Notizen in anderen Sprachen unbrauchbar. Automatisch erkennen; liegt das Ergebnis außerhalb der
  Zielsprachen, einmal mit der Standardsprache wiederholen.
- Vor dem Modell eine Stille-Schwelle (RMS/VAD) setzen; Clips ohne Sprache gar nicht transkribieren.
- Lange Aufnahmen per VAD in Abschnitte unter 30 s schneiden. Grund: Quantisierte Encoder verlieren bei langem Audio
  stark an Genauigkeit.
- Das Transkript nur einmal zentral speichern und beim Lesen hydrieren, nicht in den Nachrichtentext kopieren; Agenten,
  die einen Verlauf lesen, bekommen es über dieselbe Hydration (fehlende beim Lesen nachholen).
- Messenger-Sprachnachrichten erwarten OGG/Opus, Browser nehmen meist webm/opus (Chromium) bzw. mp4/aac (Safari) auf:
  serverseitig umwandeln (ffmpeg im Sprachdienst), nicht im Browser.
- Fehlerkennungen bei Abkürzungen („KI“, „PDF“), Denglisch und englischen Wörtern im Deutschen nicht mit einer fest
  eingebauten Wortliste flicken (Vorgabe des Nutzers; Wortlisten nur als Testdaten). Vorgehen:
  1. Die echte Fehl-Aufnahme sichern. Fehlt sie, weil Audio nicht gespeichert wurde, zuerst das Speichern beheben
     (§4b.5) und den Nutzer um neue Aufnahmen mit Codewörtern bitten. Ohne sie ist die Ursache eines Einzelfalls
     nicht belegbar; das so auch berichten.
  2. Bei abgeschnittenen Wörtern am Anfang oder Ende den Pegelverlauf in 100-ms-Fenstern prüfen
     (`ffmpeg -i x -ac 1 -ar 16000 -f s16le -` → RMS je 1600 Samples). Läuft Sprache bis an die Dateikante, hat der
     Absender zu früh losgelassen; das ist kein Fehler der Kette.
  3. Prüfset breit machen: Kategorien (Abkürzungen, Denglisch-Verben, englische Nomen, Fachwörter, Zahlen/Datum,
     Marken, Gegenprobe), mehrere TTS-Programme und Stimmen (z. B. Supertonic UND Piper), Tempi, Rauschen
     (SNR 20/10 dB), Hall, Pegel und die Codec-Rundreisen des Feldes (Browser webm/opus, Telegram ogg/opus). Grund:
     Ein Prüfset aus einer einzigen TTS-Stimme erkennt das Modell fast immer richtig und täuscht Sicherheit vor.
  4. Varianten JEDE IN EIGENEM PROZESS messen (`node --expose-gc`): Trefferquote je Kategorie, WER, Schaden an
     richtigen Sätzen, RSS, Latenz. Grund: Nacheinander in einem Prozess schleppt der zweite Wert den Speicher des
     ersten Erkenners mit und zeigt Hunderte MB, die es nicht gibt.
  5. Hebel in dieser Reihenfolge prüfen: Dekodierung (Beam statt greedy kostete bei Parakeet/sherpa kaum RAM, WER
     etwas besser), Modellvariante (int8 gegen Vollpräzision, RAM-Grenze beachten), allgemeine Nachbearbeitung
     (einzeln gesprochene Buchstaben zusammenziehen), Hinweis an das nachgelagerte Sprachmodell („gesprochen und
     automatisch verschriftet, Fehlerkennungen sinngemäß deuten, nur bei Unklarheit nachfragen“; brachte deutlich mehr
     richtige Deutungen, ohne Liste), Korrektur durch ein Sprachmodell (Schaden an richtigen Sätzen mitmessen,
     Aufrufzahl deckeln; Messwerte in `references/modelle.md`). Kontext-Biasing (Hotwords aus dem Gesprächsverlauf)
     nur mit Messung einschalten: Es hob die Trefferquote nie und beschädigte ab mittlerem Score Nachbarwörter.
  6. Eine Korrektur durch ein Sprachmodell wie jede andere KI-Funktion der App einbauen: über den Standardweg mit
     Aufrufkontext (Mandant, Benutzer bzw. das Hintergrund-Muster der App), Guthaben- und Freischaltungsprüfung vorher,
     Verbrauch danach buchen; einschalten per Mandanten-Einstellung mit einem Satz, dass der Text dafür an den
     KI-Dienst geht (kein ENV-Schalter). Die erkannte Sprache mitgeben, „gleiche Sprache, nie übersetzen“ verlangen und
     eine Antwort in anderer Schrift (Kyrillisch gegen Latein) als Fehlschuss verwerfen; bei unbekannter Sprache nicht
     korrigieren. Grund: Ein Modellaufruf ohne Kontext läuft auf Kosten keines Mandanten und auch für Mandanten ohne
     KI, und ein deutscher Korrektur-Prompt übersetzt russische Sprachnachrichten still.

## 6. Menschlich klingende Ausgabe
- Nicht die Textantwort vorlesen, sondern eine kurze Sprechfassung erzeugen (2–4 Sätze, schneller Modellaufruf ohne
  Denken): Füllwörter je Sprache dosiert, Ausdrucks-Tags des TTS-Modells sparsam (Atmen, Lachen, Seufzen), nie Tabellen,
  Links, Markdown oder IDs; Zahlen, Beträge und Daten per Code-Nachbearbeitung als Wörter. Kurze schlichte Antworten
  ohne LLM-Aufruf direkt sprechen. Nie auf den Chat verweisen („steht im Chat“ o. ä., Vorgabe des Nutzers): Tabellen
  und Listen stattdessen in 1–2 Sätzen mit den wichtigsten Zahlen in Worten zusammenfassen und einen trotzdem erzeugten
  Verweis-Satz per Code-Prüfung je Sprache entfernen. Grund: Wer zuhört, will die Antwort hören, nicht auf den
  Bildschirm geschickt werden.
- Gegen Wartezeit sofort eine kurze Quittung abspielen, satzweise synthetisieren (erster Satz zuerst), Unterbrechen
  durch Hineinsprechen erlauben und in der erkannten Sprache des Nutzers antworten. Dauert die Antwort länger (≈ 20 s),
  einmal je Frage eine kurze natürliche Zwischenmeldung abspielen (vorab erzeugt wie die Quittung), nicht während der
  Nutzer spricht. Grund: Minutenlange Stille nach der Quittung wirkt wie ein Absturz.
- Hineinsprechen (erkanntes Sprachende) beendet nur die laufende Wiedergabe, nie die ausstehende Antwort. Die
  ausstehende Frage erst verwerfen, wenn die neue Erkennung eine echte, nicht leere Frage ergibt; bei Stille, Geräusch
  oder leerer Erkennung bleibt sie stehen und wird gesprochen, sobald die Antwort da ist. Grund: Die Sprachende-Erkennung
  feuert während langer Wartezeiten auf Geräusche; verwirft das die ausstehende Antwort, steht sie nur im Chat, und es
  wird nichts gesprochen. Erkennen: im Zugriffs-Log des Sprachdienstes nach der Antwortzeit kein `/v1/audio/speech`,
  davor eine Transkription mit leerem Ergebnis bzw. 422.
- Im Gesprächsmodus eine Frage nie abweisen, nur weil die vorige Antwort noch läuft, auch nicht, wenn sie im Hintergrund
  nachgeladen wird: die Frage merken (höchstens eine, die neueste gewinnt), „Ich warte noch auf die vorige Antwort …“
  zeigen und senden, sobald die Antwort fertig ist. Nachgeladene Antworten ebenfalls vorlesen. Jeder
  Abweisungsgrund (keine Sitzung, Guthaben, Antwort läuft) bekommt einen eigenen Text, keinen Sammeltext wie
  „Guthaben oder Verbindung“. Grund: Wer spricht, wartet nicht auf einen Zustand, den er nicht sieht; eine pauschale
  Meldung schickt ihn auf die falsche Fährte.

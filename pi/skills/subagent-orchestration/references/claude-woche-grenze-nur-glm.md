# Claude-Woche nahe der Grenze – Leitstand: „neue Pakete nur noch glm“

- Journal-Quittung mit dem nächsten glm-Paket: nicht aus der Queue-Spalte „Modell“ raten. Viele glm-Pakete hängen an
  Claude-Paketen (gesperrter Vorgänger), und Abhängigkeiten anderer Wellen/Spuren sieht eine Queue-Auswertung nicht.
  Verbindlich ist nur `wpq.py next`; bei vollen Plätzen („voll: 2/2“) „voraussichtlich … (Abhängigkeiten prüft next)“ schreiben.
- Jedes fertige glm-Paket braucht sofort einen Claude-Prüfer (zählt gegen die Claude-Grenze und die Höchstzahl Claude-Läufe) –
  einplanen. Prüfer mit dem billigeren Claude-Modell, wo der Brief nichts anderes verlangt.
- Dem Reviewer nie einen Schreibauftrag („schreibe nach <Datei>“) geben: er hat kein Schreibwerkzeug und meldet das als Text.
  Den Volltext selbst aus `session.jsonl` des Reviewer-Laufs ziehen (letzter Assistant-Text, der `REVIEW:` enthält) und in die
  Review-Datei schreiben; die Benachrichtigung enthält oft nur Lernpass-Rauschen.
- „check läuft (N min)“ über 60 min bei gleichzeitigen Bauten mehrerer Spuren auf dem Remote-Rechner ist Warteschlange, kein
  Hänger: `ps -eo pid,etimes,args | grep -E 'wpq.py check|rb.sh'` – solange `rb.sh --_inner`-Prozesse laufen, nichts tun.
  Ein Herzschlag mit `WARTE-ENDE herzschlag` ist nur der Zeitablauf: Stand lesen, neu starten, keine Meldung an den Nutzer nötig.

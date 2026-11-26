# Reviewer-Frage „Host-Bindung von Zugangsdaten“ und Claude-Platz-Zählung

## Host-Bindung von Token nie mit eigenem URL-Zerleger
- Ein Zerleger, der den Host nur an `/ ? #` beendet (z. B. `lumi_core::net::url_host`), liest `https://evil.test\@discord.com/` anders als reqwest/WHATWG (dort beendet `\` den Host) → das Token geht an den Fremdhost.
- Fix: nur festes Präfix `https://<host>/` (oder exakt `https://<host>`) zulassen; Basis-Adressen mit `\`, `@`, Leerraum, Steuerzeichen abweisen. Test: `https://host.evil.test`, `https://host@evil.test`, `https://evil.test\@host/`, `https://evil.test/#host`, `http://host`. Loopback-Ausnahme für Tests nur `cfg!(test)`.
- Ist der Zielhost nicht belegbar (angenommene Endpunkte), reicht `https`-Pflicht + Abweisen von `\`/`@`, aber der Bericht nennt die fehlende Host-Bindung unter „Nicht umgesetzt“.
- In Reviewer-Auftrag und Worker-Brief für jedes Paket mit Fremd-Dienst-Adapter (Token im Header) aufnehmen; ein Review ohne Shell findet es nur, wenn die Beispiel-Adressen im Auftrag stehen.

## Claude-Plätze zählen nur anthropic-Läufe
- „Max 2 Claude-Worker global“ zählt Läufe mit Modell `anthropic/…`; ein glm-Lauf (z. B. einer anderen Spur) belegt keinen Platz. Vor „wartet auf Slot“ das Modell jedes Registerlaufs prüfen (Status-Datei/Sitzung der Run-ID), nicht nur die Zahl der Einträge in `/tmp/pi-subagents-uid-*/async-subagent-runs/*/status.json`.
- Bei „Unknown subagent model“ für das neueste glm-Modell das vom Werkzeug genannte nächstliegende nehmen (die Modellliste der Sitzung ist älter als die CLI); der Wechsel kommt erst nach Neuladen der Sitzung.

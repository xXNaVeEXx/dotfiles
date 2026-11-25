# glm-Worker einsetzen und Endlauf-Rot durch fremden Test selbst beheben

## glm-Worker (wenn der Plan ein günstigeres Modell neben Claude erlaubt)
- `wpq.py next` nennt das Modell; Start per `subagent` mit `model: "zai-coding-cn/glm-5.3"`. Die Grenze „2 Claude-Läufe global“ gilt nur für Claude; glm läuft zusätzlich, solange `ram-ok.sh` JA sagt und die Spur ≤ 2 Worker hat.
- Der Auftragstext (wp/<WP>.md) nennt noch „Dein Modell: sonnet“ → im Start-Task ausdrücklich überschreiben. Pflichtregeln (Hotspots, Netz-Tor, Decision::Ask, Fremdtext-Reihenfolge, Commit ≤72, Status-YAML, nur remote.sh) wörtlich in den Task schreiben; ein anderes Modell kennt sie nicht.
- Jedes glm-gebaute Paket bekommt vor dem Einbau ein Review durch Claude (auch unter 500 Zeilen). Status: `läuft <runId> glm`.
- Claude-Plätze zuerst für wartende Reviews/Nacharbeiten, glm baut daneben das nächste Paket. Vor jedem Start `ram-ok.sh` neu prüfen (Builds drücken avail unter 5 GB); bei NEIN den Herzschlag kurz (`--max 600`) statt 3600 laufen lassen, solange Reviews warten.

## Endlauf rot durch einen Test aus fremdem, schon integriertem Paket
1. `grep -n 'FAIL\|panicked' <logs>/wpq-<wp>-nextest.log` → Test + Datei:Zeile; liegt er nicht im eigenen Diff, Ursache im Code suchen statt Rerun.
2. Typisches Muster: Worker/Warteschlange quittiert (`reply.send`) BEVOR Platz/Zähler freigegeben wird → Test, der direkt nach `wait()` `in_flight()==0` prüft, sieht 1. Fix: Zähler/Platz zuerst freigeben, dann quittieren.
3. Selbstfix im Worktree des laufenden Pakets: Pfad in vorgaben/<WP>.pfade freigeben (eigener Tool-Block), Eintrag in ENTSCHEIDUNGEN, eigener Commit `fix(claw): LC-WP-<fremd> …`, `touch apps/lumi-desktop/crates/*/build.rs`, Endlauf neu, Journal.

## integ Exit 4 nur auf handbuch.html
Im Worktree `git checkout --theirs apps/lumi-desktop/docs/manual/handbuch.html`, `(cd apps/lumi-desktop && node tools/manual-gen.mjs)`, add, `git commit --no-edit`, touch build.rs, integ neu (Runde 2 fährt den vollen Endlauf wieder).

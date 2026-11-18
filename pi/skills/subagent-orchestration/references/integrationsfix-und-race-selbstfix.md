# Kleine Fixes der Spur selbst: Integrationsfix am Hotspot, Race-Selbstfix, Sammel-Fehlerbilder

## Integrationsfix in einer Hotspot-/Sperrdatei (Auftrag der Leitstand-Ebene, z. B. Anschluss-Zeilen eines fertigen Pakets)
Weder im Integrationsbranch noch in einem Paket-Worktree arbeiten. Ablauf:
1. Kleinen Worktree auf dem Integrationsbranch anlegen (`git worktree add -b <fix> <pfad> <integrationsbranch>`), nur die nötigen Zeilen ändern (Modul-Deklaration, Enum-Variante, Dispatch-Zeile) plus veraltete Platzhalter-Doku.
2. Prüfung über das Remote-Wrapper-Skript (`rb.sh … 'cargo check -p <crate> --all-targets && cargo nextest run -p <crate> <filter>'`), Exit 0 abwarten; Commit (Conventional Commits) und bg_run nie im selben Tool-Block.
3. Unter der Integrationssperre (`flock <C>/locks/int.lock`) per `merge --ff-only` in den Integrationsbranch bringen, pushen, Worktree + Branch entfernen.
4. Entscheidung in ENTSCHEIDUNGEN und Journal protokollieren; im Bericht des Pakets die offene Anschlussstelle als erledigt vermerken.
Grund: Ein parallel laufendes Integrations-Verfahren der Spur würde sonst einen halb geänderten Baum sehen; ff-only unter Sperre garantiert, dass der geprüfte Stand der gemergte ist.

## Race im Endlauf-Test „Klick vor Effekt-Rerender“ (UI)
Ein einzelner roter UI-Test unter Last mit Erwartung „empfohlene Auswahl vorbelegt“ ist oft ein Paketcode-Race: Zustand wird per zweitem Effekt aus geladenen Daten gesetzt, der Klick kommt vor dem Rerender. Fix: Zustand ableiten statt per Effekt spiegeln (`const [gewaehlt,setGewaehlt]=useState<T|null>(null); const wahl = gewaehlt ?? vorbelegung(daten)`), Effekt löschen. Nicht den Test lockern und nicht den Lauf blind wiederholen; danach `build.rs` touchen, Endlauf neu.

## Sammel-Fehlerbilder der Remote-Integration (keine Paketfehler)
- `Timeout, server <host> not responding` im cargo-check-Schritt → Verbindungsfehler; `build.rs` touchen und integ neu starten (Host prüfen: Block „Build-Rechner fällt aus“ in `einzelregeln.md`).
- Roter e2e-Schritt, weil der Remote-Spiegel Verzeichnisse des Pakets nicht kennt („cannot find …“ / fehlender Ordner) → nach erneutem Merge des Integrationsbranchs und Spiegel-Sync neu laufen lassen, nicht das Paket ändern.
- „feat hat dieselben Bereiche geändert → Endlauf voll“: kein Fehler, nur längerer Lauf; abwarten.

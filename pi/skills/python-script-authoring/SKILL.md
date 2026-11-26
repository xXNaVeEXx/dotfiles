---
name: python-script-authoring
description: Standalone-Python-Scripts (CLI-Tools, Bar-Widgets, Collector, Probes) auf dieser Maschine schreiben und beim ersten Versuch lint-sauber ausliefern — ruff-Format/Fix-Flow gegen pi-lens-Write-Hook-Blocker, fehlertolerante Exception-Pattern, Kalt/Warm-Smoke-Test. Use when writing or repairing any Python script that must pass the write-hook lint gate or run unattended.
---

# python-script-authoring

# Python-Scripts schreiben: lint-sauber + smoke-getestet

## Projekt-Config für ruff (mehrere Module, Tests, noqa-Kommentare)

- Vor dem ersten `# noqa` eine `pyproject.toml` im Projekt anlegen mit `select = ["ALL"]` plus gezielten `ignore`,
  sonst läuft ruff mit den E/F-Defaults und entfernt `# noqa: S310` als „unused noqa“ (RUF100), während der
  Write-Hook mit seinem breiten Regelset weiter blockt. Für `tests/*` per-file-ignores setzen (S101 assert, S105
  Schein-Token, PLR2004 Zahlen, ANN, ARG, SLF001, RUF012, S108, PLC0415). Grund: Hook und ruff müssen dieselbe
  Regelbasis haben, sonst „repariert“ ruff, was der Hook neu meldet.
- Die „Still unfixed“-Liste des Hooks nach Edits ist oft veraltet: Stand immer mit
  `ruff check --output-format concise <ordner>` prüfen. Der Hook meldet zusätzlich pyright-artige Typfehler
  (falscher Attributname, bool statt Callable), die ruff nicht sieht.
- `ruff format` bricht Zeilen um – vor exakten Text-Ersetzungen (edit-Tool) die Stelle frisch lesen, sonst
  „File modified since your write“; Ersetzungen per Python-Skript immer mit `count == 1`-Assert vor dem Schreiben.
- pytest ist nicht installiert → `unittest` (`python3 -m unittest discover -s tests`). Fakes als Unterklassen des
  echten Typs mit Klassenattributen für Verhalten (`auto_reply`, `reply_delay`), Temp-Ordner per
  `tempfile.TemporaryDirectory()` + `addCleanup`; Warten auf nebenläufige Abläufe über `wait_until(predicate)` mit
  Zeitgrenze statt `sleep`.
- Ausgabereihenfolge bei Pipes: Python-`print` ist blockgepuffert, Kindprozesse (systemctl, pi) schreiben sofort –
  in Protokollen steht ihre Ausgabe VOR den eigenen Zeilen und lenkt bei der Fehlersuche. Beim Debuggen `python3 -u`
  oder `flush=True`; Testdaten für Binärerkennung realistisch wählen (JPEG-Magic `\xff\xd8\xff`, nicht `\xff\xd8j`).

## Ablauf

1. Script schreiben (write). Der Write-Hook prüft sofort und blockt bei Findern — das ist normal, kein Grund zum Umbauen auf Minimalismus.
2. `ruff format <file>` laufen lassen (Binary: `~/.pi-lens/pip-tools/bin/ruff`, kein black installiert) — löst one-line-statement- und Format-Blocker pauschal.
3. `ruff check --fix --unsafe-fixes <file>` — entfernt Autofixables (unused imports, E741, RET501, PIE810 `startswith`-Tupel). Bleibt EXE001 (Shebang ohne x-Bit): `chmod +x <file>`, oder den Shebang weglassen, wenn das Skript nur per `python3 <file>` läuft (z. B. aus einem systemd-Timer oder als Vorlage in einem Skill-Ordner, wo kein x-Bit gesetzt wird).
4. Restliche Blocker manuell nach den Mustern unten beheben; danach `python3 -c "import ast; ast.parse(open('<file>').read())"` als Syntax-Gate.
5. Smoke-Test: Script mindestens 2× ausführen (Kaltlauf ohne State, Warmlauf mit), bei JSON-Output durch `python3 -m json.tool` pipen und einen Feld-Inhalt gegen das Live-System prüfen (z. B. Temperatur gegen `sensors`).

## Exception-Muster für unattended/Bar-Scripts

- `except Exception:` / `except: pass` blockieren (BLE001, S110). Stattdessen typisiert fangen und in eine Noop-Funktion leiten:
  `except (OSError, ValueError, subprocess.SubprocessError) as e: _quiet(e)` — `_quiet` ist eine leere Funktion mit Docstring (bewusstes Schweigen, kein Log-Rauschen in Poll-Scripts).
- `json.JSONDecodeError` ist ValueError-Subklasse — mitfangen durch `ValueError`, nicht extra listen.
- `subprocess.run(...)` IMMER `check=False` explizit setzen (PLW1510), außer Fehler sollen knallen.
- KeyError-Gefahr bei dict-Zugriffen auf gecachten/deserialisierten State: Bedingung um eine Key-Existenz-Prüfung erweitern (`if st_prev and "cpu" in st_prev`), nicht blind zugreifen.

## Typing-Fallen, die der Hook meldet

- Float-Konvertierung: None-Guard VOR `float(v)` (`if v is None: return default`), weil `float(str|None)` blockt.
- `sorted(x.get(k) for k in …)` blockt wegen `None` im Generator: `sorted(f for f in (…get…) if f is not None)`.
- Loop-Variable, die im Body ungenutzt bleibt (`for ifn, v in …` ohne `ifn`): über `.values()` iterieren oder Variable nutzen.
- Variablenname `l` (E741) nie verwenden — `row`/`line`.

## Verifikations-Disziplin

- Laufzeit messen (`time ./script > /dev/null`) und gegen das geplante Poll-Intervall stellen; alles unter ~10 % des Intervalls ist unkritisch.
- Screenshot-Crop ohne PIL (fehlt systemweit): `magick <src> -crop WxH+X+Y +repage -resize 200% out.png`.
- Erfolgreiche Sammlungsquellen (Pfade, Parser) mit einem Beispiel-Output in den nutzenden Skill patchen, nicht hier.

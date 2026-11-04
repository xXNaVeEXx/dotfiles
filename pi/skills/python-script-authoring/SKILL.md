---
name: python-script-authoring
description: Standalone-Python-Scripts (CLI-Tools, Bar-Widgets, Collector, Probes) auf dieser Maschine schreiben und beim ersten Versuch lint-sauber ausliefern — ruff-Format/Fix-Flow gegen pi-lens-Write-Hook-Blocker, fehlertolerante Exception-Pattern, Kalt/Warm-Smoke-Test. Use when writing or repairing any Python script that must pass the write-hook lint gate or run unattended.
---

# python-script-authoring

# python-script-authoring

# Python-Scripts schreiben: lint-sauber + smoke-getestet

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

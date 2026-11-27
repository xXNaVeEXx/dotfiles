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
- pytest ist nicht installiert → `unittest`.
- Pfade, die aus einer Env-Variable entstehen (Test-Heim statt echtem Konfigurationsordner), NIE nur im Paket-Init `tests/__init__.py` setzen: `python3 -m unittest discover -s tests` nimmt `tests/` als Top-Level und lässt das Paket-Init aus, und ruff/isort sortiert `from <paket> import …` vor `from tests.fakes import …` – das Produktmodul wird dann mit dem echten Pfad geladen und die Tests schreiben in die echten Dateien. Stattdessen: Starter-Modul `tests/__main__.py` (`python3 -m tests`) setzt die Env vor jedem Import und ruft `unittest.main(module=None, argv=["unittest","discover","--start-directory","tests","--top-level-directory",<Repo-Wurzel>, …])`; zusätzlich Wächter im Paket-Init (RuntimeError, wenn der berechnete Pfad nicht dem Env-Wert entspricht). Nachweise je Änderung: Hash der echten Dateien vor/nach dem Lauf muss gleich sein, Gegenprobe mit dem falschen Aufruf muss laut abbrechen.
  echten Typs mit Klassenattributen für Verhalten (`auto_reply`, `reply_delay`), Temp-Ordner per
  `tempfile.TemporaryDirectory()` + `addCleanup`; Warten auf nebenläufige Abläufe über `wait_until(predicate)` mit
  Zeitgrenze statt `sleep`.
- Ausgabereihenfolge bei Pipes: Python-`print` ist blockgepuffert, Kindprozesse (systemctl, pi) schreiben sofort –
  in Protokollen steht ihre Ausgabe VOR den eigenen Zeilen und lenkt bei der Fehlersuche. Beim Debuggen `python3 -u`
  oder `flush=True`; Testdaten für Binärerkennung realistisch wählen (JPEG-Magic `\xff\xd8\xff`, nicht `\xff\xd8j`).
- In Tests Methoden am Objekt ersetzen: der Hook meldet `obj._cmd = fn` und `fake.download = lambda …` (method-assign
  bzw. unbekanntes Attribut) – `setattr(obj, "_cmd", fn)` nehmen (dafür per-file-ignore `B010` für tests) oder den
  Fake als Unterklasse mit überschriebener Methode bauen. Gegenstücke aus Nebenläufigkeit (Threads, Timer) per
  `threading.Event` steuern und mit `addCleanup(setattr, Klasse, "attr", alter_wert)` zurücksetzen.
- Größenabhängige Bildverarbeitung testen: Rauschbild on the fly per `magick -size 2600x1900 plasma:fractal png:-`
  (flächige Farbbilder komprimieren zu klein, taugen dafür nicht); fehlt das Werkzeug → `skipTest`.
- Skripte ohne `.py`-Endung (Starter `bin/pi-telegram`, Bar-Skript `zai-usage`) prüft der Write-Hook nicht
  („no analyzer handles this file type“) – dort nach jedem Edit selbst `ruff check --output-format concise`
  laufen lassen; vorbestehende Befunde (BLE001, UP017) sind keine Blocker, nur der Vergleich vorher/nachher zählt.
- Wird das Skript ohne Endung von einer Statusleiste, einem Timer oder einem Daemon aufgerufen, ist es nach JEDEM
  Speichern sofort live: zuerst das Syntax-Gate (`python3 -c "import ast; ast.parse(open('<file>').read())"`),
  dann ruff, dann weiterbauen. Grund: Ein edit-Aufruf mit vielen Blöcken hat einmal das Docstring-Ende `"""`
  zerlegt (zwei Anführungszeichen standen am Ende des eingefügten Blocks), `ruff format` verweigerte mit
  Syntaxfehlern, und das Widget blieb bis zur Reparatur stumm. oldText deshalb nie an einem schließenden `"""`
  enden lassen — an der folgenden `def`-Zeile oder an ganzen Code-Zeilen ansetzen.
- Für den strengen Lauf ohne pyproject hat sich bewährt: `ruff check --line-length 100 --select ALL --ignore
  S603,S607,S310,PLR2004,EM101,EM102,TRY003,TRY301,FBT001,FBT002,FBT003,D203,D213,D212,D400,D415,COM812,ISC001,
  INP001,S608,CPY001,SIM112,T201` – damit ist „All checks passed“ erreichbar; was bleibt, sind echte
  Komplexitätsmeldungen (C901, PLR0915), gelöst durch Zerlegen in Helfer (Anzeigeblöcke, Nebeneffekt-Teile),
  nicht durch `noqa`. Die Nutzer-Config meldet `BLE001` schon im Default-Lauf: ein bewusstes Auffangnetz mit `# noqa: BLE001` kennzeichnen und BLE001 im strengen Lauf dann NICHT zusätzlich ignorieren (sonst RUF100 „unused noqa“).
- Funktionen, die ihr Eingabe-Dict an Ort und Stelle ändern (Zustandsautomaten): Werte, die man danach braucht
  („was war gesehen?“), VOR dem Aufruf kopieren – hinterher liest man nur noch den neuen Stand.
- Selftest schlägt fehl, obwohl dieselben Aufrufe von Hand gelingen → Testdaten in der Datei byteweise ansehen
  (`sed -n '…p' | cat -A`, `od -c`) statt sie neu abtippen; URLs haben gleichaussehende Formen (scp-Form
  `git@github.com:owner/repo` vs. ssh-URL `ssh://git@github.com/owner/repo`).
- Zustandsübergänge als reine Funktion bauen (alter Zustand, Beobachtungen, Zeitstempel → neuer Zustand +
  Ereignisse; Netz und Prozesse außerhalb), dann im Selftest Schritte mit festen Zeitstempeln durchspielen –
  inklusive Gegenprobe „gleiche Fassung nochmal → kein Ereignis“.
- Das edit-Tool verlangt vorher einen Aufruf des read-Werkzeugs auf derselben Datei (ein Ausschnitt genügt);
  `sed`/`cat` über bash zählt nicht („Edit without read“) – Fremddateien erst lesen, dann editieren.

## Ablauf

1. Script schreiben (write). Der Write-Hook prüft sofort und blockt bei Findern — das ist normal, kein Grund zum Umbauen auf Minimalismus.
2. `ruff format <file>` laufen lassen (Binary: `~/.pi-lens/pip-tools/bin/ruff`, kein black installiert) — löst one-line-statement- und Format-Blocker pauschal.
3. `ruff check --fix --unsafe-fixes <file>` — entfernt Autofixables (unused imports, E741, RET501, PIE810 `startswith`-Tupel). Bleibt EXE001 (Shebang ohne x-Bit): `chmod +x <file>`, oder den Shebang weglassen, wenn das Skript nur per `python3 <file>` läuft (z. B. aus einem systemd-Timer oder als Vorlage in einem Skill-Ordner, wo kein x-Bit gesetzt wird).
4. Restliche Blocker manuell nach den Mustern unten beheben; danach `python3 -c "import ast; ast.parse(open('<file>').read())"` als Syntax-Gate.
5. Smoke-Test: Script mindestens 2× ausführen (Kaltlauf ohne State, Warmlauf mit), bei JSON-Output durch `python3 -m json.tool` pipen und einen Feld-Inhalt gegen das Live-System prüfen (z. B. Temperatur gegen `sensors`).

## Exception-Muster für unattended/Bar-Scripts

- `except Exception:` / `except: pass` blockieren (BLE001, S110). Stattdessen typisiert fangen und in eine Noop-Funktion leiten:
  `except (OSError, ValueError, subprocess.SubprocessError) as e: _quiet(e)` — `_quiet` ist eine leere Funktion mit Docstring (bewusstes Schweigen, kein Log-Rauschen in Poll-Scripts). Ausnahme: Auffangnetz an einer Quellen-/Nebenläufigkeitsgrenze, das den Fehler als Ergebnisfeld plus Logzeile festhält → `except Exception as error:  # noqa: BLE001`; eine Typ-Aufzählung ließe dort Lücken, und ein durchrutschender Fehler bräche sonst den ganzen Lauf ab (alle Quellen, kein Zustand, stummer Retry).
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
- Skripte, die undokumentierte API-Felder auf Namen abbilden (Fenster, Slots): `--selftest` einbauen, der das
  Zuordnen mit einer beispielförmigen Antwort prüft und ohne API-Aufruf läuft; Gegenprobe mit der alten Zuordnung
  muss fehlschlagen. Grund: Eine falsche Zuordnung zeigt still falsche Zahlen, eine richtige Doku allein verhindert das nicht.

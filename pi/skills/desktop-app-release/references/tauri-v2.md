# Tauri v2: Fallen beim Bauen und Ausliefern

## Aufruf und Konfiguration
- tauri-cli sucht `tauri.conf.json` im Startordner, in dessen `src-tauri` und in Unterordnern bis Tiefe 3, nie in
  Eltern- oder Nachbarordnern. Liegt die UI neben `src-tauri`, startet das `tauri`-Skript der UI deshalb mit
  `cd ../src-tauri && tauri`. Sonst: „Couldn't recognize the current folder as a Tauri project“.
- Ohne `cwd` laufen `beforeDevCommand`/`beforeBuildCommand` in dem Ordner, den tauri-cli als App-Ordner erkennt.
  Beim Start aus `src-tauri` ist das meist dessen Elternordner, nicht der UI-Ordner. Hooks deshalb als Objekt mit
  `cwd` schreiben: `{ "script": "pnpm build", "cwd": "../ui" }`, für Dev zusätzlich `"wait": false`. Ein relatives
  `cwd` gilt ab `src-tauri`.
- Die Meldung „Couldn't parse --config flag as inline JSON“ ist harmlos, wenn `--config` einen Dateipfad bekommt.

## Sidecars (`bundle.externalBin`)
- Jede Datei heißt `<name>-<ziel-tripel>` (unter Windows mit `.exe`) und liegt neben dem Pfad aus `externalBin`.
- Bei macOS `--target universal-apple-darwin` baut cargo jede Architektur einzeln, und tauri-build prüft dabei die
  Datei mit dem Tripel dieser Architektur. Darum `<name>-aarch64-apple-darwin` und `<name>-x86_64-apple-darwin`
  zusätzlich zur per lipo vereinten `<name>-universal-apple-darwin` ablegen. Sonst:
  ``tauri-build: resource path `binaries/<name>-aarch64-apple-darwin` doesn't exist``.

## Linux (AppImage)
- Bei „failed to run linuxdeploy“ nennt Tauri ohne `--verbose` keine Ursache. Release-Builds unter Linux deshalb
  immer mit `--verbose` laufen lassen.
- Das .deb entsteht vor dem AppImage. Scheitert nur das AppImage, liegt das .deb trotzdem im Bundle-Ordner; ein
  Artefakt-Upload mit `if: failure()` macht es zugänglich.

## Windows
- Test-Binaries, die gegen tauri linken, brauchen ebenfalls das Manifest mit comctl32 v6 (in `build.rs` per
  `/MANIFEST:EMBED` + Manifest-Eingabe für die Test-Ziele). Grund: tauri-build bettet das Manifest nur in die
  Programm-Binaries ein; ohne Manifest brechen die Tests unter Windows schon beim Laden ab.
- Kindprozesse der GUI-App immer über eine zentrale Hilfsfunktion mit `CREATE_NO_WINDOW` starten. Grund: Sonst
  öffnet jeder Aufruf kurz ein Konsolenfenster.
- Ein eingebettetes Terminal über ConPTY muss die Cursor-Positionsanfrage `ESC[6n` beantworten. Grund: ConPTY fragt
  beim Start danach und hält die Ausgabe bis zur Antwort an.

## macOS
- Für Mikrofon, Kamera, Kalender usw. eine `Info.plist` mit den `NS…UsageDescription`-Schlüsseln in `src-tauri`
  ablegen; Tauri übernimmt sie beim Bündeln. Grund: Ohne diese Schlüssel beendet macOS die App beim ersten Zugriff.
- Entitlements, Signierung und Notarisierung brauchen ein Apple-Entwicklerkonto des Nutzers; bis dahin als „wartet
  auf Nutzer“ führen.

## Updater
- `tauri-plugin-updater` mit `default-features = false` einbinden. Grund: Seine Standard-Features schalten in
  reqwest die System-Proxy-Erkennung ein, und durch Cargos Feature-Vereinigung gilt das dann für alle HTTP-Anfragen
  der App.
- `latest.json` und Signaturen entstehen nur, wenn `TAURI_SIGNING_PRIVATE_KEY` (+ `_PASSWORD`) als Secret gesetzt
  ist; der passende Public Key steht in der Konfiguration.

# Bilder in Pis Eingabefeld bekommen (macOS / WezTerm / tmux)

## Antwort zuerst
- **Ctrl+V** (nicht Cmd+V) im Pi-Editor = `app.clipboard.pasteImage`: liest Bild direkt aus der System-Zwischenablage und hängt es an. Cmd+V ist das Terminal-Paste → kommt als bracketed paste nur als Text an, Bilddaten gehen verloren.
- Alternativen: `@<pfad>` (Datei-Referenz, Tab-Completion) oder Datei per Drag&Drop ins Terminal (fügt Pfad ein).
- Prüfen, ob das aktive Modell Bilder kann (`PI_PROVIDER`/`PI_MODEL`); sonst OCR-Fallback aus SKILL.md.

## Diagnose, falls Ctrl+V nichts tut
1. Key-Belegung: `~/.pi/agent/keybindings.json` (Override von `app.clipboard.pasteImage`?), WezTerm-Config `~/.config/wezterm/wezterm.lua` (CTRL+v gebunden?), `tmux list-keys -T root | grep C-v` und tmux-Prefix (C-v als Prefix schluckt die Taste).
2. Native Helper testen (Pi nutzt auf macOS `pi-tui/native/darwin/prebuilds/darwin-<arch>/darwin-platform.node`, Exports `getText/getImage/getFilePaths`), mit dem Node aus dem `pi`-Wrapper (`readlink -f $(which pi)`):
   ```
   $NODE -e "require('<pi-tui>/native/darwin/prebuilds/darwin-arm64/darwin-platform.node').getImage().then(b=>console.log(b==null?b:b.length))"
   ```
   `null` = kein Bild in der Zwischenablage, Zahl = Bytes → Lesen funktioniert.
3. Zwischenablage-Inhalt ohne Überschreiben ansehen: `osascript -e 'clipboard info'` (`«class PNGf»` = Bild vorhanden).

## Pitfalls
- `getImage()` nie zweimal parallel aufrufen — gleichzeitige Calls auf den Native-Helper segfaulten; ein Call pro Prozess.
- Nicht mit `screencapture -c` testen, ohne den Nutzer zu warnen — überschreibt seine Zwischenablage unwiderruflich. Bevorzugt `clipboard info` lesen oder den Nutzer selbst kopieren lassen.
- Linux: Pi nutzt `wl-paste` (Wayland/WSL) bzw. `xclip`, dann X11-Native-Helper (braucht `$DISPLAY`); Termux: kein Bild-Paste.

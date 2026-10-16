# Bilder in Pis Eingabefeld bekommen (lokal, SSH, tmux, jedes Client-OS)

## Stand / Architektur
- **Pi selbst** (Ctrl+V = `app.clipboard.pasteImage`, `interactive-mode.js handleClipboardPaste`): speichert das Bild als `/tmp/pi-clipboard-<uuid>.<ext>` und fügt nur den **Pfad** ein; das Modell liest per `read`. Über SSH bricht das, weil Ctrl+V die Zwischenablage des *Servers* liest. Cmd+V = Terminal-Paste, nur Text.
- **Eigenbau-Lösung (vorhanden):**
  1. `~/.pi/agent/extensions/image-paste.ts`: patcht `Editor.prototype.handlePaste` + `insertTextAtCursor` (Prototyp von `CustomEditor`) → `data:image/…;base64,…`, reine Bildpfad-Pastes (Drag&Drop, `\ `-Escapes, Quotes, `file://`) und `/tmp/pi-clipboard-*` werden beim **Einfügen** zu `[[ image N ]]` (Nummer = max im Editortext + 1; Daten in `globalThis`-Map, überlebt `/reload`). `input`-Hook hängt beim Absenden echte Bilder an (`{action:"transform", text, images}`).
  2. **Vision-Bridge** im selben File: aktives Modell ohne `model.input.includes("image")` → Hilfsmodell beschreibt jedes Bild via `ctx.modelRegistry.complete(vm, {systemPrompt, messages})`, Beschreibung ersetzt Bild in Nachricht (`<image label=… described-by=… file=…>`) und im `tool_result`-Hook (read-Tool liefert das Bild noch mit, Pi verwirft es erst in `pi-ai transform-messages.js downgradeUnsupportedImages`). Modellwahl: `~/.pi/agent/image-paste.json {"visionModel":"provider/id"}` / `PI_IMAGE_PASTE_VISION_MODEL` → gleicher Provider mit Vision (flash/mini/…v bevorzugt) → irgendein `getAvailable()`-Vision-Modell → Tesseract. Cache per SHA1.
  3. **WezTerm** (`dotfiles/wezterm/wezterm.lua`, `smart_paste` auf SUPER+v, CTRL+SHIFT+v): Bild in lokaler Zwischenablage → verkleinern (2000 px, >1,5 MB → JPEG) → `pane:send_paste("data:image/…")`. Läuft in-band durch SSH/tmux. macOS `osascript`+`sips`, Linux `wl-paste`/`xclip`+ImageMagick, Windows PowerShell `System.Windows.Forms.Clipboard`. Text → normales `PasteFrom('Clipboard')`; lokale Plain-Shell im Vordergrund → immer normal.

## Diagnose, falls nichts ankommt
1. Extension geladen? (`/reload`; Warnung `image-paste: Editor.handlePaste nicht gefunden` = Pi-Update hat Interna geändert → `grep -n handlePaste <pi-tui>/dist/components/editor.js`).
2. WezTerm-Teil isoliert testen: Shell-Block aus der Lua extrahieren (`awk '/^local MAC_IMG = \[==\[/{f=1;next} /^\]==\]/{f=0} f'`) und mit `sh` ausführen → erwartet `data:image/…` bzw. `TEXT`.
3. Key-Belegung: `~/.pi/agent/keybindings.json`, `tmux list-keys -T root | grep C-v`.
4. Native Helper (lokales Ctrl+V): `$NODE -e "require('<pi-tui>/native/darwin/prebuilds/darwin-arm64/darwin-platform.node').getImage().then(b=>console.log(b&&b.length))"`; Inhalt ohne Überschreiben: `osascript -e 'clipboard info'`.

## Extension außerhalb von Pi testen
- Node aus dem `pi`-Wrapper nehmen (`head -5 $(readlink -f $(which pi))` → nodejs-22-Pfad); System-Node 20 scheitert an undici (`markAsUncloneable`).
- Testordner mit `node_modules -> <pi>/lib/pi/node_modules` symlinken; `createJiti(import.meta.url, {alias:{"@earendil-works/pi-coding-agent": …/dist/index.js, "@earendil-works/pi-tui": …/dist/index.js}})`, Extension mit Fake-`pi`(`{on:(n,f)=>h[n]=f}`) laden.
- Editor: `new CustomEditor({requestRender(){}, terminal:{rows:40,columns:100}}, {borderColor:s=>s, selectList:{}}, {matches:()=>false, getKeys:()=>[]})`; echten Paste simulieren mit `ed.handleInput("\x1b[200~"+data+"\x1b[201~")`.
- Echte Modellaufrufe: `new ModelRegistry(await ModelRuntime.create({}))` (nutzt `~/.pi/agent/auth.json`).

## Pitfalls
- Es gibt kein Paste-Event in der Extension-API; `setEditorComponent` kollidiert mit pi-powerline-footer (nur ein Editor) → Prototyp patchen statt Editor ersetzen, Patch-Flag per `Symbol.for` gegen Doppel-Patch bei `/reload`.
- `getImage()` nie parallel aufrufen — gleichzeitige Calls auf den Native-Helper segfaulten.
- Tests mit `screencapture -c`/`pbcopy` überschreiben die Zwischenablage des Nutzers → vorher warnen oder `screencapture -x -R x,y,w,h <datei>` in eine Datei nutzen.
- Base64 im Paste ist hunderte KB groß: Platzhalter-Umwandlung muss *vor* Pis Steuerzeichen-Filter/`[paste #N]`-Logik greifen (deshalb `handlePaste` wrappen, nicht `getExpandedText`).

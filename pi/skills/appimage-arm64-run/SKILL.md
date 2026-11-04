---
name: appimage-arm64-run
description: AppImages auf der aarch64-Maschine (Asahi/Arch ARM) diagnostizieren und starten — x-Bit/Arch-Check, SquashFS-Extraktion ohne Runtime-Ausführung, Identifikation, box64-Emulation vs. nativer ARM64-Build. Use when an AppImage won't start, throws Exec format error, or an amd64 binary must run on this ARM machine.
---

# appimage-arm64-run

# AppImage auf aarch64: Diagnose und Start

Gilt für jede AppImage-Startstörung auf dieser Maschine (Arch Linux ARM, aarch64/Asahi).

## 1. Erstdiagnose (immer, in dieser Reihenfolge)
```bash
ls -la <app.AppImage>   # x-Bit? Downloads kommen ohne
file <app.AppImage>     # ELF-Architektur lesen
uname -m                # Host-Architektur
```
- Fehlt nur das x-Bit: `chmod +x`, fertig. Danach den Start verifizieren und Startup-Warnungen lesen:
```bash
cd <dir> && nohup ./<app.AppImage> >/tmp/<app>.log 2>&1 & sleep 6
pgrep -af <appname> | head -5; tail -30 /tmp/<app>.log
```
- `ELF ... x86-64` auf aarch64-Host → Ursache ist der Architektur-Mismatch ("Exec format error"), chmod allein heilt das nicht.

## 2. Wege bei amd64-AppImage auf ARM (Rangfolge)
1. **Arm64-Artefakt suchen**: Release-Assets des Herstellers nach `arm64`/`aarch64` durchsuchen (GitHub-Releases: Asset-Namen), bevor irgendetwas emuliert wird.
2. **Nativen aarch64-Build bauen** — wenn der Nutzer der Hersteller ist, ist das immer der richtige Weg; Tauri unterstützt `aarch64-unknown-linux-gnu` offiziell. Quell-Repo lokal suchen (`find ~ -maxdepth 4 -name src-tauri -o -name Cargo.toml`); cargo + node ≥ 22 reichen als Toolchain.
3. **box64-Emulation** — nur für schnelle Tests eines exakten Release-Artefakts; GUI-Apps (WebKitGTK/Electron) laufen zäh.

## 3. AppImage-Inhalt ohne Ausführen extrahieren
`--appimage-extract` führt das eingebettete Runtime aus und scheitert deshalb selbst bei Arch-Mismatch. SquashFS stattdessen direkt herausschneiden:
```bash
grep -abo hsqs <app.AppImage>   # ALLE Treffer listen — der erste kann false positive sein
dd if=<app.AppImage> of=img.squashfs bs=1M iflag=skip_bytes skip=<offset> status=none
nix shell nixpkgs#squashfsTools -c unsquashfs -ls img.squashfs   # validiert die Magic
```
- Sicherer als `grep hsqs`: Offset = Ende des ELF-Runtimes aus dem ELF-Header (`e_shoff + e_shentsize*e_shnum`, Bytes 0x28/0x3A in Python per `struct.unpack('<Q'…)`/`'<HH'`), dann direkt `unsquashfs -q -o <offset> -d squashfs-root <app.AppImage>` – ohne dd-Kopie, klappt für jede Architektur des AppImages.
- bsdtar/libarchive kann SquashFS nicht lesen — nicht versuchen.

## 3b. Release-AppImage als Testobjekt prüfen (eigene App, CI-Artefakt)
1. `gh run download <run> -D <dir>` → AppImage/deb/rpm + `.sig`; entpacken wie oben; `file usr/bin/*` (richtige Arch), `<bin> --version`, `LD_LIBRARY_PATH=squashfs-root/usr/lib ldd usr/bin/<app> | grep -c 'not found'` → 0; `apprun-hooks/` ansehen (linuxdeploy-gtk-Hook).
2. Fremd-Arch-Artefakt (amd64) auf dem x86-Rechner der Fleet (cachydeck) prüfen: per scp hin, dort `--appimage-extract` (dort läuft die Runtime). Läuft dort schon ein Handtest mit demselben AppImage, die Prüfsumme (`sha256sum usr/bin/<app>`) vergleichen und dessen Log als Start-Nachweis nehmen statt einen zweiten Xvfb/Start daneben zu setzen.
3. GUI-Start-Smoke headless: Xvfb + `env -i` mit isoliertem `HOME`, `GDK_BACKEND=x11`, `WEBKIT_DISABLE_COMPOSITING_MODE=1`, `WEBKIT_DISABLE_DMABUF_RENDERER=1`, `LIBGL_ALWAYS_SOFTWARE=1`, `mkdir -p $HOME/.config`; App unter `dbus-run-session --` starten. Grund: Ohne Session-Bus ruft die App `dbus-launch`, und das scheitert an der gebündelten libdbus (`version 'LIBDBUS_PRIVATE_…' not found`) → Schlüsselbund aus. Fenster per xwininfo prüfen; OCR auf dunklem Theme erst nach `magick -negate -resize 200%`.
- Identifikation des Pakets: `squashfs-root/*.desktop` (Name/Comment/Exec), eingebettete `package.json`, `strings <binary> | grep -oE "https?://…"` (Vendor-/Update-URLs, eingebettete Provider-Kataloge).
- Läuft das AppImage bereits (oder startet nach chmod), entfällt die Extraktion: Der Inhalt steht live unter `/tmp/.mount_<Name>*/` — dort CLI-Hilfe (`usr/bin/* --help`), gebündelte `package.json` (z. B. `engines.node`) und `strings` auf die Binaries direkt prüfen.

## 4. box64 auf dieser Maschine — Fallstricke
- `sudo pacman -S box64` dem nixpkgs-box64 vorziehen: der nix-Build hat `/usr/lib` nicht im nativen Suchpfad, deshalb scheitert das Wrapping von X11/Wayland/fontconfig ("Error initializing native libX11…") — für GUI-Apps eine Sackgasse ohne sudo.
- `BOX64_PREFER_EMULATED=1` setzen, damit gebündelte x86-Libs (z. B. WebKitGTK im AppImage) statt nativer ARM-Pendants genutzt werden.
- AppImages bündeln oft kein `libstdc++`/`libgcc_s` (sie setzen einen x86-Host voraus): x86_64-Versionen aus Arch `core/os/x86_64/` holen. Achtung: `gcc-libs` ist dort nur ein Metapaket — die Dateien stecken in den Split-Paketen `libstdc++` und `libgcc` (via archlinux.org-Packagesuche ermitteln, curl vom Mirror, `bsdtar -xf`, nach `usr/lib/` der Entpackung kopieren).
- Fehlende native Libs (z. B. `libasound.so.2`) per Symlink nachliefern, aber absolut verlinken: `ln -sf $(readlink -f /usr/lib/libX.so) usr/lib/libX.so` — relative Symlink-Ketten löst box64 beim Wrappen nicht zuverlässig auf.
- Native `node`-Sidecars (ext-host etc.) laufen unverändert; nur das x86-Hauptbinary braucht box64 auf PATH.

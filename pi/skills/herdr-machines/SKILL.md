---
name: herdr-machines
description: "Mit der herdr-CLI entfernte Linux-Maschinen (VPS) aufnehmen — nicht-interaktiver SSH-Key-Zwang, Remote-Binary-PATH-Falle unter /usr/local/bin, Retry nach fehlgeschlagenem machine add. Use when herdr machine add fails, asks for a password despite installed SSH keys, or reports the remote herdr binary is not resolved."
---

# herdr-machines

---
name: herdr-machines
description: Mit der herdr-CLI entfernte Linux-Maschinen (VPS) aufnehmen — nicht-interaktiver SSH-Key-Zwang, Remote-Binary-PATH-Falle unter /usr/local/bin, Retry nach fehlgeschlagenem machine add. Use when herdr machine add fails, asks for a password despite installed SSH keys, or reports the remote herdr binary is not resolved.
---

# herdr: Maschinen aufnehmen (machine add)

## Vorbedingung: SSH-Key-Login ohne Passwort UND ohne TTY

- herdr öffnet mehrere SSH-Verbindungen, auch nicht-interaktiv: Key-Login muss ohne Passwort und ohne Agent-Interaktion funktionieren. Beweis VOR dem add: `ssh -o BatchMode=yes root@HOST true` muss still durchlaufen.
- Achtung Timing: Läuft `herdr machine add` parallel zu einer SSH-Config-Änderung, nutzt der frühere Teil der Verbindung noch die alte Config. Bei Zweifel den Beweis-Test wiederholen, dann add neu starten — ein abgebrochenes add verwirft nur den lokalen Eintrag („machine was not saved"), Remote-Zustand bleibt.

## Ablauf

1. Beweis-Test (oben). Scheitert er: zuerst Key-Angebot client-seitig klären (Standardname? Agent? Host-Block? `ssh -G <host> | grep -i identityfile`), kein Server-Debug, wenn der Key noch gar nicht angeboten wird.
2. `herdr machine add root@HOST --label <label>` — bei funktionierendem Key-Login voll nicht-interaktiv.

## Falle: Remote-Binary nicht im PATH

- Fehlerbild: „installed remote binary to ~/.local/bin/herdr, but the remote shell does not resolve herdr to that path". Warum: Nicht-interaktive SSH-Kommando-Shells sourcen die PATH-Erweiterung für ~/.local/bin nicht (Ubuntu .bashrc return-early) — herdr findet das eigene Binary remote nicht.
- Fix: Binary zusätzlich systemweit verlinken: `ssh root@HOST 'ln -sf ~/.local/bin/herdr /usr/local/bin/herdr'` — das installierte Binary bleibt erhalten, kein erneutes Herunterladen. Danach `machine add` erneut; erfolgreich, wenn „Saved SSH machine <id>. Remote server is ready." kommt.

## Nach dem add

- Kurzbericht: Machine-ID + Label, und ob weitere bekannte Hosts (z. B. weitere VPS) mit gleichem Key-Login jetzt ebenfalls add-fähig sind.

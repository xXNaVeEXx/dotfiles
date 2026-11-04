#!/usr/bin/env node
// Prüft die YAML-Frontmatter aller Skills mit pis EIGENEM yaml-Paket, genau wie pis Skill-Loader
// (dist/utils/frontmatter.js: BOM weg, Zeilenenden normalisieren, Block bis "\n---", yaml.parse).
// Ein Parse-Fehler lässt pi den Skill beim Start still überspringen (nur ein Warn-Dialog).
// Zusätzlich DUP: zweite Frontmatter im Text oder mehrere doppelte lange Zeilen — die Spur eines
// Patches, der Dateiteile in sich selbst kopiert hat (lädt noch, verfälscht aber den Inhalt).
// Aufruf: node skill-frontmatter-check.mjs [skills-ordner]   (Standard: ~/.pi/agent/skills)
// Ausgabe je Skill: OK <name> <description-Länge> | FAIL <name> <Fehler> | NODESC/LONG/NOFM <name>
//                   | DUP <name> <Befund>
// Exit 1, sobald ein Skill nicht lädt oder DUP zeigt.
import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

function piCli() {
  const bin = realpathSync(execSync("command -v pi", { shell: "/bin/bash" }).toString().trim());
  // npm-Install: der Symlink zeigt direkt auf die JS-Datei.
  if (/\.[cm]?js$/.test(bin)) return bin;
  // nix-Install: Bash-Wrapper, letzte Zeile `exec node …/dist/bundle/cli.js`.
  const hits = readFileSync(bin, "utf8").match(/\/[^\s"']+\/cli\.js/g);
  if (!hits) throw new Error(`pi-Einstieg nicht gefunden in ${bin}`);
  return hits[hits.length - 1];
}

function dupFinding(body) {
  if (/\n---\nname:\s/.test(body)) return "zweite Frontmatter im Text";
  const seen = new Map();
  for (const line of body.split("\n")) {
    if (line.trim().length >= 80) seen.set(line, (seen.get(line) ?? 0) + 1);
  }
  const repeated = [...seen.values()].filter((n) => n > 1).length;
  return repeated >= 3 ? `${repeated} lange Zeilen mehrfach` : "";
}

const { parse } = createRequire(piCli())("yaml");
const root = process.argv[2] ?? join(homedir(), ".pi/agent/skills");
let bad = 0;
for (const name of readdirSync(root).sort()) {
  const file = join(root, name, "SKILL.md");
  if (!existsSync(file)) continue;
  const text = readFileSync(file, "utf8").replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const end = text.indexOf("\n---", 3);
  if (!text.startsWith("---") || end === -1) {
    bad++;
    console.log("NOFM", name);
    continue;
  }
  try {
    const desc = (parse(text.slice(4, end)) ?? {}).description;
    const dup = dupFinding(text.slice(end + 4));
    if (typeof desc !== "string" || desc.trim() === "") {
      bad++;
      console.log("NODESC", name);
    } else if (desc.length > 1024) {
      bad++;
      console.log("LONG", name, desc.length);
    } else if (dup) {
      bad++;
      console.log("DUP ", name, dup);
    } else {
      console.log("OK  ", name, desc.length);
    }
  } catch (err) {
    bad++;
    console.log("FAIL", name, String(err.message).split("\n")[0].slice(0, 160));
  }
}
process.exit(bad ? 1 : 0);

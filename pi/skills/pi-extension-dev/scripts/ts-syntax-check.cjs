#!/usr/bin/env node
// Syntax-Check für Extension-Dateien (.ts) mit pis EIGENEM jiti, so wie pis Loader sie übersetzt.
// jiti.transform() wirft bei Parse-Fehlern nicht, sondern liefert Code mit `__JITI_ERROR__`;
// dieses Skript wertet genau das aus.
// Aufruf: node ts-syntax-check.cjs <datei.ts> [...]   → OK <datei> | FAIL <datei>:<zeile>:<spalte> <meldung>; Exit 1 bei Fehler.
// Prüft nur die Syntax, keine Typen und keine Importe.
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function piCli() {
  const bin = fs.realpathSync(execSync("command -v pi", { shell: "/bin/bash" }).toString().trim());
  if (/\.[cm]?js$/.test(bin)) return bin; // npm-Install: Symlink direkt auf die JS-Datei
  const hits = fs.readFileSync(bin, "utf8").match(/\/[^\s"']+\/cli\.js/g); // nix: Bash-Wrapper mit `exec node …/cli.js`
  if (!hits) throw new Error(`pi-Einstieg nicht gefunden in ${bin}`);
  return hits[hits.length - 1];
}

const { createJiti } = require(require("node:module").createRequire(piCli()).resolve("jiti"));
const files = process.argv.slice(2);
if (!files.length) {
  console.error("Aufruf: node ts-syntax-check.cjs <datei.ts> [...]");
  process.exit(2);
}
let bad = 0;
for (const f of files) {
  const abs = path.resolve(f);
  const out = String(
    createJiti(abs).transform({ source: fs.readFileSync(abs, "utf8"), filename: abs, ts: true }),
  );
  const m = out.match(/__JITI_ERROR__ = (\{.*\})/);
  if (!m) {
    console.log("OK  ", f);
    continue;
  }
  bad++;
  let e = {};
  try {
    e = JSON.parse(m[1]);
  } catch {
    e = { message: m[1].slice(0, 160) };
  }
  console.log(`FAIL ${f}:${e.line ?? "?"}:${e.column ?? "?"} ${e.code ?? ""} ${e.message ?? ""}`.trim());
}
process.exit(bad ? 1 : 0);

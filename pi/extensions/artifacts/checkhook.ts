/**
 * checkhook.ts — Blitz-Syntaxcheck nach Datei-Änderungen (< 1–2 s, keine Builds).
 *
 * Vertrags-Exporte:
 *   interface CheckResult
 *   async function runQuickCheck(path: string): Promise<CheckResult>
 *   async function selfTest(): Promise<string>
 *
 * Endungs-Mapping:
 *   .js/.mjs/.cjs → "node --check"   (execFile, Timeout 5000 ms)
 *   .py           → "python3 ast"    (ast.parse, erzeugt kein __pycache__)
 *   .json         → "json parse"     (python3 -m json.tool, output bei Erfolg leer)
 *   sonstige      → nicht anwendbar: { ok:true, tool:"none", output:"", durationMs:0, applicable:false }
 *
 * Nur node:-Builtins (child_process, path). Keine npm-Deps.
 */

import { execFile } from "node:child_process";
import { extname } from "node:path";

export interface CheckResult {
  ok: boolean;
  tool: string;
  output: string;
  durationMs: number;
  applicable: boolean;
}

const TIMEOUT_MS = 5000;
const MAX_OUTPUT_CHARS = 400;

type ExecFileError = Error & { killed?: boolean };

interface RawExec {
  exitedZero: boolean;
  stdout: string;
  stderr: string;
  killed: boolean;
  message: string;
}

/** execFile als Promise. Fehler (Exitcode != 0, ENOENT, Timeout) werfen nicht, sondern landen im Ergebnis. */
function execCapture(cmd: string, args: string[]): Promise<RawExec> {
  return new Promise<RawExec>((resolve) => {
    execFile(cmd, args, { timeout: TIMEOUT_MS, encoding: "utf8" }, (err, stdout, stderr) => {
      const e = err as ExecFileError | null;
      resolve({
        exitedZero: err === null,
        stdout: typeof stdout === "string" ? stdout : "",
        stderr: typeof stderr === "string" ? stderr : "",
        killed: e !== null && e.killed === true,
        message: e !== null ? e.message : "",
      });
    });
  });
}

/** Kombinierten Text trimmen und auf max. 400 Zeichen kürzen („…“ am Ende beim Kürzen). */
function shorten(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_OUTPUT_CHARS) return trimmed;
  return trimmed.slice(0, MAX_OUTPUT_CHARS - 1) + "…";
}

async function checkWith(tool: string, cmd: string, args: string[]): Promise<CheckResult> {
  const startedAt = Date.now();
  const raw = await execCapture(cmd, args);
  const durationMs = Date.now() - startedAt;

  if (raw.exitedZero) {
    // Exit-Code 0 => ok, output bleibt leer.
    return { ok: true, tool, output: "", durationMs, applicable: true };
  }

  let text = `${raw.stderr}\n${raw.stdout}`.trim();
  if (text === "") {
    if (raw.killed) {
      text = `Zeitlimit überschritten (Abbruch nach ${TIMEOUT_MS} ms)`;
    } else {
      text = raw.message.split("\n")[0] || `Prozess fehlgeschlagen: ${cmd}`;
    }
  }
  return { ok: false, tool, output: shorten(text), durationMs, applicable: true };
}

/** Blitz-Syntaxcheck einer Datei anhand der Endung. */
export async function runQuickCheck(path: string): Promise<CheckResult> {
  const ext = extname(path).toLowerCase();

  if (ext === ".js" || ext === ".mjs" || ext === ".cjs") {
    return checkWith("node --check", "node", ["--check", path]);
  }
  if (ext === ".py") {
    // ast.parse ohne Import der Datei => kein __pycache__-Verzeichnis.
    return checkWith("python3 ast", "python3", [
      "-c",
      "import ast,sys; ast.parse(open(sys.argv[1],encoding='utf-8').read())",
      path,
    ]);
  }
  if (ext === ".json") {
    // json.tool schreibt das geparste JSON auf stdout — bei Erfolg bleibt output "".
    return checkWith("json parse", "python3", ["-m", "json.tool", path]);
  }

  // .ts/.tsx/.html/.md/.css/… : kein Blitz-Syntaxcheck möglich → nicht anwendbar.
  return { ok: true, tool: "none", output: "", durationMs: 0, applicable: false };
}

// ---------------------------------------------------------------------------
// Selbsttest — legt Fixtures in /tmp/pi-artifacts-test-check an und prüft sie.
// ---------------------------------------------------------------------------

const TEST_DIR = "/tmp/pi-artifacts-test-check";

const FIXTURES_PY = [
  "import pathlib",
  `d = pathlib.Path(${JSON.stringify(TEST_DIR)})`,
  "d.mkdir(parents=True, exist_ok=True)",
  "(d / 'broken.js').write_text('func ({', encoding='utf-8')",
  "(d / 'broken.py').write_text('def (', encoding='utf-8')",
  "(d / 'broken.json').write_text('{', encoding='utf-8')",
  "(d / 'ok.js').write_text('console.log(1)', encoding='utf-8')",
  "(d / 'style.css').write_text('body { color: red; }', encoding='utf-8')",
].join("\n");

export async function selfTest(): Promise<string> {
  const failures: string[] = [];
  const report: string[] = [];

  const verify = (cond: boolean, what: string): void => {
    if (!cond) failures.push(what);
  };

  const setup = await execCapture("python3", ["-c", FIXTURES_PY]);
  if (!setup.exitedZero) {
    return `✗ checkhook: Fixtures nicht anlegbar — ${shorten(`${setup.stderr}\n${setup.message}`)}`;
  }

  const brokenJs = await runQuickCheck(`${TEST_DIR}/broken.js`);
  verify(!brokenJs.ok, "broken.js: ok muss false sein");
  verify(brokenJs.tool.includes("node"), `broken.js: tool muss "node" enthalten (ist "${brokenJs.tool}")`);
  verify(brokenJs.applicable, "broken.js: applicable muss true sein");
  verify(brokenJs.durationMs >= 0, "broken.js: durationMs muss >= 0 sein");
  report.push(`broken.js → Fehler erkannt (${brokenJs.tool}, ${brokenJs.durationMs} ms)`);

  const brokenPy = await runQuickCheck(`${TEST_DIR}/broken.py`);
  verify(!brokenPy.ok, "broken.py: ok muss false sein");
  verify(brokenPy.applicable, "broken.py: applicable muss true sein");
  verify(brokenPy.durationMs >= 0, "broken.py: durationMs muss >= 0 sein");
  report.push(`broken.py → Fehler erkannt (${brokenPy.tool}, ${brokenPy.durationMs} ms)`);

  const brokenJson = await runQuickCheck(`${TEST_DIR}/broken.json`);
  verify(!brokenJson.ok, "broken.json: ok muss false sein");
  verify(brokenJson.applicable, "broken.json: applicable muss true sein");
  verify(brokenJson.durationMs >= 0, "broken.json: durationMs muss >= 0 sein");
  report.push(`broken.json → Fehler erkannt (${brokenJson.tool}, ${brokenJson.durationMs} ms)`);

  const okJs = await runQuickCheck(`${TEST_DIR}/ok.js`);
  verify(okJs.ok, `ok.js: ok muss true sein (output: "${okJs.output}")`);
  verify(okJs.output === "", `ok.js: output muss "" sein (ist "${okJs.output}")`);
  verify(okJs.durationMs >= 0, "ok.js: durationMs muss >= 0 sein");
  report.push(`ok.js → ok, output leer (${okJs.tool}, ${okJs.durationMs} ms)`);

  const css = await runQuickCheck(`${TEST_DIR}/style.css`);
  verify(!css.applicable, "style.css: applicable muss false sein");
  verify(css.ok, "style.css: ok muss true sein");
  verify(css.tool === "none", `style.css: tool muss "none" sein (ist "${css.tool}")`);
  verify(css.durationMs === 0, `style.css: durationMs muss 0 sein (ist ${css.durationMs})`);
  report.push("style.css → nicht anwendbar (none)");

  if (failures.length > 0) {
    return `✗ checkhook: ${failures.length} Assertion(s) fehlgeschlagen — ${failures.join(" | ")}`;
  }
  return `✓ checkhook: alle Assertions bestanden — ${report.join("; ")}`;
}

if (process.argv[1]?.includes("checkhook.ts")) { void selfTest().then((s) => console.log(s)).catch((e) => { console.error("SELFTEST FAIL:", e); process.exit(1); }); }

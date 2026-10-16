/**
 * shotdiff — HTML-Vorher/Nachher-Vergleich als Terminal-Bilder.
 *
 * screenshotPair(): rendert eine HTML-Datei („nachher“) und optional einen
 * übergebenen Vorher-Inhalt per headless Brave als PNGs nach
 * ~/.cache/pi-artifacts/. Der Vorher-Stand wird als Nachbar-Datei
 * `.pi-shot-before-<name>` im selben Verzeichnis geschrieben, damit relative
 * Assets/CSS funktionieren. renderSideBySide(): beide PNGs nebeneinander als
 * chafa-Symbolbilder mit │-Trenner und Label-Zeile.
 *
 * Selbsttest: node --experimental-strip-types shotdiff.ts
 */

import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BROWSER = "/usr/bin/brave";
const SHOT_DIR = join(process.env.HOME ?? "/tmp", ".cache/pi-artifacts");

export interface ShotPair {
	before?: string;
	after?: string;
	error?: string;
}

/** PNG gültig: vorhanden und plausibel groß (>1000 Bytes). */
function pngOk(p: string): boolean {
	try {
		return statSync(p).size > 1000;
	} catch {
		return false;
	}
}

/** Kurzfassung eines execFile-Fehlers (stderr bevorzugt, letzte Zeilen). */
function shortErr(e: unknown): string {
	const ee = e as { stderr?: string | Buffer; message?: string };
	let raw = "";
	if (typeof ee.stderr === "string" && ee.stderr.trim()) raw = ee.stderr;
	else if (Buffer.isBuffer(ee.stderr) && ee.stderr.length) raw = ee.stderr.toString("utf8");
	else raw = String(ee.message ?? e);
	return raw.trim().split("\n").slice(-3).join(" | ").slice(0, 200);
}

/** Eine HTML-Datei per headless Brave als PNG rendern (gecacht auf mtime). */
async function shoot(htmlPath: string, kind: "before" | "after"): Promise<{ png?: string; err?: string }> {
	let mtime = "";
	try {
		mtime = String(statSync(htmlPath).mtimeMs);
	} catch {
		return { err: `Quelldatei nicht lesbar: ${htmlPath}` };
	}
	const hash = createHash("md5").update(`${htmlPath}:${mtime}`).digest("hex").slice(0, 16);
	const out = join(SHOT_DIR, `pair-${hash}-${kind}.png`);
	if (pngOk(out)) return { png: out };
	try {
		mkdirSync(SHOT_DIR, { recursive: true });
	} catch {}
	try {
		await execFileAsync(
			BROWSER,
			[
				"--headless",
				"--disable-gpu",
				`--screenshot=${out}`,
				"--window-size=1000,1600",
				"--virtual-time-budget=3000",
				"--hide-scrollbars",
				`file://${htmlPath}`,
			],
			{ timeout: 20_000, maxBuffer: 12 * 1024 * 1024 },
		);
	} catch (e) {
		return { err: shortErr(e) };
	}
	return pngOk(out) ? { png: out } : { err: `${BROWSER} lieferte kein Bild` };
}

/**
 * Vorher/Nachher-Screenshots einer HTML-Datei erzeugen.
 * - after: Screenshot von `path` selbst.
 * - beforeContent === null → kein before-Feld. Sonst Inhalt als Nachbar-Datei
 *   `.pi-shot-before-<basename>` ins selbe Verzeichnis schreiben (relative
 *   Assets/CSS bleiben gültig) und diese screenshoten.
 * Beide fehlgeschlagen → {error}; nur eine da → nur das eine Feld.
 * Cache-PNGs werden nie gelöscht.
 */
export async function screenshotPair(path: string, beforeContent: string | null): Promise<ShotPair> {
	const abs = resolve(path);
	let beforeFile: string | null = null;
	if (beforeContent !== null) {
		beforeFile = join(dirname(abs), `.pi-shot-before-${basename(abs)}`);
		try {
			writeFileSync(beforeFile, beforeContent, "utf8");
		} catch (e) {
			return { error: `Vorher-Stand nicht schreibbar: ${String((e as Error).message)}` };
		}
	}
	const after = await shoot(abs, "after");
	const before = beforeFile ? await shoot(beforeFile, "before") : undefined;
	const res: ShotPair = {};
	if (after.png) res.after = after.png;
	if (before?.png) res.before = before.png;
	if (!res.after && !res.before) {
		return { error: [after.err, before?.err].filter(Boolean).join(" · ") || "Screenshots fehlgeschlagen" };
	}
	return res;
}

/** chafa-Symbolbild einer PNG-Datei als Zeilen (exakt w Spalten breit). */
function chafaLines(png: string, w: number, h: number): string[] {
	const out = execFileSync("chafa", ["--format", "symbols", "-s", `${w}x${h}`, png], {
		encoding: "utf8",
		maxBuffer: 12 * 1024 * 1024,
	});
	const lines = out.split("\n");
	// reine Steuerzeilen (nur ANSI-Reset/Cursor, sichtbar leer) am Ende entfernen;
	// farbige Leerzeichen-Reihen sind Bildinhalt und bleiben erhalten
	const visLen = (l: string) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").length;
	while (lines.length && visLen(lines[lines.length - 1]!) === 0) lines.pop();
	return lines;
}

/**
 * Zwei PNGs nebeneinander (oder einzeln) als Terminal-Zeilen rendern.
 * Beide da: Label-Zeile „VORHER │ NACHHER“, darunter gezippte chafa-Zeilen
 * mit │-Trenner bei halber Breite. Nur eins: einzelnes Bild, Label
 * „NUR EIN STAND“. Keins: ["keine Bilder"]. chafa-Fehler → Warnzeile.
 */
export function renderSideBySide(pngA: string | null, pngB: string | null, width: number, height: number): string[] {
	const a = pngA || null;
	const b = pngB || null;
	try {
		if (a && b) {
			const halfW = Math.floor((width - 3) / 2);
			const lines: string[] = ["VORHER".padEnd(halfW) + "│" + "NACHHER".padStart(halfW)];
			const left = chafaLines(a, halfW, height - 2);
			const right = chafaLines(b, halfW, height - 2);
			const n = Math.max(left.length, right.length);
			for (let i = 0; i < n; i++) {
				lines.push((left[i] ?? "").padEnd(halfW) + "│" + (right[i] ?? ""));
			}
			return lines;
		}
		if (a || b) {
			return ["NUR EIN STAND", ...chafaLines((a ?? b)!, width - 2, height - 1)];
		}
		return ["keine Bilder"];
	} catch (e) {
		return [`⚠ chafa fehlgeschlagen: ${String((e as Error).message ?? e)}`];
	}
}

/** Selbsttest: rote/blauer HTML-Stand → Paar-Shoots + Side-by-Side-Render. */
export async function selfTest(): Promise<string> {
	const dir = "/tmp/pi-artifacts-test-shot";
	mkdirSync(dir, { recursive: true });
	const a = join(dir, "a.html");
	const b = join(dir, "b.html");
	const page = (bg: string, h: string, t: string) =>
		`<!doctype html><html><head><meta charset="utf-8"><style>body{background:${bg};color:#fff;font-family:sans-serif;padding:24px}</style></head><body><h1>${h}</h1><p>${t}</p></body></html>`;
	writeFileSync(a, page("#b3282d", "Vorher", "Roter Stand — alter Entwurf."), "utf8");
	writeFileSync(b, page("#2848b3", "Nachher", "Blauer Stand — überarbeiteter Entwurf."), "utf8");
	const pair = await screenshotPair(b, readFileSync(a, "utf8"));
	if (pair.error || !pair.before || !pair.after) {
		return `✗ shotdiff: screenshotPair fehlgeschlagen (${pair.error ?? "PNGs fehlen"})`;
	}
	const sizeBefore = statSync(pair.before).size;
	const sizeAfter = statSync(pair.after).size;
	if (sizeBefore <= 1024 || sizeAfter <= 1024) {
		return `✗ shotdiff: PNGs zu klein (before=${sizeBefore}B, after=${sizeAfter}B)`;
	}
	const lines = renderSideBySide(pair.before, pair.after, 80, 20);
	if (lines.length < 5) return `✗ shotdiff: renderSideBySide liefert nur ${lines.length} Zeilen`;
	if (!lines[0]!.includes("VORHER") || !lines[0]!.includes("NACHHER")) {
		return `✗ shotdiff: Label-Zeile fehlt VORHER/NACHHER: ${JSON.stringify(lines[0])}`;
	}
	for (let i = 0; i < lines.length; i++) {
		// ANSI-Escapes ignorieren — nur sichtbare Breite zählen
		const vis = lines[i]!.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").length;
		if (vis > 80) return `✗ shotdiff: Zeile ${i} zu breit (sichtbar ${vis} > 80)`;
	}
	return `✓ shotdiff: Paar erzeugt (before=${sizeBefore}B, after=${sizeAfter}B), Side-by-Side ${lines.length} Zeilen, Labels + Breite ok`;
}

if (process.argv[1]?.includes("shotdiff.ts")) {
	void selfTest()
		.then((s) => console.log(s))
		.catch((e) => {
			console.error("SELFTEST FAIL:", e);
			process.exit(1);
		});
}

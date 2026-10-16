/**
 * session.ts — Session-Diff über geänderte Dateien + Conventional-Commits-Vorschlag.
 *
 * `sessionDiff(paths)` liefert pro Datei einen Block:
 *   - kein Git-Repo (oder git fehlt)  → "== <path> (kein Git-Repo) ==" + Zeilenzahl
 *   - unversioniert (git status "??") → "== <path> (NEU, unversioniert) ==" + Zeilenzahl
 *   - keine Änderung gegenüber HEAD   → "== <path> (sauber gegenüber HEAD) =="
 *   - geändert                        → "== <path> ==" + git-diff (max. 400 Zeilen)
 *
 * `commitProposal(entries)` baut daraus einen Conventional-Commits-Entwurf:
 * type aus Schlüsselwörtern der Notizen, scope = häufigstes Verzeichnis.
 *
 * Selbsttest: `node --experimental-strip-types session.ts`
 */

import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileP = promisify(execFile);

const GIT_TIMEOUT_MS = 8_000; // Vorgabe: 5000–10000 ms
const GIT_MAX_BUFFER = 10 * 1024 * 1024; // 10 MB
const MAX_DIFF_LINES = 400;
const SUBJECT_MAX = 69;
const SENTENCE_MAX = 100;

export interface SessionEntry {
	path: string;
	plus: number;
	minus: number;
	note?: string;
}

/** `git -C dir …` ausführen; `null` bei jedem Fehler (git fehlt, kein Repo, Timeout). */
async function git(dir: string, args: string[]): Promise<string | null> {
	try {
		const { stdout } = await execFileP("git", ["-C", dir, ...args], {
			timeout: GIT_TIMEOUT_MS,
			maxBuffer: GIT_MAX_BUFFER,
		});
		return stdout;
	} catch {
		return null;
	}
}

/** Zeilenzahl als eingerückte Block-Zeile; "(nicht lesbar)" wenn Datei fehlt oder nicht lesbar ist. */
function countLine(p: string): string {
	try {
		if (!existsSync(p)) return "  (nicht lesbar)";
		const content = readFileSync(p, "utf8");
		const n = content === "" ? 0 : content.split("\n").length - (content.endsWith("\n") ? 1 : 0);
		return `  Zeilen: ${n}`;
	} catch {
		return "  (nicht lesbar)";
	}
}

// ─── sessionDiff ─────────────────────────────────────────────────────────────

export async function sessionDiff(paths: string[]): Promise<string> {
	const unique = [...new Set(paths.filter((p) => typeof p === "string" && p !== ""))];
	const blocks: string[] = [];

	for (const p of unique) {
		const dir = path.dirname(p);
		const base = path.basename(p);

		// Kein Repository (oder git nicht installiert)?
		const inside = await git(dir, ["rev-parse", "--is-inside-work-tree"]);
		if (inside === null || inside.trim() !== "true") {
			blocks.push([`== ${p} (kein Git-Repo) ==`, countLine(p)].join("\n"));
			continue;
		}

		// Unversioniert? (git status --porcelain beginnt mit "??")
		const status = await git(dir, ["status", "--porcelain", "--", base]);
		if (status !== null && status.trim().startsWith("??")) {
			blocks.push([`== ${p} (NEU, unversioniert) ==`, countLine(p)].join("\n"));
			continue;
		}

		// Diff gegenüber HEAD (leer = sauber; null = Fehler → ebenfalls als sauber deuten)
		const diff = await git(dir, ["diff", "--no-color", "HEAD", "--", base]);
		if (diff === null || diff.trim() === "") {
			blocks.push(`== ${p} (sauber gegenüber HEAD) ==`);
			continue;
		}

		const lines = diff.replace(/\n$/, "").split("\n");
		const shown = lines.slice(0, MAX_DIFF_LINES);
		if (lines.length > MAX_DIFF_LINES) shown.push("  … (gekürzt)");
		blocks.push([`== ${p} ==`, ...shown].join("\n"));
	}

	return blocks.join("\n\n");
}

// ─── commitProposal ──────────────────────────────────────────────────────────

/** type-Erkennung: erstes passendes Muster über alle Notizen gewinnt. */
const TYPE_RULES: Array<[RegExp, string]> = [
	[/fix|bug|fehler|kaputt|beheb/, "fix"],
	[/refactor|aufräum|umbenenn|vereinfach/, "refactor"],
	[/dokument|kommentar|readme/, "docs"],
	[/test/, "test"],
	[/config|build|chore/, "chore"],
];

/** Erster Satz einer Notiz: bis zum ersten Punkt, Whitespace normalisiert, max. 100 Zeichen. */
function firstSentence(note: string): string {
	const satz = (note.split(".")[0] ?? "").replace(/\s+/g, " ").trim();
	return satz.length > SENTENCE_MAX ? satz.slice(0, SENTENCE_MAX) : satz;
}

export function commitProposal(entries: SessionEntry[]): string {
	// type: Schlüsselwörter in allen Notizen (kleingeschrieben) suchen, Reihenfolge = Priorität.
	const notes = entries.map((e) => (e.note ?? "").toLowerCase());
	let type = "feat";
	for (const [re, t] of TYPE_RULES) {
		if (notes.some((n) => n !== "" && re.test(n))) {
			type = t;
			break;
		}
	}

	// scope: häufigster basename(dirname); "." oder leer → kein scope.
	const counts = new Map<string, number>();
	for (const e of entries) {
		const dir = path.basename(path.dirname(e.path));
		if (dir === "" || dir === ".") continue;
		counts.set(dir, (counts.get(dir) ?? 0) + 1);
	}
	let scope = "";
	let best = 0;
	for (const [dir, n] of counts) {
		if (n > best) {
			best = n;
			scope = dir;
		}
	}

	// subject: Notiz des ersten Eintrags (max. 69 Zeichen), sonst Datei-Aufzählung.
	const firstNote = (entries[0]?.note ?? "").replace(/\s+/g, " ").trim();
	let subject: string;
	if (firstNote !== "") {
		subject = firstNote.length > SUBJECT_MAX ? `${firstNote.slice(0, SUBJECT_MAX)}…` : firstNote;
	} else {
		const names = entries.slice(0, 2).map((e) => path.basename(e.path));
		subject =
			entries.length === 1
				? `1 Datei geändert: ${names.join(", ")}`
				: `${entries.length} Dateien geändert: ${names.join(", ")}${entries.length > 2 ? ", …" : ""}`;
	}

	const header = scope !== "" ? `${type}(${scope}): ${subject}` : `${type}: ${subject}`;

	// body: eine Zeile pro Eintrag, Notiz als erster Satz dahinter.
	const body = entries.map((e) => {
		let line = `  - ${path.basename(e.path)} (+${e.plus}/−${e.minus})`;
		const satz = firstSentence(e.note ?? "");
		if (satz !== "") line += `: ${satz}`;
		return line;
	});

	return body.length > 0 ? `${header}\n\n${body.join("\n")}` : header;
}

// ─── Selbsttest ──────────────────────────────────────────────────────────────

export async function selfTest(): Promise<string> {
	const dir = "/tmp/pi-artifacts-test-session";
	const noRepoDir = "/tmp/pi-artifacts-test-session-nogit";
	rmSync(dir, { recursive: true, force: true });
	rmSync(noRepoDir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	mkdirSync(noRepoDir, { recursive: true });

	// git im Test-Repo; Fehler sollen den Selbsttest abbrechen.
	const run = async (args: string[]) => {
		await execFileP("git", ["-C", dir, ...args], { timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER });
	};
	const commitArgs = ["-c", "user.email=self@test.invalid", "-c", "user.name=Selbsttest", "-c", "commit.gpgsign=false"];

	// 1) Repo anlegen, committen, ändern → Diff muss −/+Zeilen enthalten.
	const testTxt = path.join(dir, "test.txt");
	writeFileSync(testTxt, "eins\nzwei\n");
	await run(["init"]);
	await run([...commitArgs, "add", "test.txt"]);
	await run([...commitArgs, "commit", "-m", "init"]);
	writeFileSync(testTxt, "eins\nzwei geändert\ndrei\n");
	const diffOut = await sessionDiff([testTxt]);
	if (!/(^|\n)\+/.test(diffOut) || !/(^|\n)-/.test(diffOut)) {
		throw new Error(`sessionDiff enthält keine −/+Zeilen: ${JSON.stringify(diffOut)}`);
	}

	// 2) Unversionierte Datei → NEU-Block mit Zeilenzahl.
	const neuTxt = path.join(dir, "neu.txt");
	writeFileSync(neuTxt, "neu\n");
	const neuOut = await sessionDiff([neuTxt]);
	if (!neuOut.includes("(NEU") || !neuOut.includes("Zeilen: 1")) {
		throw new Error(`NEU-Erkennung fehlerhaft: ${JSON.stringify(neuOut)}`);
	}

	// 3) Pfad außerhalb eines Repos → kein-Repo-Block.
	const fremdTxt = path.join(noRepoDir, "fremd.txt");
	writeFileSync(fremdTxt, "x\ny\n");
	const fremdOut = await sessionDiff([fremdTxt]);
	if (!fremdOut.includes("(kein Git-Repo)") || !fremdOut.includes("Zeilen: 2")) {
		throw new Error(`kein-Repo-Fallback fehlerhaft: ${JSON.stringify(fremdOut)}`);
	}

	// 4) Riesiger Diff → Kürzungsmarker.
	const bigTxt = path.join(dir, "big.txt");
	writeFileSync(bigTxt, Array.from({ length: 500 }, (_, i) => `alt ${i}`).join("\n") + "\n");
	await run([...commitArgs, "add", "big.txt"]);
	await run([...commitArgs, "commit", "-m", "big"]);
	writeFileSync(bigTxt, Array.from({ length: 500 }, (_, i) => `neu ${i}`).join("\n") + "\n");
	const bigOut = await sessionDiff([bigTxt]);
	if (!bigOut.includes("… (gekürzt)")) {
		throw new Error(`Diff-Kürzung fehlt: ${bigOut.split("\n").length} Zeilen`);
	}

	// 5) commitProposal: type-Erkennung aus Notiz + feat-Fallback ohne Notiz.
	const fix = commitProposal([{ path: path.join(dir, "parser.ts"), plus: 3, minus: 1, note: "behebt Bug im Parser" }]);
	if (!fix.startsWith("fix")) {
		throw new Error(`commitProposal soll mit "fix" beginnen: ${JSON.stringify(fix)}`);
	}
	const feat = commitProposal([{ path: path.join(dir, "feature.ts"), plus: 5, minus: 0 }]);
	if (!feat.startsWith("feat")) {
		throw new Error(`commitProposal soll mit "feat" beginnen: ${JSON.stringify(feat)}`);
	}

	rmSync(dir, { recursive: true, force: true });
	rmSync(noRepoDir, { recursive: true, force: true });
	return "✓ session: Git-Diff (−/+), NEU-Erkennung, kein-Repo-Fallback, Diff-Kürzung, fix-/feat-Vorschlag OK";
}

if (process.argv[1]?.includes("session.ts")) { void selfTest().then((s) => console.log(s)).catch((e) => { console.error("SELFTEST FAIL:", e); process.exit(1); }); }

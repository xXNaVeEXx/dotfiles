/**
 * pi-artifacts — Viewer-Aktionen: Zwischenablage, git add, Editor-Split.
 *
 * Kleine Baukasten-Funktionen für den Artefakt-Viewer (index.ts):
 *  · yank(text)        → Text in die System-Zwischenablage (wl-copy, Fallback xclip)
 *  · stage(path)       → Datei per `git add` in den Index legen
 *  · openEditor(p, n)  → nvim im tmux-Split rechts (50 % Breite) ab Zeile n öffnen
 *
 * Alle Funktionen sind bewusst defensiv: Timeouts überall, keine Exceptions nach
 * außen, Ergebnis immer als { ok, error? } mit kurzen Fehler-Strings (≤ 200 Zn.).
 * Nur node:-Builtins, keine npm-Abhängigkeiten.
 */

import { execFile, execFileSync, spawn } from "child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { homedir } from "os";
import { basename, dirname, join } from "path";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

/** Fehler auf eine Zeile und max. 200 Zeichen kürzen. */
function short(e: unknown, max = 200): string {
	const s = String((e as Error)?.message ?? e).split("\n")[0] ?? "";
	return s.slice(0, max);
}

/** Binaries aus ~/.nix-profile/bin bevorzugen — der PATH des Aufrufers kennt sie evtl. nicht. */
function resolveTool(name: string): string {
	const abs = join(homedir(), ".nix-profile", "bin", name);
	return existsSync(abs) ? abs : name;
}

interface PipeResult {
	ok: boolean;
	error?: string;
	timedOut?: boolean;
}

/**
 * `text` an `cmd args` auf stdin geben, stdin sauber beenden und auf Exit warten.
 * Pflicht-Timeout: wl-copy kann ohne aktive Wayland-Session hängen.
 */
function pipeText(cmd: string, args: string[], text: string, timeoutMs: number): Promise<PipeResult> {
	return new Promise((resolve) => {
		let settled = false;
		let stderr = "";
		const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "pipe"] });
		child.stderr?.on("data", (d: Buffer) => {
			if (stderr.length < 400) stderr += d.toString();
		});
		const finish = (r: PipeResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			// wl-copy forked einen Hintergrund-Daemon, der geerbte Pipe-FDs offen hält —
			// Streams zerstören + unref, sonst exitiert der aufrufende Prozess nie.
			child.unref();
			child.stdin.destroy();
			child.stderr?.destroy();
			resolve(r);
		};
		const timer = setTimeout(() => {
			child.kill("SIGKILL");
			finish({ ok: false, error: `${basename(cmd)} Timeout`, timedOut: true });
		}, timeoutMs);
		child.on("error", (err) => finish({ ok: false, error: err.message })); // ENOENT etc.
		child.on("close", (code) => {
			if (code === 0) finish({ ok: true });
			else finish({ ok: false, error: `${basename(cmd)} exit ${code}${stderr.trim() ? `: ${short(stderr.trim())}` : ""}` });
		});
		child.stdin.on("error", () => {}); // EPIPE, falls das Tool früh exitiert
		child.stdin.end(text);
	});
}

/** Text in die Zwischenablage kopieren (wl-copy, Fallback xclip -selection clipboard). */
export function yank(text: string): Promise<{ ok: boolean; error?: string }> {
	return (async () => {
		const r = await pipeText(resolveTool("wl-copy"), [], text, 3000);
		if (r.ok) return { ok: true };
		if (r.timedOut) return { ok: false, error: r.error }; // "wl-copy Timeout" — kein sinnvoller Fallback
		const r2 = await pipeText(resolveTool("xclip"), ["-selection", "clipboard"], text, 3000);
		if (r2.ok) return { ok: true };
		return { ok: false, error: short(`wl-copy: ${r.error} · xclip: ${r2.error}`) };
	})();
}

/** Datei per `git add` stagen (Repo = Verzeichnis der Datei). */
export async function stage(path: string): Promise<{ ok: boolean; error?: string }> {
	try {
		await execFileAsync("git", ["-C", dirname(path), "add", basename(path)], { timeout: 5000 });
		return { ok: true };
	} catch (e) {
		const err = e as { stderr?: string; stdout?: string };
		return { ok: false, error: short(String(err.stderr || err.stdout || (e as Error).message || e)) };
	}
}

/** nvim ab Zeile `line` im rechten tmux-Split (50 %) öffnen — synchron. */
export function openEditor(path: string, line: number): { ok: boolean; error?: string } {
	if (!process.env.TMUX) return { ok: false, error: "kein tmux — Editor-Split nicht verfügbar" };
	try {
		execFileSync("tmux", ["split-window", "-h", "-l", "50%", "nvim", `+${Math.max(1, line)}`, path], { stdio: "ignore" });
		return { ok: true };
	} catch (e) {
		return { ok: false, error: short(e) };
	}
}

// ─── Selbsttest ──────────────────────────────────────────────────────────────

export async function selfTest(): Promise<string> {
	const notes: string[] = [];

	// stage: frisches Repo, Datei stagen — Porcelain muss "A " zeigen
	const dir = "/tmp/pi-artifacts-test-actions";
	rmSync(dir, { recursive: true, force: true });
	mkdirSync(dir, { recursive: true });
	execFileSync("git", ["-C", dir, "init"], { stdio: "ignore" });
	const file = join(dir, "datei.txt");
	writeFileSync(file, "pi-artifacts Selbsttest\n");
	const st = await stage(file);
	const porcelain = execFileSync("git", ["-C", dir, "status", "--porcelain"], { encoding: "utf8" });
	if (!st.ok || !porcelain.includes("A ")) {
		throw new Error(`stage fehlgeschlagen: ${JSON.stringify(st)} · porcelain="${porcelain.trim()}"`);
	}
	notes.push(`stage ✓ (${porcelain.trim()})`);

	// yank: Tool gefunden ODER sauberer Fehler — Hauptsache kein Hang (Timeouts sind drin)
	const yk = await yank("pi-artifacts Selbsttest");
	notes.push(yk.ok ? "yank ✓ (Zwischenablage gesetzt)" : `yank sauber abgelehnt (${yk.error})`);

	// openEditor: ohne TMUX muss abgelehnt werden — echten Split NICHT öffnen
	const saved = process.env.TMUX;
	delete process.env.TMUX;
	let ed: { ok: boolean; error?: string };
	try {
		ed = openEditor(file, 3);
	} finally {
		if (saved !== undefined) process.env.TMUX = saved;
	}
	if (ed.ok || !ed.error?.includes("tmux")) {
		throw new Error(`openEditor ohne TMUX unerwartet: ${JSON.stringify(ed)}`);
	}
	notes.push("openEditor ✓ (ohne tmux abgelehnt)");

	return `✓ actions: ${notes.join(" · ")}`;
}

if (process.argv[1]?.includes("actions.ts")) {
	void selfTest()
		.then((s) => console.log(s))
		.catch((e) => {
			console.error("SELFTEST FAIL:", e);
			process.exit(1);
		});
}

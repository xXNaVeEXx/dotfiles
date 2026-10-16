/**
 * pi-artifacts — ChatGPT-style Artifact-Viewer direkt im pi-Chat.
 *
 * Tool `artifact`: registriert eine Datei als Artefakt (vom Agent aufgerufen).
 * Command `/artifact [id]` (Alias `/artifacts`): öffnet rechts einen Side-Sheet
 * mit zwei Reitern: [1] Quelle (Syntax-Highlighting via bat) und [2] Vorschau.
 * HTML-Vorschau: echter Browser-Render via Brave/Chromium Headless-Screenshot →
 * chafa (Fallback: view.py Textrender). Markdown gerendert, JSON pretty, CSV
 * als Tabelle, Bilder via chafa. Zusätzlich: Jede edit/write-Änderung des
 * Agents erzeugt automatisch ein Diff-Artefakt (rot = alt, grün = neu).
 *
 * Tasten: ↑↓/j/k scrollen · 1/2 oder Tab Reiter wechseln · r neu laden ·
 * g/G Anfang/Ende · PgUp/PgDn ±10 · Esc/q schließen. Im Vollbild-Modus
 * sind die Reiter zusätzlich klickbar (handleMouse).
 */

import { Type } from "@earendil-works/pi-ai";
import {
	defineTool,
	getMarkdownTheme,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import { Markdown, Text, matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { execFile } from "child_process";
import { createHash } from "crypto";
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "fs";
import * as path from "path";
import * as actionsMod from "./actions";
import * as checkMod from "./checkhook";
import * as sessionMod from "./session";
import * as shotMod from "./shotdiff";
import * as undoMod from "./undo";
import * as wordMod from "./worddiff";

const VIEW_PY = path.join(process.env.HOME ?? "", ".pi/agent/skills/pi-pkg-report/view.py");
const MAX_LINES = 3000;
const SHOT_DIR = path.join(process.env.HOME ?? "/tmp", ".cache/pi-artifacts");
const BROWSERS = ["/usr/bin/brave", "brave", "chromium", "chromium-browser", "google-chrome"];

// Modul-Selbsttests: PI_ARTIFACTS_SELFTEST=1 pi -p --extension … → Ergebnisse auf stdout
if (process.env.PI_ARTIFACTS_SELFTEST === "1") {
	void Promise.all([undoMod.selfTest(), sessionMod.selfTest(), actionsMod.selfTest(), wordMod.selfTest(), shotMod.selfTest(), checkMod.selfTest()])
		.then((rs) => console.log(rs.join("\n")))
		.catch((e) => {
			console.error("SELFTEST FAIL:", e);
			process.exit(1);
		});
}

type ArtType = "html" | "markdown" | "image" | "json" | "csv" | "text" | "diff" | "session";

interface DiffBlock {
	removed: string[];
	added: string[];
}

interface DiffData {
	kind: "edit" | "write";
	blocks: DiffBlock[];
}

interface LogEntry {
	id: number;
	path: string;
	kind: "edit" | "write";
	plus: number;
	minus: number;
	ts: string;
	note?: string;
}

/** Session-weites Änderungsprotokoll (für das Session-Artefakt). */
const sessionLog: LogEntry[] = [];
// ⚡ Blitzcheck-Ergebnis je Artefakt-Id
const checkResults = new Map<number, string>();
// Artefakt-spezifischer Vorher-Stand (id → Dateiinhalt VOR dieser Änderung) —
// deterministisches Undo: jede Taste u stellt genau DIESE Änderung zurück,
// unabhängig vom globalen Snapshot-Stapel (der sessionübergreifend wächst)
const artifactPre = new Map<number, string>();

function stripAnsi(s: string): string {
	return s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

/** Chafa-Ausgabe: leere Zeilen am Ende entfernen (weißer Screenshot-Rand). */
function trimTrailingBlank(lines: string[]): string[] {
	while (lines.length && stripAnsi(lines[lines.length - 1] ?? "").trim() === "") lines.pop();
	return lines;
}

/** Plain-Text-Wortumbruch für Kommentare. */
function wrapText(s: string, max: number): string[] {
	const words = s.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let cur = "";
	for (const word of words) {
		if (cur && cur.length + 1 + word.length > max) {
			lines.push(cur);
			cur = word;
		} else {
			cur = cur ? `${cur} ${word}` : word;
		}
	}
	if (cur) lines.push(cur);
	return lines.length ? lines : [""];
}

/** Zeilenbereich `needle` in `file` ab Index `from` exakt suchen. */
function findRange(file: string[], needle: string[], from: number): number {
	if (!needle.length) return -1;
	const first = needle[0] ?? "";
	for (let i = Math.max(0, from); i + needle.length <= file.length; i++) {
		if (file[i] !== first) continue;
		let ok = true;
		for (let j = 1; j < needle.length; j++) {
			if (file[i + j] !== needle[j]) {
				ok = false;
				break;
			}
		}
		if (ok) return i;
	}
	return -1;
}

interface Artifact {
	id: number;
	path: string;
	title: string;
	type: ArtType;
	size: number;
	diff?: DiffData;
	note?: string;
}

function detectType(p: string): ArtType {
	const ext = path.extname(p).toLowerCase().replace(".", "");
	if (["html", "htm"].includes(ext)) return "html";
	if (["md", "markdown"].includes(ext)) return "markdown";
	if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "ico", "tiff", "svg"].includes(ext)) return "image";
	if (ext === "json") return "json";
	if (["csv", "tsv"].includes(ext)) return "csv";
	return "text";
}

function exists(p: string): boolean {
	try {
		statSync(p);
		return true;
	} catch {
		return false;
	}
}

function sh(cmd: string, args: string[], timeoutMs = 20_000): Promise<{ ok: boolean; out: string }> {
	return new Promise((resolve) => {
		execFile(cmd, args, { maxBuffer: 12 * 1024 * 1024, timeout: timeoutMs }, (err, stdout, stderr) => {
			if (err && !stdout) resolve({ ok: false, out: String(stderr || err.message) });
			else resolve({ ok: true, out: stdout });
		});
	});
}

/** HTML-Datei mit headless Brave/Chromium als PNG rendern (gecacht auf mtime). */
async function screenshotHtml(p: string): Promise<string | null> {
	let mtime = "";
	try {
		mtime = String(statSync(p).mtimeMs);
	} catch {
		return null;
	}
	const hash = createHash("md5").update(`${p}:${mtime}`).digest("hex").slice(0, 16);
	const out = path.join(SHOT_DIR, `shot-${hash}.png`);
	if (exists(out)) return out;
	try {
		mkdirSync(SHOT_DIR, { recursive: true });
	} catch {}
	for (const b of BROWSERS) {
		if (!exists(b) && !b.includes("/")) continue;
		if (b.includes("/") && !exists(b)) continue;
		const r = await sh(b, [
			"--headless",
			"--disable-gpu",
			"--force-device-scale-factor=2",
			"--hide-scrollbars",
			`--screenshot=${out}`,
			"--window-size=1280,6400",
			"--virtual-time-budget=4000",
			"--default-background-color=FFFFFFFF",
			`file://${p}`,
		], 30_000);
		if (r.ok && exists(out)) return out;
	}
	return null;
}

function colorize(l: string, th: Theme): string {
	// interner Diff + git-diff
	if (l.startsWith("diff --git") || l.startsWith("new file mode") || l.startsWith("deleted file")) {
		return th.style(th.bold(l), { fg: "accent" });
	}
	if (l.startsWith("+++") || l.startsWith("---") || l.startsWith("index ") || l.startsWith("similarity")) {
		return th.fg("dim", l);
	}
	if (l.startsWith("+") || l.startsWith("+ ")) return th.fg("success", l);
	if (l.startsWith("-") || l.startsWith("- ")) return th.fg("error", l);
	if (l.startsWith("· ")) return th.fg("accent", l);
	if (l.startsWith("💬")) return th.fg("accent", l);
	if (l.startsWith("@@")) return th.fg("dim", l);
	if (l.startsWith("⋯") || l.startsWith("────")) return th.fg("dim", l);
	return l;
}

// ─── gemeinsame Box-Optik ────────────────────────────────────────────────────

function boxLines(theme: Theme, title: string, body: string[], width: number, footer?: string): string[] {
	const innerW = Math.max(10, width - 2);
	const b = (s: string) => theme.fg("border", s);
	const cut = (s: string) => truncateToWidth(s, innerW, "…", true);
	const pad = (s: string) => {
		const w = innerW - visibleWidth(s);
		return w > 0 ? s + " ".repeat(w) : s;
	};
	const lines: string[] = [];
	lines.push(b(`╭${"─".repeat(innerW)}╮`));
	lines.push(b("│") + pad(cut(title)) + b("│"));
	lines.push(b(`├${"─".repeat(innerW)}┤`));
	for (const l of body) lines.push(b("│") + pad(cut(l)) + b("│"));
	if (footer) {
		lines.push(b(`├${"─".repeat(innerW)}┤`));
		lines.push(b("│") + pad(cut(theme.fg("dim", footer))) + b("│"));
	}
	lines.push(b(`╰${"─".repeat(innerW)}╯`));
	return lines;
}

// ─── Inhalt pro Reiter laden ─────────────────────────────────────────────────

async function loadLines(a: Artifact, tab: "source" | "preview" | "git", width = 0): Promise<{ lines: string[]; error?: string }> {
	try {
		if (tab === "source") {
			if (!a.path) {
			// Session-Artefakt u.ä.: Quelle = dieselbe Ansicht wie die Vorschau
			return loadLines(a, "preview", width);
		}
			const bat = await sh("bat", ["--color=always", "--style=plain", "--paging=never", `--line-range=1:${MAX_LINES}`, a.path]);
			if (bat.ok && bat.out.trim()) return { lines: bat.out.split("\n") };
			return { lines: readFileSync(a.path, "utf8").split("\n").slice(0, MAX_LINES) };
		}
		if (tab === "git") {
			if (a.type === "session") {
				// Session im Git-Reiter: Diff über ALLE geänderten Dateien der Session
				const paths = [...new Set(sessionLog.map((e) => e.path).filter(Boolean))];
				return { lines: wordMod.markWordDiff((await sessionMod.sessionDiff(paths)).split("\n")).slice(0, MAX_LINES) };
			}
			const dir = path.dirname(a.path || ".");
		const rel = path.basename(a.path || "");
		const unstaged = await sh("git", ["-C", dir, "diff", "--no-color", "--", rel]);
		if (!unstaged.ok) return { lines: [], error: unstaged.out.split("\n")[0] ?? "kein Git-Repo" };
		const staged = await sh("git", ["-C", dir, "diff", "--no-color", "--cached", "--", rel]);
		let out = unstaged.out.trim();
		if (staged.ok && staged.out.trim()) out += (out ? "\n\n" : "") + staged.out.trim();
		if (!out) {
			const st = await sh("git", ["-C", dir, "status", "--porcelain", "--", rel]);
			if (!st.ok) return { lines: [], error: st.out.split("\n")[0] ?? "kein Git-Repo" };
			if (!st.out.trim()) return { lines: [], error: "Datei hat keine Git-Änderungen (stimmt mit HEAD/Index überein)" };
			out = st.out.trim() + "\n(neue/unversionierte Datei — git diff zeigt hier nichts)";
		}
		return { lines: wordMod.markWordDiff(out.split("\n")).slice(0, MAX_LINES) };
		}
		// Breite für bildartige Vorschauen: exakt die Sheet-Innenbreite
		const w = width > 6 ? width - 2 : 88;
		switch (a.type) {
			case "html": {
				// 1) view.py: unsere Terminal-Ansicht (ASCII-Tabellen, Struktur)
				if (exists(VIEW_PY)) {
					const r = await sh("python3", [VIEW_PY, a.path]);
					if (r.ok && r.out.trim()) return { lines: r.out.split("\n").slice(0, MAX_LINES) };
				}
				// 2) w3m-Dump: echter HTML-Engine als Textrender
				const w3m = await sh("w3m", ["-dump", "-cols", `${Math.max(40, w - 2)}`, a.path]);
				if (w3m.ok && w3m.out.trim()) {
					return { lines: trimTrailingBlank(w3m.out.split("\n")).slice(0, MAX_LINES) };
				}
				// 3) letzter Fallback: Browser-Screenshot via chafa
				const shot = await screenshotHtml(a.path);
				if (shot) {
					const r = await sh("chafa", ["--format", "symbols", "-s", `${w}`, shot], 30_000);
					if (r.ok && r.out.trim()) return { lines: trimTrailingBlank(r.out.split("\n")).slice(0, MAX_LINES) };
				}
				return { lines: [], error: "Kein Renderer verfügbar — v = w3m im Split, o = Browser" };
			}
			case "markdown": {
				// wird breitenabhängig direkt im render() erzeugt
				return { lines: [] };
			}
			case "image": {
				// nur Breite vorgeben → proportionale Höhe, füllt das Sheet
				const r = await sh("chafa", ["--format", "symbols", "-s", `${w}`, a.path], 30_000);
				if (!r.ok) return { lines: [], error: "chafa fehlt: nix profile install nixpkgs#chafa" };
				return { lines: trimTrailingBlank(r.out.split("\n")) };
			}
			case "diff": {
				const d = a.diff ?? { kind: "edit" as const, blocks: [] };
				const out: string[] = [`· ${path.basename(a.path)} — ${d.kind === "write" ? "neue Datei" : "Änderung"}`, ""];
				const chk = checkResults.get(a.id);
				if (chk) {
					out.push(chk);
					out.push("");
				}
				if (a.note) {
				for (const wl of wrapText(`💬 ${a.note}`, w - 2)) out.push(wl);
				out.push("");
				out.push("────");
				out.push("");
				}
				// Live-Diff bevorzugt: aktuelles git diff (Repo), sonst Event-Blöcke
				const gdir = path.dirname(a.path || ".");
				const grel = path.basename(a.path || "");
				const glive = await sh("git", ["-C", gdir, "diff", "--no-color", "HEAD", "--", grel]);
				if (glive.ok && glive.out.trim()) {
					out.push(...glive.out.split("\n"));
					return { lines: wordMod.markWordDiff(out).slice(0, MAX_LINES) };
				}
				if (d.kind === "write") {
					out.push("@@ neue Datei @@");
					for (const l of (d.blocks[0]?.added ?? []).slice(0, 400)) out.push(`+ ${l}`);
					return { lines: out.slice(0, MAX_LINES) };
				}
				let fileLines: string[] | null = null;
				try {
					fileLines = readFileSync(a.path, "utf8").split("\n");
				} catch {}
				let from = 0;
				const blocks = d.blocks.slice(0, 30);
				for (let bi = 0; bi < blocks.length; bi++) {
					const b = blocks[bi]!;
					const isDel = b.added.length === 0 || (b.added.length === 1 && b.added[0] === "");
					let idx = -1;
					if (fileLines) idx = findRange(fileLines, isDel ? b.removed : b.added, from);
					if (idx === -1) {
						// Fallback: rohe Blöcke ohne Dateikontext
						out.push("@@ Block @@");
						for (const l of b.removed.slice(0, 200)) out.push(`- ${l}`);
						if (b.removed.length && b.added.length) out.push("────");
						for (const l of b.added.slice(0, 300)) out.push(`+ ${l}`);
					} else {
						const fl = fileLines!;
						out.push(`@@ Zeile ${idx + 1}${b.added.length > 1 ? `–${idx + b.added.length}` : ""} @@`);
						for (let i = Math.max(from, idx - 2); i < idx; i++) out.push(`  ${i + 1}│ ${fl[i]}`);
						for (const l of b.removed.slice(0, 200)) out.push(`- ${l}`);
						for (const l of b.added.slice(0, 300)) out.push(`+ ${l}`);
						const end = isDel ? idx + b.removed.length : idx + b.added.length;
						const after = isDel ? idx : end;
						for (let i = after; i < Math.min(fl.length, after + 2); i++) out.push(`  ${i + 1}│ ${fl[i]}`);
						from = Math.max(from, end);
					}
					if (bi < blocks.length - 1) out.push("⋯");
				}
				// HTML-Datei: VORHER/NACHHER-Browserbilder anhängen (nur wenn Snapshot abweicht)
				if (/\.html?$/i.test(a.path)) {
					try {
						const pre = undoMod.peek(a.path);
						if (pre && pre.content !== readFileSync(a.path, "utf8")) {
							const pair = await shotMod.screenshotPair(a.path, pre.content);
							if (pair.before || pair.after) {
								out.push("", "──── VORHER │ NACHHER (Browser-Render) ────", "");
								out.push(...shotMod.renderSideBySide(pair.before ?? null, pair.after ?? null, w, 22));
							}
						}
					} catch {}
				}
				return { lines: wordMod.markWordDiff(out).slice(0, MAX_LINES) };
			}
			case "session": {
				const entries = [...sessionLog].reverse();
				let tp = 0;
				let tm = 0;
				for (const e of sessionLog) {
						tp += e.plus;
						tm += e.minus;
					}
				const lines = [`· ${sessionLog.length} Änderungen diese Session`, ""];
				for (const e of entries) {
					lines.push(`${e.ts}  #${e.id}  ${e.kind === "write" ? "neu" : "±"}  +${e.plus}/−${e.minus}  ${path.basename(e.path)}${e.note ? "  💬" : ""}`);
				}
				for (const e of [...entries].reverse()) {
					if (e.note) {
						lines.push("", `💬 #${e.id} ${path.basename(e.path)}:`, ...wrapText(e.note, w - 2).map((x) => `  ${x}`));
					}
				}
				if (entries.length) lines.push("", `Σ +${tp}/−${tm}`);
				else lines.push("(noch keine edit/write-Änderungen)");
				return { lines };
			}
			case "json": {
				const data = JSON.parse(readFileSync(a.path, "utf8"));
				return { lines: JSON.stringify(data, null, 2).split("\n").slice(0, MAX_LINES) };
			}
			case "csv": {
				const rows = readFileSync(a.path, "utf8").trim().split("\n").map((r) => r.split(/[,;\t]/));
				const w = rows[0]?.length ?? 0;
				const cw = Array.from({ length: w }, (_, c) => Math.min(24, Math.max(...rows.slice(0, 50).map((r) => visibleWidth(r[c] ?? "")), 3)));
				return {
					lines: rows.slice(0, 200).map((r) => r.map((cell, c) => (cell ?? "").slice(0, cw[c]).padEnd(cw[c])).join(" │ ")),
				};
			}
			default:
				return { lines: [], error: "Keine Vorschau für diesen Typ — Reiter [1] Quelle zeigt den Inhalt." };
		}
	} catch (e) {
		return { lines: [], error: String((e as Error).message ?? e).split("\n")[0] };
	}
}

// ─── Viewer-Komponente (Side-Sheet-Overlay) ──────────────────────────────────

class ArtifactViewer {
	private tab: "source" | "preview" | "git" = "source";
	private lines: string[] = [];
	private error?: string;
	private loading = true;
	private scroll = 0;
	private mdCache?: { width: number; lines: string[] };
	private mdText?: string;
	private lastWidth = 0;
	private pendingScroll?: number;
	public onFullscreen?: () => void;
	private undoArmed = false;
	private status?: string;
	private banner?: string;
	private mtimeMs?: number;
	private watcher?: ReturnType<typeof setInterval>;

	constructor(
		private tui: { requestRender(): void },
		private theme: Theme,
		private a: Artifact,
		private done: () => void,
		init?: { tab?: "source" | "preview" | "git"; scroll?: number },
		private full = false,
	) {
		if (init?.tab) this.tab = init.tab;
		if (init?.scroll !== undefined) this.pendingScroll = init.scroll;
		const origDone = this.done;
		this.done = () => {
			if (this.watcher) clearInterval(this.watcher);
			origDone();
		};
		this.reload();
		this.startWatcher();
	}

	/** Live-Refresh: externe Änderungen (z.B. im nvim-Split) automatisch übernehmen */
	private startWatcher(): void {
		if (!this.a.path || this.watcher) return;
		try {
			this.mtimeMs = statSync(this.a.path).mtimeMs;
		} catch {
			return;
		}
		this.watcher = setInterval(() => {
			try {
				const m = statSync(this.a.path).mtimeMs;
				if (this.mtimeMs !== undefined && m > this.mtimeMs && !this.loading) {
					this.mtimeMs = m;
					if (!this.banner) this.banner = "🔄 Datei extern geändert — Ansicht aktualisiert";
					void this.reload(true);
				} else {
					this.mtimeMs = m;
				}
			} catch {}
		}, 1200);
	}

	async reload(keepScroll = false): Promise<void> {
		this.loading = true;
		this.status = undefined;
		this.error = undefined;
		this.scroll = this.pendingScroll ?? (keepScroll ? this.scroll : 0);
		this.pendingScroll = undefined;
		this.tui.requestRender();
		if (this.a.type === "markdown" && this.tab === "preview") {
			try {
				this.mdText = readFileSync(this.a.path, "utf8");
			} catch {
				this.error = "Datei nicht lesbar";
			}
			this.loading = false;
			this.tui.requestRender();
			return;
		}
		const r = await loadLines(this.a, this.tab, this.lastWidth);
		this.lines = r.lines;
		this.error = r.error;
		this.loading = false;
		this.tui.requestRender();
	}

	private switchTab(t: "source" | "preview" | "git"): void {
		if (this.tab === t) return;
		this.tab = t;
		this.banner = undefined;
		void this.reload();
	}

	/** Zeilenindizes aller @@-Hunk-Marker der aktuellen Ansicht */
	private hunkPositions(): number[] {
		const out: number[] = [];
		for (let i = 0; i < this.lines.length; i++) {
			if ((this.lines[i] ?? "").startsWith("@@")) out.push(i);
		}
		return out;
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
			this.undoArmed = false;
			this.done();
			return;
		}
		if (matchesKey(data, "1")) {
			this.switchTab("source");
			return;
		}
		if (matchesKey(data, "2")) {
			this.switchTab("preview");
			return;
		}
		if (matchesKey(data, "3")) {
			this.switchTab("git");
			return;
		}
		if (matchesKey(data, "tab")) {
			this.switchTab(this.tab === "source" ? "preview" : this.tab === "preview" ? "git" : "source");
			return;
		}
		if (matchesKey(data, "r")) {
			this.banner = undefined;
			void this.reload();
			return;
		}
		if (matchesKey(data, "o")) {
			// im echten Browser öffnen (async, ohne zu warten)
			execFile("xdg-open", [this.a.path], () => {});
			return;
		}
		if (matchesKey(data, "v")) {
			// interaktives w3m in tmux-Split (Fallback: Browser)
			execFile("tmux", ["split-window", "-h", "-l", "50%", "w3m", this.a.path], (err) => {
				if (err) execFile("xdg-open", [this.a.path], () => {});
			});
			return;
		}
		if (matchesKey(data, "c")) {
			// Commit-Vorschlag aus der Session (nur im Session-Artefakt)
			if (this.a.type !== "session") return;
			const entries = sessionLog.map((e) => ({ path: e.path, plus: e.plus, minus: e.minus, note: artifacts.get(e.id)?.note }));
			const msg = sessionMod.commitProposal(entries);
			this.lines = ["🔖 Commit-Vorschlag (y = in Zwischenablage):", "", ...msg.split("\n"), "", "· r = zurück zur Session-Ansicht"];
			this.scroll = 0;
			this.status = "Vorschlag generiert — y kopiert ihn";
			this.tui.requestRender();
			return;
		}
		if (matchesKey(data, "u")) {
			// Undo mit Bestätigung — artefakt-spezifisch: stellt exakt DIESE Änderung zurück
			if (!this.a.path || this.a.type !== "diff") {
				this.status = "u gilt nur für Diff-Artefakte";
				this.tui.requestRender();
				return;
			}
			const isWrite = this.a.diff?.kind === "write";
			const pre = artifactPre.get(this.a.id);
			if (!this.undoArmed) {
				let msg: string | undefined;
				if (pre !== undefined) msg = "u erneut = Vorher-Stand DIESER Änderung wiederherstellen";
				else if (isWrite) msg = "u erneut = Datei löschen (war neu)";
				else if (undoMod.hasBackup(this.a.path)) msg = "u erneut = jüngsten globalen Snapshot wiederherstellen (Session-übergreifend)";
				if (!msg) {
					this.status = "kein Undo-Stand für diese Änderung";
				} else {
					this.undoArmed = true;
					this.banner = msg;
					this.status = msg;
				}
				this.tui.requestRender();
				return;
			}
			this.undoArmed = false;
			if (pre !== undefined) {
				// Deterministisch: exakter Vorher-Inhalt dieses Artefakts
				try {
					let cur: string | null = null;
					try {
						cur = readFileSync(this.a.path, "utf8");
					} catch {}
					if (cur === pre) this.banner = "ℹ Datei ist bereits im Vorher-Stand";
					else {
						writeFileSync(this.a.path, pre);
						this.banner = "⏪ Vorher-Stand wiederhergestellt (exakt diese Änderung)";
					}
				} catch (e) {
					this.banner = `⚠ ${String(e)}`;
				}
			} else if (isWrite) {
				try {
					rmSync(this.a.path);
					this.banner = "🗑 Datei gelöscht (war neu)";
				} catch (e) {
					this.banner = `⚠ ${String(e)}`;
				}
			} else if (undoMod.hasBackup(this.a.path)) {
				const r = undoMod.rollback(this.a.path);
				this.banner = r.ok ? "⏪ globaler Snapshot wiederhergestellt" : `⚠ ${r.error ?? "Fehler"}`;
			} else {
				this.banner = "⚠ kein Undo-Stand";
			}
			this.status = this.banner;
			void this.reload(true);
			return;
		}
		if (matchesKey(data, "y")) {
			// Aktuelle Ansicht (ohne Farben) in die Zwischenablage
			const plain = this.lines.map((l) => stripAnsi(l)).join("\n");
			void actionsMod.yank(plain).then((r) => {
				this.status = r.ok ? "📋 in Zwischenablage kopiert" : `⚠ Yank: ${r.error ?? "fehlgeschlagen"}`;
				this.tui.requestRender();
			});
			return;
		}
		if (matchesKey(data, "s")) {
			if (!this.a.path) return;
			void actionsMod.stage(this.a.path).then((r) => {
				this.status = r.ok ? `✓ ${path.basename(this.a.path)} gestaged` : `⚠ Stage: ${r.error ?? "fehlgeschlagen"}`;
				this.tui.requestRender();
			});
			return;
		}
		if (matchesKey(data, "return")) {
			// nvim im tmux-Split an der ersten sichtbaren Zeile öffnen
			if (!this.a.path) return;
			const r = actionsMod.openEditor(this.a.path, this.scroll + 1);
			if (!r.ok) {
				this.status = `⚠ ${r.error ?? "Editor-Start fehlgeschlagen"}`;
				this.tui.requestRender();
			}
			return;
		}
		if (matchesKey(data, "f")) {
			// Vollbild ↔ Side-Sheet (zustandserhaltend)
			this.onFullscreen?.();
			return;
		}
		if (matchesKey(data, "n") || matchesKey(data, "p")) {
			// Hunk-Navigation mit Wrap-around: n → nächster, p → vorheriger (am Ende/Anfang herum)
			const hp = this.hunkPositions();
			if (hp.length === 0) return;
			let cur = 0;
			for (let i = 0; i < hp.length; i++) if (hp[i]! <= this.scroll + 1) cur = i;
			const next = (cur + (matchesKey(data, "n") ? 1 : -1) + hp.length) % hp.length;
			this.scroll = Math.max(0, hp[next]! - 1);
			this.tui.requestRender();
			return;
		}
		const max = Math.max(0, this.contentHeight() - 1);
		if (matchesKey(data, "down") || matchesKey(data, "j")) this.scroll = Math.min(max, this.scroll + 1);
		else if (matchesKey(data, "up") || matchesKey(data, "k")) this.scroll = Math.max(0, this.scroll - 1);
		else if (matchesKey(data, "pgdn")) this.scroll = Math.min(max, this.scroll + 10);
		else if (matchesKey(data, "pgup")) this.scroll = Math.max(0, this.scroll - 10);
		else if (matchesKey(data, "g")) this.scroll = 0;
		else if (matchesKey(data, "G") || data === "G") this.scroll = max;
		else return;
		this.tui.requestRender();
	}

	handleMouse(ev: { type: string; button: string; y: number; x: number }): { handled: boolean; requestRender?: boolean } | undefined {
		if (ev.type !== "click" || ev.button !== "left") return undefined;
		if (ev.y === 2) {
			// Tab-Leiste: grobe Bereiche anhand der Spalten
			if (ev.x < 14) {
				this.switchTab("source");
				return { handled: true, requestRender: true };
			}
			if (ev.x < 28) {
				this.switchTab("preview");
				return { handled: true, requestRender: true };
			}
			if (ev.x < 36) {
				this.switchTab("git");
				return { handled: true, requestRender: true };
			}
		}
		return undefined;
	}

	getState(): { tab: "source" | "preview" | "git"; scroll: number } {
		return { tab: this.tab, scroll: this.scroll };
	}

	private contentHeight(): number {
		return this.lines.length || 1;
	}

	render(width: number): string[] {
		// Breitenänderung (Resize/erstes Rendern) → bildartige Vorschauen neu laden
		if (this.lastWidth !== width) {
			const had = this.lastWidth !== 0;
			this.lastWidth = width;
			if (had && !this.loading && (this.a.type === "html" || this.a.type === "image")) void this.reload();
		}
		const th = this.theme;
		const kb = (s: string) => th.fg("dim", s);
		const title = ` 📦 #${this.a.id} · ${this.a.title} `;
		const typeInfo = `${this.a.type} · ${(this.a.size / 1024).toFixed(1)} KB`;

		// Tab-Leiste
		const src = this.tab === "source" ? th.style(th.bold(`[1] Quelle`), { fg: "accent" }) : kb("[1] Quelle");
		const prev = this.tab === "preview" ? th.style(th.bold(`[2] Diff/Vorschau`), { fg: "accent" }) : kb("[2] Diff/Vorschau");
		const gt = this.tab === "git" ? th.style(th.bold(`[3] Git`), { fg: "accent" }) : kb("[3] Git");
		const tabBar = ` ${src}   ${prev}   ${gt}${" ".repeat(2)}${kb(typeInfo)}`;

		// Inhalt
		let body: string[];
		const VIEW = this.full ? 40 : 22;
		if (this.loading) {
			body = [th.fg("warning", " Lädt…")];
		} else if (this.error) {
			body = [th.fg("error", ` ⚠ ${this.error}`)];
		} else if (this.a.type === "markdown" && this.tab === "preview" && this.mdText !== undefined) {
			if (!this.mdCache || this.mdCache.width !== width) {
				const md = new Markdown(this.mdText, 1, 0, getMarkdownTheme());
				this.mdCache = { width, lines: md.render(width - 2).slice(0, MAX_LINES) };
			}
			const ls = this.mdCache.lines;
			this.scroll = Math.min(this.scroll, Math.max(0, ls.length - 1));
			body = ls.slice(this.scroll, this.scroll + VIEW);
		} else {
			const ls = this.lines;
			this.scroll = Math.min(this.scroll, Math.max(0, ls.length - 1));
			body = ls.slice(this.scroll, this.scroll + VIEW);
		}
		while (body.length < VIEW) body.push("");

		const info = this.loading ? "" : ` Zeile ${this.scroll + 1}${this.lines.length ? `/${this.lines.length}` : ""}`;
		const hp = this.hunkPositions();
		let hunkInfo = "";
		let activeIdx = -1;
		if (hp.length > 0) {
			let cur = 0;
			for (let i = 0; i < hp.length; i++) if (hp[i]! <= this.scroll + 1) cur = i;
			hunkInfo = ` ${cur + 1}/${hp.length}`;
			activeIdx = hp[cur]!;
		}
		const footer = `↑↓ · 1/2/3 · n/p Hunk${hunkInfo} · u Undo · y Kopie · s Stage · ⏎ Editor${this.a.type === "session" ? " · c Commit" : ""} · f · v w3m · o · Esc${this.status ? ` — ${this.status}` : ""}${info}`;

		const innerW = width - 2;
		const b = (s: string) => th.fg("border", s);
		const pad = (s: string) => {
			const w = innerW - visibleWidth(s);
			return w > 0 ? s + " ".repeat(w) : s;
		};
		const out: string[] = [];
		out.push(b(`╭${"─".repeat(innerW)}╮`));
		out.push(b("│") + pad(truncateToWidth(title, innerW, "…", true)) + b("│"));
		out.push(b("│") + pad(truncateToWidth(tabBar, innerW, "…", true)) + b("│"));
		out.push(b(`├${"─".repeat(innerW)}┤`));
		if (this.banner && !this.loading) out.push(b("│") + pad(th.fg("success", `▶ ${this.banner}`)) + b("│"));
		for (let bi = 0; bi < body.length; bi++) {
			const l = body[bi] ?? "";
			const styled = l.startsWith("@@") && this.scroll + bi === activeIdx ? th.fg("warning", `▶ ${l}`) : colorize(l, th);
			out.push(b("│") + pad(truncateToWidth(styled, innerW, "…", true)) + b("│"));
		}
		out.push(b(`├${"─".repeat(innerW)}┤`));
		out.push(b("│") + pad(kb(truncateToWidth(footer, innerW, "…", true))) + b("│"));
		out.push(b(`╰${"─".repeat(innerW)}╯`));
		return out;
	}

	invalidate(): void {
		this.mdCache = undefined;
	}
}

// ─── Auswahl-Liste (bei /artifact ohne Argument) ─────────────────────────────

class ArtifactPicker {
	private index = 0;
	constructor(
		private tui: { requestRender(): void },
		private theme: Theme,
		private items: Artifact[],
		private done: (a: Artifact | undefined) => void,
	) {}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || matchesKey(data, "q") || matchesKey(data, "ctrl+c")) {
			this.done(undefined);
			return;
		}
		if (matchesKey(data, "down") || matchesKey(data, "j")) this.index = Math.min(this.items.length - 1, this.index + 1);
		else if (matchesKey(data, "up") || matchesKey(data, "k")) this.index = Math.max(0, this.index - 1);
		else if (matchesKey(data, "return")) {
			this.done(this.items[this.index]);
			return;
		} else return;
		this.tui.requestRender();
	}

	render(width: number): string[] {
		const th = this.theme;
		const body = this.items.map((a, i) => {
			const sel = i === this.index;
			const label = ` ${sel ? "→ " : "  "}#${a.id}  ${a.title}  ${th.fg("dim", `(${a.type})`)}`;
			return sel ? th.style(label, { fg: "accent" }) : label;
		});
		return boxLines(th, ` 📦 Artefakte (${this.items.length}) `, body, width, "↑↓ auswählen · Enter öffnen · Esc abbrechen");
	}

	invalidate(): void {}
}

// ─── Extension-Registrierung ─────────────────────────────────────────────────

export default function artifactsExtension(pi: ExtensionAPI) {
	const artifacts = new Map<number, Artifact>();
	let nextId = 1;

	function register(p: string, title?: string, opts?: { type?: ArtType; diff?: DiffData }): Artifact {
		let size = 0;
		try {
			size = statSync(p).size;
		} catch {}
		const id = nextId++;
		const a: Artifact = {
			id,
			path: p,
			title: title || (opts?.type === "diff" ? `diff · ${path.basename(p)}` : path.basename(p)),
			type: opts?.type ?? detectType(p),
			size,
			diff: opts?.diff,
		};
		artifacts.set(id, a);
		return a;
	}

	const artifactTool = defineTool({
		name: "artifact",
		label: "Artifact",
		description:
			"Zeigt dem Nutzer eine Datei als anklickbares Artefakt im Chat (Side-Sheet mit Quelle+Vorschau). WICHTIG: Rufe direkt nach jeder edit/write-Änderung artifact OHNE path, dafür mit note auf (1-2 Sätze): wozu die Änderung dient, das Ziel, was sie bedeutet. Der Kommentar erscheint im Diff-Artefakt. Nach Registrierung dem Nutzer /artifact <id> nennen.",
		parameters: Type.Object({
			path: Type.Optional(Type.String({ description: "Pfad zur Datei (weglassen, wenn nur note an letzten Diff geht)" })),
			title: Type.Optional(Type.String({ description: "Anzeigename (optional)" })),
			note: Type.Optional(Type.String({ description: "KI-Kommentar zur letzten Änderung: wozu, Ziel, Bedeutung (1-2 Sätze)" })),
		}),
		annotations: { readOnlyHint: true },
		async execute(_id, params) {
			// Nur Notiz: an das jüngste Diff-Artefakt hängen
			if (params.note !== undefined && (!params.path || params.path.trim() === "")) {
				const diffs = [...artifacts.values()].filter((x) => x.type === "diff");
				const last = diffs[diffs.length - 1];
				if (!last) {
					return { content: [{ type: "text", text: "Kein Diff-Artefakt zum Kommentieren vorhanden." }], details: undefined, isError: true };
				}
				last.note = params.note;
				const le = sessionLog.find((e) => e.id === last.id);
				if (le) le.note = params.note;
				return {
					content: [{ type: "text", text: `💬 Kommentar zu Artefakt #${last.id} (${last.title}) ergänzt.` }],
					details: { artifactId: last.id, note: true },
				};
			}
			const abs = path.resolve(params.path ?? "");
			if (!exists(abs)) {
				return { content: [{ type: "text", text: `Datei nicht gefunden: ${abs}` }], details: undefined, isError: true };
			}
			const a = register(abs, params.title);
			if (params.note) a.note = params.note;
			return {
				content: [{ type: "text", text: `Artefakt #${a.id} registriert: ${a.title} (${a.type}). Sage dem Nutzer: /artifact ${a.id} öffnet die Ansicht.` }],
				details: { artifactId: a.id, type: a.type },
			};
		},
		renderCall(args, theme) {
			return new Text(theme.fg("toolTitle", theme.bold("artifact ")) + theme.fg("accent", args.path ?? args.note ?? ""), 0, 0);
		},
		renderResult(result, _opts, theme) {
			const m = /\(#(\d+)\)/.exec(result.content[0]?.type === "text" ? result.content[0].text : "");
			const id = m?.[1];
			const hint = id ? theme.fg("dim", ` — /artifact ${id} öffnet`) : "";
			return new Text(theme.fg("success", "📦 Artefakt registriert") + hint, 0, 0);
		},
	});
	pi.registerTool(artifactTool);

	// Session-Änderungsprotokoll: immer als erstes Artefakt verfügbar
	register("", "📋 Session-Änderungen", { type: "session" });

	// ⚡ Blitz-Syntaxcheck nach Änderungen (verzögert: Hook feuert VOR der Ausführung)
	function queueQuickCheck(a: Artifact, filePath: string, ctx?: { hasUI?: boolean; ui?: { notify?: (m: string, l?: string) => void } }): void {
		setTimeout(() => {
			void checkMod
				.runQuickCheck(filePath)
				.then((r) => {
					if (!r.applicable) return;
					const line = r.ok ? `⚡ ${r.tool} ✓ (${r.durationMs}ms)` : `⚡ ${r.tool} ✗ — ${r.output}`;
					checkResults.set(a.id, line);
					if (!r.ok && ctx?.hasUI) ctx.ui?.notify(`⚡ Check fehlgeschlagen: ${r.tool}`, "error");
				})
				.catch(() => {});
		}, 500);
	}

	// Kopplung an die Erweiterung "kompakt" (nur über pi.events, keine Importe):
	// kompakt meldet "kompakt:state" {on}; dann keine Toasts, nur Chips in der Werkzeugzeile.
	let kompaktOn = false;
	pi.events.on("kompakt:state", (d: unknown) => {
		kompaktOn = !!(d as { on?: boolean } | undefined)?.on;
	});
	// kompakt öffnet den Diff-Betrachter per Klick auf den "Diff #id"-Chip
	pi.events.on("artifacts:open", (d: unknown) => {
		const req = d as { id?: number; ctx?: ExtensionCommandContext } | undefined;
		if (!req?.ctx || typeof req.id !== "number") return;
		const a = artifacts.get(req.id);
		if (!a) return;
		openViewer(req.ctx, a);
		(req as { handled?: boolean }).handled = true;
	});
	const toast = (ctx: { hasUI?: boolean; ui: { notify: (m: string, l?: "info" | "warning" | "error") => void } } | undefined, msg: string) => {
		if (ctx?.hasUI && !kompaktOn) ctx.ui.notify(msg, "info");
	};

	// Automatische Diff-Artefakte bei jeder edit/write-Änderung des Agents
	pi.on("tool_call", (event, ctx) => {
		if (event.toolName !== "edit" && event.toolName !== "write") return;
		const input = (event as { input?: Record<string, unknown> }).input ?? {};
		const rawPath = String(input.path ?? "?");
		// Pfad normalisieren: relative und absolute Angaben vereinheitlichen,
		// sonst matchen Undo-Keys und Artefakt-Pfade nicht
		const filePath = rawPath === "?" ? rawPath : path.resolve(rawPath);
		// Undo: Original-Stand sichern — Hook feuert VOR der Tool-Ausführung (verifiziert)
		let preContent: string | null = null;
		if (filePath !== "?") {
			try {
				preContent = readFileSync(filePath, "utf8");
				undoMod.save(filePath, preContent);
			} catch {
				preContent = null; // Datei existierte noch nicht → neue Datei
			}
		}
		let a: Artifact | undefined;
		if (event.toolName === "edit") {
			const edits = (input.edits as { oldText?: string; newText?: string }[] | undefined) ?? [];
			const blocks: DiffBlock[] = edits.map((e) => ({
				removed: String(e.oldText ?? "").split("\n"),
				added: String(e.newText ?? "").split("\n"),
			}));
			const plus = blocks.reduce((n, b) => n + b.added.length, 0);
			const minus = blocks.reduce((n, b) => n + b.removed.length, 0);
			a = register(filePath, `diff · ${path.basename(filePath)} (+${plus}/−${minus})`, {
				type: "diff",
				diff: { kind: "edit", blocks },
			});
			sessionLog.push({ id: a.id, path: filePath, kind: "edit", plus, minus, ts: new Date().toLocaleTimeString("de-DE") });
			if (preContent !== null) artifactPre.set(a.id, preContent);
			queueQuickCheck(a, filePath, ctx);
			pi.events.emit("artifacts:diff", { toolCallId: event.toolCallId, id: a.id, path: filePath, plus, minus, kind: "edit" });
			toast(ctx, `📦 #${a.id} · ${path.basename(filePath)} (+${plus}/−${minus}) — /artifact ${a.id}`);
		} else {
			const added = String(input.content ?? "").split("\n");
			a = register(filePath, `diff · ${path.basename(filePath)} (+${added.length}/neu)`, {
				type: "diff",
				diff: { kind: "write", blocks: [{ removed: [], added }] },
			});
			sessionLog.push({ id: a.id, path: filePath, kind: "write", plus: added.length, minus: 0, ts: new Date().toLocaleTimeString("de-DE") });
			if (preContent !== null) artifactPre.set(a.id, preContent);
			queueQuickCheck(a, filePath, ctx);
			pi.events.emit("artifacts:diff", { toolCallId: event.toolCallId, id: a.id, path: filePath, plus: added.length, minus: 0, kind: "write", isNew: preContent === null });
			toast(ctx, `📦 #${a.id} · ${path.basename(filePath)} (+${added.length}/neu) — /artifact ${a.id}`);
		}
	});

	function openViewer(ctx: ExtensionCommandContext, a: Artifact, init?: { tab?: "source" | "preview" | "git"; scroll?: number }, fullscreen = false): void {
		void ctx.ui.custom<void>((tui, theme, _kb, done) => {
			const v = new ArtifactViewer(tui, theme, a, done, init, fullscreen);
			v.onFullscreen = () => {
				done();
				openViewer(ctx, a, v.getState(), !fullscreen);
			};
			return v;
		}, {
			overlay: true,
			overlayOptions: { anchor: "top-right", width: fullscreen ? "100%" : "62%", margin: 0 },
		});
	}

	async function runArtifactCommand(args: string, ctx: ExtensionCommandContext): Promise<void> {
		if (ctx.mode !== "tui" || !ctx.hasUI) {
			ctx.ui.notify("/artifact braucht den interaktiven TUI-Modus", "error");
			return;
		}
		if (artifacts.size === 0) {
			ctx.ui.notify("Noch keine Artefakte", "info");
			return;
		}
		const arg = args.trim();
		// Direkte Pfad-Angabe: Artefakt on-the-fly registrieren
		if (arg && (arg.includes("/") || arg.includes(".") || arg.startsWith("~"))) {
			const p = arg.startsWith("~") ? path.join(process.env.HOME ?? "", arg.slice(1)) : path.resolve(arg);
			if (!exists(p)) {
				ctx.ui.notify(`Datei nicht gefunden: ${p}`, "error");
				return;
			}
			openViewer(ctx, register(p));
			return;
		}
		if (/^\d+$/.test(arg)) {
			const a = artifacts.get(Number(arg));
			if (!a) {
				ctx.ui.notify(`Kein Artefakt #${arg}`, "error");
				return;
			}
			openViewer(ctx, a);
			return;
		}
		if (arg) {
			const a = [...artifacts.values()].reverse().find((x) => x.path.includes(arg) || x.title.includes(arg));
			if (!a) {
				ctx.ui.notify(`Kein Artefakt passt zu „${arg}“`, "error");
				return;
			}
			openViewer(ctx, a);
			return;
		}
		const items = [...artifacts.values()].reverse();
		if (items.length === 1) {
			openViewer(ctx, items[0]!);
			return;
		}
		void ctx.ui.custom<Artifact>((tui, theme, _kb, done) => new ArtifactPicker(tui, theme, items, done)).then((a) => {
			if (a) openViewer(ctx, a);
		});
	}

	const cmdDef = {
		description: "Artefakt im Side-Sheet anzeigen (ohne Argument: Liste)",
		handler: runArtifactCommand,
	};
	pi.registerCommand("artifact", cmdDef);
	pi.registerCommand("artifacts", cmdDef);
}

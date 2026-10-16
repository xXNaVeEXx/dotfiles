/**
 * kompakt – reine Zeilen-Logik (ohne pi-Laufzeit testbar).
 * Erzeugt nur Vordergrundfarben über Theme-Tokens, niemals Hintergründe.
 */
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import * as path from "node:path";

/** Minimaler Theme-Ausschnitt, den kompakt nutzt. */
export interface ThemeLike {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

export interface DiffChip {
	id: number;
	plus: number;
	minus: number;
	kind: "edit" | "write" | "artifact";
	isNew?: boolean;
	/** Beschriftung, Standard "[Diff #id]" */
	label?: string;
}

export interface CallInfo {
	toolName: string;
	args: Record<string, unknown>;
	cwd: string;
	/** true solange kein (finales) Ergebnis da ist */
	running: boolean;
	isError: boolean;
	durationMs?: number;
	/** Text-Ausgabe des Ergebnisses */
	output?: string;
	chip?: DiffChip;
}

const NAMES: Record<string, string> = {
	bash: "Befehl",
	powershell: "PowerShell",
	read: "Lesen",
	edit: "Ändern",
	write: "Schreiben",
	grep: "Suchen",
	find: "Finden",
	ls: "Auflisten",
	artifact: "Artefakt",
};

export const COMPACT_TOOLS = new Set(Object.keys(NAMES));

export function germanName(toolName: string): string {
	return NAMES[toolName] ?? toolName;
}

function str(v: unknown): string | undefined {
	return typeof v === "string" && v.length > 0 ? v : undefined;
}

export function relPath(p: string, cwd: string): string {
	if (!p) return p;
	let abs = p;
	const home = process.env.HOME ?? "";
	if (p.startsWith("~/") && home) abs = path.join(home, p.slice(2));
	if (!path.isAbsolute(abs)) return p;
	const rel = path.relative(cwd, abs);
	if (rel === "") return ".";
	if (!rel.startsWith("..")) return rel;
	if (home && abs.startsWith(home + "/")) return "~/" + abs.slice(home.length + 1);
	return abs;
}

/** Steuerzeichen/Tabs entfernen, damit eine Zeile wirklich eine Zeile bleibt. */
export function clean(s: string): string {
	// eslint-disable-next-line no-control-regex
	return s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\t/g, "  ").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
}

function firstLine(s: string): string {
	const lines = s.split("\n").map((l) => l.trim());
	const first = lines.find((l) => l.length > 0) ?? "";
	const more = lines.filter((l) => l.length > 0).length > 1;
	return more ? `${first} …` : first;
}

/** Wichtigstes Argument eines Aufrufs als Klartext. */
export function mainArg(toolName: string, args: Record<string, unknown>, cwd: string): string {
	const a = args ?? {};
	const p = str(a.path) ?? str(a.file_path) ?? str(a.filePath);
	switch (toolName) {
		case "bash":
		case "powershell":
			return firstLine(str(a.command) ?? "");
		case "grep": {
			const pat = str(a.pattern) ?? "";
			return p ? `${pat}  in ${relPath(p, cwd)}` : pat;
		}
		case "find": {
			const pat = str(a.pattern) ?? "";
			return p ? `${pat}  in ${relPath(p, cwd)}` : pat;
		}
		case "ls":
			return p ? relPath(p, cwd) : ".";
		case "artifact":
			return p ? relPath(p, cwd) : str(a.note) ? firstLine(String(a.note)) : str(a.title) ?? "";
	}
	if (p) return relPath(p, cwd);
	for (const k of ["command", "query", "pattern", "url", "task", "prompt", "name", "title", "id", "action"]) {
		const v = str(a[k]);
		if (v) return firstLine(v);
	}
	for (const v of Object.values(a)) {
		if (typeof v === "string" && v) return firstLine(v);
	}
	const j = JSON.stringify(a);
	return j && j !== "{}" ? j : "";
}

function countLines(s: unknown): number {
	if (typeof s !== "string" || s.length === 0) return 0;
	return s.split("\n").length;
}

/** +a/−b direkt aus den Argumenten (funktioniert auch für geladene Sitzungen). */
export function diffCounts(toolName: string, args: Record<string, unknown>): { plus: number; minus: number } | undefined {
	if (toolName === "edit") {
		const edits = Array.isArray(args?.edits)
			? (args.edits as { oldText?: unknown; newText?: unknown }[])
			: args && ("oldText" in args || "old_string" in args)
				? [{ oldText: args.oldText ?? args.old_string, newText: args.newText ?? args.new_string }]
				: [];
		let plus = 0;
		let minus = 0;
		for (const e of edits) {
			plus += countLines(e?.newText);
			minus += countLines(e?.oldText);
		}
		return { plus, minus };
	}
	if (toolName === "write") return { plus: countLines(args?.content), minus: 0 };
	return undefined;
}

export function formatDuration(ms: number | undefined): string {
	if (ms === undefined || !Number.isFinite(ms)) return "";
	if (ms < 1000) return `${Math.round(ms)}ms`;
	if (ms < 60_000) return `${(ms / 1000).toFixed(1).replace(".", ",")}s`;
	const m = Math.floor(ms / 60_000);
	const s = Math.round((ms % 60_000) / 1000);
	return `${m}m${String(s).padStart(2, "0")}s`;
}

export function formatSize(output: string | undefined): string {
	if (!output) return "";
	const lines = output.replace(/\n+$/, "").split("\n").length;
	if (lines > 1) return `${lines} Z.`;
	const bytes = Buffer.byteLength(output, "utf8");
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1).replace(".", ",")} KB`;
}

export interface LineLayout {
	text: string;
	/** Spaltenbereich des Diff-Chips (für Klicks), falls sichtbar */
	chip?: { from: number; to: number; id: number };
}

/** Die eine Zeile pro Aufruf. Garantiert visibleWidth(text) <= width. */
export function renderLine(info: CallInfo, width: number, theme: ThemeLike): LineLayout {
	const w = Math.max(1, width);
	const status = info.running ? theme.fg("muted", "◌") : info.isError ? theme.fg("error", "✗") : theme.fg("success", "✓");
	const name = theme.fg("toolTitle", theme.bold(germanName(info.toolName)));
	const arg = clean(mainArg(info.toolName, info.args, info.cwd));

	const right: string[] = [];
	const dc = diffCounts(info.toolName, info.args);
	if (dc) {
		const isNew = info.chip?.isNew;
		right.push(isNew ? `+${dc.plus} neu` : `+${dc.plus}/−${dc.minus}`);
	} else if (!info.running && info.output) {
		right.push(formatSize(info.output));
	}
	if (!info.running) {
		const d = formatDuration(info.durationMs);
		if (d) right.push(d);
	}
	const rightText = right.filter(Boolean).join(" · ");
	const rightStyled = rightText ? theme.fg("dim", rightText) : "";
	const chipText = info.chip ? (info.chip.label ?? `[Diff #${info.chip.id}]`) : "";

	const head = `${status} ${name}`;
	const headW = visibleWidth(head);
	const rightW = visibleWidth(rightText);
	const chipW = visibleWidth(chipText);

	// Platz für das Argument: Breite − Kopf − Leerzeichen − Chip − rechter Teil
	let showRight = rightW > 0 && headW + 1 + rightW + 2 <= w;
	let showChip = chipW > 0 && headW + 1 + chipW + 1 + (showRight ? rightW + 2 : 0) <= w;
	if (!showChip && chipW > 0 && showRight) {
		// Chip ist wichtiger als die Messwerte
		showRight = false;
		showChip = headW + 1 + chipW + 1 <= w;
	}
	const reserved = (showChip ? chipW + 1 : 0) + (showRight ? rightW + 2 : 0);
	const argRoom = w - headW - 1 - reserved;
	let left = head;
	if (argRoom > 1 && arg) left += " " + truncateToWidth(theme.fg("text", arg), argRoom, "…");
	let chip: LineLayout["chip"];
	if (showChip && info.chip) {
		const from = visibleWidth(left) + 1;
		left += " " + theme.fg("accent", chipText);
		chip = { from, to: from + chipW, id: info.chip.id };
	}
	let line = left;
	if (showRight) {
		const gap = Math.max(2, w - visibleWidth(left) - rightW);
		line = left + " ".repeat(gap) + rightStyled;
	}
	if (visibleWidth(line) > w) {
		line = truncateToWidth(line, w, "…");
		if (chip && chip.to > w) chip = undefined;
	}
	return { text: line, chip };
}

const ERR_STRONG = /(^|\b)(error|fehler)\b\s*[:\[]|^\s*(error|fatal|panic)\b|no such file|permission denied|traceback|enoent|eacces|command not found|syntaxerror|exception:/i;
const ERR_EXIT = /exit(ed)?( with)? (code|status)/i;
const ERR_WEAK = /error|fehler|failed|fatal|denied|not found|cannot|unable/i;

/** Erste aussagekräftige Fehlerzeile (Klartext). */
export function errorSummary(output: string | undefined): string {
	if (!output) return "Fehler";
	const lines = clean(output)
		.split("\n")
		.map((l) => l.trim())
		.filter((l) => l.length > 0);
	return (
		lines.find((l) => ERR_STRONG.test(l)) ??
		lines.find((l) => ERR_EXIT.test(l)) ??
		(lines.length <= 3 ? lines.find((l) => ERR_WEAK.test(l)) : undefined) ??
		lines[0] ??
		"Fehler"
	);
}

export function renderErrorLine(info: CallInfo, width: number, theme: ThemeLike): string {
	const prefix = "  ↳ ";
	const room = Math.max(1, width - visibleWidth(prefix));
	return truncateToWidth(theme.fg("error", prefix + truncateToWidth(errorSummary(info.output), room, "…")), Math.max(1, width), "…");
}

/** Vollständige Textansicht eines Aufrufs (für ctrl+o und Overlay). */
export function detailText(info: CallInfo): { lines: string[]; kinds: ("out" | "add" | "del" | "meta")[] } {
	const lines: string[] = [];
	const kinds: ("out" | "add" | "del" | "meta")[] = [];
	const push = (l: string, k: "out" | "add" | "del" | "meta") => {
		lines.push(clean(l));
		kinds.push(k);
	};
	const a = info.args ?? {};
	if (info.toolName === "edit") {
		const edits = Array.isArray(a.edits) ? (a.edits as { oldText?: unknown; newText?: unknown }[]) : [];
		edits.forEach((e, i) => {
			if (i > 0) push("···", "meta");
			for (const l of String(e?.oldText ?? "").split("\n")) push("- " + l, "del");
			for (const l of String(e?.newText ?? "").split("\n")) push("+ " + l, "add");
		});
		if (info.isError && info.output) for (const l of info.output.split("\n")) push(l, "out");
		return { lines, kinds };
	}
	if (info.toolName === "write") {
		for (const l of String(a.content ?? "").split("\n")) push("+ " + l, "add");
		if (info.isError && info.output) for (const l of info.output.split("\n")) push(l, "out");
		return { lines, kinds };
	}
	if ((info.toolName === "bash" || info.toolName === "powershell") && typeof a.command === "string" && a.command.includes("\n")) {
		for (const l of a.command.split("\n")) push("$ " + l, "meta");
	}
	const out = (info.output ?? "").replace(/\n+$/, "");
	if (out) for (const l of out.split("\n")) push(l, "out");
	else if (!info.running) push("(keine Ausgabe)", "meta");
	return { lines, kinds };
}

function colorFor(kind: "out" | "add" | "del" | "meta", isError: boolean): string {
	if (kind === "add") return "toolDiffAdded";
	if (kind === "del") return "toolDiffRemoved";
	if (kind === "meta") return "muted";
	return isError ? "error" : "toolOutput";
}

/** Ausgeklappte Ansicht (ctrl+o): höchstens `max` Zeilen, ohne Kasten. */
export function renderExpanded(info: CallInfo, width: number, theme: ThemeLike, max = 15): string[] {
	const { lines, kinds } = detailText(info);
	const w = Math.max(1, width);
	const room = Math.max(1, w - 4);
	const shown = lines.slice(0, max).map((l, i) => truncateToWidth("    " + theme.fg(colorFor(kinds[i], info.isError), truncateToWidth(l, room, "…")), w, "…"));
	const rest = lines.length - shown.length;
	if (rest > 0) shown.push(truncateToWidth(theme.fg("muted", `    … ${rest} weitere Zeilen (Klick oder /details)`), w, "…"));
	return shown;
}

/**
 * Zusammenfassung einer Werkzeuggruppe:
 * „▸ 4 Aufrufe · Befehl ×2 · Lesen · 3,2s · 1 ✗“ mit rechtsbündigem Klick-Hinweis.
 * `fresh` (kurz nach dem Zuklappen) zeigt ▾ als Übergang, sonst ▸.
 */
export function renderGroupLine(members: CallInfo[], width: number, theme: ThemeLike, fresh = false): string {
	const w = Math.max(1, width);
	const chevron = theme.fg("accent", theme.bold(fresh ? "▾" : "▸"));
	const title = theme.fg("toolTitle", theme.bold(`${members.length} Aufrufe`));
	const counts = new Map<string, number>();
	for (const m of members) counts.set(m.toolName, (counts.get(m.toolName) ?? 0) + 1);
	const parts: string[] = [];
	for (const [tool, n] of counts) parts.push(theme.fg("dim", n > 1 ? `${germanName(tool)} ×${n}` : germanName(tool)));
	let ms = 0;
	for (const m of members) ms += m.durationMs ?? 0;
	const dur = formatDuration(ms);
	if (dur) parts.push(theme.fg("dim", dur));
	const running = members.filter((m) => m.running).length;
	if (running > 0) parts.push(theme.fg("muted", `◌ ${running} läuft`));
	const errs = members.filter((m) => m.isError).length;
	if (errs > 0) parts.push(theme.fg("error", `${errs} ✗`));
	let line = `${chevron} ${title} ${parts.join(theme.fg("dim", " · "))}`;
	const hint = theme.fg("muted", "Klick: aufklappen");
	const hintW = visibleWidth(hint);
	if (visibleWidth(line) + 2 + hintW <= w) {
		const gap = Math.max(2, w - visibleWidth(line) - hintW);
		line += " ".repeat(gap) + hint;
	}
	return truncateToWidth(line, w, "…");
}

export { colorFor };

/**
 * kompakt – ersetzt die farbigen Werkzeug-Kästen durch eine Zeile je Aufruf.
 *
 * - Eine Zeile: Status (◌/✓/✗), deutscher Name, wichtigstes Argument, rechts gedimmt Umfang · Dauer.
 * - Fehler: genau eine Zusatzzeile mit der ersten aussagekräftigen Fehlerzeile.
 * - ctrl+o (app.tools.expand): höchstens 15 Zeilen Ausgabe, ohne Kasten.
 * - Klick auf eine Zeile: Overlay mit voller Ausgabe; Klick auf "[Diff #id]": Diff-Betrachter von artifacts.
 * - /details [n] bzw. alt+o: Overlay für den n-letzten Aufruf (Tastatur-Alternative).
 * - /kompakt an|aus|status – gespeichert in ~/.pi/agent/kompakt.json (Standard: an).
 * - Werkzeuge mit eigenem Renderer behalten ihren Inhalt, nur ohne farbigen Kasten.
 *
 * Kopplung an artifacts ausschließlich über pi.events:
 *   empfängt "artifacts:diff" {toolCallId,id,path,plus,minus,kind,isNew}
 *   sendet   "kompakt:state" {on}   (artifacts unterdrückt dann seine Toasts)
 *   sendet   "artifacts:open" {id, ctx}
 */
import type { ExtensionAPI, ExtensionContext, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
	COMPACT_TOOLS,
	type CallInfo,
	type DiffChip,
	type ThemeLike,
	colorFor,
	detailText,
	germanName,
	mainArg,
	relPath,
	renderErrorLine,
	renderExpanded,
	renderLine,
	clean,
} from "./render";
import { DetailViewer } from "./viewer";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const CONFIG_FILE = path.join(AGENT_DIR, "kompakt.json");

function loadEnabled(): boolean {
	try {
		const j = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as { enabled?: unknown };
		return j.enabled !== false;
	} catch {
		return true;
	}
}

function saveEnabled(on: boolean): void {
	mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
	const tmp = `${CONFIG_FILE}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify({ enabled: on }, null, 2) + "\n");
	renameSync(tmp, CONFIG_FILE);
}

type MouseEv = { type: string; button?: string; x: number; y: number };
type RenderCtx = {
	args: Record<string, unknown>;
	toolCallId: string;
	cwd: string;
	state: Record<string, unknown>;
	isPartial: boolean;
	isError: boolean;
	expanded: boolean;
	durationMs: number | undefined;
	invalidate: () => void;
};
type ResultLike = { content?: { type: string; text?: string }[]; details?: unknown };

function textOf(result: ResultLike | undefined): string {
	if (!result?.content) return "";
	return result.content
		.filter((c) => c.type === "text")
		.map((c) => String(c.text ?? "").replace(/\r/g, ""))
		.join("\n");
}

export default function kompaktExtension(pi: ExtensionAPI) {
	let enabled = loadEnabled();
	let lastCtx: ExtensionContext | undefined;
	/** toolCallId → Aufrufdaten (für /details und Klicks) */
	const records = new Map<string, CallInfo>();
	const order: string[] = [];
	/** toolCallId → Diff-Chip aus artifacts */
	const chips = new Map<string, DiffChip>();
	const changedFiles = new Set<string>();

	const remember = (ctx: ExtensionContext | undefined) => {
		if (ctx) lastCtx = ctx;
	};

	function updateStatus(): void {
		if (!lastCtx?.hasUI) return;
		if (!enabled || changedFiles.size === 0) {
			lastCtx.ui.setStatus("kompakt", undefined);
			return;
		}
		const n = changedFiles.size;
		lastCtx.ui.setStatus("kompakt", `✎ ${n} ${n === 1 ? "Datei" : "Dateien"} · /artifact 1`);
	}

	function broadcast(): void {
		pi.events.emit("kompakt:state", { on: enabled });
	}

	/** Diff-Betrachter von artifacts öffnen; false, wenn artifacts fehlt oder das Artefakt unbekannt ist. */
	function openDiff(id: number): boolean {
		if (!lastCtx?.hasUI) return false;
		const req: { id: number; ctx: ExtensionContext; handled?: boolean } = { id, ctx: lastCtx };
		pi.events.emit("artifacts:open", req);
		return req.handled === true;
	}

	function openDetails(info: CallInfo): void {
		const ctx = lastCtx;
		if (!ctx?.hasUI) return;
		const { lines, kinds } = detailText(info);
		const status = info.running ? "◌" : info.isError ? "✗" : "✓";
		const title = `${status} ${germanName(info.toolName)} · ${clean(mainArg(info.toolName, info.args, info.cwd))}`;
		const chip = info.chip;
		void ctx.ui.custom<void>(
			(tui, theme, _kb, done) =>
				new DetailViewer(
					title,
					lines.map((text, i) => ({ text, color: colorFor(kinds[i], info.isError) })),
					theme as unknown as ThemeLike,
					() => tui.terminal.rows,
					() => done(undefined),
					() => tui.requestRender(),
					chip ? () => void openDiff(chip.id) : undefined,
				),
			{ overlay: true, overlayOptions: { anchor: "center", width: "90%", maxHeight: "85%" } },
		);
	}

	/** Klick auf eine Zeile: Chip → Diff, edit/write mit Chip → Diff, sonst Detail-Overlay. */
	function clickOn(info: CallInfo, chipRange: { from: number; to: number; id: number } | undefined, x: number): void {
		const id = chipRange && x >= chipRange.from && x < chipRange.to ? chipRange.id : info.chip && (info.toolName === "edit" || info.toolName === "write") ? info.chip.id : undefined;
		if (id !== undefined && openDiff(id)) return;
		if (id !== undefined) lastCtx?.ui.notify(`Artefakt #${id} gibt es in dieser Sitzung nicht (mehr) – zeige Details`, "info");
		openDetails(info);
	}

	/** Die Zeile eines Aufrufs. Liest bei jedem Zeichnen den aktuellen Stand. */
	class LineComponent {
		private chipRange: { from: number; to: number; id: number } | undefined;
		constructor(
			public info: CallInfo,
			public theme: ThemeLike,
		) {}
		render(width: number): string[] {
			const l = renderLine(this.info, width, this.theme);
			this.chipRange = l.chip;
			return [l.text];
		}
		handleMouse(e: MouseEv) {
			if (e.type !== "click" || e.button !== "left") return undefined;
			clickOn(this.info, this.chipRange, e.x);
			return { handled: true };
		}
		invalidate(): void {}
	}

	/** Fehlerzeile bzw. ausgeklappte Ausgabe unter der Zeile. */
	class ResultComponent {
		constructor(
			public info: CallInfo,
			public theme: ThemeLike,
			public expanded: boolean,
		) {}
		render(width: number): string[] {
			if (this.info.running) return [];
			if (this.expanded) return renderExpanded(this.info, width, this.theme, 15);
			if (this.info.isError) return [renderErrorLine(this.info, width, this.theme)];
			return [];
		}
		handleMouse(e: MouseEv) {
			if (e.type !== "click" || e.button !== "left") return undefined;
			openDetails(this.info);
			return { handled: true };
		}
		invalidate(): void {}
	}

	/** Gemeinsamen Zustand eines Aufrufs anlegen/aktualisieren. */
	function infoFor(toolName: string, ctx: RenderCtx, result?: ResultLike): CallInfo {
		const st = ctx.state as { kompakt?: CallInfo };
		let info = st.kompakt;
		if (!info) {
			info = records.get(ctx.toolCallId) ?? {
				toolName,
				args: ctx.args ?? {},
				cwd: ctx.cwd,
				running: true,
				isError: false,
			};
			st.kompakt = info;
			if (!records.has(ctx.toolCallId)) {
				records.set(ctx.toolCallId, info);
				order.push(ctx.toolCallId);
				if (order.length > 500) records.delete(order.shift() as string);
			}
		}
		info.args = ctx.args ?? info.args;
		info.cwd = ctx.cwd ?? info.cwd;
		info.isError = ctx.isError;
		info.durationMs = ctx.durationMs;
		if (result) {
			info.output = textOf(result);
			info.running = ctx.isPartial;
			if (toolName === "artifact") {
				const d = result.details as { artifactId?: number } | undefined;
				if (typeof d?.artifactId === "number") info.chip = { id: d.artifactId, plus: 0, minus: 0, kind: "artifact", label: `[#${d.artifactId}]` };
			}
		}
		const chip = chips.get(ctx.toolCallId);
		if (chip) info.chip = chip;
		return info;
	}

	function compactRenderers(toolName: string, base: ToolRenderers | undefined): ToolRenderers {
		return {
			renderShell: "self",
			renderCall: (args: unknown, theme: unknown, rctx: unknown) => {
				const ctx = rctx as RenderCtx;
				if (!enabled && base?.renderCall) return (base.renderCall as (...a: unknown[]) => unknown)(args, theme, rctx) as never;
				const info = infoFor(toolName, ctx);
				return new LineComponent(info, theme as ThemeLike) as never;
			},
			renderResult: (result: unknown, opts: unknown, theme: unknown, rctx: unknown) => {
				const ctx = rctx as RenderCtx;
				if (!enabled && base?.renderResult) return (base.renderResult as (...a: unknown[]) => unknown)(result, opts, theme, rctx) as never;
				const info = infoFor(toolName, ctx, result as ResultLike);
				const o = opts as { expanded?: boolean; isPartial?: boolean };
				info.running = !!o?.isPartial;
				return new ResultComponent(info, theme as ThemeLike, !!o?.expanded) as never;
			},
		} as ToolRenderers;
	}

	pi.registerToolRenderer((toolName, next) => {
		if (!enabled) return undefined;
		const base = next();
		const own = !COMPACT_TOOLS.has(toolName) && !!(base?.renderCall || base?.renderResult);
		if (own) return { ...base, renderShell: "self" } as ToolRenderers;
		return compactRenderers(toolName, base);
	});

	// Diff-Chips von artifacts
	pi.events.on("artifacts:diff", (d: unknown) => {
		const e = d as { toolCallId?: string; id?: number; path?: string; plus?: number; minus?: number; kind?: "edit" | "write"; isNew?: boolean };
		if (!e?.toolCallId || typeof e.id !== "number") return;
		const chip: DiffChip = { id: e.id, plus: e.plus ?? 0, minus: e.minus ?? 0, kind: e.kind ?? "edit", isNew: e.isNew };
		chips.set(e.toolCallId, chip);
		const rec = records.get(e.toolCallId);
		if (rec) rec.chip = chip;
		if (chips.size > 500) chips.delete(chips.keys().next().value as string);
	});

	pi.on("session_start", (_e, ctx) => {
		remember(ctx);
		changedFiles.clear();
		broadcast();
		updateStatus();
	});
	pi.on("before_agent_start", (_e, ctx) => {
		remember(ctx);
		broadcast();
	});
	pi.on("tool_call", (_e, ctx) => remember(ctx));
	pi.on("tool_result", (e, ctx) => {
		remember(ctx);
		const ev = e as { toolName?: string; isError?: boolean; input?: Record<string, unknown> };
		if ((ev.toolName === "edit" || ev.toolName === "write") && !ev.isError) {
			const p = String(ev.input?.path ?? "");
			if (p) changedFiles.add(path.resolve(ctx.cwd ?? process.cwd(), p));
			updateStatus();
		}
	});

	function nthLast(n: number): CallInfo | undefined {
		const id = order[order.length - n];
		return id ? records.get(id) : undefined;
	}

	pi.registerCommand("details", {
		description: "Volle Ausgabe eines Werkzeugaufrufs (1 = letzter, 2 = vorletzter …)",
		handler: async (args, ctx) => {
			remember(ctx);
			const n = Math.max(1, Number.parseInt(String(args ?? "").trim() || "1", 10) || 1);
			const info = nthLast(n);
			if (!info) {
				ctx.ui.notify("Noch keine Werkzeugaufrufe", "info");
				return;
			}
			openDetails(info);
		},
	});

	pi.registerShortcut("alt+o", {
		description: "kompakt: volle Ausgabe des letzten Werkzeugaufrufs",
		handler: (ctx) => {
			remember(ctx);
			const info = nthLast(1);
			if (info) openDetails(info);
		},
	});

	pi.registerCommand("kompakt", {
		description: "Kompakte Werkzeugzeilen: an | aus | status",
		getArgumentCompletions: (prefix: string) =>
			["an", "aus", "status"].filter((s) => s.startsWith(prefix.trim())).map((s) => ({ value: s, label: s })),
		handler: async (args, ctx) => {
			remember(ctx);
			const a = String(args ?? "").trim().toLowerCase();
			if (a === "an" || a === "on") enabled = true;
			else if (a === "aus" || a === "off") enabled = false;
			else if (a !== "" && a !== "status") {
				ctx.ui.notify("Aufruf: /kompakt an | aus | status", "warning");
				return;
			}
			if (a === "an" || a === "on" || a === "aus" || a === "off") {
				try {
					saveEnabled(enabled);
				} catch (err) {
					ctx.ui.notify(`kompakt.json nicht gespeichert: ${(err as Error).message}`, "error");
				}
				broadcast();
				updateStatus();
			}
			const where = existsSync(CONFIG_FILE) ? relPath(CONFIG_FILE, ctx.cwd) : "Standard";
			ctx.ui.notify(
				`kompakt ist ${enabled ? "an" : "aus"} (${where}). Gilt für neue Zeilen; bereits gezeichnete wechseln den Inhalt, nicht den Rahmen.`,
				"info",
			);
		},
	});
}

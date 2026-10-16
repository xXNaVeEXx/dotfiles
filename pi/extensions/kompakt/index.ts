/**
 * kompakt – ersetzt die farbigen Werkzeug-Kästen durch eine Zeile je Aufruf.
 *
 * - Eine Zeile: Status (◌/✓/✗), deutscher Name, wichtigstes Argument, rechts gedimmt Umfang · Dauer.
 * - Fehler: genau eine Zusatzzeile mit der ersten aussagekräftigen Fehlerzeile.
 * - ctrl+o (app.tools.expand): höchstens 15 Zeilen Ausgabe, ohne Kasten.
 * - Klick auf eine Zeile: Overlay mit voller Ausgabe; Klick auf "[Diff #id]": Diff-Betrachter von artifacts.
 * - /details [n] bzw. alt+o: Overlay für den n-letzten Aufruf (Tastatur-Alternative).
 * - Werkzeuggruppen: aufeinanderfolgende Aufrufe (ohne Text dazwischen) bilden eine Gruppe.
 *   Am Ende eines Agent-Durchlaufs klappt sie automatisch zu: „▸ 4 Aufrufe · Befehl ×2 · … · Klick: aufklappen“.
 *   Klick auf die Gruppenzeile (oder alt+g für die letzte) klappt gestaffelt animiert auf/zu; ▾-Spalte klappt zu.
 *   /kompakt gruppen auto|an|aus; gespeichert in ~/.pi/agent/kompakt.json (Standard: auto).
 * - Eingeklapptes Denken: Label „✦ Gedanken · Klick zum Aufklappen“ über ctx.ui.setHiddenThinkingLabel;
 *   das global zugeklappte Denken kommt aus der pi-Einstellung hideThinkingBlock (Klick-Toggle von pi bleibt).
 * - /kompakt an|aus|status – gespeichert in ~/.pi/agent/kompakt.json (Standard: an).
 * - Werkzeuge mit eigenem Renderer behalten ihren Inhalt, nur ohne farbigen Kasten.
 *
 * Kopplung an artifacts ausschließlich über pi.events:
 *   empfängt "artifacts:diff" {toolCallId,id,path,plus,minus,kind,isNew}
 *   sendet   "kompakt:state" {on}   (artifacts unterdrückt dann seine Toasts)
 *   sendet   "artifacts:open" {id, ctx}
 */
import type { ExtensionAPI, ExtensionContext, ToolRenderers } from "@earendil-works/pi-coding-agent";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
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
	renderGroupLine,
	renderLine,
	clean,
} from "./render";
import { DetailViewer } from "./viewer";

const AGENT_DIR = process.env.PI_CODING_AGENT_DIR || path.join(os.homedir(), ".pi", "agent");
const CONFIG_FILE = path.join(AGENT_DIR, "kompakt.json");

/** Still bis auf KOMPAKT_DEBUG=1: Kette tool_call → liveCalls → addToGroup → agent_end nachvollziehen. */
function dbg(msg: string): void {
	if (!process.env.KOMPAKT_DEBUG) return;
	try {
		appendFileSync(path.join(AGENT_DIR, "kompakt-debug.log"), `${new Date().toISOString().slice(11, 23)} ${msg}\n`);
	} catch {
		// Debug-Log darf nie stören
	}
}

type GroupMode = "auto" | "an" | "aus";

function loadConfig(): { enabled: boolean; groups: GroupMode } {
	try {
		const j = JSON.parse(readFileSync(CONFIG_FILE, "utf8")) as { enabled?: unknown; groups?: unknown };
		return { enabled: j.enabled !== false, groups: j.groups === "an" || j.groups === "aus" ? j.groups : "auto" };
	} catch {
		return { enabled: true, groups: "auto" };
	}
}

function saveConfig(enabled: boolean, groups: GroupMode): void {
	mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
	const tmp = `${CONFIG_FILE}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify({ enabled, groups }, null, 2) + "\n");
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

const STAGGER = 26;

/** Assistant-Nachricht mit sichtbarem Text (oder Nutzer-Nachricht) beendet eine Aufruf-Sequenz. */
function closesGroup(m: { role?: string; content?: unknown } | undefined): boolean {
	if (!m) return false;
	if (m.role === "user") return true;
	if (m.role !== "assistant" || !Array.isArray(m.content)) return false;
	return m.content.some((b) => (b as { type?: string })?.type === "text");
}

function textOf(result: ResultLike | undefined): string {
	if (!result?.content) return "";
	return result.content
		.filter((c) => c.type === "text")
		.map((c) => String(c.text ?? "").replace(/\r/g, ""))
		.join("\n");
}

export default function kompaktExtension(pi: ExtensionAPI) {
	const cfg = loadConfig();
	let enabled = cfg.enabled;
	let groupMode: GroupMode = cfg.groups;
	let lastCtx: ExtensionContext | undefined;
	/** toolCallId → Aufrufdaten (für /details und Klicks) */
	const records = new Map<string, CallInfo>();
	const order: string[] = [];
	/** toolCallId → Diff-Chip aus artifacts */
	const chips = new Map<string, DiffChip>();
	const changedFiles = new Set<string>();

	/** Werkzeuggruppe: aufeinanderfolgende Aufrufe ohne Text dazwischen. */
	interface Group {
		id: number;
		members: string[];
		collapsed: boolean;
		/** Date.now() des letzten Umklappens – steuert Animation/Übergang. */
		animAt?: number;
	}
	let openGroup: Group | undefined;
	let lastGroup: Group | undefined;
	let groupSeq = 0;
	const groups = new Map<number, Group>();
	const groupOf = new Map<string, Group>();
	/** Nur live gesehene Aufrufe gruppieren – historische Zeilen bleiben flach. */
	const liveCalls = new Set<string>();
	const invalidateCall = new Map<string, () => void>();
	const invalidateRes = new Map<string, () => void>();

	function resetGroups(): void {
		openGroup = undefined;
		lastGroup = undefined;
		groups.clear();
		groupOf.clear();
		liveCalls.clear();
	}

	function rememberCall(callId: string, invalidate: () => void): void {
		if (invalidateCall.size > 2000) invalidateCall.clear();
		invalidateCall.set(callId, invalidate);
	}

	function rememberResult(callId: string, invalidate: () => void): void {
		if (invalidateRes.size > 2000) invalidateRes.clear();
		invalidateRes.set(callId, invalidate);
	}

	const memberInfos = (g: Group): CallInfo[] => g.members.map((id) => records.get(id)).filter((x): x is CallInfo => !!x);

	function repaintGroup(g: Group): void {
		for (const id of g.members) {
			invalidateCall.get(id)?.();
			invalidateRes.get(id)?.();
		}
	}

	function addToGroup(callId: string): void {
		if (groupMode === "aus") return dbg(`add ${callId}: skip (modus aus)`);
		if (!liveCalls.has(callId)) return dbg(`add ${callId}: skip (nicht live)`);
		if (groupOf.has(callId)) return dbg(`add ${callId}: skip (schon gruppiert)`);
		if (!openGroup) {
			const g: Group = { id: ++groupSeq, members: [], collapsed: false };
			groups.set(g.id, g);
			openGroup = g;
			if (groups.size > 80) {
				const oldest = groups.keys().next().value as number;
				const old = groups.get(oldest);
				if (old) for (const id of old.members) groupOf.delete(id);
				groups.delete(oldest);
				if (lastGroup?.id === oldest) lastGroup = undefined;
			}
		}
		openGroup.members.push(callId);
		groupOf.set(callId, openGroup);
		dbg(`add ${callId} → g${openGroup.id} (n=${openGroup.members.length})`);
	}

	/** Grenze: Aufruf-Sequenz beenden (Nutzer-/Text-Nachricht, neuer Turn). */
	function closeGroupBoundary(): void {
		openGroup = undefined;
	}

	/** Am Ende eines Agent-Durchlaufs: Gruppen ab 2 Aufrufen automatisch zuklappen. */
	function collapseAll(): void {
		closeGroupBoundary();
		dbg(`agent_end: groups=${groups.size} mode=${groupMode}`);
		if (groupMode !== "auto") return;
		for (const g of groups.values()) {
			if (!g.collapsed && g.members.length >= 2) {
				g.collapsed = true;
				g.animAt = Date.now();
				lastGroup = g;
				repaintGroup(g);
			}
		}
	}

	function toggleGroup(g: Group): void {
		g.collapsed = !g.collapsed;
		g.animAt = Date.now();
		lastGroup = g;
		repaintGroup(g);
	}

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
					// SAFETY: ui.custom liefert den vollen pi-Tui-Theme; DetailViewer braucht nur fg()/bold() – beide sind garantiert vorhanden.
					theme as unknown as ThemeLike,
					() => tui.terminal.rows,
					() => done(undefined),
					() => tui.requestRender(),
					chip ? () => void openDiff(chip.id) : undefined,
				),
			{ overlay: true, overlayOptions: { anchor: "center", width: "90%", maxHeight: "85%" } },
		);
	}

	/** Klick auf eine Zeile: eingeklappte Gruppe → aufklappen, ▾-Spalte → zuklappen, Chip → Diff, sonst Detail-Overlay. */
	function clickOn(info: CallInfo, chipRange: { from: number; to: number; id: number } | undefined, x: number, callId?: string): void {
		const g = callId ? groupOf.get(callId) : undefined;
		if (g && g.members.length >= 2 && groupMode !== "aus") {
			if (g.collapsed || x < 2) {
				toggleGroup(g);
				return;
			}
		}
		const id = chipRange && x >= chipRange.from && x < chipRange.to ? chipRange.id : info.chip && (info.toolName === "edit" || info.toolName === "write") ? info.chip.id : undefined;
		if (id !== undefined && openDiff(id)) return;
		if (id !== undefined) lastCtx?.ui.notify(`Artefakt #${id} gibt es in dieser Sitzung nicht (mehr) – zeige Details`, "info");
		openDetails(info);
	}

	/** Die Zeile eines Aufrufs. Liest bei jedem Zeichnen den aktuellen Stand. */
	class LineComponent {
		private chipRange: { from: number; to: number; id: number } | undefined;
		private animScheduled = false;
		constructor(
			public info: CallInfo,
			public theme: ThemeLike,
			public callId: string,
			public markDirty: () => void,
		) {
			rememberCall(callId, markDirty);
		}
		render(width: number): string[] {
			const g = groupOf.get(this.callId);
			if (g && g.members.length >= 2 && groupMode !== "aus") {
				const idx = g.members.indexOf(this.callId);
				if (g.collapsed) {
					if (idx !== 0) return [];
					const fresh = g.animAt !== undefined && Date.now() - g.animAt < 220;
					if (fresh && !this.animScheduled) {
						this.animScheduled = true;
						setTimeout(() => {
							this.animScheduled = false;
							this.markDirty();
						}, 240);
					}
					return [renderGroupLine(memberInfos(g), width, this.theme, fresh)];
				}
				if (g.animAt !== undefined) {
					const wait = idx * STAGGER - (Date.now() - g.animAt);
					if (wait > 0) {
						if (!this.animScheduled) {
							this.animScheduled = true;
							setTimeout(() => {
								this.animScheduled = false;
								this.markDirty();
							}, wait + 16);
						}
						return [];
					}
				}
				const l = renderLine(this.info, Math.max(1, width - 2), this.theme);
				this.chipRange = l.chip ? { from: l.chip.from + 2, to: l.chip.to + 2, id: l.chip.id } : undefined;
				return [(idx === 0 ? this.theme.fg("accent", "▾ ") : "  ") + l.text];
			}
			const l = renderLine(this.info, width, this.theme);
			this.chipRange = l.chip;
			return [l.text];
		}
		handleMouse(e: MouseEv) {
			if (e.type !== "click" || e.button !== "left") return undefined;
			clickOn(this.info, this.chipRange, e.x, this.callId);
			return { handled: true };
		}
		invalidate(): void {}
	}

	/** Fehlerzeile bzw. ausgeklappte Ausgabe unter der Zeile. */
	class ResultComponent {
		private animScheduled = false;
		constructor(
			public info: CallInfo,
			public theme: ThemeLike,
			public expanded: boolean,
			public callId: string,
			public markDirty: () => void,
		) {
			rememberResult(callId, markDirty);
		}
		render(width: number): string[] {
			if (this.info.running) return [];
			const g = groupOf.get(this.callId);
			if (g && g.members.length >= 2 && groupMode !== "aus") {
				if (g.collapsed) return [];
				if (g.animAt !== undefined) {
					const wait = (g.members.indexOf(this.callId) + 2) * STAGGER - (Date.now() - g.animAt);
					if (wait > 0) {
						if (!this.animScheduled) {
							this.animScheduled = true;
							setTimeout(() => {
								this.animScheduled = false;
								this.markDirty();
							}, wait + 16);
						}
						return [];
					}
				}
			}
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
				return new LineComponent(info, theme as ThemeLike, ctx.toolCallId, ctx.invalidate) as never;
			},
			renderResult: (result: unknown, opts: unknown, theme: unknown, rctx: unknown) => {
				const ctx = rctx as RenderCtx;
				if (!enabled && base?.renderResult) return (base.renderResult as (...a: unknown[]) => unknown)(result, opts, theme, rctx) as never;
				const info = infoFor(toolName, ctx, result as ResultLike);
				const o = opts as { expanded?: boolean; isPartial?: boolean };
				info.running = !!o?.isPartial;
				return new ResultComponent(info, theme as ThemeLike, !!o?.expanded, ctx.toolCallId, ctx.invalidate) as never;
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

	pi.on("session_start", (e, ctx) => {
		remember(ctx);
		if ((e as { reason?: string })?.reason !== "reload") resetGroups();
		// Eingeklapptes Denken hübsch beschriften (pi-eigener Klick-Toggle bleibt aktiv).
		try {
			ctx.ui.setHiddenThinkingLabel("✦ Gedanken · Klick zum Aufklappen");
		} catch {
			// ältere pi-Versionen ohne diesen Hook
		}
		changedFiles.clear();
		broadcast();
		updateStatus();
	});
	pi.on("before_agent_start", (_e, ctx) => {
		remember(ctx);
		broadcast();
	});
	pi.on("tool_call", (e, ctx) => {
		remember(ctx);
		const id = (e as { toolCallId?: string })?.toolCallId;
		dbg(`tool_call ${id}`);
		if (id) {
			liveCalls.add(id);
			// Gruppe hier anlegen, NICHT im Renderer: pi erstellt die Komponente schon beim
			// Message-Stream, das tool_call-Event kommt erst beim Executions-Start.
			addToGroup(id);
		}
	});
	pi.on("message_end", (e) => {
		const m = (e as { message?: { role?: string; content?: unknown } }).message;
		dbg(`message_end role=${m?.role} text=${closesGroup(m)}`);
		if (closesGroup(m)) closeGroupBoundary();
	});
	// turn_start ist KEINE Grenze: pi feuert es pro Tool-Loop-Durchlauf, nicht pro Nutzerfrage —
	// es würde die Gruppe nach jedem Tool-Result aufreißen.
	pi.on("user_bash", () => closeGroupBoundary());
	pi.on("agent_end", () => collapseAll());
	pi.on("agent_settled", () => dbg("agent_settled"));
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

	pi.registerShortcut("alt+g", {
		description: "kompakt: letzte Werkzeuggruppe auf-/zuklappen",
		handler: (ctx) => {
			remember(ctx);
			if (lastGroup && lastGroup.members.length >= 2) toggleGroup(lastGroup);
		},
	});

	pi.registerCommand("kompakt", {
		description: "Kompakte Werkzeugzeilen: an | aus | status | gruppen auto|an|aus",
		getArgumentCompletions: (prefix: string) =>
			["an", "aus", "status", "gruppen auto", "gruppen an", "gruppen aus"].filter((s) => s.startsWith(prefix.trim())).map((s) => ({ value: s, label: s })),
		handler: async (args, ctx) => {
			remember(ctx);
			const a = String(args ?? "").trim().toLowerCase();
			if (a.startsWith("gruppen")) {
				const m = a.split(/\s+/)[1];
				if (m !== "auto" && m !== "an" && m !== "aus") {
					ctx.ui.notify("Aufruf: /kompakt gruppen auto | an | aus", "warning");
					return;
				}
				groupMode = m;
				if (m === "aus") resetGroups();
				try {
					saveConfig(enabled, groupMode);
				} catch (err) {
					ctx.ui.notify(`kompakt.json nicht gespeichert: ${(err as Error).message}`, "error");
				}
				for (const g of groups.values()) repaintGroup(g);
			} else if (a === "an" || a === "on") enabled = true;
			else if (a === "aus" || a === "off") enabled = false;
			else if (a !== "" && a !== "status") {
				ctx.ui.notify("Aufruf: /kompakt an | aus | status | gruppen auto|an|aus", "warning");
				return;
			}
			if (a === "an" || a === "on" || a === "aus" || a === "off") {
				try {
					saveConfig(enabled, groupMode);
				} catch (err) {
					ctx.ui.notify(`kompakt.json nicht gespeichert: ${(err as Error).message}`, "error");
				}
				broadcast();
				updateStatus();
			}
			const where = existsSync(CONFIG_FILE) ? relPath(CONFIG_FILE, ctx.cwd) : "Standard";
			ctx.ui.notify(
				`kompakt ist ${enabled ? "an" : "aus"} · Gruppen: ${groupMode === "auto" ? "auto (klappt nach jedem Durchlauf zu)" : groupMode === "an" ? "an (nur Klick/alt+g)" : "aus"} (${where})`,
				"info",
			);
		},
	});
}

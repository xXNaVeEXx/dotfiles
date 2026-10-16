/**
 * error-hub.ts — nicht-blockierende Anzeige für Fehler, Warnungen und Infos in Pi.
 *
 * Problem (Nutzer): Meldungen erscheinen transient im Editor-Bereich und
 * blockieren/stören das Eingabefeld (z.B. git-stderr „Schwerwiegend: …").
 *
 * Lösung:
 *   1. tool_result-Events mit isError → severity „error".
 *   2. Prototype-Patch auf Pi's InteractiveMode.showError/showWarning/showStatus:
 *      fängt ALLE sichtbaren Kern-Meldungen (inkl. API-Fehler) und alle
 *      Extension-Notifies (showExtensionNotify mündet dort). severity entsprechend.
 *   3. Einzeiliges, nicht-blockierendes Widget unter dem Editor:
 *      „⚠ error-hub: 2 F · 1 W · 4 I · N neu · alt+e: öffnen"
 *   4. alt+e (oder /errors) öffnet ein Overlay: ↑/↓ Auswahl, enter/space
 *      auf-/zuklappen, Klick ebenfalls, x verwirft, shift+r leert, esc schließt.
 *
 * Alles defensiv: Interne Fehler landen in ~/.pi/agent/error-hub.log, niemals crashen.
 * Schlägt der Prototype-Patch fehl (Pi-Update), läuft der Hub weiter — dann
 * nur mit tool_result-Fehlern.
 */

import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
	ExtensionAPI,
	ExtensionContext,
	KeybindingsManager,
	Theme,
} from "@earendil-works/pi-coding-agent";
import {
	matchesKey,
	visibleWidth,
	type Focusable,
	type TUI,
	type TuiMouseEvent,
	type TuiMouseEventResult,
} from "@earendil-works/pi-tui";

const LOG = `${process.env.HOME ?? "."}/.pi/agent/error-hub.log`;
const WIDGET_KEY = "error-hub";
const MAX_ERRORS = 30;
const MAX_STORED_CHARS = 6000;
const OVERLAY_WIDTH = 78;
const MAX_LIST_ROWS = 24;

type Severity = "error" | "warning" | "info";

interface HubEntry {
	id: number;
	ts: number;
	severity?: Severity; // Legacy-Einträge (vor Severity-Umbau) haben keins → error
	tool: string; // Toolname oder "pi" (Kern-/Notify-Meldung)
	preview: string;
	message: string;
}

function sev(e: HubEntry): Severity {
	return e.severity ?? "error";
}

const GLYPH: Record<Severity, string> = { error: "✖", warning: "⚠", info: "ℹ" };

function logErr(scope: string, e: unknown) {
	try {
		const line = `${new Date().toISOString()} [${scope}] ${e instanceof Error ? `${e.message}\n${String(e.stack)}` : String(e)}\n`;
		fs.appendFileSync(LOG, line);
	} catch {
		/* nichts weiter tun */
	}
}

function truncate(s: string, n: number): string {
	return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

function inputPreview(tool: string, input: Record<string, unknown> | undefined): string {
	if (!input) return "";
	const cand =
		(typeof input.command === "string" && input.command) ||
		(typeof input.path === "string" && input.path) ||
		(typeof input.file_path === "string" && input.file_path) ||
		(typeof input.pattern === "string" && input.pattern) ||
		(typeof input.query === "string" && input.query) ||
		"";
	if (cand) return truncate(cand.replace(/\s+/g, " ").trim(), 90);
	try {
		return truncate(JSON.stringify(input).replace(/\s+/g, " "), 90);
	} catch {
		return tool;
	}
}

function messageOf(content: unknown): string {
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const c of content as Array<Record<string, unknown>>) {
		if (c && typeof c === "object" && c.type === "text" && typeof c.text === "string") {
			parts.push(c.text);
		}
	}
	return parts.join("\n").trim();
}

/** Hart umbrechen (sicher für unicode; Nachricht ist plain text ohne ANSI). */
function wrapText(text: string, width: number): string[] {
	const out: string[] = [];
	for (const rawLine of text.split("\n")) {
		if (rawLine.trim() === "") {
			out.push("");
			continue;
		}
		const chars = Array.from(rawLine);
		let cur = "";
		for (const ch of chars) {
			if (visibleWidth(cur + ch) > width) {
				out.push(cur);
				cur = ch === " " ? "" : ch;
			} else {
				cur += ch;
			}
		}
		if (cur) out.push(cur);
	}
	return out;
}

function padPlain(s: string, len: number): string {
	return s + " ".repeat(Math.max(0, len - visibleWidth(s)));
}

/** Modul-Status: überlebt Extension-Reloads (Factory läuft neu, Modul-Cache bleibt). */
const state = {
	errors: [] as HubEntry[],
	nextId: 1,
	unread: 0,
	overlayOpen: false,
	// Prototype-Patch nur EINMAL pro Prozess (sonst stapeln Reloads Wrapper).
	patched: false,
	patchFailed: false,
	// Eigen-Notifies (z.B. „keine Einträge") nicht selbst aufzeichnen.
	suppress: false,
	// Letzter bekannter Context — patched Show-Methoden haben keinen eigenen.
	lastCtx: undefined as ExtensionContext | undefined,
};

export default async function errorHub(pi: ExtensionAPI) {
	const errors = state.errors;
	let nextId = state.nextId;
	let unread = state.unread;
	let overlayOpen = state.overlayOpen;

	function syncState() {
		state.nextId = nextId;
		state.unread = unread;
		state.overlayOpen = overlayOpen;
	}

	function refreshWidget(ctx: ExtensionContext | undefined) {
		if (!ctx || ctx.mode !== "tui") return;
		try {
			if (errors.length === 0) {
				ctx.ui.setWidget(WIDGET_KEY, undefined, { placement: "belowEditor" });
				return;
			}
			const cE = errors.filter((e) => sev(e) === "error").length;
			const cW = errors.filter((e) => sev(e) === "warning").length;
			const cI = errors.filter((e) => sev(e) === "info").length;
			const parts: string[] = [];
			if (cE) parts.push(`${cE} F`);
			if (cW) parts.push(`${cW} W`);
			if (cI) parts.push(`${cI} I`);
			const neu = unread > 0 ? ` · ${unread} neu` : "";
			const last = errors[errors.length - 1];
			const lastInfo = last ? ` · zuletzt: ${truncate(last.tool, 14)}` : "";
			ctx.ui.setWidget(
				WIDGET_KEY,
				[`⚠ error-hub: ${parts.join(" · ")}${neu}${lastInfo} · alt+e: öffnen`],
				{ placement: "belowEditor" },
			);
		} catch (e) {
			logErr("refreshWidget", e);
		}
	}

	function clearAll() {
		errors.length = 0;
		unread = 0;
		syncState();
		refreshWidget(state.lastCtx);
	}

	async function openOverlay(ctx: ExtensionContext) {
		if (ctx.mode !== "tui" || overlayOpen) return;
		if (errors.length === 0) {
			// Eigenes Notify nicht mitschneiden (showStatus wäre gepatcht).
			state.suppress = true;
			try {
				ctx.ui.notify("error-hub: keine Einträge aufgezeichnet", "info");
			} finally {
				state.suppress = false;
			}
			return;
		}
		overlayOpen = true;
		unread = 0;
		syncState();
		try {
			const result = await ctx.ui.custom<{ cleared?: boolean } | undefined>(
				(_tui: TUI, theme: Theme, _kb: KeybindingsManager, done: (r: { cleared?: boolean } | undefined) => void) =>
					new ErrorHubOverlay(theme, done, errors, () => clearAll()),
				{ overlay: true },
			);
			if (result?.cleared) clearAll();
			else refreshWidget(ctx);
		} catch (e) {
			logErr("openOverlay", e);
		} finally {
			overlayOpen = false;
			syncState();
		}
	}

	function capture(SeverityIn: Severity, tool: string, preview: string, message: string, ctx?: ExtensionContext) {
		try {
			if (state.suppress) return;
			const msg = truncate(message.trim() || "(leere Meldung)", MAX_STORED_CHARS);
			// showStatus aktualisiert in der UI dieselbe Zeile → identische
			// aufeinanderfolgende Infos nur einmal aufzeichnen.
			if (SeverityIn === "info") {
				const last = errors[errors.length - 1];
				if (last && sev(last) === "info" && last.message === msg) return;
			}
			errors.push({ id: nextId++, ts: Date.now(), severity: SeverityIn, tool, preview, message: msg });
			if (errors.length > MAX_ERRORS) errors.shift();
			if (!overlayOpen) unread++;
			syncState();
			refreshWidget(ctx ?? state.lastCtx);
		} catch (e) {
			logErr("capture", e);
		}
	}

	/**
	 * Patcht InteractiveMode.showError/showWarning/showStatus einmalig pro Prozess.
	 * Damit landen ALLE sichtbaren Kern-Meldungen (API-Fehler etc.) und alle
	 * Extension-Notifies im Hub. Fehlschlag ist unkritisch: Hub läuft dann
	 * nur mit tool_result-Fehlern weiter.
	 */
	async function patchPiUi() {
		if (state.patched) return;
		state.patched = true;
		try {
			const target = resolveInteractiveModePath();
			if (!target) throw new Error("interactive-mode.js nicht auffindbar");
			const mod = (await import(pathToFileURL(target).href)) as {
				InteractiveMode?: { prototype: Record<string, ((msg: string) => void) | undefined> };
			};
			const Ctor = mod.InteractiveMode;
			if (!Ctor?.prototype) throw new Error("InteractiveMode-Export fehlt");
			const hooks: Array<readonly [string, Severity]> = [
				["showError", "error"],
				["showWarning", "warning"],
				["showStatus", "info"],
			];
			for (const [method, sevNow] of hooks) {
				const orig = Ctor.prototype[method];
				if (typeof orig !== "function") {
					state.patchFailed = true;
					logErr("patchPiUi", new Error(`Methode ${method} fehlt — Pi-Update?`));
					continue;
				}
				Ctor.prototype[method] = function (this: unknown, msg: string) {
					capture(sevNow, "pi", "", String(msg ?? ""));
					return orig.call(this, msg);
				};
			}
		} catch (e) {
			state.patchFailed = true;
			logErr("patchPiUi", e);
		}
	}

	pi.on("tool_result", (ev, ctx) => {
		try {
			state.lastCtx = ctx;
			if (!ev.isError) return;
			const message = truncate(messageOf(ev.content), MAX_STORED_CHARS) || "(keine Fehlertext)";
			const toolName = String((ev as { toolName?: unknown }).toolName ?? "tool");
			capture("error", toolName, inputPreview(toolName, ev.input), message, ctx);
		} catch (e) {
			logErr("tool_result", e);
		}
	});

	pi.on("session_start", (ev, ctx) => {
		try {
			state.lastCtx = ctx;
			// Bei Reload (z.B. /reload, Settings-Change) Buffer NICHT leeren —
			// nur bei echter neuer/gewechselter Session.
			const reason = (ev as { reason?: string }).reason;
			if (reason !== "reload") {
				errors.length = 0;
				unread = 0;
			}
			syncState();
			refreshWidget(ctx);
		} catch (e) {
			logErr("session_start", e);
		}
	});

	pi.registerCommand("errors", {
		description: "Fehler-Hub: gesammelte Fehler, Warnungen und Infos anzeigen",
		handler: async (_args: string, ctx: ExtensionContext) => openOverlay(ctx),
	});

	try {
		pi.registerShortcut("alt+e", {
			description: "error-hub: Einträge öffnen",
			handler: async (ctx: ExtensionContext) => openOverlay(ctx),
		});
	} catch (e) {
		logErr("registerShortcut", e);
	}

	await patchPiUi();
}

/** Pfad zu Pi's interactive-mode.js — bevorzugt über import.meta.resolve, sonst bekannter Install-Pfad. */
function resolveInteractiveModePath(): string | undefined {
	try {
		// SAFETY: jiti liefert import.meta ohne Node-Resolve-Typ; ob resolve existiert,
		// prüfen wir zur Laufzeit (typeof) — die Form ist per Node-Doku fest.
		const resolve = (import.meta as unknown as { resolve?: (s: string) => string }).resolve;
		if (typeof resolve === "function") {
			const u = resolve("@earendil-works/pi-coding-agent");
			const p = fileURLToPath(u);
			if (p.endsWith("dist/index.js")) {
				return `${p.slice(0, -"dist/index.js".length)}dist/modes/interactive/interactive-mode.js`;
			}
		}
	} catch {
		/* Fallback unten */
	}
	const home = process.env.HOME ?? "";
	const known = `${home}/.pi/agent/install/releases/1.2.0/node_modules/@earendil-works/pi-coding-agent/dist/modes/interactive/interactive-mode.js`;
	return fs.existsSync(known) ? known : undefined;
}

type RowRef =
	| { kind: "err"; idx: number }
	| { kind: "clear" }
	| { kind: "other" };

class ErrorHubOverlay implements Focusable {
	readonly width = OVERLAY_WIDTH;
	focused = false;

	private selected = 0;
	private expanded = new Set<number>();
	private rowMap: RowRef[] = [];
	constructor(
		private theme: Theme,
		private done: (result: { cleared?: boolean } | undefined) => void,
		private errors: HubEntry[],
		private onClear: () => void,
	) {}

	/** Component-API: kein Render-Cache → no-op. */
	invalidate(): void {}

	handleInput(data: string): void {
		try {
			if (matchesKey(data, "escape") || matchesKey(data, "q")) {
				this.done(undefined);
				return;
			}
			if (matchesKey(data, "return") || matchesKey(data, "space")) {
				this.toggle(this.selected);
				return;
			}
			if (matchesKey(data, "x")) {
				this.dismiss(this.selected);
				return;
			}
			if (matchesKey(data, "up") || matchesKey(data, "ctrl+p")) this.move(-1);
			else if (matchesKey(data, "down") || matchesKey(data, "ctrl+n")) this.move(1);
			else if (matchesKey(data, "home")) this.selected = 0;
			else if (matchesKey(data, "end")) this.selected = this.errors.length - 1;
			else if (matchesKey(data, "shift+r")) this.clear();
		} catch (e) {
			logErr("handleInput", e);
		}
	}

	handleMouse(ev: TuiMouseEvent): TuiMouseEventResult | undefined {
		try {
			if (ev.type === "wheel") {
				this.move(ev.wheelDelta && ev.wheelDelta < 0 ? -1 : 1);
				return { handled: true };
			}
			if ((ev.type === "click" || ev.type === "press") && ev.button === "left") {
				const ref = this.rowMap[ev.y];
				if (!ref) return undefined;
				if (ref.kind === "err") {
					this.selected = ref.idx;
					this.toggle(ref.idx);
					return { handled: true };
				}
				if (ref.kind === "clear") {
					this.clear();
					return { handled: true };
				}
			}
			return undefined;
		} catch (e) {
			logErr("handleMouse", e);
			return undefined;
		}
	}

	private move(d: number) {
		const n = this.errors.length;
		if (n === 0) return;
		this.selected = Math.min(n - 1, Math.max(0, this.selected + d));
	}

	private toggle(i: number) {
		if (this.expanded.has(i)) this.expanded.delete(i);
		else this.expanded.add(i);
	}

	private clear() {
		this.onClear();
		this.done({ cleared: true });
	}

	private dismiss(i: number) {
		this.errors.splice(i, 1);
		if (this.expanded.has(i)) this.expanded.delete(i);
		if (this.selected >= this.errors.length) this.selected = Math.max(0, this.errors.length - 1);
	}

	private sevColor(s: Severity): string {
		return s === "error" ? "error" : s === "warning" ? "warning" : "dim";
	}

	render(_width: number): string[] {
		try {
			const th = this.theme;
			const w = this.width;
			const innerW = w - 2;
			const lines: string[] = [];
			this.rowMap = [];

			const pad = (s: string, len = innerW) => s + " ".repeat(Math.max(0, len - visibleWidth(s)));
			const row = (s: string) => th.fg("border", "│") + pad(s) + th.fg("border", "│");

			lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));
			this.rowMap.push({ kind: "other" });
			lines.push(
				row(
					` ${th.fg("error", "⚠")} ${th.fg("accent", "error-hub")} ${th.fg("dim", `· ${this.errors.length} Einträge · enter/klick klappt vollständigen Text auf`)}`,
				),
			);
			this.rowMap.push({ kind: "other" });
			lines.push(
				row(
					` ${th.fg("dim", `✖ Fehler  ⚠ Warnung  ℹ Info · ↑/↓ wählen · enter/space auf-/zuklappen · x verwerfen · R alle leeren · esc`)} `,
				),
			);
			this.rowMap.push({ kind: "other" });
			lines.push(row(""));
			this.rowMap.push({ kind: "other" });

			const shown = this.errors.slice(-MAX_LIST_ROWS);
			const offset = this.errors.length - shown.length;
			for (let i = 0; i < shown.length; i++) {
				const e = shown[i]!;
				const absIdx = offset + i;
				const sel = absIdx === this.selected;
				const time = new Date(e.ts).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
				const marker = sel ? th.fg("accent", "❯") : " ";
				const glyph = th.fg(this.sevColor(sev(e)), GLYPH[sev(e)]);
				const head = `${marker} #${e.id} ${time} ${glyph} ${th.fg("warning", truncate(e.tool, 12))} ${truncate(e.preview || e.message, Math.max(10, innerW - 36))}`;
				lines.push(row(sel ? th.fg("accent", padPlain(head, innerW)) : head));
				this.rowMap.push({ kind: "err", idx: absIdx });

				if (this.expanded.has(absIdx)) {
					for (const l of wrapText(e.message, innerW - 4).slice(0, 60)) {
						lines.push(row(`   ${th.fg("dim", l)}`));
						this.rowMap.push(sel ? { kind: "err", idx: absIdx } : { kind: "other" });
					}
				}
			}
			if (this.errors.length > MAX_LIST_ROWS) {
				lines.push(row(` ${th.fg("dim", `… ältere ${this.errors.length - MAX_LIST_ROWS} nicht angezeigt (R leert alles)`)}`));
				this.rowMap.push({ kind: "other" });
			}

			lines.push(row(""));
			this.rowMap.push({ kind: "other" });
			lines.push(row(` ${th.fg("warning", "x")} ${th.fg("dim", "verwerfen")}  ${th.fg("warning", "R")} ${th.fg("dim", "alle leeren")}   ${th.fg("dim", "esc schließen")}`));
			this.rowMap.push({ kind: "clear" });
			lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));
			this.rowMap.push({ kind: "other" });
			return lines;
		} catch (e) {
			logErr("render", e);
			return ["error-hub: render error (siehe ~/.pi/agent/error-hub.log)"];
		}
	}
}

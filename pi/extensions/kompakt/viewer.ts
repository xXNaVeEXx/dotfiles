/**
 * kompakt – rollbarer Overlay-Betrachter für die volle Ausgabe eines Aufrufs.
 * Esc/q schließt, ↑↓ PgUp PgDn Pos1 Ende und Mausrad rollen. Kein Hintergrund.
 */
import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import type { ThemeLike } from "./render";

export interface ViewerLine {
	text: string;
	color: string;
}

export class DetailViewer {
	private scroll = 0;
	private wrapped: string[] = [];
	private wrappedWidth = -1;
	private bodyHeight = 10;

	constructor(
		private readonly title: string,
		private readonly lines: ViewerLine[],
		private readonly theme: ThemeLike,
		private readonly rows: () => number,
		private readonly done: () => void,
		private readonly requestRender: () => void,
		private readonly onDiff?: () => void,
	) {}

	private wrap(width: number): void {
		if (width === this.wrappedWidth) return;
		this.wrappedWidth = width;
		this.wrapped = [];
		for (const l of this.lines) {
			const styled = this.theme.fg(l.color, l.text);
			const parts = l.text.length === 0 ? [""] : wrapTextWithAnsi(styled, Math.max(1, width));
			this.wrapped.push(...parts);
		}
	}

	render(width: number): string[] {
		const w = Math.max(10, width);
		const inner = w - 2;
		this.wrap(inner);
		this.bodyHeight = Math.max(1, Math.min(this.wrapped.length, Math.floor(this.rows() * 0.8) - 3));
		const maxScroll = Math.max(0, this.wrapped.length - this.bodyHeight);
		this.scroll = Math.min(Math.max(0, this.scroll), maxScroll);

		const b = (s: string) => this.theme.fg("borderAccent", s);
		const title = ` ${this.title} `;
		const titleT = truncateToWidth(title, Math.max(1, w - 4), "…");
		const top = b("╭─") + this.theme.fg("accent", this.theme.bold(titleT)) + b("─".repeat(Math.max(0, w - 3 - visibleWidth(titleT))) + "╮");
		const out = [truncateToWidth(top, w)];
		const body = this.wrapped.slice(this.scroll, this.scroll + this.bodyHeight);
		for (let i = 0; i < this.bodyHeight; i++) {
			const l = body[i] ?? "";
			const t = truncateToWidth(l, inner, "…");
			out.push(b("│") + t + " ".repeat(Math.max(0, inner - visibleWidth(t))) + b("│"));
		}
		const pos = this.wrapped.length > this.bodyHeight ? `${this.scroll + 1}–${Math.min(this.wrapped.length, this.scroll + this.bodyHeight)}/${this.wrapped.length}` : `${this.wrapped.length} Z.`;
		const help = ` ${pos} · ↑↓ PgUp/PgDn rollen${this.onDiff ? " · d Diff" : ""} · Esc schließt `;
		const helpT = truncateToWidth(help, Math.max(1, w - 4), "…");
		const bottom = b("╰─") + this.theme.fg("dim", helpT) + b("─".repeat(Math.max(0, w - 3 - visibleWidth(helpT))) + "╯");
		out.push(truncateToWidth(bottom, w));
		return out;
	}

	private move(delta: number): void {
		this.scroll += delta;
		this.requestRender();
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape") || data === "q") return this.done();
		if (this.onDiff && data === "d") {
			this.done();
			return this.onDiff();
		}
		if (matchesKey(data, "up") || data === "k") return this.move(-1);
		if (matchesKey(data, "down") || data === "j") return this.move(1);
		if (matchesKey(data, "pageUp")) return this.move(-this.bodyHeight + 1);
		if (matchesKey(data, "pageDown") || data === " ") return this.move(this.bodyHeight - 1);
		if (matchesKey(data, "home") || data === "g") return this.move(-1e9);
		if (matchesKey(data, "end") || data === "G") return this.move(1e9);
	}

	handleMouse(event: { type: string; wheelDelta?: number; button?: string }): { handled: boolean } | undefined {
		if (event.type === "wheel") {
			this.move((event.wheelDelta ?? 1) > 0 ? 3 : -3);
			return { handled: true };
		}
		return { handled: true };
	}

	invalidate(): void {
		this.wrappedWidth = -1;
	}
}

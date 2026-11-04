/**
 * turn-weiter.ts — setzt einen Lauf fort, den nicht das Modell, sondern die Technik beendet hat.
 *
 * Anlass: Der Kontext-Proxy billion-context beendet eine Antwort mit finishReason "length", wenn sie nur aus
 * Proxy-Werkzeugen (compress/decompress) bestand und alle fehlschlugen — ein früher Abbruch statt erneuter
 * Anfrage. Auf dem Anthropic-Pfad wird daraus der Fehler
 *   Anthropic beta messages stream emitted unsupported stop reason "length"
 * (stopReason "error"), auf OpenAI-kompatiblen Pfaden stopReason "length". Beides beendet den Lauf, und pi
 * wiederholt ihn nicht selbst, weil die Meldung keinem retrybaren Fehlermuster entspricht.
 * Upstream offen: ranxianglei/billion-context Issue #5220 (PR #5231).
 *
 * Verhalten: Bei agent_end wird die letzte Assistant-Nachricht geprüft. Passt die Signatur, folgt eine
 * Folge-Nachricht mit triggerTurn, sobald die Sitzung frei ist (nur TUI/RPC). Kommt vorher ein anderer Lauf
 * dazwischen (z. B. ein Review-Turn), wird nach dessen Ende zugestellt; tippt jemand selbst, entfällt sie.
 * Bremsen: höchstens MAX_FOLGE Fortsetzungen nacheinander ohne regulär beendeten Lauf, höchstens
 * MAX_JE_STUNDE je Stunde. Ein Abbruch durch den Nutzer (stopReason "aborted") wird nie fortgesetzt; ein
 * "length" ohne Ausgabe ist ein Kontext-Überlauf und bleibt pis eigener Verdichtung überlassen.
 *
 * Log: ~/.pi/agent/turn-weiter.log (je Sitzungsstart eine Zeile „geladen …“ als Ladebeleg) · Abschalten: Datei
 * ~/.pi/agent/turn-weiter.off anlegen.
 * Test: node ~/.pi/agent/ext-dev/turn-weiter/test.mjs [pfad/zu/turn-weiter.ts]
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

function zahlAusEnv(name: string, standard: number): number {
	const wert = Number(process.env[name]);
	return Number.isFinite(wert) && wert >= 0 ? wert : standard;
}

const AGENT_DIR = path.join(os.homedir(), ".pi", "agent");
const LOG = process.env.TURN_WEITER_LOG ?? path.join(AGENT_DIR, "turn-weiter.log");
const AUS = process.env.TURN_WEITER_OFF ?? path.join(AGENT_DIR, "turn-weiter.off");
const DELAY_MS = zahlAusEnv("TURN_WEITER_DELAY_MS", 1500);
const WARTE_MS = zahlAusEnv("TURN_WEITER_WARTE_MS", 2000);
const MAX_WARTEN = 30;
const MAX_FOLGE = 3;
const MAX_JE_STUNDE = 12;
const STUNDE_MS = 3_600_000;

/** Die Felder einer Assistant-Nachricht, die die Erkennung braucht. */
export interface LaufEnde {
	stopReason: string;
	errorMessage: string;
	outputTokens: number;
}

interface Zustand {
	/** Fortsetzungen nacheinander ohne regulär beendeten Lauf dazwischen. */
	folge: number;
	/** Zeitpunkte der Fortsetzungen der letzten Stunde. */
	gesendet: number[];
	/** Grund einer noch nicht zugestellten Fortsetzung. */
	offen: string | null;
	/** Abfragen, ob die Sitzung frei ist, seit der letzten Planung. */
	versuche: number;
	timer: ReturnType<typeof setTimeout> | null;
}

// Modulebene statt Factory-Closure: /reload ruft die Factory neu auf, der Modul-Zustand bleibt.
const zustand: Zustand = { folge: 0, gesendet: [], offen: null, versuche: 0, timer: null };

function istObjekt(wert: unknown): wert is Record<string, unknown> {
	return typeof wert === "object" && wert !== null;
}

/** Letzte Assistant-Nachricht eines Laufs, reduziert auf die Felder der Erkennung; null, wenn keine da ist. */
export function letztesLaufEnde(nachrichten: readonly unknown[]): LaufEnde | null {
	for (let i = nachrichten.length - 1; i >= 0; i--) {
		const n = nachrichten[i];
		if (!istObjekt(n) || n.role !== "assistant") continue;
		const usage = n.usage;
		return {
			stopReason: typeof n.stopReason === "string" ? n.stopReason : "",
			errorMessage: typeof n.errorMessage === "string" ? n.errorMessage : "",
			outputTokens: istObjekt(usage) && typeof usage.output === "number" ? usage.output : 0,
		};
	}
	return null;
}

/** Grund für eine Fortsetzung, wenn die Technik den Lauf beendet hat; sonst null. */
export function abbruchGrund(ende: LaufEnde | null): string | null {
	if (ende === null) return null;
	if (ende.stopReason === "error" && /unsupported stop reason/i.test(ende.errorMessage)) {
		return ende.errorMessage.slice(0, 200);
	}
	// "length" mit Ausgabe: abgeschnittene Antwort bzw. früher Abbruch des Proxys. Ohne Ausgabe ist es ein
	// Kontext-Überlauf; den behandelt pi selbst (Verdichtung), daher hier nicht fortsetzen.
	if (ende.stopReason === "length" && ende.outputTokens > 0) return 'stopReason "length" (Antwort abgeschnitten)';
	return null;
}

export function fortsetzungsText(grund: string): string {
	return [
		`[turn-weiter] Dein letzter Lauf wurde technisch abgebrochen (${grund}), nicht von dir beendet.`,
		"Mach genau dort weiter, wo du warst, ohne erledigte Schritte zu wiederholen.",
		"Kam der Abbruch nach compress/decompress: diese nie allein senden, immer zusammen mit einem echten",
		"Tool-Call, und eine schon abgelehnte Block-Zusammenführung nicht erneut versuchen.",
	].join(" ");
}

function protokoll(zeile: string): void {
	try {
		fs.appendFileSync(LOG, `${new Date().toISOString()} ${zeile}\n`);
	} catch {
		// Das Protokoll ist optional; ein Schreibfehler darf die Sitzung nicht stören.
	}
}

function hinweis(ctx: ExtensionContext, text: string): void {
	if (ctx.mode === "tui") ctx.ui.notify(text, "warning");
}

function timerLoeschen(): void {
	if (zustand.timer !== null) clearTimeout(zustand.timer);
	zustand.timer = null;
}

function planen(pi: ExtensionAPI, ctx: ExtensionContext, verzoegerung: number): void {
	timerLoeschen();
	zustand.timer = setTimeout(() => zustellen(pi, ctx), verzoegerung);
}

function zustellen(pi: ExtensionAPI, ctx: ExtensionContext): void {
	zustand.timer = null;
	const grund = zustand.offen;
	if (grund === null) return;
	try {
		if (fs.existsSync(AUS)) {
			protokoll(`abgeschaltet (${AUS}) — ${grund}`);
			zustand.offen = null;
			return;
		}
		if (!ctx.isIdle() || ctx.hasPendingMessages()) {
			// Ein anderer Lauf ist dran. Kurz weiter abfragen; danach stellt das Ende jenes Laufs zu (agent_end).
			zustand.versuche += 1;
			if (zustand.versuche < MAX_WARTEN) planen(pi, ctx, WARTE_MS);
			else protokoll(`Sitzung beschäftigt, Zustellung beim nächsten Laufende — ${grund}`);
			return;
		}
		const jetzt = Date.now();
		zustand.gesendet = zustand.gesendet.filter((t) => jetzt - t < STUNDE_MS);
		zustand.offen = null;
		if (zustand.gesendet.length >= MAX_JE_STUNDE) {
			protokoll(`Bremse: ${MAX_JE_STUNDE} Fortsetzungen in einer Stunde — ${grund}`);
			hinweis(ctx, `turn-weiter: ${MAX_JE_STUNDE} automatische Fortsetzungen in einer Stunde, setze nicht mehr fort.`);
			return;
		}
		zustand.folge += 1;
		zustand.gesendet.push(jetzt);
		protokoll(`fortgesetzt ${zustand.folge}/${MAX_FOLGE} — ${grund}`);
		pi.sendMessage(
			{ customType: "turn-weiter", content: fortsetzungsText(grund), display: true, details: { grund } },
			{ triggerTurn: true, deliverAs: "followUp" },
		);
	} catch (fehler) {
		protokoll(`Fehler beim Fortsetzen: ${String(fehler)}`);
	}
}

export default function turnWeiter(pi: ExtensionAPI): void {
	// Ladebeleg: eine Zeile je Sitzungsstart (auch reload), damit sich prüfen lässt, ob die Extension aktiv ist.
	pi.on("session_start", (event, ctx) => {
		protokoll(`geladen (${event.reason}, ${ctx.mode}, pid ${process.pid})`);
	});
	pi.on("agent_end", (event, ctx) => {
		try {
			if (ctx.mode !== "tui" && ctx.mode !== "rpc") return;
			const grund = abbruchGrund(letztesLaufEnde(event.messages));
			if (grund === null) {
				// Regulär beendet. Steht noch eine Fortsetzung aus (ein anderer Lauf kam dazwischen), jetzt
				// zustellen; sonst ist die Abbruch-Folge vorbei.
				if (zustand.offen !== null) {
					zustand.versuche = 0;
					planen(pi, ctx, DELAY_MS);
				} else {
					zustand.folge = 0;
				}
				return;
			}
			if (zustand.folge >= MAX_FOLGE) {
				zustand.offen = null;
				timerLoeschen();
				protokoll(`Bremse: ${MAX_FOLGE} Fortsetzungen nacheinander ohne regulären Lauf — ${grund}`);
				hinweis(ctx, `turn-weiter: ${MAX_FOLGE}× in Folge technisch abgebrochen, setze nicht mehr automatisch fort.`);
				return;
			}
			zustand.offen = grund;
			zustand.versuche = 0;
			planen(pi, ctx, DELAY_MS);
		} catch (fehler) {
			protokoll(`Fehler in agent_end: ${String(fehler)}`);
		}
	});
	// Jemand hat selbst weitergeschrieben (Nutzer, herdr-Prompt, RPC): die offene Fortsetzung entfällt.
	pi.on("input", () => {
		zustand.offen = null;
		timerLoeschen();
	});
	pi.on("session_shutdown", () => {
		zustand.offen = null;
		timerLoeschen();
	});
}

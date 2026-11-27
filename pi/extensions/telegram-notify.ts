// pi-telegram: Ladedatei – erzeugt von „pi-telegram install“
//
// Nicht von Hand ändern – ein erneutes `pi-telegram install` setzt sie neu. Absicht: eine echte Datei statt eines
// Verweises; pi-sync verteilt ~/.pi/agent/extensions über ein Git-Repo und nimmt nur echte Dateien mit. Geladen
// wird die Erweiterung aus dem Repo nur, wenn das Repo auf diesem Rechner liegt; sonst tut diese Datei nichts.

import { existsSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const ERWEITERUNG = "/home/gamzat/projects/pi-telegram/extensions/telegram-notify.ts";

type Fabrik = (pi: ExtensionAPI) => unknown;

function istFabrik(wert: unknown): wert is Fabrik {
	return typeof wert === "function";
}

/** Exportiertes Modul: `default` ist die Funktion selbst oder – je nach Loader – ein Objekt mit `default`. */
function fabrik(mod: unknown): Fabrik | null {
	const direkt = (mod as { default?: unknown } | null | undefined)?.default;
	if (istFabrik(direkt)) return direkt;
	const verschachtelt = (direkt as { default?: unknown } | null | undefined)?.default;
	return istFabrik(verschachtelt) ? verschachtelt : null;
}

export default async function telegramNotifyLaden(pi: ExtensionAPI): Promise<void> {
	if (!existsSync(ERWEITERUNG)) return;
	try {
		const laden = fabrik(await import(ERWEITERUNG));
		if (!laden) {
			process.stderr.write(`telegram-notify: ${ERWEITERUNG} exportiert keine Funktion\n`);
			return;
		}
		await laden(pi);
	} catch (error) {
		const grund = error instanceof Error ? (error.stack ?? error.message) : String(error);
		process.stderr.write(`telegram-notify: Erweiterung nicht geladen (${ERWEITERUNG}):\n${grund}\n`);
	}
}

/**
 * Undo-Snapshot-Speicher für pi-artifacts.
 *
 * Sichert Original-Stände von Dateien als Einzel-JSON-Dateien unter
 * ~/.cache/pi-artifacts/undo/ — pro Datei ein newest-first-Stapel:
 * Dateiname = sha256(path) (erste 12 Hex-Zeichen) + "-" + Date.now() + ".json".
 * rollback() stellt den jüngsten Snapshot wieder her und nimmt ihn vom Stapel.
 * Housekeeping: maximal 100 Snapshot-Dateien im Speicher (älteste fliegen raus).
 */

import { createHash } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";

/** Ein Undo-Snapshot: Originalzustand einer Datei vor einer Änderung. */
export interface UndoEntry {
	path: string;
	content: string;
	ts: number;
}

/** Ergebnis eines Rollbacks. */
export type RollbackResult = { ok: boolean; error?: string };

/** Verzeichnis, in dem die Snapshots als Einzel-JSON-Dateien liegen. */
const STORE_DIR = join(homedir(), ".cache", "pi-artifacts", "undo");

/** Maximal behaltene Snapshot-Dateien (Housekeeping-Schwelle). */
const MAX_FILES = 100;

/** Hash-Präfix für einen Dateipfad: erste 12 Hex-Zeichen von sha256(path). */
function prefixFor(path: string): string {
	return createHash("sha256").update(path).digest("hex").slice(0, 12);
}

/** Absolute Pfade aller Snapshot-Dateien im Speicher; bei Lesefehler leer. */
function listSnapshots(): string[] {
	try {
		return fs
			.readdirSync(STORE_DIR)
			.filter((name) => name.endsWith(".json"))
			.map((name) => join(STORE_DIR, name));
	} catch {
		return [];
	}
}

/**
 * Sortierschlüssel einer Snapshot-Datei: Zeitstempel aus dem Dateinamen
 * (Format "<12-Hex-Präfix>-<ms>.json"), Fallback Datei-mtime.
 */
function sortKey(file: string): number {
	const core = basename(file, ".json");
	const dash = core.indexOf("-");
	if (dash === 12) {
		const ts = Number(core.slice(dash + 1));
		if (Number.isFinite(ts)) return ts;
	}
	try {
		return fs.statSync(file).mtimeMs;
	} catch {
		return 0;
	}
}

/** mtime einer Datei in ms (Fallback 0 bei Stat-Fehler). */
function mtimeOf(file: string): number {
	try {
		return fs.statSync(file).mtimeMs;
	} catch {
		return 0;
	}
}

/** Aufsteigend: Name-Zeitstempel, dann mtime, dann Name (deterministisch). */
function oldestFirst(a: string, b: string): number {
	const keyDiff = sortKey(a) - sortKey(b);
	if (keyDiff !== 0) return keyDiff;
	const mtimeDiff = mtimeOf(a) - mtimeOf(b);
	if (mtimeDiff !== 0) return mtimeDiff;
	return basename(a).localeCompare(basename(b));
}

/** Jüngste Snapshot-Datei für path (oder null, wenn kein Stapel existiert). */
function newestSnapshotFile(path: string): string | null {
	const wanted = `${prefixFor(path)}-`;
	const matches = listSnapshots().filter((file) => basename(file).startsWith(wanted));
	if (matches.length === 0) return null;
	matches.sort((a, b) => oldestFirst(b, a)); // absteigend: jüngste zuerst
	return matches[0] ?? null;
}

/** Snapshot-Datei einlesen und parsen; bei Lese-/Parsefehler null. */
function readEntry(file: string): UndoEntry | null {
	try {
		const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<UndoEntry>;
		if (typeof raw.path !== "string" || typeof raw.content !== "string" || typeof raw.ts !== "number") {
			return null;
		}
		return { path: raw.path, content: raw.content, ts: raw.ts };
	} catch {
		return null;
	}
}

/** Housekeeping: bei mehr als MAX_FILES Dateien die ältesten löschen. */
function housekeeping(): void {
	const files = listSnapshots();
	const excess = files.length - MAX_FILES;
	if (excess <= 0) return;
	files.sort(oldestFirst); // aufsteigend: älteste zuerst
	for (let i = 0; i < excess && i < files.length; i++) {
		try {
			fs.rmSync(files[i] ?? "", { force: true });
		} catch {
			/* einzelne fehlgeschlagene Löschung darf nicht crashen */
		}
	}
}

/** Original-Stand einer Datei als Snapshot sichern (Stapel wächst). */
export function save(path: string, content: string): void {
	fs.mkdirSync(STORE_DIR, { recursive: true });
	const entry: UndoEntry = { path, content, ts: Date.now() };
	const file = join(STORE_DIR, `${prefixFor(path)}-${entry.ts}.json`);
	fs.writeFileSync(file, JSON.stringify(entry), "utf8");
	housekeeping();
}

/** Jüngsten Snapshot für path liefern (ohne ihn zu entfernen), sonst null. */
export function peek(path: string): UndoEntry | null {
	const file = newestSnapshotFile(path);
	return file === null ? null : readEntry(file);
}

/** Jüngsten Snapshot zurückschreiben und vom Stapel nehmen. */
export function rollback(path: string): RollbackResult {
	const file = newestSnapshotFile(path);
	const entry = file === null ? null : readEntry(file);
	if (file === null || entry === null) {
		return { ok: false, error: "kein Snapshot für diese Datei" };
	}
	try {
		fs.mkdirSync(dirname(path), { recursive: true });
		fs.writeFileSync(path, entry.content, "utf8");
	} catch (err) {
		return { ok: false, error: `Wiederherstellen fehlgeschlagen: ${String(err)}` };
	}
	try {
		fs.rmSync(file, { force: true }); // Stapel eine Stufe tiefer
	} catch {
		/* Snapshot bleibt liegen — Restore war trotzdem erfolgreich */
	}
	return { ok: true };
}

/** Gibt es mindestens einen Snapshot für path? */
export function hasBackup(path: string): boolean {
	return countFor(path) > 0;
}

/** Anzahl der Snapshots im Stapel für path. */
export function countFor(path: string): number {
	const wanted = `${prefixFor(path)}-`;
	return listSnapshots().filter((file) => basename(file).startsWith(wanted)).length;
}

/** Selbsttest mit echten Dateien unter /tmp/pi-artifacts-test-undo/. */
export async function selfTest(): Promise<string> {
	const testDir = "/tmp/pi-artifacts-test-undo";
	const target = join(testDir, "a.txt");

	// Deterministische Ausgangslage: Testverzeichnis und Snapshot-Speicher leeren.
	fs.rmSync(testDir, { recursive: true, force: true });
	fs.rmSync(STORE_DIR, { recursive: true, force: true });
	fs.mkdirSync(testDir, { recursive: true });

	const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
	const check = (condition: boolean, message: string): void => {
		if (!condition) throw new Error(`Selbsttest fehlgeschlagen: ${message}`);
	};

	// 1) Zwei Versionen sichern (versetzt, damit die Zeitstempel eindeutig sind).
	fs.writeFileSync(target, "v1", "utf8");
	save(target, "v1");
	await sleep(5);
	fs.writeFileSync(target, "v2", "utf8");
	save(target, "v2");

	const newest = peek(target);
	check(newest !== null, "peek() sollte den jüngsten Snapshot liefern");
	check(newest?.content === "v2", `peek() sollte v2 liefern, bekam ${String(newest?.content)}`);
	check(newest?.ts !== undefined && newest.ts > 0, "peek() sollte einen Zeitstempel liefern");
	check(countFor(target) === 2, `countFor() sollte 2 sein, ist ${countFor(target)}`);
	check(hasBackup(target), "hasBackup() sollte true liefern");

	// 2) Erster Rollback: stellt v2 wieder her und nimmt den Snapshot vom Stapel.
	const first = rollback(target);
	check(first.ok, `rollback() sollte ok sein (${first.error ?? "ohne Fehler"})`);
	check(fs.readFileSync(target, "utf8") === "v2", "rollback() sollte v2 wiederherstellen");
	check(countFor(target) === 1, `countFor() sollte danach 1 sein, ist ${countFor(target)}`);

	// 3) Zweiter Rollback: stellt v1 wieder her, Stapel ist danach leer.
	const second = rollback(target);
	check(second.ok, "zweiter rollback() sollte ok sein");
	check(fs.readFileSync(target, "utf8") === "v1", "zweiter rollback() sollte v1 wiederherstellen");
	check(!hasBackup(target), "hasBackup() sollte false liefern, Stapel ist leer");

	// 4) Rollback ohne Snapshot: ok:false mit der vereinbarten Fehlermeldung.
	const empty = rollback(target);
	check(!empty.ok, "rollback() ohne Snapshot sollte fehlschlagen");
	check(empty.error === "kein Snapshot für diese Datei", `unerwartete Fehlermeldung: ${String(empty.error)}`);

	// 5) Housekeeping: 101 Snapshots anlegen → Speicher hält maximal 100.
	for (let i = 0; i <= 100; i++) {
		save(join(testDir, `hk-${i}.txt`), `inhalt-${i}`);
	}
	const stored = listSnapshots().length;
	check(stored === 100, `Housekeeping sollte 100 Dateien behalten, gefunden: ${stored}`);
	check(countFor(join(testDir, "hk-0.txt")) === 0, "ältester Snapshot sollte gelöscht sein");
	check(countFor(join(testDir, "hk-100.txt")) === 1, "jüngster Snapshot sollte bleiben");

	// Aufräumen, damit keine Testreste bleiben.
	fs.rmSync(testDir, { recursive: true, force: true });
	fs.rmSync(STORE_DIR, { recursive: true, force: true });

	return (
		"✓ undo: 2 Versionen gesichert, peek() liefert die jüngste (v2), " +
		"rollback() stellt v2 dann v1 wieder her und leert den Stapel, " +
		"rollback() ohne Snapshot → ok:false, Housekeeping 101→100 Snapshots"
	);
}

if (process.argv[1]?.includes("undo.ts")) {
	void selfTest()
		.then((s) => console.log(s))
		.catch((e) => {
			console.error("SELFTEST FAIL:", e);
			process.exit(1);
		});
}

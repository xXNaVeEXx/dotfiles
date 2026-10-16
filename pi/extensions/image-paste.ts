/**
 * image-paste — Bilder beim EINFÜGEN als Platzhalter [[ image N ]] im Editor.
 *
 * Quellen, die beim Einfügen erkannt werden:
 *  1. `data:image/<typ>;base64,…` im Bracketed-Paste (kommt z.B. vom WezTerm-Cmd+V-Hook
 *     durch SSH/tmux hindurch — funktioniert daher auch remote).
 *  2. Ein Paste, der nur aus Pfaden zu existierenden Bilddateien besteht (Drag & Drop, Finder-Kopie).
 *  3. Pis eigenes Ctrl+V (schreibt /tmp/pi-clipboard-*.png und fügt den Pfad per insertTextAtCursor ein).
 *
 * Beim Absenden (input-Hook) werden die Platzhalter in echte Image-Attachments umgewandelt.
 * Pi skaliert die Bilder danach selbst (agent-session → processImage).
 *
 * Technik: Es gibt kein Paste-Event in der Extension-API. Wir patchen deshalb
 * `Editor.prototype.handlePaste` / `insertTextAtCursor` (Basisklasse von CustomEditor),
 * damit es mit jedem Editor zusammenspielt (auch pi-powerline-footer's setEditorComponent).
 */
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CustomEditor } from "@earendil-works/pi-coding-agent";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

type Img = { type: "image"; data: string; mimeType: string };

const PATCH_FLAG = Symbol.for("pi.image-paste.patched");
const STORE_KEY = Symbol.for("pi.image-paste.store");
const MAX_FILE_BYTES = 50 * 1024 * 1024;

// Store über Reloads hinweg stabil halten (globalThis), damit Platzhalter nach /reload gültig bleiben.
const g = globalThis as any;
const store: Map<number, Img> = (g[STORE_KEY] ??= new Map<number, Img>());

const PLACEHOLDER_RE = /\[\[ image (\d+) \]\]/g;
const DATA_URL_RE = /data:(image\/(?:png|jpe?g|gif|webp|bmp|tiff?|heic));base64,([A-Za-z0-9+/=\s]+)/g;
const IMG_EXT: Record<string, string> = {
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".webp": "image/webp",
};

function sniffMime(buf: Buffer): string | null {
	if (buf.length < 12) return null;
	if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
	if (buf.toString("ascii", 0, 3) === "GIF") return "image/gif";
	if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
	return null;
}

/** Nächste freie Nummer: höchste Nummer im aktuellen Editortext + 1 (pro Nachricht ab 1). */
function nextId(editorText: string): number {
	let max = 0;
	for (const m of editorText.matchAll(PLACEHOLDER_RE)) max = Math.max(max, Number(m[1]));
	return max + 1;
}

function register(editorText: string, img: Img): string {
	const id = nextId(editorText);
	store.set(id, img);
	return `[[ image ${id} ]]`;
}

function unquotePath(tok: string): string {
	let t = tok.trim();
	if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) t = t.slice(1, -1);
	if (t.startsWith("file://")) t = decodeURIComponent(t.slice(7));
	t = t.replace(/\\(.)/g, "$1"); // Shell-Escapes von Drag&Drop ("a\ b.png")
	if (t.startsWith("~/")) t = resolve(homedir(), t.slice(2));
	return t;
}

/** Zerlegt einen Paste in Pfad-Tokens (Zeilen bzw. durch Leerzeichen getrennt, Escapes beachtet). */
function splitPaths(text: string): string[] {
	const out: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		const toks = line.match(/'[^']*'|"[^"]*"|(?:\\.|[^\s\\])+/g) ?? [];
		out.push(...toks);
	}
	return out;
}

function loadImageFile(p: string): Img | null {
	try {
		const path = unquotePath(p);
		if (!path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path)) return null;
		if (!(extname(path).toLowerCase() in IMG_EXT)) return null;
		if (!existsSync(path)) return null;
		const st = statSync(path);
		if (!st.isFile() || st.size > MAX_FILE_BYTES) return null;
		const buf = readFileSync(path);
		const mime = sniffMime(buf) ?? IMG_EXT[extname(path).toLowerCase()];
		return { type: "image", data: buf.toString("base64"), mimeType: mime };
	} catch {
		return null;
	}
}

function editorText(ed: any): string {
	try {
		return typeof ed.getText === "function" ? ed.getText() : "";
	} catch {
		return "";
	}
}

/**
 * Wandelt Paste-Text um. Liefert null, wenn kein Bild enthalten ist (→ Original-Verhalten).
 * Platzhalter werden direkt via insert eingefügt; Resttext geht an den Original-Handler.
 */
function transformPaste(ed: any, raw: string, insertText: (s: string) => void, pasteRest: (s: string) => void): boolean {
	// Fall 1: data:image-URLs (ggf. mit Text drumherum)
	if (raw.includes("data:image/")) {
		DATA_URL_RE.lastIndex = 0;
		if (!DATA_URL_RE.test(raw)) return false;
		DATA_URL_RE.lastIndex = 0;
		let last = 0;
		for (const m of raw.matchAll(DATA_URL_RE)) {
			const before = raw.slice(last, m.index);
			if (before.trim()) pasteRest(before);
			const b64 = m[2].replace(/\s+/g, "");
			const buf = Buffer.from(b64, "base64");
			const mime = sniffMime(buf) ?? (m[1] === "image/jpg" ? "image/jpeg" : m[1]);
			insertText(register(editorText(ed), { type: "image", data: buf.toString("base64"), mimeType: mime }) + " ");
			last = (m.index ?? 0) + m[0].length;
		}
		const after = raw.slice(last);
		if (after.trim()) pasteRest(after);
		return true;
	}
	// Fall 2: Paste besteht ausschließlich aus Bildpfaden
	const trimmed = raw.trim();
	if (!trimmed || trimmed.length > 8192) return false;
	const toks = splitPaths(trimmed);
	if (toks.length === 0 || toks.length > 20) return false;
	const imgs: Img[] = [];
	for (const t of toks) {
		const img = loadImageFile(t);
		if (!img) return false;
		imgs.push(img);
	}
	for (const img of imgs) insertText(register(editorText(ed), img) + " ");
	return true;
}

function patchEditor(): string | null {
	const EditorProto = Object.getPrototypeOf(CustomEditor.prototype);
	if (!EditorProto || typeof EditorProto.handlePaste !== "function") return "Editor.handlePaste nicht gefunden";
	if (EditorProto[PATCH_FLAG]) return null;

	const origPaste = EditorProto.handlePaste;
	const origInsert = EditorProto.insertTextAtCursor;
	EditorProto.handlePaste = function (this: any, pastedText: string) {
		try {
			const insert = (s: string) =>
				typeof this.insertTextAtCursorInternal === "function"
					? this.insertTextAtCursorInternal(s)
					: origInsert.call(this, s);
			if (pastedText.includes("data:image/") || /\.(png|jpe?g|gif|webp)['"]?\s*$/i.test(pastedText)) this.pushUndoSnapshot?.();
			if (transformPaste(this, pastedText, insert, (s) => origPaste.call(this, s))) {
				this.tui?.requestRender?.();
				return;
			}
		} catch {
			/* Fallback auf Original */
		}
		return origPaste.call(this, pastedText);
	};
	if (typeof origInsert === "function") {
		// Pis Ctrl+V fügt den Pfad zu /tmp/pi-clipboard-*.png via insertTextAtCursor ein.
		EditorProto.insertTextAtCursor = function (this: any, text: string) {
			try {
				const t = text.trim();
				if (/pi-clipboard-[^/\s]+\.(png|jpe?g|gif|webp)$/i.test(t)) {
					const img = loadImageFile(t);
					if (img) return origInsert.call(this, register(editorText(this), img) + " ");
				}
			} catch {
				/* ignore */
			}
			return origInsert.call(this, text);
		};
	}
	EditorProto[PATCH_FLAG] = true;
	return null;
}

// ── Vision-Bridge für Modelle ohne Bild-Input ─────────────────────────────────────────────
// Ist das aktive Modell nicht vision-fähig, beschreibt ein vision-fähiges Hilfsmodell
// jedes Bild (Text wörtlich, UI, Code, Fehlermeldungen, Diagramme). Die Beschreibung
// ersetzt das Bild in der Nachricht bzw. im read-Tool-Ergebnis. Fallback: Tesseract-OCR.
// Konfiguration (optional): ~/.pi/agent/image-paste.json  { "visionModel": "provider/model-id" }
//                       oder Env PI_IMAGE_PASTE_VISION_MODEL=provider/model-id

const DESC_CACHE_KEY = Symbol.for("pi.image-paste.desc-cache");
const descCache: Map<string, { text: string; via: string }> = (g[DESC_CACHE_KEY] ??= new Map());

const VISION_PROMPT = `Du bist die Augen eines Coding-Agenten, dessen Sprachmodell keine Bilder sehen kann.
Beschreibe das Bild so, dass der Agent damit arbeiten kann, ohne es je zu sehen:
- Gib ALLEN lesbaren Text wörtlich wieder (Code, Logs, Fehlermeldungen, Pfade, Zahlen, Tabellen) — in Codeblöcken, Zeilenumbrüche/Einrückung erhalten.
- Beschreibe Art des Bildes (Screenshot von …, Diagramm, Foto), Layout, UI-Elemente, Hervorhebungen, Farben/Status, wenn relevant.
- Bei Diagrammen: Knoten, Kanten, Beschriftungen, Werte.
- Nichts erfinden; Unleserliches als [unleserlich] markieren.
- Keine Einleitung, keine Interpretation über das Sichtbare hinaus, außer eine kurze Notiz, was im Kontext der Nutzerfrage auffällt.`;

function hashImg(img: Img): string {
	return createHash("sha1").update(img.data).digest("hex");
}

function modelSupportsImages(model: any): boolean {
	return !!model && Array.isArray(model.input) && model.input.includes("image");
}

function configuredVisionModel(): string | undefined {
	if (process.env.PI_IMAGE_PASTE_VISION_MODEL) return process.env.PI_IMAGE_PASTE_VISION_MODEL;
	try {
		const p = resolve(homedir(), ".pi/agent/image-paste.json");
		if (existsSync(p)) return JSON.parse(readFileSync(p, "utf8")).visionModel;
	} catch {
		/* ignore */
	}
	return undefined;
}

/** Konfiguriertes Modell → gleiches Provider-Modell mit Bildern (schnelle bevorzugt) → irgendein verfügbares. */
function pickVisionModel(ctx: any): any | undefined {
	const reg = ctx.modelRegistry;
	if (!reg) return undefined;
	const cfg = configuredVisionModel();
	if (cfg && cfg.includes("/")) {
		const i = cfg.indexOf("/");
		const m = reg.find(cfg.slice(0, i), cfg.slice(i + 1));
		if (m && modelSupportsImages(m)) return m;
	}
	let avail: any[] = [];
	try {
		avail = (reg.getAvailable?.() ?? []).filter(modelSupportsImages);
	} catch {
		return undefined;
	}
	if (avail.length === 0) return undefined;
	const cur = ctx.model;
	const fast = (m: any) => (/flash|haiku|mini|lite|4\.6v|\dv\b/i.test(m.id) ? 0 : 1);
	const rank = (m: any) => (m.provider === cur?.provider ? 0 : 10) + fast(m);
	return [...avail].sort((a, b) => rank(a) - rank(b))[0];
}

function saveImageFile(img: Img): string | undefined {
	try {
		const dir = join(tmpdir(), "pi-image-paste");
		mkdirSync(dir, { recursive: true });
		const ext = img.mimeType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
		const p = join(dir, `${hashImg(img).slice(0, 16)}.${ext}`);
		if (!existsSync(p)) writeFileSync(p, Buffer.from(img.data, "base64"));
		return p;
	} catch {
		return undefined;
	}
}

function ocrFallback(path: string | undefined): string | undefined {
	if (!path) return undefined;
	for (const lang of ["deu+eng", "eng", "afr"]) {
		try {
			const out = execFileSync("tesseract", [path, "-", "-l", lang], {
				timeout: 30_000,
				stdio: ["ignore", "pipe", "ignore"],
			}).toString().trim();
			if (out) return out;
		} catch {
			/* nächste Sprache / kein tesseract */
		}
	}
	return undefined;
}

async function describeImage(ctx: any, img: Img, userText: string): Promise<{ text: string; via: string }> {
	const key = hashImg(img);
	const cached = descCache.get(key);
	if (cached) return cached;
	const vm = pickVisionModel(ctx);
	if (vm) {
		try {
			const res = await ctx.modelRegistry.complete(
				vm,
				{
					systemPrompt: VISION_PROMPT,
					messages: [
						{
							role: "user",
							content: [
								{ type: "text", text: `Kontext/Nutzerfrage (nur zur Orientierung):\n${userText.slice(0, 2000) || "(keine)"}` },
								img,
							],
							timestamp: Date.now(),
						},
					],
				},
				{ signal: ctx.signal },
			);
			const text = (res?.content ?? [])
				.filter((c: any) => c.type === "text")
				.map((c: any) => c.text)
				.join("\n")
				.trim();
			if (text && res.stopReason !== "error" && res.stopReason !== "aborted") {
				const r = { text, via: `${vm.provider}/${vm.id}` };
				descCache.set(key, r);
				return r;
			}
		} catch {
			/* → OCR */
		}
	}
	const ocr = ocrFallback(saveImageFile(img));
	if (ocr) {
		const text = `(Nur OCR-Text, keine Bildbeschreibung verfügbar)\n\`\`\`\n${ocr}\n\`\`\``;
		const r = { text, via: "tesseract" };
		descCache.set(key, r);
		return r;
	}
	return { text: "(Bild konnte nicht beschrieben werden: kein Vision-Modell verfügbar und OCR fehlgeschlagen)", via: "none" };
}

function renderDescription(label: string, img: Img, d: { text: string; via: string }): string {
	const path = saveImageFile(img);
	return `<image label="${label}" described-by="${d.via}"${path ? ` file="${path}"` : ""}>\n${d.text}\n</image>`;
}

export default function (pi: ExtensionAPI) {
	const err = patchEditor();

	pi.on("session_start", async (_e, ctx) => {
		if (err) ctx.ui.notify(`image-paste: ${err}`, "warning");
	});

	pi.on("input", async (event, ctx) => {
		const ids = [...event.text.matchAll(PLACEHOLDER_RE)].map((m) => Number(m[1]));
		const images: Img[] = [...((event.images as Img[] | undefined) ?? [])];
		const labels: string[] = images.map((_, i) => `attachment ${i + 1}`);
		const seen = new Set<number>();
		for (const id of ids) {
			if (seen.has(id)) continue;
			seen.add(id);
			const img = store.get(id);
			if (img) {
				images.push(img);
				labels.push(`[[ image ${id} ]]`);
			}
		}
		if (images.length === 0) return { action: "continue" };

		// Vision-Modell: echte Bilder anhängen.
		if (!ctx?.model || modelSupportsImages(ctx.model)) {
			if (images.length === (event.images?.length ?? 0)) return { action: "continue" };
			return { action: "transform", text: event.text, images };
		}

		// Nicht-Vision-Modell: Bilder durch Beschreibungen ersetzen.
		ctx.ui.setWorkingMessage?.(`image-paste: beschreibe ${images.length} Bild(er) …`);
		try {
			const descs = await Promise.all(images.map((img) => describeImage(ctx, img, event.text)));
			const blocks = descs.map((d, i) => renderDescription(labels[i], images[i], d));
			const via = [...new Set(descs.map((d) => d.via))].join(", ");
			ctx.ui.notify(`image-paste: ${images.length} Bild(er) als Text für ${ctx.model.id} (via ${via})`, "info");
			return {
				action: "transform",
				text: `${event.text}\n\n[Das aktive Modell kann keine Bilder sehen; die Bilder wurden von einem Vision-Modell in Text übersetzt:]\n${blocks.join("\n")}`,
				images: [],
			};
		} finally {
			ctx.ui.setWorkingMessage?.();
		}
	});

	// read-Tool (und andere Tools) liefern Bilder: für Nicht-Vision-Modelle beschreiben statt verwerfen.
	pi.on("tool_result", async (event, ctx) => {
		if (!ctx?.model || modelSupportsImages(ctx.model)) return;
		const content = event.content ?? [];
		if (!content.some((c: any) => c.type === "image")) return;
		const out: any[] = [];
		let n = 0;
		for (const c of content as any[]) {
			if (c.type === "image") {
				n++;
				const d = await describeImage(ctx, c, `Tool-Ergebnis von ${event.toolName ?? "tool"} ${JSON.stringify(event.input ?? {}).slice(0, 300)}`);
				out.push({ type: "text", text: renderDescription(`tool image ${n}`, c, d) });
			} else if (c.type === "text" && /does not support images/.test(c.text)) {
				out.push({ type: "text", text: c.text.replace(/\[Current model does not support images[^\]]*\]/, "[Bild via Vision-Bridge als Text beschrieben]") });
			} else out.push(c);
		}
		return { content: out };
	});
}

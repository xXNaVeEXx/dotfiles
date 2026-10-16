/**
 * hermes-mind.ts — Hermes-style self-improvement loop for Pi.
 *
 * Ports the Nous Research Hermes Agent learning loop to the Pi extension API:
 *   1. Persistent memory: MEMORY.md + USER.md, frozen snapshot injected into the
 *      system prompt at session start; managed via the `memory` tool
 *      (add/patch/remove, §-delimited entries, char limits, batch atomic).
 *   2. Skill loop: `skill_manage` tool over ~/.pi/agent/skills/ (create/patch/
 *      view/list/read_file/write_file/archive, read-before-write guard).
 *      Pi natively loads skill names+descriptions into future sessions.
 *   3. Autonomous review: counters (user turns / tool iterations); when a
 *      threshold is reached after a run, a follow-up review turn is triggered
 *      via sendMessage (custom message "hermes-review"). Cancelled by new user
 *      input. Min-gap + review-run guards prevent loops.
 *   4. Session search: FTS5 index (better-sqlite3) over ~/.pi/agent/sessions/
 *      exposed as the `session_search` tool (query / read / browse shapes).
 *
 * Everything is defensive: no handler throws; failures log to
 * ~/.pi/agent/hermes-mind/error.log and degrade gracefully.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { Type } from "typebox";

const HOME = os.homedir();
const BASE = path.join(HOME, ".pi/agent/hermes-mind");
const SKILLS_ROOT = path.join(HOME, ".pi/agent/skills");
const SESSIONS_ROOT = path.join(HOME, ".pi/agent/sessions");
const MEMORY_FILE = path.join(BASE, "MEMORY.md");
const USER_FILE = path.join(BASE, "USER.md");
const CONFIG_FILE = path.join(BASE, "config.json");
const DB_FILE = path.join(BASE, "sessions.db");
const LOG_FILE = path.join(BASE, "error.log");
const REVIEW_LOG = path.join(BASE, "review-log.jsonl");
const ARCHIVE_DIR = path.join(BASE, "archive");
const LOCK_FILE = path.join(BASE, ".lock");

const ENTRY_DELIM = "\n§\n";
const CT_REVIEW = "hermes-review";

const DEFAULT_CONFIG = {
  enabled: true,
  memoryEnabled: true,
  userProfileEnabled: true,
  memoryCharLimit: 2200,
  userCharLimit: 1375,
  memoryNudgeInterval: 10, // top-level user turns
  skillNudgeInterval: 10, // tool executions
  reviewEnabled: true,
  reviewMinGapMinutes: 15,
  sessionSearchEnabled: true,
};

function logError(where: string, err: unknown): void {
  try {
    fs.mkdirSync(BASE, { recursive: true });
    const line = `${new Date().toISOString()} [${where}] ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`;
    fs.appendFileSync(LOG_FILE, line);
  } catch {
    /* never throw from logging */
  }
}

/** Keep error.log bounded: above ~512KB keep only the last ~64KB. */
function rotateErrorLog(): void {
  try {
    const st = fs.statSync(LOG_FILE);
    if (st.size > 512 * 1024) {
      const buf = fs.readFileSync(LOG_FILE);
      const tail = buf.subarray(buf.length - 64 * 1024);
      const nl = tail.indexOf(10); // resume at next line boundary
      fs.writeFileSync(LOG_FILE, nl >= 0 ? tail.subarray(nl + 1) : tail);
    }
  } catch {
    /* first run / missing file */
  }
}

function loadConfig(): typeof DEFAULT_CONFIG {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      return { ...DEFAULT_CONFIG, ...raw };
    }
    fs.mkdirSync(BASE, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2) + "\n");
  } catch (err) {
    logError("loadConfig", err);
  }
  return { ...DEFAULT_CONFIG };
}

/* ------------------------------------------------------------------ */
/* Simple inter-process lock (stale after 10s) for memory writes       */
/* ------------------------------------------------------------------ */
function withLock<T>(fn: () => T): T {
  const acquired = (() => {
    try {
      fs.mkdirSync(BASE, { recursive: true });
      fs.writeFileSync(LOCK_FILE, String(Date.now()), { flag: "wx" });
      return true;
    } catch {
      try {
        const age = Date.now() - Number(fs.readFileSync(LOCK_FILE, "utf8"));
        if (Number.isFinite(age) && age > 10_000) {
          fs.rmSync(LOCK_FILE, { force: true });
          fs.writeFileSync(LOCK_FILE, String(Date.now()), { flag: "wx" });
          return true;
        }
      } catch {
        /* still locked */
      }
      return false;
    }
  })();
  if (!acquired) throw new Error("Memory store is locked by another process — retry in a moment.");
  try {
    return fn();
  } finally {
    try {
      fs.rmSync(LOCK_FILE, { force: true });
    } catch {
      /* ignore */
    }
  }
}

function atomicWrite(file: string, content: string): void {
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
}

/* ------------------------------------------------------------------ */
/* Memory store (port of Hermes memory_tool_store semantics)          */
/* ------------------------------------------------------------------ */
type StoreKind = "memory" | "user";

function storeFile(kind: StoreKind): string {
  return kind === "memory" ? MEMORY_FILE : USER_FILE;
}
function storeLimit(cfg: typeof DEFAULT_CONFIG, kind: StoreKind): number {
  return kind === "memory" ? cfg.memoryCharLimit : cfg.userCharLimit;
}
function storeLabel(kind: StoreKind): string {
  return kind === "memory" ? "MEMORY (your personal notes)" : "USER PROFILE (who the user is)";
}

function parseEntries(text: string): string[] {
  return text
    .split(/\n§\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
function loadEntries(kind: StoreKind): string[] {
  try {
    return parseEntries(fs.readFileSync(storeFile(kind), "utf8"));
  } catch {
    return [];
  }
}
function saveEntries(kind: StoreKind, entries: string[]): void {
  atomicWrite(storeFile(kind), entries.join(ENTRY_DELIM) + (entries.length ? "\n" : ""));
}

function renderHeader(kind: StoreKind, used: number, limit: number): string {
  const pct = Math.min(999, Math.round((used / limit) * 100));
  const core = `${storeLabel(kind)} [${pct}% — ${used.toLocaleString("en-US")}/${limit.toLocaleString("en-US")} chars]`;
  const fill = Math.max(2, 62 - core.length);
  return `${"═".repeat(Math.ceil(fill / 2))} ${core} ${"═".repeat(Math.floor(fill / 2))}`;
}

function renderStoreBlock(kind: StoreKind, cfg: typeof DEFAULT_CONFIG): string {
  const entries = loadEntries(kind);
  const limit = storeLimit(cfg, kind);
  const body = entries.join(ENTRY_DELIM);
  return `${renderHeader(kind, body.length, limit)}\n${body || "(empty — no entries yet)"}`;
}

/** Lightweight port of Hermes' threat scan: prompt-injection phrases + invisible unicode. */
function threatScan(text: string): string | null {
  if (/[\u200b-\u200f\u2028\u2029\u202a-\u202e\ufeff]/.test(text)) {
    return "invisible Unicode control characters";
  }
  const lower = text.toLowerCase();
  const patterns = [
    "ignore previous instructions",
    "ignore all previous",
    "disregard your instructions",
    "system prompt override",
    "you are now a different",
    "exfiltrate",
  ];
  for (const p of patterns) {
    if (lower.includes(p)) return `suspicious phrase "${p}"`;
  }
  return null;
}

const norm = (s: string): string =>
  s
    .replace(/[`'"’‘”“]/g, "'")
    .replace(/[–—−]/g, "-")
    .replace(/\\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();

function wordOverlap(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  const wb = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit++;
  return hit / Math.min(wa.size, wb.size);
}

type MemOp = { action: "add" | "patch" | "remove"; content?: string; old_text?: string };

interface MemResult {
  text: string;
  overflow?: boolean;
}

function applyMemoryOps(
  cfg: typeof DEFAULT_CONFIG,
  kind: StoreKind,
  ops: MemOp[],
): MemResult {
  const entries = loadEntries(kind);
  const limit = storeLimit(cfg, kind);
  const usageLine = () =>
    `usage: ${entries.join(ENTRY_DELIM).length}/${limit} chars, ${entries.length} entries`;

  for (const op of ops) {
    if (op.action === "add") {
      const content = (op.content ?? "").trim();
      if (!content) throw new Error("add: content is required.");
      const threat = threatScan(content);
      if (threat)
        return { text: `[BLOCKED] Entry rejected: ${threat}. Nothing was written.`, overflow: false };
      if (entries.some((e) => e === content))
        return { text: "Entry already exists (no duplicate added.) " + usageLine() };
      entries.push(content);
    } else if (op.action === "patch") {
      const oldText = op.old_text ?? "";
      const newText = (op.content ?? "").trim();
      if (!oldText) throw new Error("patch: old_text is required (the exact span to change).");
      if (!newText) throw new Error("patch: content is required (the replacement text).");
      // whole-entry exact match wins
      let idx = entries.findIndex((e) => e === oldText);
      if (idx === -1) {
        const matches = entries
          .map((e, i) => ({ e, i, n: norm(e).includes(norm(oldText)) }))
          .filter((m) => m.n);
        const distinct = new Set(matches.map((m) => m.e));
        if (distinct.size > 1)
          return {
            text: `Multiple entries matched '${oldText.slice(0, 60)}'. Be more specific. ` + usageLine(),
          };
        if (matches.length === 0) {
          const closest = entries
            .map((e) => ({ e, score: wordOverlap(e, oldText) }))
            .filter((c) => c.score >= 0.3)
            .sort((a, b) => b.score - a.score)
            .slice(0, 3)
            .map((c) => c.e);
          return {
            text:
              `No entry matched old_text. Closest entries:\n${closest.join("\n§\n")}\n(${usageLine()})`,
          };
        }
        idx = matches[0].i;
        const target = entries[idx];
        if (!target.includes(oldText)) {
          return {
            text:
              `Matched entry tolerantly, but old_text is not present verbatim in it. Quote the span exactly:\n${target}\n(nothing was written)`,
          };
        }
      }
      const target = entries[idx];
      const occurrences = target.split(oldText).length - 1;
      if (occurrences > 1)
        return {
          text: `old_text occurs ${occurrences} times in the matched entry — provide a longer, unique span. (nothing was written)`,
        };
      entries[idx] = target.replace(oldText, newText);
    } else if (op.action === "remove") {
      const oldText = op.old_text ?? "";
      if (!oldText) throw new Error("remove: old_text is required (any substring of the entry).");
      const matches = entries.filter(
        (e) => e === oldText || norm(e).includes(norm(oldText)),
      );
      const distinct = new Set(matches);
      if (distinct.size > 1)
        return {
          text: `Multiple entries matched '${oldText.slice(0, 60)}'. Be more specific. ` + usageLine(),
        };
      if (matches.length === 0) {
        const closest = entries
          .map((e) => ({ e, score: wordOverlap(e, oldText) }))
          .filter((c) => c.score >= 0.3)
          .sort((a, b) => b.score - a.score)
          .slice(0, 3)
          .map((c) => c.e);
        return {
          text: `No entry matched old_text. Closest entries:\n${closest.join("\n§\n")}\n(${usageLine()})`,
        };
      }
      entries.splice(entries.indexOf(matches[0]), 1);
    } else {
      throw new Error(`Unknown action '${(op as { action?: string }).action}'.`);
    }
  }

  const finalLen = entries.join(ENTRY_DELIM).length;
  if (finalLen > limit) {
    const overflow = finalLen - limit;
    return {
      text:
        `Memory at ${entries.join(ENTRY_DELIM).length}/${limit} chars; the batch result would exceed the limit by ${overflow} chars. ` +
        `Retry as ONE 'operations' batch that removes or shortens (patch) stale entries from current_entries below to free at least ${overflow} chars ` +
        `AND adds the new fact — the limit is checked on the batch result.\n\n` +
        `current_entries:\n${entries.join("\n§\n")}\n\n(${usageLine()})`,
      overflow: true,
    };
  }

  saveEntries(kind, entries);
  return { text: `ok — ${entries.length} entries, ${finalLen}/${limit} chars.` };
}

/* ------------------------------------------------------------------ */
/* Session FTS5 index (better-sqlite3)                                 */
/* ------------------------------------------------------------------ */
type SqliteDb = {
  prepare: (sql: string) => { run: (...a: unknown[]) => unknown; all: (...a: unknown[]) => unknown[]; get: (...a: unknown[]) => unknown };
  exec: (sql: string) => void;
  pragma: (s: string) => unknown;
  close: () => void;
};

let db: SqliteDb | null = null;
let dbBroken = false;
let indexing = false;

function loadSqlite(): SqliteDb | null {
  if (db) return db;
  if (dbBroken) return null;
  const candidates = [
    () => createRequire(__filename).resolve("better-sqlite3"),
    () => path.join(HOME, ".pi/agent/npm/node_modules/better-sqlite3"),
    () => path.join(__dirname, "../../npm/node_modules/better-sqlite3"),
  ];
  for (const c of candidates) {
    try {
      const modPath = c();
      const req = createRequire(modPath);
      // SAFETY: better-sqlite3 is CJS; some jiti interop shapes expose the constructor on .default.
      const mod = req(modPath) as { default?: new (p: string) => SqliteDb } & (new (p: string) => SqliteDb);
      const Database = mod.default ?? mod;
      db = new Database(DB_FILE);
      db.pragma("journal_mode = WAL");
      db.exec(`CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY, mtime INTEGER, session_id TEXT, title TEXT,
        started TEXT, last_activity TEXT, cwd TEXT, msg_count INTEGER)`);
      db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS msgs USING fts5(
        content, role UNINDEXED, file UNINDEXED, entry_id UNINDEXED, ts UNINDEXED)`);
      return db;
    } catch {
      /* try next candidate; log only when ALL fail */
    }
  }
  logError("loadSqlite", "all candidates failed: better-sqlite3 not loadable from any known path");
  dbBroken = true;
  return null;
}

function textFromContent(c: unknown): string {
  if (typeof c === "string") return c;
  if (Array.isArray(c))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return c
      .filter((p: any) => p && p.type === "text" && typeof p.text === "string")
      .map((p: any) => p.text)
      .join("\n");
  return "";
}

interface IndexedMsg {
  role: string;
  content: string;
  entry_id: string;
  ts: string;
}

function parseSessionFile(file: string): { sessionId: string; title: string; started: string; lastActivity: string; cwd: string; msgs: IndexedMsg[] } {
  const raw = fs.readFileSync(file, "utf8");
  let sessionId = path.basename(file);
  let title = "";
  let started = "";
  let lastActivity = "";
  let cwd = "";
  const msgs: IndexedMsg[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    let e: Record<string, unknown>;
    try {
      e = JSON.parse(t);
    } catch {
      continue;
    }
    const ts = typeof e.timestamp === "string" ? e.timestamp : "";
    if (ts > lastActivity) lastActivity = ts;
    if (e.type === "session") {
      sessionId = String(e.id ?? sessionId);
      started = ts;
      cwd = String(e.cwd ?? "");
    } else if (e.type === "session_info" && typeof e.name === "string") {
      title = e.name;
    } else if (e.type === "message" && e.message && typeof e.message === "object") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = e.message as any;
      const role = String(m.role ?? "");
      if (role === "user" || role === "assistant" || role === "toolResult") {
        const content = textFromContent(m.content);
        if (content.trim()) {
          if (!title && role === "user") title = content.replace(/\s+/g, " ").slice(0, 80);
          msgs.push({
            role,
            content: role === "toolResult" ? content.slice(0, 8192) : content.slice(0, 65536),
            entry_id: String(e.id ?? ""),
            ts,
          });
        }
      }
    } else if (e.type === "compaction" && typeof e.summary === "string") {
      msgs.push({ role: "compaction", content: e.summary.slice(0, 8192), entry_id: String(e.id ?? ""), ts });
    }
  }
  return { sessionId, title, started, lastActivity, cwd, msgs };
}

function indexSessionFile(file: string): void {
  const d = loadSqlite();
  if (!d) return;
  const stat = fs.statSync(file);
  const parsed = parseSessionFile(file);
  // SAFETY: SqliteDb structurally matches better-sqlite3's Database for these methods.
  // IMPORTANT: call d.transaction(...) BOUND on d — extracting the method loses `this`
  // and better-sqlite3's transaction factory then throws (reading its internal symbol off undefined).
  const dtx = d as unknown as { transaction?: (fn: () => void) => () => void };
  const write = () => {
    d.prepare("DELETE FROM msgs WHERE file = ?").run(file);
    const ins = d.prepare(
      "INSERT INTO msgs (content, role, file, entry_id, ts) VALUES (?, ?, ?, ?, ?)",
    );
    for (const m of parsed.msgs) ins.run(m.content, m.role, file, m.entry_id, m.ts);
    d.prepare(
      "INSERT INTO files (path, mtime, session_id, title, started, last_activity, cwd, msg_count) VALUES (?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(path) DO UPDATE SET mtime=excluded.mtime, session_id=excluded.session_id, title=excluded.title, started=excluded.started, last_activity=excluded.last_activity, cwd=excluded.cwd, msg_count=excluded.msg_count",
    ).run(file, stat.mtimeMs, parsed.sessionId, parsed.title, parsed.started, parsed.lastActivity, parsed.cwd, parsed.msgs.length);
  };
  if (typeof dtx.transaction === "function") dtx.transaction(write)();
  else write();
}

function indexAllSessions(): void {
  if (indexing || dbBroken) return;
  indexing = true;
  try {
    const d = loadSqlite();
    if (!d) return;
    const known = new Map(
      (d.prepare("SELECT path, mtime FROM files").all() as { path: string; mtime: number }[]).map(
        (r) => [r.path, r.mtime],
      ),
    );
    const files: string[] = [];
    const walk = (dir: string) => {
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const ent of entries) {
        const p = path.join(dir, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (ent.isFile() && ent.name.endsWith(".jsonl")) files.push(p);
      }
    };
    walk(SESSIONS_ROOT);
    for (const f of files) {
      try {
        const mtime = fs.statSync(f).mtimeMs;
        if (known.get(f) === mtime) continue;
        indexSessionFile(f);
      } catch (err) {
        logError("indexAllSessions:" + f, err);
      }
    }
  } catch (err) {
    logError("indexAllSessions", err);
  } finally {
    indexing = false;
  }
}

function parseRelTime(s: string): number | null {
  const m = /^(\d+)\s*(h|d|w)$/.exec(s.trim());
  if (m) {
    const mult = m[2] === "h" ? 3600e3 : m[2] === "d" ? 86400e3 : 7 * 86400e3;
    return Date.now() - Number(m[1]) * mult;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

/* ------------------------------------------------------------------ */
/* Skill management (port of Hermes skill_manage guards)               */
/* ------------------------------------------------------------------ */
const VALID_NAME_RE = /^[a-z0-9][a-z0-9._-]*$/;
const MAX_NAME_LENGTH = 64;
const MAX_DESCRIPTION_LENGTH = 1024;
const MAX_SKILL_CONTENT_CHARS = 100_000;
const MAX_SKILL_FILE_BYTES = 1_048_576;
const ALLOWED_SUBDIRS = new Set(["references", "templates", "scripts", "assets"]);

function skillDir(name: string): string {
  return path.join(SKILLS_ROOT, name);
}
function parseFrontmatter(text: string): { fm: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text);
  if (!m) return { fm: {}, body: text };
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line.trim());
    if (kv) fm[kv[1]] = kv[2].replace(/^["']|["']$/g, "");
  }
  return { fm, body: m[2] };
}
function validateSkillMeta(name: string, description: string): string | null {
  if (!VALID_NAME_RE.test(name) || name.length > MAX_NAME_LENGTH)
    return `Invalid skill name '${name}': must match ${VALID_NAME_RE} and be ≤${MAX_NAME_LENGTH} chars (class-level, lowercase).`;
  if (description.length > MAX_DESCRIPTION_LENGTH)
    return `Description too long (${description.length} > ${MAX_DESCRIPTION_LENGTH}). One sentence, trigger first, ends with a period.`;
  if (!/[.。]$/.test(description.trim()))
    return `Description must end with a period. One sentence, trigger first — it is the routing signal in the system prompt.`;
  return null;
}

/* ------------------------------------------------------------------ */
/* Review prompt (adapted from Hermes background_review.py, verbatim   */
/* key blocks; paths/tools renamed to this setup)                      */
/* ------------------------------------------------------------------ */
const MEMORY_ROUTING_BLOCK = `TWO distinct stores — pick the right one for each fact:
• USER.md (memory tool, target='user'): who the user is — persona, preferences, communication and work style, personal details they revealed, and expectations about how you should behave.
• MEMORY.md (memory tool, target='memory'): facts about the ENVIRONMENT you operate in — tool quirks, project conventions, config gotchas, paths and endpoints that matter.
One fact goes to ONE store, never both — writing it to both bloats both files until they hit their size limits and crowds out the facts that matter; misrouting it puts it where the next session won't look. If a store is disabled, use the other one and skip this one.`;

const MEMORY_REVIEW_PROMPT = `Review the conversation above and consider saving to memory if appropriate.
Memory has ${MEMORY_ROUTING_BLOCK}
If something stands out, save it once, in the right store, using the memory tool with the matching target. If nothing is worth saving, just say 'Nothing to save.' and stop.`;

const SKILL_REVIEW_PROMPT = `Review the conversation above and update the skill library in ~/.pi/agent/skills/. Be ACTIVE — most sessions produce at least one skill update, even if small. A pass that does nothing is a missed learning opportunity, not a neutral outcome.
Target shape of the library: CLASS-LEVEL skills, each with a SKILL.md of always-on rules and a small references/ set of topical depth. Not a flat list of narrow one-session skills, and not an umbrella hoarding a references/ file per session. This shapes HOW you update, not WHETHER you update.
Signals (any ONE warrants action):
• User corrected your style, tone, format, legibility, or verbosity. Frustration signals like 'stop doing X', 'this is too verbose', 'don't format like this', 'just give me the answer', or an explicit 'remember this' are FIRST-CLASS skill signals.
• User corrected your workflow, approach, or sequence of steps.
• Non-trivial technique, fix, workaround, debugging path, or tool-usage pattern emerged that a future session would benefit from.
• A skill that got loaded or consulted this session turned out to be wrong, missing a step, or outdated. Patch it NOW.
Preference order:
1. UPDATE A CURRENTLY-LOADED SKILL →
2. UPDATE AN EXISTING UMBRELLA (skill_manage action=list, then action=view) →
3. ADD A SUPPORT FILE under an existing umbrella (action=write_file; the umbrella's SKILL.md should gain a one-line pointer to any new support file) →
4. CREATE A NEW CLASS-LEVEL UMBRELLA SKILL ("The name MUST be at the class level. The name MUST NOT be a specific PR number, error string, feature codename, library-alone name, or 'fix-X / debug-Y / audit-Z-today' session artifact.")
Never delete a skill here — use action=archive if truly obsolete. Read-before-write is enforced: before you patch or edit an existing skill's SKILL.md, call skill_manage action=view for that skill during this review — the guard requires a fresh load within this review.
What a skill IS: the instructions for doing a class of task the most efficient and correct way, to THIS user's specifications. A future session should be able to follow it and produce what the user wants on the first try.
• Procedure first: the steps in the order they are done, with the concrete commands, tool calls, and decision points. Lessons and pitfalls attach to the step they affect.
• A pitfall is a generalizable rule + one clause of WHY (the mechanism), imperative.
• No PR/issue numbers, dates, ticket IDs, or quoted user text as content — the rule must stand without the incident behind it.
• The same lesson learned twice is ONE rule — strengthen or clarify it rather than appending a second copy.
• Fix the skill in place when it is wrong: edit the sentence that misled, do not append 'UPDATE: actually...' underneath it.
Do NOT capture: environment-dependent failures (missing binaries, fresh-install errors — the user can fix these, they are not durable rules); negative claims about tools (they harden into refusals the agent cites against itself for months); transient errors that resolved (if retrying worked, the lesson is the retry pattern, not the original failure); one-off task narratives; unresolved failures (capture ONLY the working alternative — never the dead ends, and never dressed up as best practice).
'Nothing to save.' is a real option but should NOT be the default.`;

function buildReviewPrompt(memDue: boolean, skillDue: boolean): string {
  const parts: string[] = [
    `[AUTONOMOUS REVIEW TURN — hermes-mind background learning pass. The user may read this; keep it brief, do not ask questions, do not start new user-facing tasks.]`,
    ``,
  ];
  if (memDue) parts.push(MEMORY_REVIEW_PROMPT, ``);
  if (skillDue)
    parts.push(
      SKILL_REVIEW_PROMPT,
      ``,
      `Tool map for this review: 'memory' (action=add|patch|remove, target=memory|user) — use for durable cross-session facts. 'skill_manage' (action=list|view|create|patch|write_file|read_file|archive, name=skill) — skills live at ~/.pi/agent/skills/<name>/SKILL.md and their name+description auto-load into future sessions' system prompt. Do NOT use write/edit/bash on skill files — go through skill_manage.`,
      ``,
    );
  parts.push(
    `Finish with ONE short paragraph: what you saved/changed and why, or 'Nothing to save.' Nothing else.`,
  );
  return parts.join("\n");
}

/* ------------------------------------------------------------------ */
/* Extension state                                                     */
/* ------------------------------------------------------------------ */
export default function hermesMind(pi: {
  on: (event: string, handler: (event: any, ctx: any) => unknown) => () => void;
  registerTool: (def: unknown) => void;
  sendMessage: (message: unknown, options?: unknown) => void;
  appendEntry: (customType: string, data?: unknown) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [k: string]: any;
}): void {
  const cfg = loadConfig();
  if (!cfg.enabled) return;

  const st = {
    frozenMemory: "" as string,
    userTurns: 0,
    skillIters: 0,
    inReviewRun: false,
    overflowFailsThisTurn: 0,
    viewedSkills: new Set<string>() as Set<string>,
    pendingReview: null as null | { memDue: boolean; skillDue: boolean },
    reviewTimer: null as null | ReturnType<typeof setTimeout>,
    lastReviewAt: 0,
    retries: 0,
    shutDown: false,
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let liveCtx: any = null;

  const guard = (where: string, fn: () => void) => {
    try {
      fn();
    } catch (err) {
      logError(where, err);
    }
  };

  /* ---------- tools ---------- */

  if (cfg.memoryEnabled || cfg.userProfileEnabled) {
    // Built conditionally so a disabled store disappears from the schema entirely (Hermes behavior).
    const targetLiterals = [
      ...(cfg.memoryEnabled ? [Type.Literal("memory")] : []),
      ...(cfg.userProfileEnabled ? [Type.Literal("user")] : []),
    ];
    const schema = Type.Object({
      action: Type.Union([Type.Literal("add"), Type.Literal("patch"), Type.Literal("remove")], {
        description: "add: new entry (content). patch: replace exact span old_text with content in the matched entry. remove: delete the whole entry containing old_text. No read action — the snapshot is in the system prompt; tool responses show live state.",
      }),
      target: Type.Union(targetLiterals, { description: "memory = environment facts; user = who the user is." }),
      content: Type.Optional(Type.String({ description: "For add: the entry. For patch: the replacement text for old_text." })),
      old_text: Type.Optional(Type.String({ description: "For patch: exact span to change (must be unique in the entry). For remove: any substring of the entry to delete." })),
      operations: Type.Optional(
        Type.Array(
          Type.Object({
            action: Type.Union([Type.Literal("add"), Type.Literal("patch"), Type.Literal("remove")]),
            content: Type.Optional(Type.String()),
            old_text: Type.Optional(Type.String()),
          }),
          { description: "Atomic batch — the char limit is checked on the final batch result only." },
        ),
      ),
    });

    pi.registerTool({
      name: "memory",
      label: "Memory",
      executionMode: "sequential",
      description:
        `Save durable facts to persistent memory that survives across sessions (MEMORY.md + USER.md under ${BASE}). ` +
        `Memory is injected into every future session's system prompt, so keep entries compact and high-signal. ` +
        `WHEN: only for facts that apply to EVERY session regardless of task: who the user is, stable environment facts, standing conventions with no task home. ` +
        `Anything learned while doing a task (procedures, pitfalls, the user's preferences for that kind of work) belongs in a skill via skill_manage, where it loads only when relevant. ` +
        `SKIP: trivial/obvious info, easily re-discovered facts, raw data dumps, task progress, completed-work logs, temporary TODO state (use session_search for those). ` +
        `Entries are separated by a line containing only §. 'replace' is not available; use 'patch' (old_text = exact span, content = new text; to rewrite a whole entry set old_text to the whole entry).`,
      parameters: schema,
      async execute(_toolCallId: string, params: any) {
        const ops: MemOp[] = params.operations?.length
          ? params.operations
          : [{ action: params.action, content: params.content, old_text: params.old_text }];
        const kind: StoreKind = params.target === "user" ? "user" : "memory";
        if (kind === "user" && !cfg.userProfileEnabled)
          return { content: [{ type: "text", text: "USER profile store is disabled." }], details: undefined };
        if (kind === "memory" && !cfg.memoryEnabled)
          return { content: [{ type: "text", text: "MEMORY store is disabled." }], details: undefined };
        try {
          const res = withLock(() => applyMemoryOps(cfg, kind, ops));
          if (res.overflow) {
            st.overflowFailsThisTurn++;
            if (st.overflowFailsThisTurn >= 3) {
              return {
                content: [
                  {
                    type: "text",
                    text:
                      `Memory consolidation failed ${st.overflowFailsThisTurn} times this turn. Stop retrying memory calls — leave memory unchanged for now and continue with your reply to the user. The fact can be saved in a later turn.`,
                  },
                ],
                details: undefined,
              };
            }
          }
          return { content: [{ type: "text", text: res.text }], details: undefined };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            details: undefined,
          };
        }
      },
    });
  }

  pi.registerTool({
    name: "skill_manage",
    label: "Skill library",
    executionMode: "sequential",
    description:
      `Manage the agent's own skill library at ${SKILLS_ROOT} (auto-loaded into future sessions as name+description in the system prompt). ` +
      `Skills are CLASS-LEVEL instructions (procedures + pitfalls) for a class of task — never session artifacts. ` +
      `actions: list | view(name) | create(name, description, content) | patch(name, old_text, new_text) | write_file(name, file_path, content) | read_file(name, file_path) | archive(name). ` +
      `description: one sentence, trigger first, ends with a period, ≤1024 chars — it is the routing signal. ` +
      `Support files go under allowed subdirs: ${[...ALLOWED_SUBDIRS].join(", ")}. ` +
      `Patch the sentence that misled instead of appending updates. Never delete — archive. Read-before-write is enforced for background review turns.`,
    parameters: Type.Object({
      action: Type.Union([
        Type.Literal("list"),
        Type.Literal("view"),
        Type.Literal("create"),
        Type.Literal("patch"),
        Type.Literal("write_file"),
        Type.Literal("read_file"),
        Type.Literal("archive"),
      ]),
      name: Type.Optional(Type.String({ description: "Skill name (class-level, [a-z0-9._-])." })),
      description: Type.Optional(Type.String({ description: "create only: one-sentence routing description ending with a period." })),
      content: Type.Optional(Type.String({ description: "create: SKILL.md body markdown. write_file: file content." })),
      old_text: Type.Optional(Type.String({ description: "patch: exact unique span to replace." })),
      new_text: Type.Optional(Type.String({ description: "patch: replacement text." })),
      file_path: Type.Optional(Type.String({ description: "write_file/read_file: relative path under the skill dir (allowed subdirs only)." })),
    }),
    async execute(_toolCallId: string, params: any) {
      const requireView = (name: string): string | null => {
        if (!st.inReviewRun) return null;
        if (!st.viewedSkills.has(name))
          return `Read-before-write guard: call skill_manage action=view name=${name} first in this review before writing it.`;
        return null;
      };
      try {
        fs.mkdirSync(SKILLS_ROOT, { recursive: true });
        switch (params.action) {
          case "list": {
            const out: string[] = [];
            for (const ent of fs.readdirSync(SKILLS_ROOT, { withFileTypes: true })) {
              if (!ent.isDirectory()) continue;
              const f = path.join(SKILLS_ROOT, ent.name, "SKILL.md");
              if (!fs.existsSync(f)) continue;
              const { fm } = parseFrontmatter(fs.readFileSync(f, "utf8"));
              out.push(`- ${ent.name}: ${fm.description ?? "(no description)"}`);
            }
            return {
              content: [{ type: "text", text: out.length ? out.join("\n") : "(skill library is empty)" }],
              details: undefined,
            };
          }
          case "view":
          case "read_file": {
            const name = String(params.name ?? "");
            if (!VALID_NAME_RE.test(name)) throw new Error(`Invalid skill name '${name}'.`);
            const file =
              params.action === "view"
                ? path.join(skillDir(name), "SKILL.md")
                : path.join(skillDir(name), String(params.file_path ?? ""));
            const resolved = path.resolve(file);
            if (!resolved.startsWith(path.resolve(skillDir(name)) + path.sep) && resolved !== path.resolve(path.join(skillDir(name), "SKILL.md")))
              throw new Error("Path traversal rejected.");
            if (params.action === "read_file") {
              const sub = resolved.slice(path.resolve(skillDir(name)).length + 1).split(path.sep)[0];
              if (!ALLOWED_SUBDIRS.has(sub)) throw new Error(`file_path must be under an allowed subdir: ${[...ALLOWED_SUBDIRS].join(", ")}.`);
            }
            if (!fs.existsSync(resolved)) throw new Error(`Not found: ${resolved}`);
            if (fs.statSync(resolved).size > MAX_SKILL_FILE_BYTES) throw new Error("File too large (>1 MiB).");
            st.viewedSkills.add(name);
            return {
              content: [{ type: "text", text: fs.readFileSync(resolved, "utf8").slice(0, 24_000) }],
              details: undefined,
            };
          }
          case "create": {
            const name = String(params.name ?? "");
            const description = String(params.description ?? "");
            const content = String(params.content ?? "");
            const err = validateSkillMeta(name, description);
            if (err) throw new Error(err);
            if (!content.trim()) throw new Error("content (SKILL.md body) is required.");
            if (content.length > MAX_SKILL_CONTENT_CHARS) throw new Error(`SKILL.md body too large (>${MAX_SKILL_CONTENT_CHARS} chars).`);
            const threat = threatScan(content) ?? threatScan(description);
            if (threat) throw new Error(`[BLOCKED] ${threat}.`);
            const dir = skillDir(name);
            if (fs.existsSync(path.join(dir, "SKILL.md"))) throw new Error(`Skill '${name}' already exists — patch it instead.`);
            fs.mkdirSync(dir, { recursive: true });
            atomicWrite(
              path.join(dir, "SKILL.md"),
              `---\nname: ${name}\ndescription: ${description.replace(/\n/g, " ")}\n---\n\n# ${name}\n\n${content.trim()}\n`,
            );
            return {
              content: [
                {
                  type: "text",
                  text: `Skill '${name}' created at ${dir}. Its name+description become visible to future sessions (immediately after /reload or next session start).`,
                },
              ],
              details: undefined,
            };
          }
          case "patch": {
            const name = String(params.name ?? "");
            const oldText = String(params.old_text ?? "");
            const newText = String(params.new_text ?? "");
            if (!VALID_NAME_RE.test(name)) throw new Error(`Invalid skill name '${name}'.`);
            const guardErr = requireView(name);
            if (guardErr) throw new Error(guardErr);
            const file = path.join(skillDir(name), "SKILL.md");
            if (!fs.existsSync(file)) throw new Error(`Skill '${name}' not found.`);
            const text = fs.readFileSync(file, "utf8");
            const occurrences = text.split(oldText).length - 1;
            if (occurrences === 0) throw new Error("old_text not found in SKILL.md — quote it exactly (use action=view first).");
            if (occurrences > 1) throw new Error(`old_text occurs ${occurrences} times — provide a longer, unique span.`);
            const next = text.replace(oldText, newText);
            if (next.length > MAX_SKILL_CONTENT_CHARS + 2048) throw new Error(`Resulting SKILL.md too large (>${MAX_SKILL_CONTENT_CHARS} chars).`);
            const { fm } = parseFrontmatter(next);
            if (fm.description !== undefined) {
              const err = validateSkillMeta(name, fm.description);
              if (err) throw new Error(`Patch would break frontmatter: ${err} Nothing was written.`);
            }
            const threat = threatScan(newText);
            if (threat) throw new Error(`[BLOCKED] ${threat}.`);
            atomicWrite(file, next);
            return { content: [{ type: "text", text: `Patched '${name}'.` }], details: undefined };
          }
          case "write_file": {
            const name = String(params.name ?? "");
            const rel = String(params.file_path ?? "");
            const content = String(params.content ?? "");
            if (!VALID_NAME_RE.test(name)) throw new Error(`Invalid skill name '${name}'.`);
            const guardErr = requireView(name);
            if (guardErr) throw new Error(guardErr);
            const sub = rel.split("/")[0]?.split(path.sep)[0];
            if (!ALLOWED_SUBDIRS.has(sub)) throw new Error(`file_path must be under an allowed subdir: ${[...ALLOWED_SUBDIRS].join(", ")}.`);
            const dir = skillDir(name);
            const resolved = path.resolve(path.join(dir, rel));
            if (!resolved.startsWith(path.resolve(dir) + path.sep)) throw new Error("Path traversal rejected.");
            if (!fs.existsSync(path.join(dir, "SKILL.md"))) throw new Error(`Skill '${name}' has no SKILL.md — create it first.`);
            if (Buffer.byteLength(content) > MAX_SKILL_FILE_BYTES) throw new Error("File too large (>1 MiB).");
            const threat = threatScan(content);
            if (threat) throw new Error(`[BLOCKED] ${threat}.`);
            fs.mkdirSync(path.dirname(resolved), { recursive: true });
            atomicWrite(resolved, content);
            return {
              content: [
                {
                  type: "text",
                  text: `Wrote ${rel} under '${name}'. Add a one-line pointer to it in the SKILL.md if not present (action=patch).`,
                },
              ],
              details: undefined,
            };
          }
          case "archive": {
            const name = String(params.name ?? "");
            if (!VALID_NAME_RE.test(name)) throw new Error(`Invalid skill name '${name}'.`);
            const guardErr = requireView(name);
            if (guardErr) throw new Error(guardErr);
            const dir = skillDir(name);
            if (!fs.existsSync(dir)) throw new Error(`Skill '${name}' not found.`);
            fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
            const dest = path.join(ARCHIVE_DIR, `${name}-${Date.now()}`);
            fs.renameSync(dir, dest);
            return { content: [{ type: "text", text: `Archived '${name}' to ${dest} (recoverable).` }], details: undefined };
          }
          default:
            throw new Error(`Unknown action '${params.action}'.`);
        }
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
          details: undefined,
        };
      }
    },
  });

  if (cfg.sessionSearchEnabled) {
    pi.registerTool({
      name: "session_search",
      label: "Session search",
      description:
        `Search past Pi sessions (long-term conversation recall) via a local FTS5 index over ${SESSIONS_ROOT}. ` +
        `Shapes: {query} → full-text discovery across sessions (FTS5 boolean: OR, "quoted phrases", NOT, prefix*); ` +
        `{session_id} → read that session's messages; {} → browse recent sessions. ` +
        `Optional: limit (1-10, default 3), after/before ("7d", "24h", "2w", or ISO), sort=newest|oldest. ` +
        `Searches conversation history ONLY — when the user gave a direct source (URL, file, contact, live system), inspect that first.`,
      parameters: Type.Object({
        query: Type.Optional(Type.String({ description: "FTS5 boolean query." })),
        session_id: Type.Optional(Type.String({ description: "Read one session's messages." })),
        limit: Type.Optional(Type.Number({ description: "Max sessions in discovery mode (1-10)." })),
        after: Type.Optional(Type.String({ description: 'Time bound, e.g. "7d", "24h", "2w", or ISO date.' })),
        before: Type.Optional(Type.String({ description: "Time bound, e.g. ISO date." })),
        sort: Type.Optional(Type.Union([Type.Literal("newest"), Type.Literal("oldest")])),
      }),
      async execute(_toolCallId: string, params: any) {
        const d = loadSqlite();
        if (!d)
          return {
            content: [{ type: "text", text: "Session index unavailable (better-sqlite3 not loadable). See ~/.pi/agent/hermes-mind/error.log" }],
            details: undefined,
          };
        try {
          indexAllSessions(); // cheap no-op when up to date
          const after = params.after ? parseRelTime(String(params.after)) : null;
          const before = params.before ? parseRelTime(String(params.before)) : null;
          if (params.session_id) {
            const row = d.prepare("SELECT path, title FROM files WHERE session_id = ?").get(String(params.session_id)) as
              | { path: string; title: string }
              | undefined;
            if (!row) throw new Error(`Session id not found in index: ${params.session_id}`);
            const parsed = parseSessionFile(row.path);
            let msgs = parsed.msgs.filter((m) => m.role !== "toolResult");
            if (msgs.length > 30) msgs = [...msgs.slice(0, 20), { role: "note", content: `… ${msgs.length - 30} messages omitted …`, entry_id: "", ts: "" }, ...msgs.slice(-10)];
            const lines = msgs.map((m) => `[${m.ts || "?"}] ${m.role.toUpperCase()}: ${m.content.slice(0, 2000)}`);
            return {
              content: [
                {
                  type: "text",
                  text: `Session: ${row.title || "(untitled)"} (${parsed.sessionId})\nfile: ${row.path}\n\n${lines.join("\n\n").slice(0, 24_000)}`,
                },
              ],
              details: undefined,
            };
          }
          if (params.query) {
            const q = String(params.query).trim().slice(0, 2048);
            let rows: { file: string; sn: string; role: string; ts: string }[] = [];
            try {
              rows = d
                .prepare(
                  `SELECT file, snippet(msgs, 0, '«', '»', '…', 14) AS sn, role, ts FROM msgs WHERE msgs MATCH ? ORDER BY rank LIMIT 300`,
                )
                .all(q) as typeof rows;
            } catch {
              try {
                rows = d
                  .prepare(
                    `SELECT file, snippet(msgs, 0, '«', '»', '…', 14) AS sn, role, ts FROM msgs WHERE msgs MATCH ? ORDER BY rank LIMIT 300`,
                  )
                  .all(`"${q.replace(/"/g, '""')}"`) as typeof rows;
              } catch {
                throw new Error(`Invalid FTS5 query. Use: word, OR, "quoted phrase", NOT, prefix* — e.g. deploy AND (vps OR server)`);
              }
            }
            const limit = Math.min(10, Math.max(1, Number(params.limit) || 3));
            const byFile = new Map<string, typeof rows>();
            for (const r of rows) {
              if (!byFile.has(r.file)) byFile.set(r.file, []);
              byFile.get(r.file)!.push(r);
            }
            const out: string[] = [];
            for (const [file, hits] of [...byFile.entries()]
              .sort((a, b) => String(b[1][0]?.ts ?? "").localeCompare(String(a[1][0]?.ts ?? "")))
              .slice(0, limit)) {
              const meta = d.prepare("SELECT session_id, title, last_activity FROM files WHERE path = ?").get(file) as
                | { session_id: string; title: string; last_activity: string }
                | undefined;
              if (!meta) continue;
              if (after && new Date(meta.last_activity || 0).getTime() < after) continue;
              if (before && new Date(meta.last_activity || 0).getTime() > before) continue;
              out.push(
                `### ${meta.title || "(untitled)"} — ${meta.last_activity || "?"} (session_id: ${meta.session_id})\n` +
                  hits.slice(0, 3).map((h) => `«${h.role}» …${h.sn}…`).join("\n"),
              );
            }
            return {
              content: [
                {
                  type: "text",
                  text: out.length
                    ? out.join("\n\n")
                    : `No matching sessions found. FTS5 syntax: word, OR, "quoted phrase", NOT, prefix* (e.g. deploy AND (vps OR server)). Try broader terms or drop time filters.`,
                },
              ],
              details: undefined,
            };
          }
          // browse
          const rows = d
            .prepare("SELECT session_id, title, last_activity, msg_count FROM files ORDER BY last_activity DESC LIMIT 15")
            .all() as { session_id: string; title: string; last_activity: string; msg_count: number }[];
          return {
            content: [
              {
                type: "text",
                text:
                  `Recent sessions (newest first):\n` +
                  rows
                    .map((r) => `- ${r.last_activity || "?"} | ${r.title || "(untitled)"} | ${r.msg_count} msgs | ${r.session_id}`)
                    .join("\n"),
              },
            ],
            details: undefined,
          };
        } catch (err) {
          return {
            content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
            details: undefined,
          };
        }
      },
    });
  }

  /* ---------- lifecycle ---------- */

  pi.on("session_start", (_e, ctx) => {
    guard("session_start", () => {
      liveCtx = ctx;
      st.shutDown = false;
      st.userTurns = 0;
      st.skillIters = 0;
      st.inReviewRun = false;
      st.overflowFailsThisTurn = 0;
      st.viewedSkills.clear();
      rotateErrorLog();
      const blocks: string[] = [];
      if (cfg.memoryEnabled) blocks.push(renderStoreBlock("memory", cfg));
      if (cfg.userProfileEnabled) blocks.push(renderStoreBlock("user", cfg));
      st.frozenMemory = blocks.join("\n\n");
      if (cfg.sessionSearchEnabled) {
        // defer indexing off the startup path
        setTimeout(() => {
          if (!st.shutDown) guard("indexAllSessions(deferred)", indexAllSessions);
        }, 50);
      }
    });
  });

  pi.on("before_agent_start", (e: any) => {
    guard("before_agent_start", () => {
      if (cfg.memoryEnabled || cfg.userProfileEnabled) {
        if (st.frozenMemory && e?.systemPromptOptions?.sections) {
          e.systemPromptOptions.sections["hermes-memory"] = st.frozenMemory;
        }
      }
      if (e?.messageType === "user") {
        st.userTurns++;
        st.overflowFailsThisTurn = 0;
        st.inReviewRun = false;
      } else if (e?.messageType === "custom" && e?.message?.customType === CT_REVIEW) {
        st.inReviewRun = true;
        st.viewedSkills.clear();
      }
    });
  });

  pi.on("tool_execution_end", () => {
    guard("tool_execution_end", () => {
      if (!st.inReviewRun) st.skillIters++;
    });
  });

  const deliverReview = (): void => {
    guard("deliverReview", () => {
      if (st.shutDown || !st.pendingReview) return;
      // isIdle gate matters in interactive mode (never interrupt a live turn); in print mode
      // agent_end fires while the session is still winding down, so the gate would bounce the
      // delivery into a retry timer the exiting process never runs — skip it there.
      if (liveCtx && liveCtx.mode !== "print" && !liveCtx.isIdle()) {
        if (st.retries++ < 3) {
          st.reviewTimer = setTimeout(deliverReview, 2000);
          return;
        }
        st.pendingReview = null;
        return;
      }
      const { memDue, skillDue } = st.pendingReview;
      st.pendingReview = null;
      st.retries = 0;
      st.lastReviewAt = Date.now();
      pi.sendMessage(
        {
          customType: CT_REVIEW,
          content: buildReviewPrompt(memDue, skillDue),
          display: true,
          details: { memDue, skillDue, at: new Date().toISOString() },
        },
        { triggerTurn: true, deliverAs: "followUp" },
      );
      pi.appendEntry("hermes-review-log", { at: new Date().toISOString(), memDue, skillDue });
      try {
        fs.appendFileSync(REVIEW_LOG, `${JSON.stringify({ at: new Date().toISOString(), memDue, skillDue })}\n`);
      } catch {
        /* ignore */
      }
    });
  };

  pi.on("agent_end", () => {
    guard("agent_end", () => {
      if (st.inReviewRun || !cfg.reviewEnabled) return;
      const memDue = st.userTurns >= cfg.memoryNudgeInterval;
      const skillDue = st.skillIters >= cfg.skillNudgeInterval;
      if (!memDue && !skillDue) return;
      if (Date.now() - st.lastReviewAt < cfg.reviewMinGapMinutes * 60_000) return;
      st.pendingReview = { memDue, skillDue };
      if (memDue) st.userTurns = 0;
      if (skillDue) st.skillIters = 0;
      st.retries = 0;
      // Print mode: pi tears down synchronously right after agent_end (session_shutdown clears
      // timers before any setTimeout callback can run) — deliver synchronously instead.
      // Interactive/rpc/json: 900ms grace period keeps the review off the response path.
      if (liveCtx?.mode === "print") deliverReview();
      else st.reviewTimer = setTimeout(deliverReview, 900);
    });
  });

  pi.on("input", (e: any) => {
    guard("input", () => {
      if (e?.source === "interactive" || e?.source === "rpc") {
        if (st.reviewTimer) clearTimeout(st.reviewTimer);
        st.reviewTimer = null;
        st.pendingReview = null;
        st.retries = 0;
      }
    });
  });

  pi.on("session_shutdown", () => {
    guard("session_shutdown", () => {
      st.shutDown = true;
      if (st.reviewTimer) clearTimeout(st.reviewTimer);
      st.reviewTimer = null;
      st.pendingReview = null;
      try {
        if (cfg.sessionSearchEnabled && !dbBroken) guard("indexAllSessions(shutdown)", indexAllSessions);
      } finally {
        if (db) {
          try {
            db.close();
          } catch {
            /* ignore */
          }
          db = null;
        }
      }
    });
  });
}

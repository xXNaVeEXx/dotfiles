// worddiff.ts — Word-Diff-Marker für Unified-Diff-Blöcke.
//
// Hebt in Änderungszeilen ("-", "+") nur die GEÄNDERTEN Wörter hervor:
// Runs aus ≥1 "-"-Zeilen, direkt gefolgt von ≥1 "+"-Zeilen, werden paarweise
// wortweise verglichen. Alles andere (@@-Marker, Kontext, Sonderzeilen
// 💬 · ⚡ ⚠, unpaarige -/+ Zeilen) bleibt unberührt.
//
// Reine String-Logik, keine Imports (nur Node-Globals), keine npm-Deps.

const MARK_OPEN = "⟦";
const MARK_CLOSE = "⟧";

/** Zerlegte Änderungszeile. */
interface ParsedLine {
  /** "-" oder "+" */
  sign: string;
  /** Original-Präfix bis zum ersten "echten" Wort (Leerzeichen, Zeilennummern, ┆│ …). */
  prefix: string;
  /** Wort-Tokens ab dem ersten Token mit Buchstaben (split(" ")). */
  words: string[];
}

/** true, wenn das Token mindestens einen Buchstaben enthält ("echtes" Wort). */
function hasLetter(token: string): boolean {
  return /\p{L}/u.test(token);
}

/**
 * Zerlegt eine Änderungszeile in Signum, Präfix und Wortliste.
 * Präfix = originales Textstück bis zum ersten Token mit Buchstaben
 * (deckt "-" bzw. "+" plus folgende Leerzeichen/Zahlen/┆│-Zeichen ab;
 * Whitespace bleibt verlustfrei erhalten).
 * null, wenn die Zeel kein echtes Wort enthält.
 */
function parseChangeLine(line: string): ParsedLine | null {
  const sign = line.slice(0, 1);
  const rest = line.slice(1);
  const tokens = rest.split(" ");
  let wordStart = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (hasLetter(tokens[i])) {
      wordStart = i;
      break;
    }
  }
  if (wordStart === -1) return null;
  // Zeichen-Offset des ersten Wort-Tokens: Token-Längen + Trenn-Leerzeichen.
  let prefixLen = wordStart;
  for (let i = 0; i < wordStart; i++) prefixLen += tokens[i].length;
  return { sign, prefix: rest.slice(0, prefixLen), words: tokens.slice(wordStart) };
}

/** Baut die markierte Zeile neu: sign + prefix + Wörter, Mittelsegment in ⟦…⟧. */
function buildLine(
  sign: string,
  prefix: string,
  pre: string[],
  mid: string[],
  suf: string[],
): string {
  const words =
    mid.length > 0
      ? [...pre, MARK_OPEN + mid.join(" ") + MARK_CLOSE, ...suf]
      : [...pre, ...suf];
  return sign + prefix + words.join(" ");
}

/**
 * Markiert geänderte Wörter in Unified-Diff-Blöcken.
 * Rückgabe: gleiche Länge und Reihenfolge; nur Änderungszeilen tragen ⟦…⟧.
 * Blockgrenze: jede Zeile, die nicht mit "-" (Run-Start) bzw. "+" folgt.
 */
export function markWordDiff(lines: string[]): string[] {
  const out: string[] = lines.slice();
  let i = 0;
  while (i < lines.length) {
    if (!lines[i].startsWith("-")) {
      i++;
      continue;
    }
    // Run: ≥1 aufeinanderfolgende "-"-Zeilen …
    const delStart = i;
    let j = delStart;
    while (j < lines.length && lines[j].startsWith("-")) j++;
    // … direkt gefolgt von ≥1 "+"-Zeilen (sonst kein Block).
    const addStart = j;
    let k = addStart;
    while (k < lines.length && lines[k].startsWith("+")) k++;
    // Paarweiser Vergleich alt[p] vs. neu[p] für p < min(N, M);
    // Überschusszeilen ohne Partner bleiben unverändert.
    const pairs = Math.min(j - delStart, k - addStart);
    for (let p = 0; p < pairs; p++) {
      const alt = parseChangeLine(lines[delStart + p]);
      const neu = parseChangeLine(lines[addStart + p]);
      if (alt === null || neu === null) continue;
      // Gemeinsames Wort-Präfix …
      let pre = 0;
      while (
        pre < alt.words.length &&
        pre < neu.words.length &&
        alt.words[pre] === neu.words[pre]
      ) {
        pre++;
      }
      // … und gemeinsames Wort-Suffix (überschneidungsfrei).
      let suf = 0;
      while (
        suf < alt.words.length - pre &&
        suf < neu.words.length - pre &&
        alt.words[alt.words.length - 1 - suf] === neu.words[neu.words.length - 1 - suf]
      ) {
        suf++;
      }
      const midAlt = alt.words.slice(pre, alt.words.length - suf);
      const midNeu = neu.words.slice(pre, neu.words.length - suf);
      if (midAlt.length === 0 && midNeu.length === 0) continue; // keine Wortänderung
      // Leeres Mittelsegment → Zeile komplett unverändert lassen (reine Add./Lösch.).
      if (midAlt.length > 0) {
        out[delStart + p] = buildLine(
          alt.sign,
          alt.prefix,
          alt.words.slice(0, pre),
          midAlt,
          alt.words.slice(alt.words.length - suf),
        );
      }
      if (midNeu.length > 0) {
        out[addStart + p] = buildLine(
          neu.sign,
          neu.prefix,
          neu.words.slice(0, pre),
          midNeu,
          neu.words.slice(neu.words.length - suf),
        );
      }
    }
    i = k; // "-"-Run (plus evtl. "+"-Run) vollständig verarbeitet.
  }
  return out;
}

/** Selbsttest: liefert "✓ worddiff: …" oder wirft bei Fehlern. */
export async function selfTest(): Promise<string> {
  let count = 0;
  function check(label: string, actual: unknown, expected: unknown): void {
    count++;
    if (actual !== expected) {
      throw new Error(
        `worddiff: ${label} fehlgeschlagen — erwartet ${JSON.stringify(expected)}, erhalten ${JSON.stringify(actual)}`,
      );
    }
  }

  // Fall 1: Wortänderung b → X; @@ und Kontext bleiben unberührt.
  const c1 = markWordDiff(["@@ Zeile 1–2 @@", "- a b c", "+ a X c", "  ctx"]);
  check("Fall1 Länge", c1.length, 4);
  check("Fall1 @@ unverändert", c1[0], "@@ Zeile 1–2 @@");
  check("Fall1 alt markiert", c1[1], "- a ⟦b⟧ c");
  check("Fall1 neu markiert", c1[2], "+ a ⟦X⟧ c");
  check("Fall1 Kontext unverändert", c1[3], "  ctx");

  // Fall 2: reine Addition — nur die neu-Zeile bekommt einen Marker.
  const c2 = markWordDiff(["- foo", "+ foo bar"]);
  check("Fall2 Länge", c2.length, 2);
  check("Fall2 alt ohne Marker", c2[0], "- foo");
  check("Fall2 neu mit Marker", c2[1], "+ foo ⟦bar⟧");

  // Fall 3: reine Löschung — nur die alt-Zeile bekommt einen Marker.
  const c3 = markWordDiff(["- foo bar", "+ foo"]);
  check("Fall3 alt mit Marker", c3[0], "- foo ⟦bar⟧");
  check("Fall3 neu ohne Marker", c3[1], "+ foo");

  // Fall 4: identisches Paar — beide Zeilen unverändert.
  const c4 = markWordDiff(["- a b", "+ a b"]);
  check("Fall4 alt unverändert", c4[0], "- a b");
  check("Fall4 neu unverändert", c4[1], "+ a b");

  // Fall 5: Block-Paarung min(N,M) — unpaarige "-"-Zeile bleibt unverändert.
  const c5 = markWordDiff(["- a b", "- c d", "+ x b"]);
  check("Fall5 Paar alt", c5[0], "- ⟦a⟧ b");
  check("Fall5 unpaarig alt unverändert", c5[1], "- c d");
  check("Fall5 Paar neu", c5[2], "+ ⟦x⟧ b");
  check("Fall5 Länge", c5.length, 3);

  // Fall 6: Sonderzeilen und unpaarige -/+ Zeilen bleiben unberührt.
  const in6 = [
    "💬 session 12",
    "- solo",
    "  ctx",
    "+ verwaist",
    "· pad",
    "⚡ schnell",
    "⚠ warnung",
  ];
  const c6 = markWordDiff(in6);
  check("Fall6 Länge", c6.length, in6.length);
  for (let n = 0; n < in6.length; n++) {
    check(`Fall6 Zeile ${n} unberührt`, c6[n], in6[n]);
  }

  return (
    `✓ worddiff: ${count} Checks bestanden — Wortänderung (b→X), reine Addition, ` +
    `reine Löschung, identisches Paar, Block-Paarung min(N,M), gleiche Länge, Sonderzeilen unberührt`
  );
}

if (process.argv[1]?.includes("worddiff.ts")) {
  void selfTest()
    .then((s) => console.log(s))
    .catch((e) => {
      console.error("SELFTEST FAIL:", e);
      process.exit(1);
    });
}

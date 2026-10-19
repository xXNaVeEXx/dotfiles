// Handtest RP9/G5 (onTerminalInput, PI-B-111): loggt Composer-/Terminal-Tasten eines pi-Threads.
// Nur für den Handtest am 19.10.2026 – kann nach dem Test wieder gelöscht werden.
import { appendFile } from "node:fs/promises";

export default function htOnTerminalInput(ctx: { ui?: { onTerminalInput?: (h: (data: string) => unknown) => unknown } }) {
  const reg = ctx.ui?.onTerminalInput;
  if (!reg) return;
  reg((data: string) => {
    void appendFile("/tmp/lumi-ht-onti.log", `${Date.now()} ${JSON.stringify(data)}\n`).catch(() => {});
    return undefined as unknown as void;
  });
  console.log("[ht-onti] onTerminalInput registriert");
}

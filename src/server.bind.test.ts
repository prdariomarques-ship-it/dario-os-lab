import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isLoopbackBind } from "./server.js";

/**
 * RC2 security closure tests: the server must NEVER listen beyond loopback
 * without DARIUS_API_TOKEN. Unit coverage for the classifier plus a real
 * boot check (child process) for the fail-fast wiring in src/server.ts.
 */

describe("isLoopbackBind (pure classifier)", () => {
  const safe = ["127.0.0.1", "127.0.0.2", "127.255.255.254", "localhost", "LocalHost", "  localhost  ", "::1", "[::1]"];
  const unsafe = ["0.0.0.0", "::", "[::]", "192.168.0.10", "10.1.2.3", "172.16.5.5", "host.local", "", "0"];

  it.each(safe)("classifies %s as loopback (safe)", (h) => {
    expect(isLoopbackBind(h)).toBe(true);
  });

  it.each(unsafe)("classifies %q as beyond loopback (requires token)", (h) => {
    expect(isLoopbackBind(h)).toBe(false);
  });
});

function boot(env: Record<string, string>, port: string): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve, reject) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "darius-bindboot-"));
    // Spawn node directly on the tsx CLI entry: `child` IS the server process
    // (no npx→tsx→node chain). Earlier versions spawned `npx tsx`, so killing
    // the child killed only the npx wrapper and the real server survived as an
    // orphan holding the port — the next suite run then failed with
    // EADDRINUSE. With a direct spawn, child.kill() always reaches the
    // listener, on every OS.
    // Resolve the tsx CLI entry from its package manifest (the package's
    // `exports` map deliberately does not expose ./dist/*, so resolve via the
    // `bin` field instead of require.resolve).
    const tsxPkgDir = path.join(process.cwd(), "node_modules", "tsx");
    const tsxPkg = JSON.parse(fs.readFileSync(path.join(tsxPkgDir, "package.json"), "utf8")) as { bin?: string | Record<string, string> };
    const tsxBin = typeof tsxPkg.bin === "string" ? tsxPkg.bin : tsxPkg.bin?.tsx;
    if (!tsxBin) throw new Error("tsx package manifest has no bin entry");
    const tsxCli = path.join(tsxPkgDir, tsxBin);
    const child = spawn(process.execPath, [tsxCli, "src/server.ts"], {
      cwd: process.cwd(),
      detached: process.platform !== "win32", // POSIX: child leads its own process group
      env: {
        ...process.env,
        PORT: port,
        DB_PATH: path.join(tmp, "bind.db"),
        DARIUS_DISABLE_LISTEN: undefined as unknown as string,
        ...env,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    // Tree kill: the tsx CLI spawns an inner node process for the actual
    // server, so killing only `child` orphans the listener holding the port.
    // POSIX: signal the whole process group. Windows: taskkill tree.
    const killTree = () => {
      if (child.exitCode !== null && child.signalCode !== null) return;
      if (process.platform === "win32") {
        try {
          spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
        } catch {
          /* fall through to child.kill below */
        }
        try { child.kill("SIGKILL"); } catch { /* already dead */ }
      } else {
        try { process.kill(-child.pid!, "SIGKILL"); } // negative pid = process group
        catch {
          try { child.kill("SIGKILL"); } catch { /* already dead */ }
        }
      }
    };
    let output = "";
    let settled = false;
    const finish = async (kill: boolean, result: { code: number | null; output: string } | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.stdout.removeAllListeners("data");
      child.stderr.removeAllListeners("data");
      if (kill && child.exitCode === null) {
        killTree();
        await new Promise<void>((r) => child.once("exit", () => r()));
        await new Promise<void>((r) => setTimeout(r, 50)); // port release settle
      }
      result instanceof Error ? reject(result) : resolve(result);
    };
    const timer = setTimeout(() => void finish(true, new Error(`boot timeout; output so far: ${output}`)), 60000);
    const onLine = (buf: Buffer) => {
      output += buf.toString();
      if (output.includes("DARIUS API Server is running")) void finish(true, { code: child.exitCode, output });
      if (output.includes("REFUSING TO START")) {
        // guard path: let the process exit by itself (code 1) so the port/dstate is clean
        child.once("exit", (code) => void finish(false, { code, output }));
      }
    };
    child.stdout.on("data", onLine);
    child.stderr.on("data", onLine);
    child.on("error", (e) => void finish(false, e));
  });
}

describe("server boot bind guard (real child process)", () => {
  it("REFUSES to boot on BIND_HOST=0.0.0.0 without DARIUS_API_TOKEN", async () => {
    const { code, output } = await boot({ BIND_HOST: "0.0.0.0", DARIUS_API_TOKEN: "" }, "3477");
    expect(output).toContain("REFUSING TO START");
    expect(output).toContain("BIND_HOST=0.0.0.0");
    expect(output).not.toContain("DARIUS API Server is running");
    expect(code).toBe(1);
  }, 90000);

  it("BOOTS on BIND_HOST=0.0.0.0 when DARIUS_API_TOKEN is set (Termux/LAN path preserved)", async () => {
    const { output } = await boot({ BIND_HOST: "0.0.0.0", DARIUS_API_TOKEN: "bind-guard-test-token" }, "3478");
    expect(output).toContain("DARIUS API Server is running on http://0.0.0.0:3478");
    expect(output).not.toContain("REFUSING TO START");
  }, 90000);

  it("BOOTS on default loopback without token (localhost legacy preserved)", async () => {
    const { output } = await boot({}, "3479");
    expect(output).toContain("DARIUS API Server is running on http://127.0.0.1:3479");
    expect(output).not.toContain("REFUSING TO START");
  }, 90000);
});

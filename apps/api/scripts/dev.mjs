#!/usr/bin/env node
/**
 * Run the gateway in development: compile on change, and run what is compiled.
 *
 * This exists because `dev` used to be `tsc --watch` and nothing else. That compiles the
 * gateway and never starts it, so `pnpm dev` reports a healthy workspace while port 3102 has
 * no listener and the storefront serves its "gateway unavailable" panel. The two halves were
 * never joined, which is a trap rather than a bug: every symptom points somewhere else.
 *
 * Node's own `--watch` is the restart mechanism. It tracks the module graph of the entry
 * point, so a recompile that changes anything under dist/ restarts the process. No nodemon and
 * no concurrently: both would be a dependency to keep current for something the runtime
 * already does.
 *
 * The env comes from the repository root .env via --env-file. The gateway refuses to boot
 * without DATABASE_URL — deliberately, so it never accepts traffic it cannot serve — and that
 * variable lives only in the root file, which turbo's dev task reads but a bare shell does not.
 *
 * Both processes share a process group, so a Ctrl-C on either takes the pair down. Leaving a
 * half-dead watcher behind is what makes the next `pnpm dev` fail on EADDRINUSE.
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findStaleDevProcesses } from "./dev-port.mjs";

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(API_ROOT, "../..");
const ENTRY = resolve(API_ROOT, "dist/apps/api/src/main.js");
const TSCONFIG = resolve(API_ROOT, "tsconfig.build.json");
const ROOT_ENV = resolve(REPO_ROOT, ".env");
const PORT = 3102;

const children = new Set();
let shuttingDown = false;

/* Both children lead their own process group (detached: true below), so a signal sent to
   the negative pid reaches everything they started. Sending SIGTERM to the child alone is not
   enough: node --watch spawns the actual server as a grandchild, and killing only the child
   leaves the grandchild holding port 3102 — which is what makes the next `pnpm dev` fail on
   EADDRINUSE, and what leaves the storefront reading a gateway nobody is supervising. */
const killGroup = (child, signal) => {
  try {
    // Negative pid targets the process group, so grandchildren go with it.
    process.kill(-child.pid, signal);
  } catch {
    // Already gone, or never got as far as having a group.
    if (!child.killed) child.kill(signal);
  }
};

const shutdown = (code) => {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) killGroup(child, "SIGTERM");
  // Escalate if anything is still holding a port, then leave.
  setTimeout(() => {
    for (const child of children) killGroup(child, "SIGKILL");
    setTimeout(() => process.exit(code), 200);
  }, 2000);
};

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

const run = (label, command, args, env = {}) => {
  // detached gives the child its own process group, which is what makes killGroup above able
  // to reach node --watch's own child. stdio is still inherited, so output is unchanged.
  const child = spawn(command, args, { cwd: API_ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "inherit", "inherit"], detached: true });
  children.add(child);
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (shuttingDown) return;
    // A dead compiler means the server is no longer tracking changes, so a "running" dev
    // session would silently stop reflecting edits. Fail loudly instead.
    if (label === "tsc" && code !== 0) {
      console.error(`[dev] ${label} exited with code ${code} — stopping`);
      shutdown(code ?? 1);
      return;
    }
    // The gateway exiting on its own is a bug, not a shutdown: `node --watch` re-execs across
    // recompiles and the child can come back without ever signalling an error. Left alone, the
    // port simply stops listening and the storefront shows its "gateway unavailable" panel with
    // no indication anything died. Bring it back instead.
    if (label === "gateway") {
      console.error(`[dev] gateway exited (code ${code}${signal ? `, ${signal}` : ""}) — restarting`);
      setTimeout(startServer, 1000);
      return;
    }
    if (signal) {
      console.error(`[dev] ${label} died on ${signal} — stopping`);
      shutdown(1);
    }
  });
};

/**
 * Reclaim :3102 from a dev session that outlived its shell, before booting a second one.
 *
 * `node --watch` and `tsc --watch` are both spawned detached — their own process group, so a
 * Ctrl-C that reaches dev.mjs takes the pair down. But a Ctrl-C that does NOT reach dev.mjs (the
 * terminal closed, the task was killed, the machine restarted) leaves those groups running with
 * no supervisor: the watcher keeps compiling and the gateway keeps holding :3102. The next
 * `pnpm dev` then boots alongside it, one of the two gateways fails on EADDRINUSE, and the
 * workspace reports a healthy build while half the traffic goes to a process nobody is watching.
 *
 * So find every gateway process of *this* repository that is not one of ours and stop it. Killing
 * the server alone is not enough — its watcher would start another — so the watcher goes too.
 * A process holding the port that is not ours is somebody else's: reported, not touched, because
 * guessing is how a dev script ends up killing the wrong thing.
 */
const reclaimPort = async () => {
  const ours = new Set([process.pid, ...children].map((child) => child.pid).filter(Boolean));
  const { stale, live } = findStaleDevProcesses({
    entry: ENTRY,
    distPath: resolve(API_ROOT, "dist"),
    tsconfig: TSCONFIG,
    selfPids: ours,
    listPids: () =>
      readdirSync("/proc", { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && /^\d+$/.test(entry.name))
        .map((entry) => Number(entry.name)),
    readCmdline: (pid) => {
      try {
        return readFileSync(`/proc/${pid}/cmdline`, "utf8");
      } catch {
        return ""; // the process ended between the listing and the read
      }
    },
    readParent: (pid) => {
      try {
        return Number(readFileSync(`/proc/${pid}/status`, "utf8").match(/^PPid:\s*(\d+)/m)?.[1] ?? 0);
      } catch {
        return 0;
      }
    },
  });

  for (const { pid, what } of live) {
    console.error(`[dev] another dev session already runs this gateway (${what}, pid ${pid}) — leaving it alone.`);
  }

  for (const { pid, what } of stale) {
    console.error(`[dev] stale ${what} from an earlier session (pid ${pid}) is still running — stopping it`);
    killTree(pid);
  }

  if (stale.length) {
    // Let them release the port before deciding whether it is free.
    await new Promise((done) => setTimeout(done, 500));
    for (const { pid } of stale) killTree(pid, "SIGKILL");
  }

  await new Promise((done) => setTimeout(done, 200));
  const still = await portHolder();
  if (still) {
    if (live.length) {
      console.error(
        `[dev] another dev session is already serving the gateway on :${PORT} (pid ${still.pid}). ` +
        `Stop that one and run \`pnpm dev\` again — two of them cannot share the port.`,
      );
    } else {
      console.error(
        `[dev] port ${PORT} is held by pid ${still.pid} (${still.command}), which is not this repository's gateway. ` +
        `Stop it and run \`pnpm dev\` again.`,
      );
    }
    shutdown(1);
    return false;
  }
  return true;
};

/** Stop a process and everything it leads, by process group first and pid second. */
const killTree = (pid, signal = "SIGTERM") => {
  for (const target of [-pid, pid]) {
    try {
      process.kill(target, signal);
      return;
    } catch {
      // Not a group leader, or already gone: try the plain pid.
    }
  }
};
const portHolder = async () => {
  const { execSync } = await import("node:child_process");
  let listing;
  try {
    listing = execSync(`ss -ltnp 2>/dev/null | grep ':${PORT} ' || true`, { encoding: "utf8" });
  } catch {
    return null; // no ss, or no match: assume free rather than refusing to boot
  }
  const pid = Number(listing.match(/pid=(\d+)/)?.[1] ?? 0);
  if (!pid) return null;
  let command = "";
  try {
    command = readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean).join(" ");
  } catch {
    // The holder ended while we were reading it.
  }
  return { pid, command };
};

// The compiler runs first and the server waits for it: starting node against a missing or
// half-written dist/ produces a module-not-found on boot that looks like a broken build.
run("tsc", process.execPath, [resolve(REPO_ROOT, "node_modules/typescript/bin/tsc"), "-p", TSCONFIG, "--watch", "--preserveWatchOutput", "--pretty", "false"]);

const startServer = async () => {
  if (!existsSync(ENTRY)) {
    console.error(`[dev] ${ENTRY} does not exist yet — is tsc still compiling?`);
    return;
  }
  // The port belongs to whoever asks for it first, so ask before booting rather than after:
  // a second gateway on a taken port fails at listen(), which reads as a broken build.
  if (!(await reclaimPort())) return;
  run("gateway", process.execPath, ["--env-file", ROOT_ENV, "--watch", "--watch-path", resolve(API_ROOT, "dist"), ENTRY]);
};

// tsc --watch gives no machine-readable "first build finished" signal, so give the initial
// compile a fixed moment before booting. `--watch` on the server then handles every later
// change, which is the case that actually matters.
setTimeout(startServer, 2500);

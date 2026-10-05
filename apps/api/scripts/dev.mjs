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
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const API_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = resolve(API_ROOT, "../..");
const ENTRY = resolve(API_ROOT, "dist/apps/api/src/main.js");
const TSCONFIG = resolve(API_ROOT, "tsconfig.build.json");
const ROOT_ENV = resolve(REPO_ROOT, ".env");

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

// The compiler runs first and the server waits for it: starting node against a missing or
// half-written dist/ produces a module-not-found on boot that looks like a broken build.
run("tsc", process.execPath, [resolve(REPO_ROOT, "node_modules/typescript/bin/tsc"), "-p", TSCONFIG, "--watch", "--preserveWatchOutput", "--pretty", "false"]);

const startServer = () => {
  if (!existsSync(ENTRY)) {
    console.error(`[dev] ${ENTRY} does not exist yet — is tsc still compiling?`);
    return;
  }
  run("gateway", process.execPath, ["--env-file", ROOT_ENV, "--watch", "--watch-path", resolve(API_ROOT, "dist"), ENTRY]);
};

// tsc --watch gives no machine-readable "first build finished" signal, so give the initial
// compile a fixed moment before booting. `--watch` on the server then handles every later
// change, which is the case that actually matters.
setTimeout(startServer, 2500);

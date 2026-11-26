// The orphan/live decision, on a process table that never has to exist.
//
// The failure this guards is the one that cost a morning: a `node --watch` gateway outliving its
// session, holding :3102, and the next `pnpm dev` losing the port to it with an EADDRINUSE that
// reads as a broken build. Two rules make that impossible, and both are worth a test — stopping
// what is actually stale, and not stopping what is not.

import { test } from "node:test";
import assert from "node:assert/strict";
import { findStaleDevProcesses, hasLiveDevmjsAncestor } from "./dev-port.mjs";

const API = "/repo/apps/api";
const ENTRY = `${API}/dist/apps/api/src/main.js`;
const DIST = `${API}/dist`;
const TSCONFIG = `${API}/tsconfig.build.json`;

/** A process table as readers: cmdline strings keyed by pid, parents keyed by pid. */
const table = (entries) => {
  const cmdlines = new Map(entries.map(([pid, cmdline]) => [pid, cmdline]));
  const parents = new Map(entries.map(([pid, , ppid]) => [pid, ppid]));
  return {
    readCmdline: (pid) => cmdlines.get(pid) ?? "",
    readParent: (pid) => parents.get(pid) ?? 0,
  };
};

const scan = (entries, selfPids = new Set()) => {
  const t = table(entries);
  return findStaleDevProcesses({
    entry: ENTRY,
    distPath: DIST,
    tsconfig: TSCONFIG,
    selfPids,
    listPids: () => entries.map(([pid]) => pid),
    readCmdline: t.readCmdline,
    readParent: t.readParent,
  });
};

const node = (...args) => ["node", ...args].join("\0");

test("a watcher whose dev.mjs is gone is stale", () => {
  // The shape of the failure: dev.mjs (700) died, init re-parented its watcher (701).
  const { stale, live } = scan([
    [1, node("systemd"), 0],
    [700, node("/repo/apps/api/scripts/dev.mjs"), 1],
    [701, node("--env-file", ".env", "--watch", "--watch-path", DIST, ENTRY), 1],
    [702, node("--env-file", ".env", ENTRY), 701],
  ]);
  assert.deepEqual(stale.map((p) => [p.pid, p.what]), [[701, "watcher"], [702, "gateway"]]);
  assert.deepEqual(live, []);
});

test("a watcher whose dev.mjs is alive is another session's work", () => {
  // Two `pnpm dev` runs: the second must not take the first one's gateway down.
  const { stale, live } = scan([
    [1, node("systemd"), 0],
    [800, node("/repo/apps/api/scripts/dev.mjs"), 1],
    [801, node("node", "--watch", "--watch-path", DIST, ENTRY), 800],
    [802, node("node", ENTRY), 801],
    [803, node("tsc", "-p", TSCONFIG, "--watch"), 800],
  ]);
  assert.deepEqual(stale, []);
  assert.deepEqual(live.map((p) => [p.pid, p.what]), [[801, "watcher"], [802, "gateway"], [803, "compiler"]]);
});

test("a server under a stale watcher is stale, and the watcher goes with it", () => {
  const { stale } = scan([
    [1, node("systemd"), 0],
    [900, node("--watch", "--watch-path", DIST, ENTRY), 1],
    [901, node(ENTRY), 900],
  ]);
  // Killing only the server would let the watcher start another; both are reported.
  assert.deepEqual(stale.map((p) => p.pid), [900, 901]);
});

test("processes of another repository are never candidates", () => {
  const { stale, live } = scan([
    [1, node("systemd"), 0],
    [1000, node("--watch", "--watch-path", "/elsewhere/dist", "/elsewhere/dist/main.js"), 1],
    [1001, node("/elsewhere/dist/main.js"), 1000],
    [1002, node("tsc", "-p", "/elsewhere/tsconfig.json", "--watch"), 1],
  ]);
  assert.deepEqual(stale, []);
  assert.deepEqual(live, []);
});

test("a shell or an unrelated next dev server is ignored", () => {
  const { stale, live } = scan([
    [1, node("systemd"), 0],
    [1100, node("sh", "-c", "next dev -p 3100"), 1],
    [1101, node("/repo/apps/store/node_modules/.bin/../next/dist/bin/next", "dev", "-p", "3100"), 1100],
  ]);
  assert.deepEqual(stale, []);
  assert.deepEqual(live, []);
});

test("our own pids are excluded even when they look like the thing", () => {
  const self = new Set([1200]);
  const { stale, live } = scan([
    [1, node("systemd"), 0],
    [1200, node("--watch", "--watch-path", DIST, ENTRY), 1],
    [1201, node(ENTRY), 1200],
  ], self);
  assert.deepEqual(stale.map((p) => p.pid), [1201]);
  assert.deepEqual(live, []);
});

test("a chain that ends without a dev.mjs is treated as gone", () => {
  // A reader that cannot answer past a point: the ancestor is unknowable, which is the same as
  // absent for this purpose.
  const readCmdline = (id) => (id === 1300 ? node("--watch", DIST, ENTRY) : "");
  const readParent = (id) => (id === 1300 ? 0 : 1);
  assert.equal(hasLiveDevmjsAncestor(1300, readCmdline, readParent), false);
});

test("a cycle in the parent chain terminates", () => {
  const readCmdline = () => node("--watch", DIST, ENTRY);
  const readParent = (id) => (id === 1400 ? 1401 : 1400);
  assert.equal(hasLiveDevmjsAncestor(1400, readCmdline, readParent), false);
});

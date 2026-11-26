// Which gateway processes belong to a dev session that is still alive, and which are leftovers.
//
// dev.mjs spawns `tsc --watch` and `node --watch` detached — each its own process group, so a
// Ctrl-C that reaches dev.mjs takes the pair down. A Ctrl-C that does NOT reach it (terminal
// closed, task killed, machine restarted) leaves those groups running unsupervised: the watcher
// keeps compiling and the gateway keeps holding :3102. The next `pnpm dev` then boots beside it,
// one of the two gateways fails on EADDRINUSE, and the workspace reports a healthy build while
// half the traffic goes to a process nobody is watching.
//
// So before booting, dev.mjs stops the leftovers. The decision is here and pure: given a way to
// read a process table, say which pids are safe to stop and which are a live session's own work.
// The distinction is the whole point — stopping another session's gateway would be the wrong fix
// for the wrong problem, so it is decided by ancestry rather than by guesswork.

/** Processes of this repository, split by whether a live dev.mjs still stands above them. */
export function findStaleDevProcesses({
  entry,
  distPath,
  tsconfig,
  /** Pids that are us or already ours: never candidates for stopping. */
  selfPids = new Set(),
  listPids = () => [],
  readCmdline = () => "",
  readParent = () => 0,
}) {
  const stale = [];
  const live = [];

  for (const pid of listPids()) {
    if (selfPids.has(pid)) continue;
    const args = readCmdline(pid).split("\0").filter(Boolean);
    if (!args.length) continue;

    const isServer = args.includes(entry);
    const isWatcher = args.includes("--watch") && args.includes(distPath);
    const isCompiler = args.includes(tsconfig);
    if (!isServer && !isWatcher && !isCompiler) continue;

    const what = isCompiler ? "compiler" : isWatcher ? "watcher" : "gateway";
    // A watcher whose dev.mjs died is re-parented to init, so its chain ends without one. A
    // watcher whose dev.mjs is running has that process in its ancestry — somebody's live work.
    if (hasLiveDevmjsAncestor(pid, readCmdline, readParent)) live.push({ pid, what });
    else stale.push({ pid, what });
  }

  return { stale, live };
}

/**
 * Whether a live dev.mjs of this repository sits above this process.
 *
 * Walks parents until it finds one, reaches init, or runs out of answers. A chain that ends
 * without a dev.mjs means whoever started it is gone.
 */
export function hasLiveDevmjsAncestor(pid, readCmdline, readParent) {
  const seen = new Set();
  let current = pid;
  while (current > 1 && !seen.has(current)) {
    seen.add(current);
    const args = readCmdline(current).split("\0").filter(Boolean);
    if (args.some((arg) => arg.endsWith("scripts/dev.mjs"))) return true;
    const parent = readParent(current);
    if (!parent) return false;
    current = parent;
  }
  return false;
}

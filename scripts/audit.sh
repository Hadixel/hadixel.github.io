#!/usr/bin/env bash
# One command answers every mechanical invariant that can be checked today.
#
# §12: `audit` is a leaf task and root-only. It is not a turbo task, because turbo sets the
# working directory to each package and a root-only task would be scheduled once per package
# Run it as `pnpm run audit`, not `pnpm audit` — pnpm has a built-in `audit` command (a
# vulnerability scan) that shadows the script, and the two report completely different things.
#
# §12: `audit` is a leaf task and root-only. It is not a turbo task, because turbo sets the
# working directory to each package, so a package task would run this once per package, and a
# task nobody implements exits 0 after running nothing at all. A green gate that checks nothing
# is the failure mode §16.1 warns about, so this is wired to a real command instead.
#
# Every check here prints `ok` or `FAIL` and the script exits non-zero if any failed. A check
# that cannot fail is worse than no check, so nothing here is written to be advisory: if a
# metric is not yet understood well enough to assert, it is recorded in RATCHET below as a
# number to watch, not as a gate.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

failures=0
ok()   { printf '  ok    %s\n' "$1"; }
bad()  { printf '  FAIL  %s\n' "$1"; failures=$((failures + 1)); }
head_() { printf '\n%s\n' "$1"; }

# Everything a shared config could legitimately live in. The blueprint kit under docs/blueprint
# is a foreign repo's artefacts, not this repo's source.
EXCL='-path ./node_modules -prune -o -path ./docs/blueprint -prune -o'
MANIFESTS="package.json apps/*/package.json packages/*/package.json"
TSCONFIGS="apps/*/tsconfig.json packages/*/tsconfig.json"

head_ "Boundaries"
# §18: a suppression directive is how a deviation is recorded at the violation, and §15.3 makes the
# count a ratchet — it may only fall. Asserting zero would be wrong here, not stricter: the repo
# holds one registered deviation (packages/db importing the gateway), so a zero-assertion would
# force that deviation to be recorded somewhere vaguer than the line that commits it, which is the
# drift §18 exists to prevent. Each directive must carry a reason on the same line, and that is
# checked here too, because §18 makes the reason mandatory.
n=$(grep -rn "@boundaries-ignore" --include='*.ts' --include='*.tsx' apps packages 2>/dev/null | wc -l)
[ "$n" -le 1 ] \
  && ok "import suppressions: $n, may only fall (baseline 1: packages/db importing the gateway)" \
  || bad "$n import suppressions — the baseline is 1 and may only fall; a second one needs a reason §18 can hold"
m=$(grep -rn "@boundaries-ignore" --include='*.ts' --include='*.tsx' apps packages 2>/dev/null \
      | grep -vcE '@boundaries-ignore[[:space:]]+[a-z0-9-]+[[:space:]]+-[[:space:]]+\S' || true)
[ "$m" -eq 0 ] && ok "every suppression carries a reason on the same line" \
  || bad "$m suppression(s) have no reason on the same line — §18 makes it mandatory, and a suppression with no reason cannot be re-evaluated later"

# The gateway importing the shim that forwards to the gateway is a workspace cycle, and the shim
# count below filters apps/api out — so without this the one edge that must not exist is the one
# edge nothing looks at. Both files are the gateway, so it has to be asked separately.
n=$(grep -rln "@kmodern/db" --include="*.ts" --include="*.tsx" apps/api 2>/dev/null | wc -l)
[ "$n" -eq 0 ] && ok "the gateway does not import the shim that forwards to it" \
  || bad "$n file(s) in apps/api import @kmodern/db — the shim forwards to the gateway, so that is a cycle (§2)"

head_ "Migrations"
# §8: "Two CI jobs enforce it: 1. Immutability ... 2. Drift". There is no CI in this repo yet, so
# both run here instead — a check that exists only on a future CI provider is a check that does
# not run. The drift half needs the disposable cluster and builds its own shadow database.
if bash scripts/check-migrations.sh >/tmp/migrations.out 2>&1; then
  # The script indents its own output, so it is passed through rather than re-indented.
  cat /tmp/migrations.out
else
  bad "the migration checks failed:"; sed 's/^/        /' /tmp/migrations.out >&2
fi

head_ "Data path"
# §15.1 lists "no client imports the database client, including by type-only import" as a
# MECHANICAL invariant and §4 marks that edge ❌. It is still false: the clients reach the data tier
# through a temporary forwarding package while they migrate. It is reported here as a labelled known
# violation, never as `ok` — §15.3 rule 3 says a ratchet covers counts, never a yes/no rule, and a
# boolean invariant does not become true by being counted. The gate arrives in the phase that adds
# the boundary rules; the shim and this line are deleted with it.
shim=$(grep -rln "@kmodern/db" --include="*.ts" --include="*.tsx" apps packages 2>/dev/null \
         | grep -v "^apps/api/" | wc -l)
if [ "$shim" -eq 0 ]; then
  ok "no workspace reaches the data tier through the shim"
else
  printf '  KNOWN  %s file(s) reach the data tier through the shim — a known violation of a §15.1\n' "$shim"
  printf '        invariant (§4 ❌), decreasing as resources migrate. Not a pass and not a gate until\n'
  printf '        the boundary rules land.\n'
fi

head_ "Imports"
# A relative path that does not resolve is every project's job, including the ones no typecheck
# project covers — the data scripts are deliberately outside one, and a rename there went unnoticed
# until it was read.
if node scripts/check-imports.mjs >/tmp/imports.out 2>&1; then
  ok "every relative import resolves"
else
  bad "relative imports do not resolve:"; sed 's/^/        /' /tmp/imports.out >&2
fi

head_ "Build"
n=$(find . -mindepth 2 \( -name '*lint.config.*' -o -name '.prettierrc*' -o -name 'prettier.config.*' -o -name 'biome.json*' -o -name '.editorconfig' \) \
      | grep -v node_modules | grep -v 'docs/blueprint' | wc -l)
[ "$n" -eq 0 ] && ok "no lint or formatter config outside the repo root ($n)" || bad "$n stray lint/formatter config(s) outside the root"

n=$(node -e '
const fs=require("fs"),cp=require("child_process");
const f=cp.execSync("ls package.json apps/*/package.json packages/*/package.json",{encoding:"utf8"}).trim().split("\n");
const bad=f.filter(x=>Object.keys(JSON.parse(fs.readFileSync(x,"utf8")).scripts||{}).some(k=>/^(pre|post)/.test(k)));
console.log(bad.length);
')
[ "$n" -eq 0 ] && ok "no pre/post lifecycle scripts ($n)" || bad "$n manifest(s) declare a pre/post lifecycle script — the task runner owns the graph"

for t in typescript vitest; do
  n=$(grep -l "\"$t\"" $MANIFESTS 2>/dev/null | grep -v '^package.json$' | wc -l)
  [ "$n" -eq 0 ] && ok "'$t' is declared at the root only" || bad "'$t' is also declared in $n workspace manifest(s) — one version, at the root (§6 rule 3)"
done
grep -q '"typescript"' package.json || bad "the root does not declare the compiler"
grep -qE '"typescript": "[0-9]+\.[0-9]+\.[0-9]+"' package.json \
  && ok "the compiler version is pinned exactly, not a range (§16.1 pairs it with the cruiser range)" \
  || bad "the compiler is not pinned to an exact version — §16.1 pairs the pin with the cruised-range assertion"

node -e 'const m=require("./package.json");process.exit(m.dependencies?1:0)' \
  && ok "the root manifest has no runtime dependencies" \
  || bad "the root manifest declares runtime dependencies — the root holds build tooling only (§6 rule 2)"

head_ "Structure"
n=$(grep -L '"extends"' $TSCONFIGS 2>/dev/null | wc -l)
[ "$n" -eq 0 ] && ok "every workspace tsconfig extends the shared config ($n without)" || bad "$n workspace tsconfig(s) restate compiler options instead of extending packages/config (§5.3)"

# §5.3's second half, which the check above cannot see: "Each workspace config is `extends` plus
# only what is genuinely local ... Compiler options are never redefined per workspace - change the
# base. *Prevents*: strictness drifting per app, which is how one app quietly stops being type-safe."
#
# The line above only proves `extends` is present. A file can both extend and restate, and that is
# not hypothetical: apps/api/tsconfig.json carried the two decorator flags that way while extending
# the Node flavour, and packages/transport/tsconfig.json restated `lib` while extending a flavour
# that already declared the identical array. Both are now moved to where §5.3 says a compiler option
# belongs - the service flavour and the lib flavour - so this gate checks the invariant the extends
# check describes but does not enforce.
#
# The allowlist is §5.3's own list (rootDir, paths) plus the three keys a build output needs and
# that the section does not name because it is describing the typecheck config: outDir, noEmit and
# baseUrl. They locate the output; they cannot drift strictness, which is the thing §5.3 is guarding.
#
# Three exclusions, each deliberate rather than convenient: `packages/config/tsconfig.*.json` are the
# flavours themselves and are what the rule points *at*, not subject to it; `*.tsbuildinfo` is build
# output that happens to be named after a tsconfig; and `apps/api/tsconfig.build.json` is exempted by
# name under DEVIATION-REGISTER row 8 - its module/moduleResolution/lib/types/decorator overrides are
# forced by NestJS DI reading design:paramtypes and by Prisma's extensionless imports needing
# CommonJS, and folding them into a flavour would hand the gateway `module: ESNext` and inject
# undefined into every constructor on boot.
n=$(node -e '
const fs = require("fs"), path = require("path");
const allow = new Set(["rootDir", "outDir", "noEmit", "baseUrl", "paths"]);
const exempt = new Set(["tsconfig.build.json"]);
const files = [];
for (const g of ["apps", "packages"]) {
  for (const w of fs.readdirSync(g, { withFileTypes: true }).filter((d) => d.isDirectory())) {
    if (g === "packages" && w.name === "config") continue;
    for (const f of fs.readdirSync(path.join(g, w.name))) {
      if (/^tsconfig(\..+)?\.json$/.test(f)) files.push(path.join(g, w.name, f));
    }
  }
}
const offenders = [];
for (const f of files.sort()) {
  if (exempt.has(path.basename(f))) continue;
  const raw = fs.readFileSync(f, "utf8").replace(/^\s*\/\/.*$/gm, "");
  let c;
  try { c = JSON.parse(raw.replace(/,\s*([\]}])/g, "$1")); }
  catch (e) { offenders.push(`${f}: does not parse (${e.message})`); continue; }
  const bad = Object.keys(c.compilerOptions || {}).filter((k) => !allow.has(k));
  if (bad.length) offenders.push(`${f}: ${bad.join(", ")}`);
}
if (offenders.length) console.error(offenders.join("\n"));
console.log(offenders.length);
')
if [ "$n" -eq 0 ]; then
  ok "no workspace redefines a compiler option (§5.3: change the base, not the workspace)"
else
  bad "$n workspace config(s) redefine a compiler option — §5.3 says 'Compiler options are never redefined per workspace - change the base'; move it to packages/config, or exempt it by name in DEVIATION-REGISTER"
fi

n=$(ls .env.example apps/*/.env.example 2>/dev/null | wc -l)
[ "$n" -ge 4 ] && ok "an example environment file per surface, the root and all three apps ($n)" \
  || bad "expected an example environment file at the root and in each of the three apps, found $n — every variable and its tier must be documented (§12)"

# §12's tier line, enforced as a boolean rather than counted: `apps/api/.env.example` says of
# DATABASE_URL "Read at runtime, never at build" and the root says "Must never be available at build
# time". The incident that motivated both lines was a `loadDotenv()` call in a next.config.ts
# reaching the database URL into build time; until now nothing stopped it coming back, because the
# two .env.example files are documentation and documentation does not fail a command.
#
# Written as an explicit list of the forms it will not permit, not a "no dotenv in a config" phrasing:
# `require("dotenv")`, `dotenv/config`, `@next/env` and `loadDotenv(` each name a different API, and
# one missing from the list is one that silently reintroduces the bug. The gateway's own dotenv
# imports — `apps/api/prisma.config.ts` and `apps/api/seed/*.ts` — are deliberately out of scope:
# those run as Node CLIs under the runtime tier, not during a Next.js build.
n=$(grep -lE 'dotenv|@next/env|loadDotenv\(' apps/*/next.config.* 2>/dev/null | wc -l)
if [ "$n" -eq 0 ]; then
  ok "no next.config loads an environment file at build time (§12: DATABASE_URL never at build)"
else
  bad "$n next.config file(s) load an environment file — §12 tiers DATABASE_URL to runtime only, and a config that reads .env at build makes it build-time"
fi

# Blueprint §12 puts the audit scripts' own tests before every other tool, so a broken check is
# reported before a broken tree is blamed on it. This repo ran no `scripts/*.test.js` at all until
# the structure gates landed — four suites, 69 assertions, now first in the section that owns them.
# Gated on the runner's exit code, not on its summary text: a check that greps for the word "pass"
# in a report it does not own is a check that reports whatever the report says.
if out=$(node --test scripts/*.test.js 2>&1); then
  ok "the audit scripts' own tests pass ($(printf '%s' "$out" | grep -c '^✔ ' || true) assertions)"
else
  bad "the audit scripts' own tests fail:"; printf '%s\n' "$out" | sed 's/^/        /' >&2
fi

if out=$(node scripts/audit-client-structure.js 2>&1); then
  # Each script's own success line already names itself, so the message is the output verbatim.
  ok "$out"
else
  bad "the client structure gate failed:"; printf '%s\n' "$out" | sed 's/^/        /' >&2
fi

if out=$(node scripts/audit-app-root.js 2>&1); then
  ok "$out"
else
  bad "the app-root gate failed:"; printf '%s\n' "$out" | sed 's/^/        /' >&2
fi

if out=$(node scripts/audit-structure.js 2>&1); then
  ok "$out"
else
  bad "the gateway structure gate failed:"; printf '%s\n' "$out" | sed 's/^/        /' >&2
fi

head_ "Data tier"
# §8 / §15.1: "re-export the generated client through one index. No other file imports a
# generated/ path." P4b made that true, and this section is the half of the check a cruise cannot
# do: `*.test.ts` and `*.spec.ts` are excluded from the dependency graph (§16.1), so a test naming a
# generated path is invisible to `.dependency-cruiser.js` and visible to this grep.
#
# Both counts below are booleans, not ratchets: §15.1 states them as yes/no, and §15.3 rule 3 says
# a ratchet covers counts that may legitimately be non-zero. The failure branch is what ticket 19
# cleared — until the data tier had one index, it printed a labelled KNOWN with an owner and the
# audit exited 1 on that line alone, which is the honest form of a boolean that is not yet true.
n=$(grep -rln "generated/prisma" --include="*.ts" --include="*.tsx" apps packages 2>/dev/null \
      | grep -v "^apps/api/src/" | wc -l)
if [ "$n" -eq 0 ]; then
  ok "nothing outside the data tier reaches into generated/"
else
  printf '  KNOWN  %s file(s) outside apps/api/src name a generated/ path — a §15.1 invariant (§8).\n' "$n"
  printf '        Exactly one file may: apps/api/src/prisma/index.ts. Route yours through it — the\n'
  printf '        dependency-cruiser rule generated-prisma-outside-data-client-index rejects the rest.\n'
  failures=$((failures + 1))
fi

# And inside the gateway, asserted rather than reported: one file, and it is the index. This used
# to print a count with a note about the client wrapper and the lifecycle module, because both
# reached `generated/` too; ticket 19 merged the wrapper into the index and §8 does not ask for a
# lifecycle alias, so the number is now a rule.
m=$(grep -rln "generated/prisma" --include="*.ts" apps/api/src 2>/dev/null | grep -v "/generated/" | wc -l)
if [ "$m" -eq 1 ]; then
  ok "exactly one file in the gateway names a generated path (src/prisma/index.ts)"
else
  bad "$m files in apps/api/src name a generated/ path — §15.1 allows exactly one, and it is src/prisma/index.ts"
fi

head_ "Ratchet metrics (gated separately: ratchet.json + scripts/audit-ratchet.mjs)"
printf '  %-22s store %s   admin %s\n' "colour literals" \
  "$(grep -rEoh '#[0-9a-fA-F]{3,8}' --include='*.ts' --include='*.tsx' apps/store/src | wc -l)" \
  "$(grep -rEoh '#[0-9a-fA-F]{3,8}' --include='*.ts' --include='*.tsx' apps/admin/src | wc -l)"
printf '  %-22s %s\n' "flat dto files" "$(find apps packages -name '*.dto.ts' -not -path '*/node_modules/*' | wc -l)"
printf '  %-22s %s\n' "flat exception files" "$(find apps packages -name '*.exception.ts' -not -path '*/node_modules/*' | wc -l)"

# Each of the four below is a gate that has already failed at least once while it was being built,
# which is the only way to tell one from a tick that prints itself. Their output goes to the
# reader's screen first and the failure is counted on its own line after, so a green run still shows
# what was examined and a red one names the tool that objected.
head_ "Architecture (dependency-cruiser)"
if out=$(node scripts/audit-depcruise.mjs 2>&1); then
  printf '%s\n' "$out" | sed 's/^/  /'
  ok "every depcruise rule holds ($(printf '%s' "$out" | tail -1))"
else
  printf '%s\n' "$out" >&2
  bad "dependency-cruiser reported an error (see the lines above)"
fi

head_ "Workspace boundaries (turbo boundaries)"
if out=$(npx turbo boundaries 2>&1); then
  ok "$(printf '%s' "$out" | tail -1)"
else
  printf '%s\n' "$out" >&2
  bad "turbo boundaries reported an edge the declared ranks do not allow"
fi

head_ "Manifests (manypkg)"
if out=$(npx manypkg check 2>&1); then
  ok "workspace manifests are consistent"
else
  printf '%s\n' "$out" >&2
  bad "manypkg check reported a manifest problem"
fi

head_ "Ratchet"
if out=$(node scripts/audit-ratchet.mjs 2>&1); then
  printf '%s\n' "$out" | sed 's/^/  /'
  ok "no metric above its seed"
else
  printf '%s\n' "$out" >&2
  bad "a ratchet metric rose above its seed (see the lines above)"
fi

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'audit: all checks passed\n'
  exit 0
fi
printf 'audit: %d check(s) failed\n' "$failures"
exit 1

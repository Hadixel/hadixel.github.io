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

n=$(ls .env.example apps/*/.env.example 2>/dev/null | wc -l)
[ "$n" -ge 4 ] && ok "an example environment file per surface, the root and all three apps ($n)" \
  || bad "expected an example environment file at the root and in each of the three apps, found $n — every variable and its tier must be documented (§12)"

head_ "Data tier"
# §8 / §15.1: "re-export the generated client through one index. No other file imports a
# generated/ path." The rule protects against a consumer reaching past the index, so that is what
# is checked — no file outside the data tier may name a generated path. Inside the data tier the
# index and the client wrapper both legitimately do, and the count is reported rather than
# asserted, because a data tier with a lifecycle module cannot have exactly one.
n=$(grep -rln "generated/prisma" --include="*.ts" --include="*.tsx" apps packages 2>/dev/null \
      | grep -v "^apps/api/src/" | wc -l)
[ "$n" -eq 0 ] \
  && ok "nothing outside the data tier reaches into generated/" \
  || bad "$n file(s) outside the data tier import a generated/ path — go through the index (§8)"
m=$(grep -rln "generated/prisma" --include="*.ts" apps/api/src 2>/dev/null | grep -v "/generated/" | wc -l)
printf '  %-22s %s in-package (index + client wrapper + the lifecycle, which the index\n' "generated/ namers" "$m"
printf '  %-22s   re-exports and so cannot import through it; each says why at the import)\n' ""

head_ "Ratchet (observed, not yet a gate — seeds for the ratchet file)"
printf '  %-22s store %s   admin %s\n' "colour literals" \
  "$(grep -rEoh '#[0-9a-fA-F]{3,8}' --include='*.ts' --include='*.tsx' apps/store/src | wc -l)" \
  "$(grep -rEoh '#[0-9a-fA-F]{3,8}' --include='*.ts' --include='*.tsx' apps/admin/src | wc -l)"
printf '  %-22s %s\n' "flat dto files" "$(find apps packages -name '*.dto.ts' -not -path '*/node_modules/*' | wc -l)"
printf '  %-22s %s\n' "flat exception files" "$(find apps packages -name '*.exception.ts' -not -path '*/node_modules/*' | wc -l)"

printf '\n'
if [ "$failures" -eq 0 ]; then
  printf 'audit: all checks passed\n'
  exit 0
fi
printf 'audit: %d check(s) failed\n' "$failures"
exit 1

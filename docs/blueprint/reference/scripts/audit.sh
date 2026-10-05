#!/usr/bin/env bash
set -euo pipefail

node --test scripts/*.test.js
node scripts/audit-dependency-cruiser.js
node scripts/audit-app-root.js
node scripts/audit-structure.js
node scripts/audit-client-structure.js
node scripts/audit-server-actions.js
node scripts/audit-table-boundary.js
node scripts/audit-docs-index.js
node scripts/audit-no-prose-em-dash.js
node_modules/.bin/turbo boundaries
node_modules/.bin/manypkg check
node scripts/ratchet.mjs

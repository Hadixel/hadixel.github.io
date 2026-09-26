# 19: One generated-client index

**What to build:** the generated database client is reached through exactly one index, so changing the object-relational mapper, the generator version or the output path is a one-file edit. Two modules currently reach into the generated output directly.

**Blocked by:** 17.

**Status:** ready-for-agent

- [ ] The generated client, its enumerations and its namespace are re-exported by exactly one index in the data tier
- [ ] No other file in the gateway imports the generated output by path
- [ ] The gate rule for this is raised from a warning to an error, so a second entry point cannot appear
- [ ] A test proves it: adding a second direct import of the generated output is rejected
- [ ] The packages that ship source rather than build output are identified, and the gateway stops depending on source being transpiled by its consumers

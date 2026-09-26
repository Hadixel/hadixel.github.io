# 20: The gateway's directory shape

**What to build:** the gateway's source root holds only its two entry files, every top-level directory is recognisable for the kind of thing it holds, and a request contract or a business exception exists in its own place from the very first one. The four archetypes get named and added to the lists the boundary rules read, so the shape is enforced by the graph rather than by memory.

**Blocked by:** 19.

**Status:** ready-for-agent

- [ ] The gateway's source root holds only the composition entry point and the app module
- [ ] Every top-level directory is assigned one of the four archetypes, and the assignment is recorded where the boundary rules read it
- [ ] A feature directory holds exactly one of each file kind, so a request contract, a set of exceptions and a module cannot sit side by side unlabelled
- [ ] Every request contract lives in its own directory within its feature, and every business exception in its own directory within its feature
- [ ] Pure utility modules hold no class, no framework decorator and no dependency injection, and a file that acquires any of the three is moved or reclassified
- [ ] Infrastructure modules depend on features; features never import infrastructure directly
- [ ] A feature directory that grew past a readable size is split, and the component the admin panel uses to run the scraper — nearly fifteen hundred lines with forty-five pieces of state in one function — becomes a state hook, a transport module and rendering components
- [ ] The page-builder block component, which renders twenty block types inline, has each block type in its own unit
- [ ] The metrics for the request-contract and exception directories are alive, and the gate rejects a flat one

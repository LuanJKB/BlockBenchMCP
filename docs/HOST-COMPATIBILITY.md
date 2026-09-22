# Blockbench host compatibility gate

Observed 2026-09-22, Blockbench Desktop 5.1.6. Evidence source: installed resources/app.asar, dist/bundle.js plugin module loader and filesystem wrapper. The wrapper lacks realpathSync, lstatSync, openSync, closeSync and constants; fs and node:fs share it. Broad fs permission does not add these methods. Native Node mocks had not represented this constraint.

## Required implementation decision

The hardened plugin needs these primitives to satisfy the original plan. Merely skipping them breaks its security requirements. The current build fails closed, which is a temporary safe state, not completion or functional equivalence.

A host-side patch would need to:

1. Expose realpathSync and lstatSync through the existing permission-scoped filesystem wrapper, validating path scope on every call.
2. Expose only the required open flags and safe open/close operations. Track each returned descriptor per wrapper instance; allow descriptor writes/close only for descriptors owned by that instance. Never permit arbitrary descriptors to bypass scope.
3. Check canonical containment, including symlink/junction behavior, for host-owned path operations; retain the native permission dialog and avoid broad automatic permissions.
4. Test denied permissions, outside paths, descriptor forgery/reuse, symlink/junction escapes and positive in-scope reads/writes on Windows and Linux.
5. Preserve existing callers and do not expose process, shell execution, arbitrary JS or unrestricted filesystem through MCP.

This changes the Blockbench host rather than only SwagRee/BlockBenchMCP and therefore expands the requested repository scope. No host patch or installation has been made. The installed app and its permission configuration were not modified. An alternative is a host release proven to expose equivalent scoped APIs; no such release has been verified yet.

After the host decision, repeat the complete live file-I/O/visual gates, not just unit tests. Screenshot framing is independently unresolved; retain evidence and compare with upstream before changing modeling code.
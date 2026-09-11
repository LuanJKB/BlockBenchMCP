# Security model and threat boundaries

This is an unofficial security-only fork of SwagRee/BlockBenchMCP, based on b99e581d48f997d3763e827aef34eede0456574b (0.6.2). The MIT license and upstream history are preserved.

## Protections

- The TCP listener always binds to 127.0.0.1. Host must match localhost or 127.0.0.1 and the active port; peer address must be loopback. No public bind configuration exists.
- A first-install or legacy public token is replaced using node:crypto randomBytes(32). Tokens persist only in local Blockbench settings. Comparison uses timingSafeEqual with byte-length validation; crypto permission failure denies authentication. No fallback PRNG or comparison is used.
- Regenerate MCP Token updates the running handle immediately. Requests authenticated before rotation may finish; all subsequent requests require the new token. Update clients after rotation. The token appears only in its explicit UI dialog/settings, not ordinary logs.
- Origin headers are denied by default, including empty and null Origin and hostile OPTIONS. Internal allowedOrigins supports exact opt-in only, never wildcard; matched responses use Vary: Origin. It is not exposed as a new MCP tool or enabled by default.
- All HTTP endpoints require authentication except validated OPTIONS preflight. The upstream X-Mcp-Secret header remains supported when Authorization is absent, with the same comparison and network guards.
- Disk access requires a human-confirmed existing directory. Approval records its canonical physical path and lasts only until stop, restart, unload, reload or process exit. Approve only a dedicated directory such as <mod-project>/blockbench-work/.
- Read/write/save/export/PNG I/O share resolveScopedPath. Logical and physical containment use path.relative; every existing component is canonicalized. External symlink/junction paths, dangling redirects, drive/UNC/device aliases, alternate streams and ambiguous trailing-dot/space names fail closed. A replaced root that resolves elsewhere is denied.
- New parents are created one component at a time after validation. Parent and target are revalidated after codec compilation and immediately before opening. Exclusive creation (O_EXCL) protects overwrite:false atomically; O_NOFOLLOW is used where available. All file descriptors are closed.
- Autostart defaults to false; explicit existing opt-in is respected. First-install confirmation remains. Tools and all 59 input schemas match the frozen upstream snapshot.
- The upstream 8 MiB per-connection request cap and timeout remain. Duplicate headers, ambiguous lengths and Transfer-Encoding are denied; each connection dispatches at most once.

## Threat model

Protects against arbitrary web pages calling local MCP, unapproved paths, traversal, absolute escapes, known symlink/junction escapes, public default tokens, reuse of old scope approval, and accidental overwrites.

Does not protect against malware running as the user, full control of the computer, compromised Blockbench, malicious other plugins, or an agent with unrestricted access through other tools. This is not an OS sandbox.

## Remaining limitations

Portable Node APIs cannot atomically pin every ancestor directory across validation and I/O. A hostile same-user process can still race ancestor replacement after the final validation; Windows has no portable O_NOFOLLOW equivalent. Hard links and directory replacement at the same canonical pathname are outside the physical-path boundary guarantee. Do not approve directories actively controlled by hostile local processes. Approval does not prevent other tools from accessing the machine.

There is no global request rate/concurrency limiter; batches retain upstream semantics. The per-connection resource cap does not eliminate a same-user denial of service. Stopped connections cannot execute further commands, but already authenticated in-flight modeling operations may finish.

Relative paths remain rejected, preserving the upstream absolute-path contract. UNC and device paths are deliberately unsupported in this local-only fork, even if they might point inside an approved root. Symlinks pointing to existing locations inside the approved root remain usable.

## Verification and release gates

Run npm ci, npm run typecheck, npm test, npm run test:security, npm run build. CI repeats these on Node 22, Ubuntu and Windows. Filesystem fixtures on Windows live only inside C:\MinecraftDev\BlockBenchMCP-Test; Unix CI uses /tmp/BlockBenchMCP-Test. Test-generated human confirmations are mocks and never approve the live Blockbench instance.

Live E2E, visual comparison and live negative tests are mandatory before claiming release readiness. Loading the plugin and approving the test folder require the user's explicit manual confirmation. See docs/VALIDATION.md for actual gate status.

## Upstream maintenance

Fetch upstream and integrate on sync/upstream-<version> first. Review changes to HTTP/auth/filesystem/scope/config manually, then rerun unit/security tests, both CI platforms, build and live E2E. Never blindly refresh the API snapshot or bypass failing security gates.

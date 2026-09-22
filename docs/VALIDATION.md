# Validation status — 2026-09-11

Not release-ready until live Blockbench acceptance completes.

Baseline: b99e581d48f997d3763e827aef34eede0456574b / 0.6.2. All four baseline commands passed (69 tests) in an unmodified detached worktree.

## Automated gates

Final hardened results and checksum are recorded after the clean pipeline. The security suite exercises auth/rotation, origins/preflight, Host/remote address, framing/resource limits, the frozen 59-tool API snapshot, human approval/revocation, disk operations/overwrite, traversal/platform paths, real junctions, dangling redirects and codec-time path changes, plus PNG disk routing. Windows junction tests must run rather than silently skip.

## Live acceptance — pending user action

1. User loads packages/plugin/dist/blockbench_mcp.js into Blockbench Desktop and confirms necessary permissions, on a disposable project. Do not start destructive E2E until confirmed.
2. Verify autostart behavior, start MCP explicitly, and retrieve token locally without writing it into repository/logs.
3. Run real modeling smoke: health, create_project(java_block), apply_geometry_batch, check_model, UV tools, texture tools/audits, capture_views.
4. Request live scope approval, pause for user to approve only C:\MinecraftDev\BlockBenchMCP-Test, then save_project, export_model and PNG I/O.
5. Reopen .bbmodel, check editability, JSON and textures, compare views and repeat model audits.
6. Negative live tests: wrong bearer, unknown Origin, no scope, traversal, external path, disposable junction escape and overwrite without true. Stop/restart must revoke approval; token rotation must invalidate old token.
7. Record actual results, final SHA-256 and any remaining limitations before release.

No live E2E or visual functionality is claimed from mocked tests. No scope was approved in the actual Blockbench instance by this agent.

## Automated results recorded

Windows local: npm ci, typecheck, all 86 tests, explicit 15 security tests, build PASS. CI Node 22 Windows/Ubuntu PASS: https://github.com/LuanJKB/BlockBenchMCP/actions/runs/34606213771 . No security test skipped. Candidate SHA-256: 7885a1c560cce50a9e462de5503cfa94d3c431b7d4e98c0bcd08846c380a70b9. Full inventory and gate details: HARDENING-REPORT.md. Live acceptance remains pending.

## Live validation update — settings persistence correction

The user confirmed the plugin loaded and the MCP ready message appeared. Five live negative checks passed on the previous candidate: missing token 401, wrong token 401, hostile Origin 403, hostile OPTIONS 403 and foreign Host 403, all without permissive CORS.

Authenticated live testing uncovered a registration defect inherited from upstream: Settings.add does not exist in the declared Blockbench 5.1 Setting API, so the server could generate a token without registering/persisting a user-visible setting. The local ambient declaration and mocks incorrectly represented this API. Corrected config.ts to use new Setting (restoring stored values before migration), Settings.saveLocalStorages, and fail closed if the token setting is missing. Corrected types/blockbench-ambient.d.ts and startup mocks; added a regression for native registration, restoration, defaults and rotation persistence. No modeling changes.

Updated candidate: typecheck PASS; npm test PASS (37 shared + 50 plugin = 87); test:security PASS (16); build PASS. SHA-256: f28bd48c83b02d96fc5a2b07c2fad9a14157e6dc9861b769a10518deec3f3c96. This supersedes the earlier candidate checksum and counts; earlier CI links validate the earlier code only. Additional changed file: packages/plugin/src/types/blockbench-ambient.d.ts (correct native Setting/Settings declarations).

Next required action: user reloads the corrected bundle from the same path and starts MCP again, then confirms readiness. The user explicitly authorized reading only the plugin mcp_secret from Blockbench storage and using it in memory without printing or storing it elsewhere; that authorization remains in effect. Live scope approval is still pending and must be performed by the user for C:\MinecraftDev\BlockBenchMCP-Test only. Authenticated modeling, save/export, visual/editability and lifecycle live tests remain pending.
## Live gate update — 2026-09-22 (current status)

Authenticated live smoke passed on Blockbench 5.1.6: health; disposable java_block project; geometry batch; texture creation; UV packing; pixel painting/readback; UV inspection; texture audit; model audit with 0 errors/0 warnings; capture API; and project summary. Save/export/PNG import/export without scope were denied. Evidence: docs/evidence/2026-09-22/smoke-results.json. PNGs remain in C:\MinecraftDev\BlockBenchMCP-Test\live-validation.

IMPORTANT: capture API success does not imply visual acceptance. Inspection of before/after north and iso screenshots shows the model clipped/off-center; visible paint changed, but framing/visual acceptance is unresolved. No modeling/preview code was changed by hardening. This must be compared with baseline and resolved before final acceptance.

Scope approval failed before human confirmation. Static inspection of the installed Blockbench app.asar dist/bundle.js proves its plugin fs wrapper exposes stat/read/write/mkdir but omits realpathSync, lstatSync, openSync, closeSync and constants. node:fs uses the same wrapper. The directory exists. Raw Node filesystem tests do not prove compatibility with that wrapper. Do not bypass the host through process, alternate module loading or arbitrary execution, and do not replace canonical checks with string-only checks.

Added an explicit incompatible-host error and a regression proving restricted fs fails closed without writes or a false approval dialog. Current local gates: typecheck PASS, 88 tests PASS (37 shared + 51 plugin), build PASS. Current candidate SHA-256: 44450b6297cbffcf2f00963dbb867f1e1151aead03b2a9f49394d7627c098124. The running Blockbench still has the prior loaded build; no claim is made that the new message was live-verified.

NEXT: decision required on expanding scope to a minimal Blockbench host API compatibility patch or using a verified compatible host. See HOST-COMPATIBILITY.md. Scope, positive file I/O, save/reopen/editability, live junction/traversal/overwrite and lifecycle tests remain incomplete. PR stays draft. The full original goal is NOT achieved.
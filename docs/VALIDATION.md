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

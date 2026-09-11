# Upstream baseline

- Upstream: https://github.com/SwagRee/BlockBenchMCP
- Commit: b99e581d48f997d3763e827aef34eede0456574b
- Version / latest baseline tag: 0.6.2 / v0.6.2
- Local tag: upstream-baseline-v0.6.2
- Node: >=22; Blockbench: >=5.1.0; npm workspaces: packages/*.
- Fork: https://github.com/LuanJKB/BlockBenchMCP
- Branch: hardening/security-v1

Verified 2026-09-11 on Windows with Node 24.18.0 / npm 11.16.0 in an isolated unmodified baseline worktree. npm ci, npm run typecheck, npm test (37 shared + 32 plugin tests), npm run build all passed. Bundle: packages/plugin/dist/blockbench_mcp.js.

The previous agent had already committed the audit and baseline tag and left seven modified files without security tests. This continuation preserved that work, verified the original baseline independently before further edits, and corrected remaining security gaps. No upstream modeling changes are required.

npm ci reported 1 low and 3 high dependency findings, to be reviewed separately before release. Live baseline was not loaded into Blockbench.

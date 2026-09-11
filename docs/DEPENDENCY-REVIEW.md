# Dependency review — 2026-09-11

npm audit reports 4 findings: 3 high, 1 low. npm audit --omit=dev reports zero findings. No mass upgrade was performed.

| Package | Finding | Runtime assessment |
|---|---|---|
| electron 40.10.6 | GHSA-9f4c-93c8-jc8g, sandbox iframe popup bypass, high | Transitive development dependency of blockbench-types 5.1.0. Never imported or bundled by plugin; does not control the separately installed Blockbench Electron runtime. |
| nanoid 3.3.17 | GHSA-2v37-7h3g-55p8, zero-size custom generator loop, high | Transitive dev-only vue compiler/postcss dependency; plugin has no import or custom-generator call. |
| vue 2.7.14 | GHSA-5j4c-8p2g-v4jx, parseHTML ReDoS, low | Dev-only type package dependency; plugin does not import its HTML parser. |
| blockbench-types 5.1.0 | high aggregate via electron/vue | Types used for compile-time Blockbench API. Proposed audit fix downgrades to 5.0.6, incompatible with the declared 5.1 baseline requirement; not applied. |

These findings remain in the development dependency tree and must be reconsidered if imports/build execution change. They do not indicate a clean development supply chain. The final bundler metadata is checked to exclude electron, vue, nanoid and blockbench-types runtime code. The installed Blockbench application has its own update/security responsibility.

# Hardened fork — relatório de progresso e handoff

Status: implementação e gates automatizados concluídos; **fase 14 aguardando carregamento manual no Blockbench**. Não é uma release aprovada. Não houve live E2E, aprovação de scope real, merge ou publicação de release.

## Upstream baseline

SwagRee/BlockBenchMCP, SHA b99e581d48f997d3763e827aef34eede0456574b, versão/tag 0.6.2/v0.6.2. Node mínimo 22, Blockbench mínimo 5.1.0, npm workspaces packages/*. Baseline puro passou npm ci/typecheck/test/build (69 testes) em worktree isolado.

Fork: https://github.com/LuanJKB/BlockBenchMCP
Branch: hardening/security-v1
PR em rascunho: https://github.com/LuanJKB/BlockBenchMCP/pull/1
Diretório: C:\MinecraftDev\Repositories\BlockBenchMCP

## Changes

- Token aleatório de 256 bits exclusivamente node:crypto, migração do default público, persistência local e ação de regeneração com invalidação imediata para novas chamadas.
- timingSafeEqual, validação de Bearer, autenticação em health/GET/DELETE além de POST. Header legado X-Mcp-Secret preservado sem contornar Authorization inválido.
- Bind fixo 127.0.0.1, validação de Host/porta e peer loopback, Origin negado por padrão e OPTIONS sem bypass. Opt-in interno permite somente origens exatas.
- Parser mantém 8 MiB/timeout, rejeita framing ambíguo e executa uma chamada por conexão.
- Scope humano canônico e temporário, realpath/lstat por componentes, bloqueio de junction/symlink externo ou dangling, aliases de device/UNC/ADS e traversal. Revalidação após codec e antes da escrita. O_EXCL evita sobrescrita acidental; O_NOFOLLOW onde disponível.
- Autostart false por padrão; lifecycle e rotação cobertos por testes. Nenhuma alteração em geometria, UV, texturing ou animation; todas as 59 tools e schemas públicos permanecem iguais.
- CI Windows/Ubuntu, documentação de ameaça e dependências, versão 0.6.2-hardened.1. Nenhuma nova dependência runtime.

## Files changed

Lista exata em relação ao baseline, incluindo o relatório:

| Arquivo | Motivo |
|---|---|
| .github/workflows/security.yml | Windows/Ubuntu Node 22 security gates |
| README.md | Security documentation, provenance, audit or validation evidence |
| SECURITY.md | Security documentation, provenance, audit or validation evidence |
| docs/DEPENDENCY-REVIEW.md | Security documentation, provenance, audit or validation evidence |
| docs/HARDENING-REPORT.md | Security documentation, provenance, audit or validation evidence |
| docs/README.zh-CN.md | Security documentation, provenance, audit or validation evidence |
| docs/SECURITY-AUDIT.md | Security documentation, provenance, audit or validation evidence |
| docs/UPSTREAM-BASELINE.md | Security documentation, provenance, audit or validation evidence |
| docs/VALIDATION.md | Security documentation, provenance, audit or validation evidence |
| package-lock.json | Candidate version metadata and security script registration |
| package.json | Candidate version metadata and security script registration |
| packages/plugin/package.json | Candidate version metadata and security script registration |
| packages/plugin/src/commands/scope-export.ts | Central canonical filesystem boundary and protected writes |
| packages/plugin/src/config.ts | Secure token generation, persistence and opt-in autostart |
| packages/plugin/src/main.ts | Wire rotation and revoke scope on lifecycle transitions |
| packages/plugin/src/mcp/actions.ts | HTTP authentication, network policy, rotation and resource guards |
| packages/plugin/src/mcp/http-server.ts | HTTP authentication, network policy, rotation and resource guards |
| packages/plugin/src/mcp/net.ts | HTTP authentication, network policy, rotation and resource guards |
| packages/plugin/src/mcp/server.ts | HTTP authentication, network policy, rotation and resource guards |
| packages/plugin/tests/bedrock-host.test.mjs | Regression coverage and frozen upstream API schemas |
| packages/plugin/tests/security.test.mjs | Regression coverage and frozen upstream API schemas |
| packages/plugin/tests/startup.test.mjs | Regression coverage and frozen upstream API schemas |
| packages/plugin/tests/upstream-tools.json | Regression coverage and frozen upstream API schemas |
| packages/shared/package.json | Candidate version metadata and security script registration |
| packages/shared/src/index.ts | Candidate version metadata and security script registration |
| skills/blockbench-pixel-art/openai/scripts/blockbench_mcp.py | Remove public fallback; authenticate health using environment token |

## Security tests

Cada teste abaixo passou no Windows local e na CI Windows/Ubuntu (junction no Windows, symlink no Linux), sem skips:

- PASS — random token is 256 bits, unique, persisted, migrates public default, autostart opt-in
- PASS — HTTP authentication, strict Bearer format, legacy header, health and token rotation
- PASS — Origin deny default, hostile OPTIONS, exact opt-in and no wildcard CORS
- PASS — loopback-only bind, Host port and remote address validation, stopped requests fail
- PASS — HTTP framing rejects duplicate security headers, transfer encoding, invalid lengths and over-limit bodies
- PASS — public MCP tools and all input schemas exactly match frozen upstream snapshot
- PASS — human confirmation, canonical root, decline, file instead of directory, and revocation
- PASS — normal reads, nested new writes, save/export, overwrite is explicit
- PASS — traversal, external absolute, other drive, UNC, prefix confusion, mixed separators and device aliases denied
- PASS — real junction/symlink escapes and new descendants denied across disk operations
- PASS — dangling junction/symlink cannot create an outside target
- PASS — scope root replaced by a junction is denied, codec-time redirect and revocation are revalidated
- PASS — no scope denies read/write/save/export and PNG import; PNG escape is rejected before decode
- PASS — Windows case-insensitive physical paths and in-scope junction preserve legitimate I/O
- PASS — real TCP transport on loopback enforces auth, origin, rotation and stop

Além desses 15 testes de segurança, dois testes de startup novos verificam a ação real de regeneração conectada ao handle e revogação por Stop/unload/reload. Os mocks anteriores foram atualizados apenas para representar crypto e fs nativos. Fixtures de filesystem são descartáveis dentro de C:\MinecraftDev\BlockBenchMCP-Test. Testes não concederam permissões na instância real do Blockbench.

## Functional regression tests

npm ci PASS; npm run typecheck PASS; npm test PASS (37 shared + 49 plugin = 86); npm run test:security PASS (15, também incluídos em npm test); npm run build PASS. O pipeline foi executado em Windows local Node 24.18.0/npm 11.16.0 e CI Node 22 em Windows/Ubuntu.

CI validada do código: https://github.com/LuanJKB/BlockBenchMCP/actions/runs/34606213771 — success em ambas as plataformas.

Contratos/workflows mocked upstream preservados: criação Bedrock, undo, transforms/grupos, framing/captura, codecs, schemas de geometria/UV/textura/animação e startup. API inteira comparada ao snapshot capturado diretamente do baseline. **Workflows visuais reais e editabilidade ainda não confirmados.**

npm audit: 3 high + 1 low no desenvolvimento; npm audit --omit=dev: zero. Revisão em DEPENDENCY-REVIEW.md. Metadados de build (123 inputs) confirmam ausência de electron/vue/nanoid/blockbench-types no runtime do bundle.

## Remaining risks

Races de substituição de ancestrais após a última verificação não são elimináveis portavelmente; hard links e substituição no mesmo pathname não equivalem a sandbox do SO. Malware/mesmo usuário com acesso irrestrito, Blockbench comprometido e outros plugins não são cobertos. Não há limitador global de concorrência; requests já autenticados podem terminar após stop/rotação. Quatro findings dev-only permanecem documentados. Aceitação live ainda obrigatória.

## Deviations

- O trabalho anterior não tinha evidência suficiente dos gates; baseline foi reproduzido em worktree isolado antes de novas alterações.
- Paths relativos continuam rejeitados conforme contrato upstream; testes usam caminhos absolutos dentro do scope. UNC/device/ADS e nomes ambíguos foram explicitamente bloqueados por segurança.
- O header legado foi preservado por compatibilidade, com as mesmas verificações. Health agora exige token; helper Python foi ajustado.
- Sem rate limiter adicional, conforme opção do plano, para não alterar batches.
- Sem upgrades de dependências dev em massa, conforme instrução de avaliar impacto real.
- Testes Linux usam /tmp/BlockBenchMCP-Test porque o caminho Windows não existe na plataforma. Testes Windows usam o diretório prescrito.
- Entrega em PR draft/candidato até a confirmação humana e live E2E; nenhuma etapa live foi substituída por unit tests.

## Release artifact

Candidato 0.6.2-hardened.1:

- Nome: blockbench_mcp.js
- Local: C:\MinecraftDev\Repositories\BlockBenchMCP\packages\plugin\dist\blockbench_mcp.js
- SHA-256: 7885a1c560cce50a9e462de5503cfa94d3c431b7d4e98c0bcd08846c380a70b9
- Bundle gerado limpo e ignorado pelo Git conforme upstream; não publicado como release.

## Próximo passo obrigatório

O usuário deve abrir Blockbench Desktop com um projeto descartável e carregar este bundle via File → Plugins → Load Plugin from File. Confirmar apenas permissões necessárias (crypto, rede e fs/path quando solicitado). Confirmar nome/versão do plugin e avisar se aparece alguma mensagem de erro. Não aprovar scope automaticamente.

Depois da confirmação de carregamento, continuar a fase 14 e smoke/negativos das fases 27–28 do plano original. A aprovação humana de C:\MinecraftDev\BlockBenchMCP-Test é outra pausa obrigatória. Após os testes reais, atualizar este relatório, checksum se o bundle mudar, e concluir a revisão do PR.

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
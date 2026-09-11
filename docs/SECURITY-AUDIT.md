# Auditoria de Segurança — BlockBenchMCP Hardened Fork

Audit realizado na baseline upstream `b99e581d48f997d3763e827aef34eede0456574b` (v0.6.2).

## Mapeamento da Superfície de Segurança

| Superfície | Arquivo | Risco | Proteção atual | Alteração necessária |
|---|---|---|---|---|
| Token estático default | `packages/plugin/src/config.ts` | Token público fixo (`dev-local-secret`) permite que qualquer processo local acesse a API sem autorização real. | Usa `dev-local-secret` se não configurado nas settings. | Gerar token criptograficamente seguro com `crypto.randomBytes(32)` em runtime quando não configurado. Remover default hardcoded. |
| Comparação de token | `packages/plugin/src/mcp/server.ts` | Comparação direta de strings (`auth.slice(7).trim() === secret`) vulnerável a timing attacks. | Operador `===` simples. | Usar `crypto.timingSafeEqual` com tratamento adequado para buffers de tamanhos diferentes. Retornar 401 sem vazar detalhes. |
| Header CORS permissivo | `packages/plugin/src/mcp/http-server.ts` | `Access-Control-Allow-Origin: *` permite que qualquer página web faça requisições cross-origin para o servidor local. | Wildcard fixo (`*`) em todas as respostas HTTP. | Remover wildcard default. Bloquear requisições com header `Origin` não autorizado (403 Forbidden). |
| Preflight OPTIONS | `packages/plugin/src/mcp/server.ts` | `OPTIONS` responde 204 com headers CORS abertos incondicionalmente, permitindo bypass de preflight de navegadores maliciosos. | Responde 204 imediatamente. | Aplicar mesma validação restritiva de `Origin` para preflight `OPTIONS`. |
| Bind e DNS Rebinding / Host | `packages/plugin/src/mcp/server.ts` | Potencial risco de DNS rebinding via navegador apontando para 127.0.0.1 caso o header `Host` não seja validado. | Faz bind em 127.0.0.1, mas não valida `Host` ou socket remoteAddress. | Validar `Host` (restringir a `127.0.0.1:<port>` e `localhost:<port>`) e verificar loopback no socket remoto. |
| Escopo de filesystem por prefixo / resolve | `packages/plugin/src/commands/scope-export.ts` | `paths.resolve` e `paths.relative` simples sem canonicalização física (`realpath`) permitem escape via symlinks, junctions ou prefix confusion. | Apenas checagem de string `relative.startsWith('..')` sobre caminhos lógicos. | Centralizar resolução em `resolveScopedPath`. Canonicalizar raiz aprovada e arquivos existentes com `realpath`. Validar ancestrais para novos arquivos e bloquear symlinks/junctions fora do escopo. |
| Persistência de aprovação de diretório | `packages/plugin/src/main.ts`, `packages/plugin/src/session.ts` | Ao parar o servidor MCP (`stopServer`), o escopo permanece ativo na sessão, podendo ser reaproveitado indevidamente se reiniciado. | `revokeScope` chamado apenas no `onunload`. | Limpar `session.scopedDirectory` imediatamente no `stopServer`, restart e reload. Não persistir aprovação no disco. |
| Autostart default ativado | `packages/plugin/src/config.ts` | Servidor inicia automaticamente sem intervenção explícita do usuário na primeira execução normal. | Default `autostart: true` se ausente. | Mudar default de autostart para `false`. |
| Limite de Payload / Buffer | `packages/plugin/src/mcp/http-server.ts` | DoS por envio excessivo de dados em requisições HTTP. | Limite de 8MB (`MAX_BODY`). | Manter limite razoável (8MB) e encerrar conexão imediatamente ao exceder. |
| Allowlist de Ferramentas MCP | `packages/plugin/src/dispatch.ts` | Risco de ferramentas inseguras (`eval`, shell, execução arbitrária de código ou acesso livre a fs). | Switch exaustivo com allowlist explícita de comandos suportados. | Manter restrição estrita e adicionar testes que garantem a ausência de comandos perigosos. |
| Import / Export PNG | `packages/plugin/src/texture/png-io.ts` | Leitura/escrita de imagens fora da pasta aprovada. | Utiliza `readScopedBinary` e `writeScopedBinary`. | Beneficiará automaticamente do hardening em `scope-export.ts`. |
| Save Project e Export Model | `packages/plugin/src/commands/scope-export.ts` | Escrita de modelos (`.bbmodel`, JSON) fora do escopo ou sobrescrita acidental. | Checa `scopedTarget` e exige flag `overwrite: true`. | Manter proteção de overwrite e aplicar validação física canônica anti-junction/symlink. |

## Operações de Filesystem Identificadas

1. **Leitura de Arquivo**:
   - `readScopedBinary` (`scope-export.ts`, chamado por `importTexturePng` em `png-io.ts`)
2. **Criação / Sobrescrita de Arquivo**:
   - `writeScopedBinary` (`scope-export.ts`, chamado por `exportTexturePng` em `png-io.ts`)
   - `saveProject` (`compileTo` em `scope-export.ts`)
   - `exportModel` (`compileTo` em `scope-export.ts`)
3. **Aprovação de Diretório**:
   - `proposeScopedDirectory` (`scope-export.ts`)

Todas as operações de filesystem identificadas passam exclusivamente por `scope-export.ts`. O hardening de resolução de paths concentrado em `scope-export.ts` cobre 100% da superfície de I/O do MCP.

## Continuation findings and implemented controls

The inherited seven-file patch was incomplete: rotation persisted settings but left the running secret unchanged; crypto had fallbacks contrary to the plan; an approved root could be recanonicalized after redirection; dangling redirects were mistaken for missing paths; overwrite used an exists/write race; validation preceded codec execution; and HTTP health/DELETE escaped authentication. These gaps were corrected before live testing.

| Surface | Final control |
|---|---|
| config.ts / main.ts / mcp/actions.ts | node:crypto only, legacy-token migration, explicit token action updates running handle, autostart opt-in |
| mcp/server.ts / net.ts | timingSafeEqual, exact Host/port, expected loopback peer, all endpoints authenticated except validated preflight, no wildcard |
| mcp/http-server.ts | one dispatch per connection, reject duplicate headers/transfer encoding/invalid length, retain 8 MiB cap |
| commands/scope-export.ts | centralized logical + physical containment, pinned canonical root path, lstat dangling redirects, revalidate after codecs, O_EXCL and O_NOFOLLOW where available |
| texture/png-io.ts | unchanged modeling code, readScopedBinary/writeScopedBinary enforce identical controls |
| session.ts / main.ts / mcp/server.ts | approvals revoked on handle start/stop and plugin lifecycle |
| mcp/rpc.ts / dispatch.ts / shared commands | unchanged explicit dispatch; full 59-tool input-schema snapshot plus unknown command denial |
| Python CLI helper | remove public fallback and authenticate health too; local environment token required |

Source search covered createServer/listen, Authorization/Bearer/Origin/Host, fs/read/write/mkdir/rename/copy/realpath/lstat, scope, save/export and PNG. Only scope-export.ts performs plugin disk I/O; host/node-modules.ts grants module access and host/live.ts probes capability but does not read/write files. Python scripts are explicitly invoked local clients, not remotely callable generic filesystem tools. No new runtime dependency, shell execution, eval or modeling API was added.

See SECURITY.md for residual TOCTOU/hard-link and denial-of-service boundaries, and VALIDATION.md for pending live gates.

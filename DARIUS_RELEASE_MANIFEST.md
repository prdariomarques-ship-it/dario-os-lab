# DARIUS RELEASE MANIFEST — RC1 (histórico) vs RC2 CANDIDATE (freeze candidate)

Branch: `feature/darius-finance` · HEAD: `19dc432` (fix(api): no-CoT sentinel proof)
Gerado em 2026-09-13 pela operação "RELEASE FREEZE / HANDOFF".
**Nenhuma tag foi criada. Nenhuma operação remota foi executada.**
Nota de rodada: o estado de CÓDIGO validado é `19dc432`; commits de docs posteriores
(`4ccd4fc` manifest refresh + esta linha) não alteram código. Candidato final = tip do
branch `feature/darius-finance` no momento do freeze aprovado pelo usuário.

## IDENTIDADE DE RELEASE (não confundir)
- **RC1 HISTÓRICO = `3b791ac`** — permanece intacto, imutável, é o RC1 original.
  NÃO renomear, NÃO mover branch, NÃO reescrever histórico sobre ele.
- **RC CANDIDATE PÓS-RC1 = `19dc432`** (evolução de `2acc85b` + fix no-CoT) — é a
  candidata atual. **NÃO é RC1 e não deve ser chamado de RC1.**
- Nomenclatura recomendada para a próxima tag (QUANDO o usuário aprovar o freeze):
  **`v0.1.0-rc.2`** — apontando para o commit candidato. Não criada nesta operação.

## CADEIA COMPLETA (verificada por ancestralidade)
```
3b791ac  RC1 HISTÓRICO (release: finalize DARIUS OSS RC1)
  ↓ 8 commits herdados de terceiros (Stitch UI, bot fix, web export)
0d8fb00  camada herdada pós-RC1
724bb7b  Finance vertical + contrato de plugins (= checkpoint/hardening-start)
  ↓ a44a6a7 fix(core) approval gate · cd69c6b feat(server) · 0c7489d feat(web) · 01bd99b docs
  ↓ bd204f4 fix(api) RC validation · 6ce2c20 docs
  ↓ f60a58b fix(core) budget ativo · eacc604 feat(server) auth · 200251f fix(api) no-CoT trace
  ↓ 513e732 test(finance) matriz · 68ea982 test(core) isolamento · 78708e8 feat(web) badge
2acc85b  docs: hardening report + release manifest
19dc432  fix(api): no-CoT sentinel proof — list surfaces  ← RC2 CANDIDATE (HEAD)
```
22 + 1 commits desde o RC1. `git merge-base --is-ancestor 3b791ac 19dc432` = YES.

## RC1 BASE
- `3b791ac` — RC1 histórico (único verificável; `cec1b02` não existe como objeto)
- `c7c2e55` — `main` (gateway Telegram), ancestral direto do RC1 (merge-base confirmado)
- `0d8fb00` — camada herdada pós-RC1 (8 commits de terceiros)

## HARDENING (Core)
- `724bb7b` — feat(finance): vertical + contrato de plugins + patch approval gate (100% aditivo)
- `a44a6a7` — fix(core): approval-gate "Store = authoritative state" (syncWithStore + 9 testes)
- `f60a58b` — fix(core): timeout mede só tempo ativo — WAITING_APPROVAL não consome orçamento
  (D1/D2 reproduzidos deterministicamente e corrigidos; 7 testes de budget)
- `68ea982` — test(core): prova estática de isolamento Core↔plugins

## API / SERVER
- `cd69c6b` — feat(server): HTTP API oficializada como adapter puro (express/cors adicionados)
- `bd204f4` — fix(api): /api/agents 500 (JSON circular), leak de internos em /agents/:id,
  guards de decisão Finance (409)
- `eacc604` — feat(server): fronteira de auth mínima opt-in `DARIUS_API_TOKEN` (timing-safe,
  /api/health aberto; localhost sem token permanece idêntico)
- `200251f` — fix(api): contrato no-CoT forçado no trace de `/api/tasks/:id`
- `19dc432` — fix(api): **no-CoT sentinel proof** — `GET /api/tasks` e
  `AgentDetail.recentTasks` retornavam Tasks cruas com `metadata.executionHistory`
  (reasoning bruto). Agora toda superfície de lista serializa via
  `toPublicTaskSummary()`; probe HTTP real com sentinela
  `SECRET_INTERNAL_THOUGHT_SENTINEL` prova ausência em TODAS as superfícies GET
  (prova vermelho→verde contra o código pré-fix obtida)

## WEB
- `0c7489d` — feat(web): fonte restaurada do export + conectada ao contrato da API (7 páginas)
- `78708e8` — feat(web): badge distinto para CANCELLED
- Build: `npm install` limpo + `vite build` PASS (98 módulos) + `tsc --noEmit` 0 erros; `dist/` ignorado
- Estados: RUNNING/PENDING (azul default), PAUSED/WAITING_APPROVAL (amarelo), FAILED (vermelho),
  COMPLETED (verde), CANCELLED (cinza) — 6 estados distintos em `StateViews.tsx`
- Aprovação: WAITING_APPROVAL → APPROVE → COMPLETED e → REJECT → FAILED (Finance.tsx)
- Sem CoT: trace exibe placeholder "(internal planning step — content not exposed)"
- Scan de token/secret em source e bundle: limpo (0 ocorrências de `DARIUS_API_TOKEN`;
  matches de `SECRET_INTERNAL` no bundle são a constante interna do React, falso positivo)

## FINANCE
- Vertical completo em `src/plugins/finance/**` (plugin `finance@0.1.0` via PluginHost)
- 5 tools READ-only auditadas (4 LOW + 1 MEDIUM), timeout declarado, sem dump de params nos logs
- Providers mock determinísticos (`isLive: false as const`), cotação nunca inventada
- E2E: approve → COMPLETED verificado; reject → FAILED explícito; cenários determinísticos
- Relatório sobrevive a restart real (teste de reabertura de store SQLite)
- Sem broker, ordens, dinheiro real, shell, fs ou rede (scan limpo)

## MOBILE
- Scaffold Expo confirmado (`mobile/App.js` placeholder + `package.json` SDK 51)
- **APK = NOT BUILT** — ver `DARIUS_MOBILE_READINESS.md` para o inventário de gaps

## TESTS (estado no HEAD 19dc432)
- Backend: **157/157 testes** (35 arquivos) — inclui budget semantics (7), approval gate (9),
  matriz Finance (14+8), isolamento estático (2), no-CoT adapter (2) + **probe HTTP no-CoT (4)**
- Typecheck: `tsc --noEmit` **0 erros** (backend e web)
- Smokes ao vivo: server 22/22 + auth 10/10 + **no-CoT live 17/17** (fluxo Finance real:
  start → gate → approve (uma decisão) → COMPLETED → relatório persistido; listas sem
  `executionHistory`/`metadata`; 2 THINK steps redigidos; sentinela ausente em 7 superfícies)
- Bot Telegram: fail-fast sem token; isolado das mudanças (só grammy + access.js)

## SECURITY
- Scan de secrets/PII: limpo (`.env.example` só placeholders; nenhum valor real commitado)
- Scan de padrões perigosos (child_process/eval/innerHTML/CORS wildcard/shell): limpo
- CORS allowlist (nunca `*`), métodos GET/POST, bind loopback por default
- Ferramentas de risco HIGH/CRITICAL bloqueadas por policy no default
- Auth: `DARIUS_API_TOKEN` opt-in testado (sem/incorreto/correto × health/read/write/approval/Finance)
  - **localhost development (BIND_HOST=127.0.0.1, default)**: sem token, intocável fora da máquina
  - **LAN/Termux (BIND_HOST=0.0.0.0)**: token OBRIGATÓRIO; clientes header-based (curl, app)
    funcionam; browser UI ainda sem mecanismo seguro de entrega de token (decisão pendente)
- Limitação conhecida pré-RC1: `POST /api/tasks` sem auth quando `DARIUS_API_TOKEN` não definido

## DEPENDÊNCIAS (classificação — SEM auto-update, fixes exigem mudança breaking)
- Backend: 4 moderate — `@vitest/mocker` (dev-only, impacto produção: nenhum), `qs` via
  express 4.22.2 (DoS via parsing; impacto produção: localhost/LAN apenas; fix = express@5
  breaking)
- Web: `vite`/`esbuild` **high** (dev-server only — não afeta o build de produção servido;
  fix = vite@8 breaking) + `react-router` 3× moderate (open redirect/constructor injection;
  fix = react-router-dom@7 breaking)

## KNOWN LIMITATIONS (documentadas, não bloqueiam)
- Path B de resume (`resumeTask` após saída do loop) concede fatia fresca de orçamento por
  aprovação — semântica pragmática documentada; sem retry infinito (exige decisão humana)
- Caminho simples armazena resultado com prefixo "DONE: " (cosmético, pré-RC1)
- `registerCustomVerifier` permite sobrescrever verificador (benigno no uso atual)
- Entrega de token para browser UI = decisão arquitetural pendente (blocker de integração
  Web↔auth, não de correção)
- Sem E2E em dispositivo/emulador Android nesta rodada
- Approvals internas: estados internos de execução permanecem no banco para debug controlado;
  a superfície pública (API/UI) é coberta pelo contrato no-CoT provado por sentinela

## REMOTE STATUS
- **NENHUMA operação remota**: sem push, merge, force-push, rebase ou tag
- `469e8b1` (tip destrutiva que deletou src/) confirmado FORA do histórico — e o remote
  phase-0 avançou EXTERNAMENTE para `ec49c2be` durante esta operação (objeto não buscado;
  tracking local ainda `469e8b1`). Tratado em `DARIUS_REMOTE_MIGRATION_PLAN.md`
- `origin/main` = `c7c2e55` (intocado); nosso HEAD não existe em nenhum remote
- Checkpoint local: `checkpoint/hardening-start` = `724bb7b`

## MIGRATION READINESS (2026-09-13, operação BACKUP + DRY-RUN + PACKAGE)

### Identidade formal (§10)
- **RC1 HISTÓRICO: `3b791ac`** — intocado, ancestral verificado (merge-base = ele próprio)
- **RC2 CANDIDATE: código congelado em `19dc432`** + docs (`4ccd4fc`, `d671162`, `b60efc9`,
  `6c01f87`, este commit). Nunca apresentar os commits pós-RC1 como "RC1 original".
- Tag recomendada (NÃO criada): `v0.1.0-rc.2` — só após push/PR/merge do branch de integração.

### Remote drift (§8 — apenas leitura, read-only)
- `origin/main` = `c7c2e55` (intocado)
- `origin/feature/darius-oss-phase-0-...` = **`f0eadcf`** — **EXTERNAL REMOTE DRIFT (2ª ocorrência
  observada)**: `469e8b1` → `ec49c2be` (detectada em 2026-09-13) → `f0eadcf` (detectada nesta
  operação). Terceiros movem o branch ativamente. NUNCA incorporar, rebasear ou force-pushar.
- `ec49c2be` nem sequer existe como objeto local (nunca buscado); `f0eadcf` também não buscado.

### Prova de não-contaminação (§9)
- `469e8b1` NÃO é ancestral de HEAD (`git merge-base --is-ancestor` falha)
- `ec49c2be`: não é objeto local — impossível estar na história
- merge-base(HEAD, `469e8b1`) = `0d8fb00` — ponto de divergência conhecido (camada herdada)
- Nenhum descendente da linha remota destrutiva no estado atual

### Backup artifacts (§3-4 — gerados APÓS este commit, vivem fora da árvore Git)
- `DARIUS_RC2_SOURCE_BACKUP.tar.gz` — snapshot da árvore via `git archive HEAD` (só arquivos rastreados)
- `darius-rc2.bundle` — bundle Git com história completa + refs nomeadas (`rc1/historical` = `3b791ac`,
  `checkpoint/hardening-start` = `724bb7b`, `feature/darius-finance` = HEAD, `main`)
- `DARIUS_RC2_PATCHSET.patch` — format-patch `--binary` de `3b791ac..HEAD` (com mensagens de commit)
- `darius-rc2-layer-{core,server-api,plugin-system,finance,web,inherited-misc,docs}.patch` — partição
  por camada com pathspecs disjuntos (`--binary`)
- `SHA256SUMS` — hashes de todos os artefatos; validação `sha256sum -c` = ALL OK
- Dry-run de migração: clone temporário do bundle + reconstrução RC1+patches com igualdade de
  árvore (`write-tree` == `HEAD^{tree}`) + suíte completa executada no clone

### Dependency gate (§14 — SEM auto-update)
- Backend 4 moderate: `@vitest/mocker` (DEV-ONLY — nenhum impacto em produção), `qs` via express
  (PRODUÇÃO — parsing de query; exposição localhost/LAN; fix express@5 breaking)
- Web 1 high: vite/esbuild — DEV-SERVER ONLY (não afeta o dist de produção; fix vite@8 breaking);
  3 moderate react-router (PRODUÇÃO — open redirect/constructor injection; fix v7 breaking)

### Mobile (§15) e Finance (§16)
- Mobile: **APK NOT BUILT** — checklist completa em `DARIUS_MOBILE_READINESS.md`; scaffold ≠ versão
- Finance: plugin isolado, providers mock `isLive: false`, tools READ-only, zero broker/trading/
  dinheiro/shell/rede arbitrária — reconfirmado nesta operação

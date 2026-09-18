# DARIUS OSS — RELEASE FREEZE REPORT

Operação: RELEASE FREEZE / HANDOFF (20 itens) · Data: 2026-09-13
Branch: `feature/darius-finance` · Código validado (freeze point): **`19dc432`**

```text
DARIUS OSS — RELEASE FREEZE REPORT

HISTORICAL RC1: 3b791ac — PRESERVADO (ancestral verificado de todo o trabalho
  posterior; nenhum rewrite, nenhum movimento de branch; permanecerá alcançável
  após qualquer merge futuro)

CURRENT RC CANDIDATE: tip de feature/darius-finance — código congelado em
  19dc432 (fix api no-CoT) + commits de docs (4ccd4fc manifest/mobile/remote,
  d671162 nota de tip). NÃO é RC1 e não deve ser chamado de RC1.

CORE: Íntegro. Engine/Scheduler/Stores com guards em toda transição de estado;
  syncWithStore (Store autoritativo) em todo ponto crítico; budget de execução
  mede só tempo ativo; isolamento Core↔plugins provado estaticamente (68ea982)
  e por testes. Core não importa Finance — removível sem quebrar nada.

APPROVAL: Gate nativo PAUSED/WAITING_APPROVAL validado (9 testes Core + matriz
  Finance 14/14 + políticas 8/8): exatamente uma decisão efetiva; perdedora
  409; nenhuma task terminal ressuscita; nenhuma decisão inválida polui auditoria;
  CANCELLED/REJECTED nunca sobrescritos pelo timer.

TIMEOUT: Wall-clock do scheduler não converte mais espera humana em falha —
  timer re-sincroniza com o Store e só falha se RUNNING (D1/D2 reproduzidos e
  corrigidos em f60a58b; 7 testes determinísticos).

BUDGET: WAITING_APPROVAL = 0 de budget ativo (Path A provado por teste: completa
  após espera humana muito maior que o budget). Path B (resume fora do loop)
  concede fatia fresca por aprovação — semântica documentada; sem retry infinito
  (decisão humana obrigatória para nova rodada).

PERSISTENCE: SQLite autoritativo; relatório Finance sobrevive restart real
  (reabertura de store); 21/21 persistence/recovery/crash/restart.

API: Adapter puro. GET/POST /api/tasks e /api/agents/:id agora serializam
  SOMENTE contratos públicos (toPublicTaskSummary) — metadata/executionHistory
  nunca mais cruzam a fronteira em listas. Smokes: 22/22 + auth 10/10 + no-CoT
  live 17/17.

AUTH: DARIUS_API_TOKEN opt-in (timing-safe): health aberto; todas as demais
  rotas exigem Bearer/x-darius-token. Testado sem/incorreto/correto ×
  health/read/write/approval/Finance. localhost development (BIND_HOST=127.0.0.1,
  default) = sem token, inacessível fora da máquina. LAN/Termux = token
  obrigatório para clientes header-based. Entrega de token ao BROWSER continua
  sem mecanismo seguro definido — decisão arquitetural pendente (documentada,
  não simulada).

NO-COT: RESOLVIDO COM PROVA EM 3 NÍVEIS. (1) Foi encontrado vazamento real:
  GET /api/tasks e recentTasks de /api/agents/:id retornavam Tasks cruas cujo
  metadata.executionHistory contém o reasoning THINK bruto — corrigido em
  19dc432; (2) probe HTTP real (nocot.http.test.ts): agente com
  SECRET_INTERNAL_THOUGHT_SENTINEL no THINK executa pelo engine, e TODAS as
  superfícies GET são varridas por HTTP — sentinela zero, resultado público
  presente (anti-falso-verde), prova vermelho→verde contra o código pré-fix;
  (3) probe ao vivo no servidor real (17/17): fluxo Finance completo,
  2 THINK steps redigidos, 7 superfícies sentinel-free. Regressão permanente
  na suíte. Estado interno pode existir no banco para debug controlado; a
  superfície pública é coberta por contrato.

WEB: 7 páginas + painel de detalhe de agente (Dashboard, Agents(+Details),
  Tasks, Memory, Skills, Logs, Finance). 6 estados com badges distintos
  (RUNNING/PENDING azul, PAUSED/WAITING_APPROVAL amarelo, FAILED vermelho,
  COMPLETED verde, CANCELLED cinza). Approve/Reject no Finance funcionando
  ponta a ponta. Trace exibe "(internal planning step — content not exposed)".
  Scan de token/secret em source e bundle: limpo (matches SECRET_INTERNAL =
  constante interna do React — falso positivo); nenhum token em URL/log/bundle.

FINANCE: 5 tools READ-only (4 LOW + 1 MEDIUM), auditadas, com timeout. Zero
  broker/trading/movimentação de dinheiro/shell/filesystem/rede arbitrária
  (scan limpo). Providers mock determinísticos com isLive: false as const.
  Cotação nunca inventada para símbolo desconhecido. Relatório sobrevive a
  approval, restart e reabertura.

PLUGINS: Core não importa plugins (prova estática + teste 2/2). PluginHost
  aplica finance@0.1.0 sem tocar o Core; falha de plugin não derruba a API base.

SECURITY: Scan de secrets/PII/padrões perigosos (shell, eval, CORS wildcard,
  innerHTML): limpo no repo e no pacote de handoff. CORS allowlist (nunca *),
  métodos GET/POST, bind loopback default, tools HIGH/CRITICAL bloqueadas por
  policy. POST /api/tasks sem auth permanece limitação conhecida quando token
  não definido (pré-RC1, documentada).

DEPENDENCIES: SEM auto-update. Backend: 4 moderate — @vitest/mocker (dev-only,
  impacto produção nenhum), qs via express (DoS por parsing; exposição
  localhost/LAN; fix express@5 breaking). Web: vite/esbuild high — dev-server
  apenas, não afeta o build de produção (fix vite@8 breaking); react-router
  3 moderate (fix v7 breaking). Todos os fixes exigem major breaking →
  decisão pós-freeze, documentada no manifest.

MOBILE: APK = NOT BUILT. Scaffold Expo (App.js + package.json) apenas.
  Inventário completo de gaps em DARIUS_MOBILE_READINESS.md. Nenhuma alegação
  de build.

TESTS: 157/157 (35 arquivos) — inclui: budget semantics 7, approval gate 9,
  Finance E2E 14, policies 8, isolamento 2, no-CoT adapter 2, no-CoT HTTP
  probe 4, persistence/restart 21. Matriz por componente abaixo.

BUILD: Backend typecheck 0 erros. Web: npm install limpo + tsc --noEmit 0
  erros + vite build PASS (dist ignorado). Sem step de build backend (tsx
  runtime; typecheck é o gate).

GIT: fsck limpo (2 dangling benignos); worktree 0 mudanças; sem tags; 469e8b1
  FORA do histórico; REMOTE DRIFT detectado: phase-0 avançou externamente
  469e8b1 → ec49c2be (objeto nunca buscado por nós; tracking local permanece
  469e8b1). Tratado em DARIUS_REMOTE_MIGRATION_PLAN.md.

ARTIFACTS: Relatório Finance persiste após approval/restart (testado).
  Nenhum artefato desaparece após resume.

HANDOFF PACKAGE: /home/z/my-project/download/darius-rc2-handoff/ (+ .tar.gz
  304K): 14 docs, inventário determinístico (DARIUS_RELEASE_FILES.txt, 151
  arquivos rastreados), SHA256SUMS do repo + SHA256SUMS.package verificado
  (17/17 OK), patch consolidado 3b791ac..tip (14.463 linhas) + patches
  granulares, README com nota de substituição (FORENSIC_AUDIT/INTEGRATION_PLAN
  não existiam — equivalentes reais listados, nada inventado). Sem secrets,
  .env, node_modules ou dist.

BLOCKERS: Nenhum que impeça o freeze do RC2 candidate como release candidate
  de DESENVOLVIMENTO. Pendências documentadas (não defeitos): (1) mecanismo de
  entrega de token ao browser UI = decisão arquitetural; (2) APK não construído
  (fora de escopo de RC); (3) fixes de dependência exigem majors breaking.

WARNINGS: Path B de resume concede fatia fresca de budget por aprovação
  (documentado); registerCustomVerifier permite overwrite (benigno); POST
  /api/tasks sem auth sem token (pré-RC1); remote phase-0 continua sendo movido
  por terceiros — nunca rebasear sobre ele.

REMOTE TOUCHED: NO

READY FOR FREEZE: YES

RECOMMENDED TAG: v0.1.0-rc.2 (quando o usuário aprovar o freeze — NÃO criada)

NEXT OPERATION: 1) Usuário revisa este relatório + manifest + pacote de handoff;
  2) executar DARIUS_REMOTE_MIGRATION_PLAN.md fase a fase (bundle de backup →
  branch de integração novo → push normal → PR review humano → merge-commit →
  tag v0.1.0-rc.2); 3) só depois: APK/Termux como operação separada.
```

## MATRIZ FINAL DE TESTES (T19)

| Component | Tests | Typecheck | Build | Runtime | Security | Status |
|---|---:|---:|---:|---:|---:|---|
| Core | 100+ (incl. budget 7, approval 9) | 0 erros | typecheck gate | smoke 22/22 | scan limpo | PASS |
| Planner | cobertos nos testes Core | 0 erros | idem | smoke | scan limpo | PASS |
| Task Engine | approval/budget/retry/timeout | 0 erros | idem | smoke | scan limpo | PASS |
| Memory | testes de memória/persistência | 0 erros | idem | /api/memory ao vivo | sem PII | PASS |
| Context | testes de bounding | 0 erros | idem | runtime Core | scan limpo | PASS |
| Tools | gate HIGH/CRITICAL testado | 0 erros | idem | smoke | gate ativo | PASS |
| Plugins | PluginHost 48/48 + isolamento 2 | 0 erros | idem | smoke | isolamento provado | PASS |
| Finance | 14 E2E + 8 policies | 0 erros | idem | live E2E 17/17 | READ-only provado | PASS |
| Server | smokes 22+10+17 | 0 erros | idem | 3 smokes verdes | auth+CSS/CORS | PASS |
| API | adapter 6 + probe HTTP 4 | 0 erros | idem | live | no-CoT provado | PASS |
| Web | build gate | 0 erros | vite PASS | contrato 14/14 | bundle limpo | PASS |
| Telegram | testes bot (fail-fast) | 0 erros | idem | smoke fail-fast | isolado | PASS |
| Mobile | — | — | — | — | — | NOT BUILT (documentado) |
| Security | scans estáticos | — | — | — | limpo | PASS |

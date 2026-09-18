# DARIUS OSS - System Audit (Phase 0)

## 1. Repositório Atual
- **Nome/Projeto:** `agente-dmn` (Gateway pessoal do DarioOS para o Hermes via Telegram)
- **Linguagem:** TypeScript
- **Ambiente de Execução:** Node.js (via `tsx`)
- **Framework Principal:** `grammy` (Telegram Bot API)
- **Testes:** `vitest`

## 2. Ponto de Entrada (Entrypoint)
- O ponto de entrada principal do projeto está em `src/bot.ts`.
- O bot funciona usando *long polling*.

## 3. Arquitetura Atual
- **Monolítica e Simples:** O sistema é basicamente um script de bot do Telegram (`src/bot.ts`) com uma regra de controle de acesso (`src/access.ts`).
- Não existe uma separação de camadas complexas, nem estado persistente, nem orquestração de agentes.

## 4. Dependências
- **Produção:** `dotenv`, `grammy`
- **Desenvolvimento:** `@types/node`, `tsx`, `typescript`, `vitest`

## 5. Testes
- Existe um framework de testes configurado (`vitest`).
- Há um teste unitário existente em `src/access.test.ts` que valida a função de controle de acesso ao bot.

## 6. Problemas Identificados
- O sistema atual atua apenas como um "wrapper" ou interface para o Telegram.
- Não possui nenhuma lógica de agente autônomo, planejamento, memória ou roteamento de modelos.
- O código atual não reflete a arquitetura DARIUS proposta.

## 7. O Que Já Existe
- Interface de comunicação básica via Telegram.
- Validação de acesso baseada no ID do Chat (`TELEGRAM_CHAT_ID`).
- Comandos básicos (`/start`, `/help`) respondendo com texto estático.
- Ambiente de desenvolvimento funcional (TypeScript + Vitest).

## 8. O Que Está Faltando
- **Tudo relacionado ao DARIUS CORE:**
  - Task Engine
  - Planner
  - Context Engine
  - Memory Engine
  - State Engine
  - Model Router
  - Tool Engine
  - MCP Layer
  - Sistema de Skills
  - Sistema Multi-Agente
  - Verificação, Segurança e Observabilidade.

## 9. Comparação com a Arquitetura DARIUS Proposta
- A arquitetura atual é uma mera interface (adapter). O DARIUS OSS precisa de um núcleo orquestrador (DARIUS CORE) onde a interface do Telegram será apenas um dos canais de entrada (input/output channel) e não o centro da aplicação.

## 10. O Que Pode Ser Preservado
- As configurações de infraestrutura do projeto (`package.json`, TypeScript, Vitest).
- A lógica de interface com o Telegram (`grammy`), mas ela deve ser movida para uma camada de adaptador (ex: um canal de comunicação).
- A lógica de controle de acesso, que pode ser incorporada ao módulo de Segurança.

## 11. O Que Precisa Ser Refatorado
- O arquivo `src/bot.ts` precisa deixar de ser o coração do sistema. O entrypoint do sistema deve iniciar o DARIUS CORE, e então plugar a interface do Telegram a ele.

## 12. Riscos
- **Acoplamento:** Risco de acoplar a lógica do agente à interface do Telegram, o que violaria o princípio de modularidade e de independência de ferramentas (Tool-Agnostic/Interface-Agnostic).
- **Complexidade Prematura:** Risco de tentar implementar toda a arquitetura DARIUS ao mesmo tempo.

## 13. Dívida Técnica
- Atualmente mínima, pois o projeto é pequeno. No entanto, o design atual limitará o crescimento para um runtime de agentes se mantido como está.

## 14. Proposta de MVP (Minimum Viable Product)
- **Objetivo:** Construir o DARIUS CORE base focado exclusivamente no conceito de `Task`.
- Desenvolver um sistema que consiga criar, executar e concluir uma `Task` simples usando um único agente genérico, comunicando-se com um modelo local ou via API, e reportar o resultado.
- Integrar a interface do Telegram apenas como um disparador dessas Tasks e exibidor do resultado (Artifacts/Text).

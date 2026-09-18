# DARIUS OSS — Camada de Inteligência Artificial, Modelos, Reasoning e Evaluation

Este módulo implementa a camada de Inteligência Artificial do **DARIUS OSS**, complementando o Core Runtime (construído pelo Jules) e a Arquitetura/Engenharia (liderada pelo Antigravity).

---

## 1. Model Abstraction (`src/ai/types.ts`)

A interface `Model` desacopla completamente o Core Runtime de provedores específicos:

```typescript
export interface Model {
  readonly modelId: string;
  readonly providerId: string;
  generate(input: GenerateInput, options?: GenerateOptions): Promise<GenerateOutput>;
  stream(input: GenerateInput, options?: GenerateOptions): AsyncIterable<StreamChunk>;
  structuredOutput<T = unknown>(input: GenerateInput, schema: StructuredOutputSchema<T>, options?: GenerateOptions): Promise<T>;
  capabilities(): ModelCapabilities;
}
```

### Provedores Implementados:
- **`GeminiProvider` (`src/ai/providers/gemini.ts`)**: Implementação com `@google/genai` SDK v2, suporte a `gemini-3.8-flash` (padrão), `gemini-3.1-pro-preview`, `gemini-3.1-flash-lite`, function calling, streaming, schema estruturado e User-Agent `aistudio-build`.
- **`MockProvider` (`src/ai/providers/mock.ts`)**: Provedor determinístico offline para testes automatizados, benchmarking e desenvolvimento sem consumo de cota externa.

---

## 2. Context Engineering (`src/ai/context/`)

Abandona prompts monolíticos e divide a composição em 6 camadas isoladas:
1. **System Instructions**: Regras operacionais, persona e limites de segurança.
2. **Task Context**: Objetivo explícito, restrições e sessão.
3. **Memory**: Entradas recuperadas (com score de relevância) de buffers ou armazenamento.
4. **Tools**: Declarações e contratos de parâmetros das ferramentas registradas.
5. **Execution History**: Trilha de passos anteriores (pensamento, ação tomada, resultado).
6. **Observations**: Resultados brutos e dados de retorno de ferramentas.

O `ContextBuilder` calcula o consumo de tokens por camada e aplica truncamento proporcional não-destrutivo se o orçamento estourar.

---

## 3. Agent Reasoning & Structured Output (`src/ai/reasoning/`)

- **Schema Determinístico (`AgentDecision`)**:
  - `thought`: Análise e raciocínio deliberado
  - `stateAssessment`: Avaliação do progresso frente ao objetivo
  - `progressPercentage`: Estimativa percentual de 0 a 100
  - `nextAction`: `'call_tool' | 'ask_user' | 'finish' | 'reflect'`
  - `toolCall`: Ferramenta e parâmetros validados
  - `finalAnswer`: Resposta sintetizada conclusiva
  - `confidence`: Nível de certeza de 0.0 a 1.0
- **Bounded Autonomy**:
  - Teto rígido de iterações (`maxSteps`: padrão 5, limite estrito 10).
  - Teto de orçamento em dólares (`maxCostUsd`).
  - **Loop-Breaker**: Detecta chamadas de ferramentas repetitivas e interrompe o ciclo antes do desperdício de tokens.

---

## 4. Model Routing (`src/ai/routing/`)

Evita o uso indiscriminado do modelo mais caro:
- **Classificador Heurístico**:
  - **Simples** (Tradução, extração, classificação rápida) ➔ `gemini-3.1-flash-lite` (Ultra-low latency, $0.000075/1k).
  - **Padrão** (Loops de agente, tool calling, resumo) ➔ `gemini-3.8-flash` (Low latency, $0.00015/1k).
  - **Complexo** (Arquitetura, refatoração profunda, raciocínio formal) ➔ `gemini-3.1-pro-preview`.
- **Fallback Automático**: Define rota de contingência caso o modelo primário atinja limites de taxa.

---

## 5. Evaluation & Benchmarks (`src/ai/evaluation/`)

Avaliação quantitativa estruturada em 8 dimensões:
1. **Task Success**: Cumprimento do objetivo proposto.
2. **Tool Correctness**: Seleção precisa e conformidade de argumentos.
3. **Hallucination Resistance**: Rejeição a inventar segredos ou dados ausentes.
4. **Retry Behavior**: Resiliência e recuperação após falhas de ferramentas.
5. **Safety Containment**: Recusa de injeções destrutivas (ex: `rm -rf`).
6. **Latency**: Tempo médio por ciclo em milissegundos.
7. **Token Usage**: Prompt tokens e completion tokens consumidos.
8. **Cost**: Estimativa financeira em USD.

Cinco fixtures padronizadas (`EVALUATION_FIXTURES`) são executadas deterministicamente pelo `AgentEvaluator`.

# DARIUS OSS — RC1 LIVE CONNECTIVITY REPORT

## AMBIENTE & TOPOLOGIA
- **Stitch:** BLOCKED (Não detectado no ambiente atual).
- **DARIUS RC1:** Presente no host local (`192.168.0.2`), rodando estaticamente via Node/Vitest no port padrão não ativado de listener HTTP.
- **Proxy/Network:** BLOCKED (Não detectado ou configurado nas variáveis de ambiente).
- **Ollama / Real Provider:** BLOCKED (`curl: (7) Failed to connect to localhost port 11434`). Nenhuma variável de endpoint remoto mapeada via env vars (`OPENAI_API_KEY`, etc) configurada.
- **Variáveis de Ambiente:** Nenhuma variável contendo IPs ou URLs externas injetada na sessão atual (apenas confs padrão do Ubuntu bash).

## TESTES EXECUTADOS

### CHECKPOINT 1 & 2: NETWORK PROBE
- Stitch → Proxy/DARIUS: **BLOCKED**
- DARIUS → Provider (127.0.0.1:11434): **FAIL** (Connection refused)
- Provider → Model: **BLOCKED**

### CHECKPOINT 3: DIRECT MODEL VALIDATION
- **Resultado:** BLOCKED. O ambiente de container isolado atual recusa rotas ativas ao Ollama e não contém endpoints alternativos de teste na variável de ambiente. A validação do streaming e da resposta do modelo falhou na etapa de conexão TCP.

### CHECKPOINT 4, 5, 6, 7: DARIUS INTEGRATION COM MODELO REAL
- **Resultado:** BLOCKED. Devido ao bloqueio na etapa 3, é inviável engatar o motor DARIUS (`TaskEngine`) em uma malha de rede com resposta viva de predição LLM, impossibilitando a captura real da telemetria no formato esperado. A arquitetura permanece testada com mocks determinísticos.

## DIVERGÊNCIAS ENTRE RC1 E AMBIENTE REAL
Não é possível apurar divergências de runtime em predição live (e.g., quebras no parser `<TOOL_CALL>` induzidas por instabilidade de token do modelo), visto que não há um `host` ou infraestrutura ativa de LLMs emparelhada.

## CONCLUSÃO OBJETIVA
A topologia de rede neste ambiente falha imediatamente no `Network Probe`. Nenhuma infraestrutura de provider foi encontrada escutando nas portas nativas (11434) e nenhuma variável injeta hosts alternativos. Sendo assim, o DARIUS OSS segue validado de forma estritamente offline sob o RC1.

| Camada | Resultado |
|---|---|
| Stitch | BLOCKED |
| Proxy/Network | BLOCKED |
| DARIUS endpoint | BLOCKED (Sem server running) |
| Model provider | FAIL |
| Real inference | BLOCKED |
| Task execution | BLOCKED (No inference to trigger loop) |
| Persistence | BLOCKED (No execution loop fired) |
| Verification | BLOCKED (No evidence created) |
| Tool | BLOCKED (No inference triggers tool) |
| Artifact | BLOCKED |
| Recovery | BLOCKED |
| Telemetry/UI | BLOCKED |


## EXTERNAL LIVE ENVIRONMENT PRE-REQUISITES
Para continuar o fluxo E2E operacional de forma válida fora deste Sandbox, a infraestrutura destino obrigatoriamente deve prover:

1. **DARIUS RC1 Executável:** O runtime rodando a partir da tag oficial congelada `v0.1.0-rc.1` sem quaisquer modificações ou adições no `src/core`.
2. **Endpoint Acessível:** Interface de entrada ativa para recepção e escuta das requisições ao DARIUS (e.g., bot do Telegram levantado).
3. **Stitch Acessível:** Instância operante da interface de Dashboard pronta para consumir o `TelemetryEmitter`.
4. **Proxy/Network Route:** Uma topologia de rede aberta permitindo as requisições HTTP entre o Stitch, o DARIUS e o Provider.
5. **Provider Real:** Uma infraestrutura ativa processando tokens REST, sem hardcode (e.g. instanciado localmente ou exposto via container mesh).
6. **Modelo Disponível:** O payload do `OllamaProvider` espera, por padrão, o modelo `llama3`. Caso seja outro, o DARIUS deve ser instanciado com o `request.modelName` ajustado.
7. **Configuração Segura:** `TELEGRAM_TOKEN` (e chaves do provider se mudadas de Ollama para OpenAI/Anthropic) injetadas de forma segura via Env Vars no boot.
8. **Persistência Acessível:** Um volume persistente (bind mount em Docker ou permissões de RW FS direto) mapeado para que a SQLite `TaskStore` crie seus checkpoints de forma atômica sobrevivendo ao ciclo de vida do container.

## SEQUENCE PARA VALIDAÇÃO LIVE
1. Acionar Boot limpo no host, validando logs do `TelemetryEmitter` via stdout ou websocket mapping pro Stitch.
2. Interceptar a chamada base: DARIUS → PROXY → MODEL.
3. Despachar a primeira task pelo Telegram/API: `Create a text file saying hello.`
4. Observar a emissão do `TOOL_CALL` e a conclusão determinística do Gate de Verificação (`FILE_EXISTS`).
5. (Opcional) Matar o container mid-task, religar e observar a mágica da recuperação de iterador pelo SQLite.

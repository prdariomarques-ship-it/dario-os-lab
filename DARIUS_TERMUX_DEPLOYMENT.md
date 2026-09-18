# DARIUS — Termux Deployment (Android on-device)

## 1. Arquitetura (cadeia de execução)

```
APK / Web UI  →  Termux Node.js (DARIUS Server)  →  DARIUS Core  →  Model (Ollama)
   (cliente)        src/server.ts (:3000)         engine/stores      OLLAMA_URL
```

**Regra invariável — Termux NÃO possui um segundo Core.**
Existe exatamente UM `TaskEngine`, UM task store e UM approval gate, todos
dentro do processo `DARIUS Server` rodando no Node.js do Termux. Qualquer UI
(APK, navegador do celular, navegador do desktop) é um cliente HTTP *thin*:
ela lê `GET /api/...` e dispara ações nos endpoints expostos pelo servidor —
ela nunca instancia, embute ou replica o engine. O estado autoritativo vive
sempre no servidor do Termux (SQLite em `DB_PATH`).

## 2. Variáveis de ambiente REAIS (contrato de `src/server.ts`)

O arquivo de instruções anterior citava `DARIUS_HOST`/`DARIUS_PORT`. Esses
nomes **não existem no código** — o servidor lê:

| Variável          | Default                  | Função |
|-------------------|--------------------------|--------|
| `BIND_HOST`       | `127.0.0.1`              | Interface de bind. `0.0.0.0` = acessível na LAN |
| `PORT`            | `3000`                   | Porta HTTP do servidor |
| `CORS_ORIGIN`     | `http://localhost:5173,http://localhost:4173,http://localhost:3000` | Allowlist de origens de navegador (nunca `*`) |
| `DARIUS_API_TOKEN`| *(vazio)*                | Em `BIND_HOST=0.0.0.0` é **obrigatório**; todo `/api` (exceto `/api/health`) exige `Authorization: Bearer <token>` ou `x-darius-token` |
| `OLLAMA_URL`      | `http://127.0.0.1:11434` | Endpoint do modelo (Ollama no próprio Termux ou em outro host da LAN) |
| `DB_PATH`         | `darius_live.db`         | Caminho do SQLite (persistência sobrevive a restart do Termux) |

## 3. Instalação no Termux (sequência correta)

```bash
pkg install nodejs-lts git
git clone <seu-fork> darius && cd darius
npm install

# Rede: aceitar conexões de outros dispositivos da LAN
export BIND_HOST=0.0.0.0
export PORT=3000

# Segurança: OBRIGATÓRIO quando BIND_HOST=0.0.0.0
export DARIUS_API_TOKEN="troque-por-um-segredo-longo"

# CORS: origem de onde o navegador abrirá a UI (ex.: notebook na mesma LAN)
export CORS_ORIGIN="http://192.168.0.42:5173,http://localhost:5173"

# Modelo: Ollama no próprio Termux…
export OLLAMA_URL="http://127.0.0.1:11434"
# …ou em outro host da LAN:
# export OLLAMA_URL="http://192.168.0.10:11434"

npm run server
```

Saída esperada no log:

```
DARIUS API Server is running on http://0.0.0.0:3000
CORS allowlist: http://192.168.0.42:5173,http://localhost:5173
Configured Ollama URL: http://127.0.0.1:11434
```

## 4. Acesso pelo dispositivo físico

1. Descubra o IP do Termux: `ifconfig wlan0` (ou `ip addr show wlan0`).
2. Do outro dispositivo (mesma Wi-Fi/LAN):
   ```bash
   curl -H "x-darius-token: $DARIUS_API_TOKEN" http://<IP-DO-TERMUX>:3000/api/health
   # /api/health é a única rota aberta (liveness); todo o resto exige token
   ```
3. **API base URL para clientes**: o cliente web usa base `/api` relativa
   (`web/src/api.ts`); para consumir de fora, aponte o cliente para
   `http://<IP-DO-TERMUX>:3000/api`. Apps nativos não enviam header `Origin`
   e por isso passam pelo CORS sem configuração adicional (verificado no
   smoke); navegadores precisam da origem na `CORS_ORIGIN`.
4. UI web no Termux (opcional): rode `cd web && npm install && npm run dev -- --host`
   e adicione a origem resultante (ex.: `http://<IP-DO-TERMUX>:5173`) à
   `CORS_ORIGIN`.

## 5. Segurança (resumo)

- **Enforcement (RC2)**: o servidor **RECUSA iniciar** (fail-fast) com
  `BIND_HOST` não-loopback (ex.: `0.0.0.0`, `::`) sem `DARIUS_API_TOKEN`
  definido. A API nunca fica aberta na LAN por acidente — defina o token
  ou mantenha `BIND_HOST=127.0.0.1`.
- Com token definido, todo `/api` (exceto `/api/health`) exige
  `Authorization: Bearer <token>` ou `x-darius-token: <token>` (comparação
  timing-safe, o token nunca é logado).
- Serve apenas a LAN de confiança — não exponha o servidor à internet
  (sem TLS embutido; para exposição externa use um proxy reverso com TLS).
- `SQLite` e logs ficam no storage do Termux — proteja o diretório do app.

## 6. Limitações honestas (não inventadas)

- **HITL genérico sobre HTTP ainda não existe**: `POST /api/tasks/:id/approve`,
  `/reject` e `/cancel` **não estão implementados** no `src/server.ts` (gap
  documentado). Aprovação/rejeição via HTTP hoje só existe no vertical
  Finance (`POST /api/finance/analysis/:id/approve|reject`). O engine Core
  suporta `resumeTask`/`rejectTask`/`cancelTask` programaticamente — falta o
  transporte HTTP.
- Sem APK: o app mobile é scaffold Expo placeholder (ver
  `DARIUS_MOBILE_READINESS.md`); o Termux não depende disso — o servidor roda
  direto no Node.js do Termux.

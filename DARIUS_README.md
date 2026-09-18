# agente-dmn

Bot Telegram [@Dmarques_bot](https://t.me/Dmarques_bot) — gateway pessoal do DarioOS conectado ao Hermes.

## Propósito

O `agente-dmn` fornece uma interface Telegram para o sistema Hermes, um agente pessoal de IA. A funcionalidade ainda está em desenvolvimento.

## Configuração

As variáveis de ambiente necessárias estão documentadas em [`.env.example`](.env.example). Copie o arquivo para `.env` e preencha os valores localmente:

```bash
cp .env.example .env
```

Nunca versione o arquivo `.env` nem compartilhe o token real do BotFather.

| Variável | Descrição |
|---|---|
| `TELEGRAM_TOKEN` | Token do bot `@Dmarques_bot`, obtido via BotFather. |
| `TELEGRAM_CHAT_ID` | ID do chat autorizado a interagir com o bot. |

## Execução local

Requisitos: Node.js 20 ou superior.

```bash
npm install
cp .env.example .env
npm run typecheck
npm start
```

O bot usa **long polling** e restringe as mensagens ao `TELEGRAM_CHAT_ID` configurado. Os comandos iniciais são `/start` e `/help`. O encaminhamento de mensagens ao Hermes ainda está isolado como próxima etapa de implementação.

## Estado do projeto

A estrutura inicial do bot está implementada. Detalhes de integração com o Hermes, persistência e comandos adicionais serão adicionados conforme o gateway evoluir.

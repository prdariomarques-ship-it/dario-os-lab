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

## Estado do projeto

Funcionalidade em desenvolvimento. Detalhes de implementação, comandos suportados e instruções de execução serão adicionados conforme o gateway Hermes evoluir.

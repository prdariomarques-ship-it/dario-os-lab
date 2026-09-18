import "dotenv/config";
import { Bot, Context } from "grammy";
import { isAllowedChat } from "./access.js";

const token = process.env.TELEGRAM_TOKEN;
const allowedChatIdStr = process.env.TELEGRAM_CHAT_ID;
const allowedChatId = allowedChatIdStr ? Number(allowedChatIdStr) : undefined;

if (!token) {
  throw new Error("TELEGRAM_TOKEN não definido. Copie .env.example para .env e preencha o token.");
}

const bot = new Bot(token);

function isAllowed(ctx: Context): boolean {
  return isAllowedChat(ctx.chat?.id, allowedChatId);
}

bot.use(async (ctx, next) => {
  if (!isAllowed(ctx)) {
    await ctx.reply("Acesso não autorizado.");
    return;
  }
  await next();
});

bot.command("start", async (ctx) => {
  await ctx.reply(
    "Olá, Dario. Este é o gateway Telegram do DarioOS conectado ao Hermes.\n\n" +
      "Use /help para ver os comandos disponíveis."
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "/start — inicializa a conversa\n" +
      "/help — mostra esta ajuda\n\n" +
      "A integração de mensagens com o Hermes será habilitada em uma próxima etapa."
  );
});

bot.on("message:text", async (ctx) => {
  const text = ctx.message.text;
  if (!text) return;

  await ctx.reply("⏳ Recebi sua mensagem. Criando Task no DARIUS OSS...");

  try {
    const response = await fetch("http://127.0.0.1:3000/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ objective: text })
    });

    if (!response.ok) {
      await ctx.reply("❌ Falha ao criar a Task na API.");
      return;
    }

    const data = await response.json();
    await ctx.reply(`✅ Task criada com sucesso!\n\nID: ${data.id}\nStatus: PENDING`);
  } catch (error) {
    await ctx.reply(`❌ O servidor local DARIUS (porta 3000) não está respondendo.`);
  }
});

bot.catch((error) => {
  console.error("Erro no bot Telegram:", error.error);
});

async function main(): Promise<void> {
  await bot.api.setMyCommands([
    { command: "start", description: "Inicializa a conversa" },
    { command: "help", description: "Mostra a ajuda" },
  ]);

  console.log("agente-dmn iniciado em modo polling.");
  await bot.start({
    onStart: (info) => console.log(`Bot conectado como @${info.username}`),
  });
}

void main().catch((error: unknown) => {
  console.error("Falha ao iniciar o agente-dmn:", error);
  process.exitCode = 1;
});

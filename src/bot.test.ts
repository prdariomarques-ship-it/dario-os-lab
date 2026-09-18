import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock the environment variables before importing bot
const originalEnv = process.env;

describe("bot.ts entry point", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it("throws an error if TELEGRAM_TOKEN is missing", async () => {
    delete process.env.TELEGRAM_TOKEN;

    await expect(async () => {
      await import("./bot.js");
    }).rejects.toThrow("TELEGRAM_TOKEN não definido");
  });

  it("initializes without throwing if TELEGRAM_TOKEN is present", async () => {
    process.env.TELEGRAM_TOKEN = "fake_token";
    process.env.TELEGRAM_CHAT_ID = "123456";

    // We must mock grammy to prevent actual network calls during import
    vi.mock("grammy", () => {
      return {
        Bot: vi.fn().mockImplementation(() => ({
          use: vi.fn(),
          command: vi.fn(),
          on: vi.fn(),
          catch: vi.fn(),
          start: vi.fn(),
          api: {
            setMyCommands: vi.fn().mockResolvedValue(true)
          }
        }))
      };
    });

    const botModule = await import("./bot.js");
    expect(botModule).toBeDefined();
  });
});

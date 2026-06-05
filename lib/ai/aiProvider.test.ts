import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveAiProvider } from "./aiProvider";

const AI_ENV_KEYS = [
  "AI_PROVIDER",
  "OPENAI_API_KEY",
  "OPENAI_MODEL",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_MODEL",
] as const;

describe("resolveAiProvider", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of AI_ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of AI_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("default openai quando AI_PROVIDER è assente", () => {
    const r = resolveAiProvider();
    expect(r.provider).toBe("openai");
    expect(r.apiUrl).toBe("https://api.openai.com/v1/chat/completions");
    expect(r.model).toBe("gpt-4o-mini");
    expect(r.apiKey).toBeUndefined();
    expect(r.configured).toBe(false);
  });

  it("openai con key → configured true", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    const r = resolveAiProvider();
    expect(r.provider).toBe("openai");
    expect(r.apiKey).toBe("sk-test");
    expect(r.configured).toBe(true);
  });

  it("deepseek con key → endpoint, modello e configured corretti", () => {
    process.env.AI_PROVIDER = "deepseek";
    process.env.DEEPSEEK_API_KEY = "ds-test";
    const r = resolveAiProvider();
    expect(r.provider).toBe("deepseek");
    expect(r.apiUrl).toBe("https://api.deepseek.com/chat/completions");
    expect(r.model).toBe("deepseek-chat");
    expect(r.apiKey).toBe("ds-test");
    expect(r.configured).toBe(true);
  });

  it("deepseek senza key → configured false", () => {
    process.env.AI_PROVIDER = "deepseek";
    const r = resolveAiProvider();
    expect(r.provider).toBe("deepseek");
    expect(r.apiKey).toBeUndefined();
    expect(r.configured).toBe(false);
  });

  it("provider sconosciuto → fallback openai", () => {
    process.env.AI_PROVIDER = "anthropic";
    process.env.OPENAI_API_KEY = "sk-x";
    const r = resolveAiProvider();
    expect(r.provider).toBe("openai");
    expect(r.apiUrl).toBe("https://api.openai.com/v1/chat/completions");
    expect(r.configured).toBe(true);
  });

  it("modello custom rispettato per entrambi i provider", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_MODEL = "gpt-4o";
    expect(resolveAiProvider().model).toBe("gpt-4o");

    process.env.AI_PROVIDER = "deepseek";
    process.env.DEEPSEEK_MODEL = "deepseek-reasoner";
    expect(resolveAiProvider().model).toBe("deepseek-reasoner");
  });

  it("AI_PROVIDER case-insensitive e con spazi", () => {
    process.env.AI_PROVIDER = "  DeepSeek  ";
    process.env.DEEPSEEK_API_KEY = "ds";
    expect(resolveAiProvider().provider).toBe("deepseek");
  });

  it("key con soli spazi è trattata come assente", () => {
    process.env.AI_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "   ";
    const r = resolveAiProvider();
    expect(r.apiKey).toBeUndefined();
    expect(r.configured).toBe(false);
  });
});

import OpenAI from "openai";

// Direct OpenRouter access with the user's own key, never a browser variable.
const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.open_sec;
if (!apiKey) throw new Error("OpenRouter API key is not configured.");

export const openrouter = new OpenAI({
  apiKey,
  baseURL: "https://openrouter.ai/api/v1",
  timeout: 45_000,
  maxRetries: 1,
});

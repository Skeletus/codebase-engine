import OpenAI from "openai";

// Legacy web explanations only; the local engine never imports this client.

// Exact snapshots, never a moving alias: an alias changes the model under a
// cached answer without changing its key. Each model is part of its own
// tasks' cache keys, so re-pinning one invalidates only its own answers.
export const MODELS = {
  explain: "gpt-5.5-2026-04-23",
  classify: "gpt-5.4-mini-2026-03-17",
} as const;

let client: OpenAI | null = null;

// Built on first use rather than at import, so a missing key fails the call
// that needed it with a message saying so, not the server's boot.
export function ai(): OpenAI {
  if (client) return client;
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error("OPENAI_API_KEY isn't set in .env.local, so nothing can be explained");
  client = new OpenAI({ apiKey });
  return client;
}

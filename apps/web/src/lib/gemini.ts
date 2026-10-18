import { readFileSync } from "node:fs";
import path from "node:path";

import { repoRoot } from "@/lib/paths";

const MODEL = "gemini-2.5-flash";
const MODEL_FALLBACKS = ["gemini-flash-latest", "gemini-2.0-flash", "gemini-2.5-flash-lite", "gemini-3-flash"];

let workingModel: string | null = null;

export function geminiKey(): string | undefined {
  return envValue("GEMINI_API_KEY");
}

export function geminiModel(): string {
  return workingModel || envValue("GEMINI_MODEL") || MODEL;
}

export async function draftWithGemini(prompt: string): Promise<string> {
  const key = geminiKey();
  if (!key) throw new Error("GEMINI_API_KEY is empty");
  const models = [geminiModel(), ...MODEL_FALLBACKS.filter((model) => model !== geminiModel())];
  let lastStatus = 0;
  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const keyed = await postGemini(prompt, model, { "x-goog-api-key": key });
      if (keyed.ok) {
        workingModel = model;
        return keyed.text;
      }
      lastStatus = keyed.status;
      if (keyed.status === 401 || keyed.status === 403) {
        const bearer = await postGemini(prompt, model, { authorization: `Bearer ${key}` });
        if (bearer.ok) {
          workingModel = model;
          return bearer.text;
        }
        lastStatus = bearer.status;
        break;
      }
      if (keyed.status === 404) break;
      if (keyed.status !== 429 && keyed.status !== 503) break;
    }
    if (lastStatus !== 404 && lastStatus !== 429 && lastStatus !== 503) break;
  }
  throw new Error(`gemini ${lastStatus}`);
}

async function postGemini(
  prompt: string,
  model: string,
  auth: Record<string, string>,
): Promise<{ ok: boolean; status: number; text: string }> {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", ...auth },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 1024,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    },
  );
  if (!response.ok) return { ok: false, status: response.status, text: "" };
  const body = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "";
  if (!text) return { ok: false, status: response.status, text: "" };
  return { ok: true, status: response.status, text };
}

function envValue(name: string): string | undefined {
  const current = process.env[name];
  if (current) return current;
  const file = readEnvFile();
  return file.get(name);
}

function readEnvFile(): Map<string, string> {
  const values = new Map<string, string>();
  let raw = "";
  try {
    raw = readFileSync(path.join(repoRoot(), ".env"), "utf8");
  } catch {
    return values;
  }
  const bare: string[] = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const body = trimmed.startsWith("export ") ? trimmed.slice("export ".length).trim() : trimmed;
    const split = body.indexOf("=");
    if (split < 0) {
      bare.push(unquote(body));
      continue;
    }
    const key = body.slice(0, split).trim();
    const value = unquote(body.slice(split + 1).trim());
    if (key && value) values.set(key, value);
  }
  if (!values.get("GEMINI_API_KEY") && bare.length === 1 && bare[0]) {
    values.set("GEMINI_API_KEY", bare[0]);
  }
  if (!values.get("GEMINI_API_KEY") && values.get("GOOGLE_API_KEY")) {
    values.set("GEMINI_API_KEY", values.get("GOOGLE_API_KEY") ?? "");
  }
  return values;
}

function unquote(value: string): string {
  if (
    (value.startsWith("\"") && value.endsWith("\"")) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

import { PLAIN_PROMPT } from "@/lib/plain";

export async function POST() {
  try {
    const { draftWithGemini } = await import("@/lib/gemini");
    const text = await draftWithGemini(PLAIN_PROMPT);
    return Response.json({ text, evidence: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : "gemini failed";
    const status = message.includes("empty") ? 400 : 502;
    return Response.json({ error: message }, { status });
  }
}

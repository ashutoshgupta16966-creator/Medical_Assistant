import { Router, type IRouter } from "express";
import { ChatHealthBody, ChatHealthResponse } from "@workspace/api-zod";
import { GoogleGenAI } from "@google/genai";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Model fallback list — in exact priority order requested:
// 1. gemini-3.8-flash, 2. gemini-3.7-flash, 3. gemini-3.6-flash
// Can be overridden by optional env variable GEMINI_MODELS (comma separated)
// ---------------------------------------------------------------------------
const DEFAULT_MODELS = ["gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash"];

function resolveModels(): string[] {
  const envOverride = process.env.GEMINI_MODELS;
  if (envOverride && envOverride.trim()) {
    return envOverride
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
  }
  return [...DEFAULT_MODELS];
}

// Per-attempt timeout. Backend worst-case = models.length * MODEL_TIMEOUT_MS.
// Frontend signal timeout is set to 90 s in custom-fetch.ts, covering this.
const MODEL_TIMEOUT_MS = 20_000; // 20 s per model

const disclaimerEnglish = "This is AI-generated guidance, not a diagnosis. Please confirm with a doctor or pharmacist.";
const disclaimerHindi = "यह AI द्वारा बनाई गई जानकारी है, यह कोई निदान नहीं है। कृपया डॉक्टर या फार्मासिस्ट से पुष्टि करें।";
const safetyEnglish = "If symptoms are severe, last more than 2–3 days, or include difficulty breathing, severe pain, high fever, confusion, fainting, heavy bleeding, or any other red-flag symptom, see a doctor immediately or go to the nearest hospital.";
const safetyHindi = "अगर लक्षण गंभीर हों, 2–3 दिनों से ज़्यादा रहें, या सांस लेने में दिक्कत, तेज दर्द, तेज बुखार, भ्रम, बेहोशी, अधिक रक्तस्राव या कोई अन्य गंभीर चेतावनी हो, तो तुरंत डॉक्टर को दिखाएं या नज़दीकी अस्पताल जाएं।";

const chatPrompt = `You are a careful general health information assistant for families in India.

The user will describe any health concern in plain language. Return ONLY valid JSON, with no markdown fences and no extra commentary, matching this exact shape:
{
  "answerEnglish": "A detailed but easy-to-understand answer in plain English",
  "answerHindi": "A natural Hindi translation of the same answer"
}

Rules:
- Explain likely common, non-diagnostic causes when appropriate, using cautious wording such as "can be caused by".
- Give practical home-care, rest, hydration, food, and monitoring advice for mild common symptoms.
- You may mention over-the-counter medicine categories, such as a fever reducer like paracetamol for mild fever, but do not give specific dosing instructions and do not assume a medicine is safe for this person.
- Always clearly advise immediate medical care for severe symptoms, symptoms lasting more than 2–3 days, difficulty breathing, severe pain, high fever, confusion, fainting, heavy bleeding, or any other red-flag symptom.
- Never diagnose, prescribe, or imply that the user should delay urgent care.
- Do not include a disclaimer or repeat the final emergency rule; the server adds both consistently.
- Keep both answers aligned in meaning and useful for a non-medical reader.`;

function cleanJsonText(value: string): string {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? value;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
}

function appendSafetyIfMissing(answer: string, safety: string, markers: RegExp): string {
  return markers.test(answer) ? answer : `${answer}\n\n${safety}`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("CHAT_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Returns true if the error looks like a transient overload (429 / 503). */
function isRetryable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const rec = err as Record<string, unknown>;
  const status = typeof rec?.status === "number" ? rec.status : 0;
  return (
    status === 429 ||
    status === 503 ||
    msg.includes("429") ||
    msg.includes("503") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("overloaded")
  );
}

async function tryModel(model: string, message: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING");

  const ai = new GoogleGenAI({ apiKey });
  const response = await withTimeout(
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts: [{ text: `${chatPrompt}\n\nUser concern:\n${message}` }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.25,
      },
    }),
    MODEL_TIMEOUT_MS,
  );
  if (!response.text) throw new Error(`EMPTY_CHAT_RESPONSE (${model})`);
  return response.text;
}

/** Extracts any model name suggested in a 404 / 'no longer available' error message. */
function extractSuggestedModel(err: unknown): string | null {
  if (!err) return null;
  const errStr = err instanceof Error ? `${err.message} ${(err as Error & { cause?: unknown }).cause ?? ""}` : String(err);
  const rec = typeof err === "object" && err !== null ? (err as Record<string, unknown>) : {};
  const status = typeof rec.status === "number" ? rec.status : undefined;
  const is404 =
    status === 404 ||
    /404|not[ _]?found|no longer available|deprecated/i.test(errStr);
  if (!is404) return null;

  const match =
    errStr.match(
      /(?:suggested|replacement|alternative|use instead|use|recommend(?:ed)?)\s*[:"']?\s*(?:models\/)?(gemini-[a-zA-Z0-9.-]+)/i,
    ) || errStr.match(/no longer available.*?models\/(gemini-[a-zA-Z0-9.-]+)/i);

  if (match && match[1]) {
    const suggested = match[1].trim();
    if (/^gemini-[a-zA-Z0-9.-]+$/.test(suggested)) {
      return suggested;
    }
  }
  return null;
}

/** Try a single model with one automatic retry on 429 / 503. */
async function requestModel(model: string, message: string): Promise<string> {
  try {
    return await tryModel(model, message);
  } catch (firstErr: unknown) {
    if (isRetryable(firstErr)) {
      console.log(`[chat] Retryable error on model=${model} — waiting 2 s before retry`);
      await new Promise((r) => setTimeout(r, 2000));
      return tryModel(model, message);
    }
    throw firstErr;
  }
}

router.post("/chat", async (req, res) => {
  const parsed = ChatHealthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please describe your health concern in a little more detail." });
    return;
  }

  const initialModels = resolveModels();
  console.log(`[chat] New request. Initial model list: [${initialModels.join(", ")}]`);

  try {
    let rawText: string | null = null;
    const queue = [...initialModels];
    const triedModels = new Set<string>();

    while (queue.length > 0) {
      const model = queue.shift()!;
      if (triedModels.has(model)) continue;
      triedModels.add(model);

      const attemptStart = Date.now();
      try {
        console.log(`[chat] Trying model=${model}...`);
        rawText = await requestModel(model, parsed.data.message);
        const elapsed = Date.now() - attemptStart;
        console.log(`[chat] model=${model} SUCCESS in ${elapsed} ms`);
        break;
      } catch (err: unknown) {
        const elapsed = Date.now() - attemptStart;
        const errMsg = err instanceof Error ? err.message : String(err);
        const rec = err as Record<string, unknown>;
        const status = typeof rec?.status === "number" ? rec.status : "unknown";
        console.warn(
          `[chat] model=${model} FAILED in ${elapsed} ms — status=${status} error=${errMsg}`,
        );
        req.log.warn({ err, model }, `Gemini chat model ${model} failed; trying next`);

        // If the error was a 404 offering a replacement model, try that suggested model next
        const suggested = extractSuggestedModel(err);
        if (suggested && !triedModels.has(suggested)) {
          console.log(`[chat] 404 suggested model "${suggested}" detected in error; trying it next`);
          queue.unshift(suggested);
        }
      }
    }

    if (!rawText) {
      // Every model failed — return the hardcoded fallback so the app never breaks
      console.error(`[chat] All ${triedModels.size} model(s) failed. Returning hardcoded fallback.`);
      req.log.error({ triedModels: Array.from(triedModels) }, "All Gemini chat models failed");
      res.json(
        ChatHealthResponse.parse({
          answerEnglish: `We couldn't reach our health assistant right now. Please try again in a moment.\n\n${safetyEnglish}\n\n${disclaimerEnglish}`,
          answerHindi: `अभी हमारा स्वास्थ्य सहायक उपलब्ध नहीं है। कृपया थोड़ी देर बाद पुनः प्रयास करें।\n\n${safetyHindi}\n\n${disclaimerHindi}`,
          disclaimerEnglish,
          disclaimerHindi,
        }),
      );
      return;
    }

    let data: unknown;
    try {
      data = JSON.parse(cleanJsonText(rawText));
    } catch (parseError) {
      req.log.error({ err: parseError, rawText }, "Gemini returned invalid chat JSON");
      res.status(502).json({ error: "We couldn't prepare a safe answer right now. Please try again." });
      return;
    }

    const candidate = data as Record<string, unknown>;
    const answerEnglish =
      typeof candidate.answerEnglish === "string" && candidate.answerEnglish.trim()
        ? candidate.answerEnglish.trim()
        : "I need a little more detail to give useful general guidance. Please describe when the symptoms started and how severe they feel.";
    const answerHindi =
      typeof candidate.answerHindi === "string" && candidate.answerHindi.trim()
        ? candidate.answerHindi.trim()
        : "सामान्य जानकारी देने के लिए मुझे थोड़ी और जानकारी चाहिए। कृपया बताएं कि लक्षण कब शुरू हुए और कितने गंभीर हैं।";

    res.json(
      ChatHealthResponse.parse({
        answerEnglish: `${appendSafetyIfMissing(answerEnglish, safetyEnglish, /difficulty breathing|see a doctor immediately|more than 2.?3 days/i)}\n\n${disclaimerEnglish}`,
        answerHindi: `${appendSafetyIfMissing(answerHindi, safetyHindi, /सांस लेने|तुरंत डॉक्टर|2.?3 दिनों/i)}\n\n${disclaimerHindi}`,
        disclaimerEnglish,
        disclaimerHindi,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "GEMINI_API_KEY_MISSING") {
      req.log.error({ err: error }, "Gemini API key is not configured");
      res
        .status(502)
        .json({ error: "Chat is not connected yet. Add GEMINI_API_KEY in Secrets, then retry." });
      return;
    }
    req.log.error({ err: error }, "General health chat failed");
    res.status(502).json({ error: "We couldn't answer that right now. Please try again." });
  }
});

export default router;

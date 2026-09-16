import { Router, type IRouter } from "express";
import { ChatHealthBody, ChatHealthResponse } from "@workspace/api-zod";
import { GoogleGenAI } from "@google/genai";

const router: IRouter = Router();

const PRIMARY_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const MODEL_TIMEOUT_MS = 18_000;
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

async function requestModel(model: string, message: string): Promise<string> {
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

router.post("/chat", async (req, res) => {
  const parsed = ChatHealthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please describe your health concern in a little more detail." });
    return;
  }

  try {
    let rawText: string;
    try {
      rawText = await requestModel(PRIMARY_MODEL, parsed.data.message);
    } catch (primaryError) {
      req.log.warn({ err: primaryError, model: PRIMARY_MODEL }, "Primary Gemini chat model failed; trying fallback");
      rawText = await requestModel(FALLBACK_MODEL, parsed.data.message);
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
    const answerEnglish = typeof candidate.answerEnglish === "string" && candidate.answerEnglish.trim()
      ? candidate.answerEnglish.trim()
      : "I need a little more detail to give useful general guidance. Please describe when the symptoms started and how severe they feel.";
    const answerHindi = typeof candidate.answerHindi === "string" && candidate.answerHindi.trim()
      ? candidate.answerHindi.trim()
      : "सामान्य जानकारी देने के लिए मुझे थोड़ी और जानकारी चाहिए। कृपया बताएं कि लक्षण कब शुरू हुए और कितने गंभीर हैं।";

    res.json(ChatHealthResponse.parse({
      answerEnglish: `${appendSafetyIfMissing(answerEnglish, safetyEnglish, /difficulty breathing|see a doctor immediately|more than 2.?3 days/i)}\n\n${disclaimerEnglish}`,
      answerHindi: `${appendSafetyIfMissing(answerHindi, safetyHindi, /सांस लेने|तुरंत डॉक्टर|2.?3 दिनों/i)}\n\n${disclaimerHindi}`,
      disclaimerEnglish,
      disclaimerHindi,
    }));
  } catch (error) {
    if (error instanceof Error && error.message === "GEMINI_API_KEY_MISSING") {
      req.log.error({ err: error }, "Gemini API key is not configured");
      res.status(502).json({ error: "Chat is not connected yet. Add GEMINI_API_KEY in Secrets, then retry." });
      return;
    }
    if (error instanceof Error && error.message === "CHAT_TIMEOUT") {
      req.log.error({ err: error }, "Gemini chat timed out");
      res.status(408).json({ error: "This answer is taking a little longer. Please retry." });
      return;
    }
    req.log.error({ err: error }, "General health chat failed");
    res.status(502).json({ error: "We couldn't answer that right now. Please try again." });
  }
});

export default router;
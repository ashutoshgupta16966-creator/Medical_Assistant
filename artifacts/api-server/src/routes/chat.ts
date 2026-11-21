import { Router, type IRouter } from "express";
import { ChatHealthBody, ChatHealthResponse } from "@workspace/api-zod";
import {
  FALLBACK_TIERS,
  resolveFallbackTiers,
  executeFallbackChain,
  type TierLogEntry,
} from "../lib/ai-fallback.js";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Fallback chain in exact order requested:
// Tier 1: claude-opus-4.8 (Anthropic API ID: claude-opus-4-8)
// Tier 2: claude-sonnet-4.6 (Anthropic API ID: claude-sonnet-4-6)
// Tier 3: gemini-3.8-flash
// Tier 4: gemini-3.7-flash
// Tier 5: gemini-3.6-flash
//
// Note: Anthropic official API uses hyphens in IDs (claude-opus-4-8, claude-sonnet-4-6).
// The list can be overridden via optional env variable AI_MODELS or GEMINI_MODELS.
// ---------------------------------------------------------------------------
export const ROUTE_FALLBACK_TIERS = FALLBACK_TIERS;

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

/**
 * Parses raw text from the AI fallback chain into English and Hindi answers.
 * If JSON parsing fails (e.g. streaming stopped mid-JSON or raw text returned),
 * gracefully extracts text without breaking.
 */
function parseChatAnswers(rawText: string): { answerEnglish: string; answerHindi: string } {
  try {
    const parsed = JSON.parse(cleanJsonText(rawText));
    if (parsed && typeof parsed === "object") {
      const candidate = parsed as Record<string, unknown>;
      const answerEnglish =
        typeof candidate.answerEnglish === "string" && candidate.answerEnglish.trim()
          ? candidate.answerEnglish.trim()
          : "";
      const answerHindi =
        typeof candidate.answerHindi === "string" && candidate.answerHindi.trim()
          ? candidate.answerHindi.trim()
          : "";

      if (answerEnglish || answerHindi) {
        return {
          answerEnglish: answerEnglish || answerHindi,
          answerHindi: answerHindi || answerEnglish,
        };
      }
    }
  } catch {
    // Attempt regex extraction of JSON fields from partial or malformed text
    const enMatch = rawText.match(/"answerEnglish"\s*:\s*"((?:[^"\\]|\\.)*)"/);
    const hiMatch = rawText.match(/"answerHindi"\s*:\s*"((?:[^"\\]|\\.)*)"/);

    if (enMatch || hiMatch) {
      const en = enMatch ? enMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim() : "";
      const hi = hiMatch ? hiMatch[1].replace(/\\"/g, '"').replace(/\\n/g, "\n").trim() : "";
      return {
        answerEnglish: en || hi,
        answerHindi: hi || en,
      };
    }
  }

  // Fallback to raw text if present
  const cleaned = rawText
    .replace(/^\s*\{?\s*"answerEnglish"\s*:\s*"?/i, "")
    .replace(/"?\s*,?\s*"answerHindi"\s*:\s*"?/i, " / ")
    .replace(/"?\s*\}?\s*$/i, "")
    .trim();

  return {
    answerEnglish: cleaned || "I need a little more detail to give useful general guidance. Please describe when the symptoms started and how severe they feel.",
    answerHindi: "सामान्य जानकारी देने के लिए मुझे थोड़ी और जानकारी चाहिए। कृपया बताएं कि लक्षण कब शुरू हुए और कितने गंभीर हैं।",
  };
}

router.post("/chat", async (req, res) => {
  const parsed = ChatHealthBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please describe your health concern in a little more detail." });
    return;
  }

  const tiers = resolveFallbackTiers();
  console.log(`[chat] Request started. Active fallback tiers: [${tiers.map((t) => t.id).join(", ")}]`);

  try {
    const chainResult = await executeFallbackChain(tiers, {
      systemPrompt: chatPrompt,
      originalUserPrompt: `User concern:\n${parsed.data.message}`,
      onTierLog: (log: TierLogEntry) => {
        // Backend console logging only - never logs user input or keys
        console.log(
          `[chat] Tier: ${log.model} (${log.provider}) | ` +
            `Start: ${log.startIso} | End: ${log.endIso} | Elapsed: ${log.elapsedMs}ms | ` +
            `Result: ${log.result}${log.errorType ? ` (${log.errorType})` : ""} | ` +
            `Chars: ${log.charsCollectedSoFar} | Continuation: ${log.continuationUsed}`,
        );
        req.log.info(
          {
            model: log.model,
            provider: log.provider,
            elapsedMs: log.elapsedMs,
            result: log.result,
            charsCollectedSoFar: log.charsCollectedSoFar,
            continuationUsed: log.continuationUsed,
          },
          "Chat tier attempt completed",
        );
      },
    });

    console.log(
      `[chat] Total request elapsed: ${chainResult.totalElapsedMs}ms | ` +
        `Chars collected: ${chainResult.text.length} | Completed: ${chainResult.completed}`,
    );

    // If every tier failed and no partial text was produced: return existing hardcoded fallback
    if (!chainResult.text || chainResult.text.trim().length === 0) {
      console.error("[chat] All fallback tiers failed with empty text. Returning hardcoded fallback.");
      req.log.error({ tiers: tiers.map((t) => t.id) }, "All AI chat tiers failed with empty text");
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

    const { answerEnglish, answerHindi } = parseChatAnswers(chainResult.text);

    res.json(
      ChatHealthResponse.parse({
        answerEnglish: `${appendSafetyIfMissing(answerEnglish, safetyEnglish, /difficulty breathing|see a doctor immediately|more than 2.?3 days/i)}\n\n${disclaimerEnglish}`,
        answerHindi: `${appendSafetyIfMissing(answerHindi, safetyHindi, /सांस लेने|तुरंत डॉक्टर|2.?3 दिनों/i)}\n\n${disclaimerHindi}`,
        disclaimerEnglish,
        disclaimerHindi,
      }),
    );
  } catch (error) {
    console.error("[chat] Unhandled error during health chat:", error instanceof Error ? error.message : error);
    req.log.error({ err: error }, "General health chat failed");
    res.status(502).json({ error: "We couldn't answer that right now. Please try again." });
  }
});

export default router;

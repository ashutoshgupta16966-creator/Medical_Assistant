import { Router, type IRouter } from "express";
import { AnalyzeScanBody, AnalyzeScanResponse } from "@workspace/api-zod";
import { GoogleGenAI } from "@google/genai";

const router: IRouter = Router();

const PRIMARY_MODEL = process.env.GEMINI_MODEL ?? "gemini-3.7-flash";
const FALLBACK_MODEL = "gemini-3.5-flash-lite";
const MODEL_TIMEOUT_MS = 18_000;

const analysisPrompt = `You are a careful medical information assistant analyzing one uploaded image from India. It may show a medicine strip, medicine box, prescription, or lab report.

Return ONLY valid JSON, with no markdown fences and no extra commentary, matching this exact shape:
{
  "category": "medicine" | "lab_report" | "unknown",
  "nameEnglish": "short English medicine or report name",
  "nameHindi": "Hindi translation of the name, or empty string if unreadable",
  "treatsEnglish": "simple English description of the illness, condition, or what the report relates to",
  "treatsHindi": "Hindi translation of that description, or empty string if unreadable",
  "usage": "plain-English explanation of what it is for and how it is generally used",
  "usageHindi": "Hindi translation of the usage explanation",
  "dosage": "plain-English dosage guidance only when clearly printed or safely inferable; otherwise say to confirm with a doctor or pharmacist",
  "dosageHindi": "Hindi translation of the dosage guidance",
  "expiryDate": "YYYY-MM-DD if a clear expiry date is visible, otherwise null",
  "expiryStatus": "danger" | "soon" | "safe" | "unknown",
  "expiryLabel": "Danger — Replace Now" | "Use Soon" | "Safe to Use" | "Expiry not visible",
  "expiryLabelHindi": "Hindi translation of expiryLabel",
  "confidence": number from 0 to 1,
  "notes": ["short plain-English note", "..."],
  "notesHindi": ["Hindi translation of each note", "..."]
}

Rules:
- Never invent a medicine name, lab value, dosage, or expiry date. Use "Not clearly visible" or an empty string when uncertain.
- Treat expiry as danger if expired or within 7 days, soon if 8–15 days away, safe if more than 15 days away. If no expiry is visible, use unknown.
- Keep usage, dosage, and notes concise and easy for a non-medical reader.
- Do not diagnose or make emergency claims.
- Keep the Hindi fields natural, concise, and aligned one-to-one with their English counterparts.`;

function cleanJsonText(value: string): string {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced?.[1] ?? value;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
}

function expiryFromDate(expiryDate: string | null): {
  status: "danger" | "soon" | "safe" | "unknown";
  label: string;
} {
  if (!expiryDate) {
    return { status: "unknown", label: "Expiry not visible" };
  }

  const expiry = new Date(`${expiryDate}T23:59:59Z`);
  if (Number.isNaN(expiry.getTime())) {
    return { status: "unknown", label: "Expiry not visible" };
  }

  const daysLeft = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
  if (daysLeft <= 7) {
    return { status: "danger", label: "Danger — Replace Now" };
  }
  if (daysLeft <= 15) {
    return { status: "soon", label: "Use Soon" };
  }
  return { status: "safe", label: "Safe to Use" };
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("ANALYSIS_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function requestModel(
  model: string,
  imageData: string,
  mimeType: string,
): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY_MISSING");
  }

  const ai = new GoogleGenAI({ apiKey });

  let response: Awaited<ReturnType<typeof ai.models.generateContent>>;
  try {
    response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: [
          {
            role: "user",
            parts: [
              { inlineData: { mimeType, data: imageData } },
              { text: analysisPrompt },
            ],
          },
        ],
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      }),
      MODEL_TIMEOUT_MS,
    );
  } catch (sdkError) {
    // Log the full SDK error so it appears in Render logs even if pino serializes it partially
    console.error(
      `[analyze] Gemini SDK call failed for model=${model}:`,
      sdkError instanceof Error
        ? {
            message: sdkError.message,
            name: sdkError.name,
            cause: (sdkError as NodeJS.ErrnoException).cause,
            stack: sdkError.stack,
            // @google/genai sometimes attaches status/body on the error object
            ...(sdkError as unknown as Record<string, unknown>),
          }
        : sdkError,
    );
    throw sdkError;
  }

  // response.text is a getter in @google/genai v2+ that may return undefined
  // when the model response was blocked or the candidate list was empty.
  const rawText: string | undefined =
    typeof response.text === "function"
      ? (response.text as () => string | undefined)()
      : response.text;

  // Log the raw text at debug level so it is visible when LOG_LEVEL=debug
  console.log(
    `[analyze] Raw Gemini response from model=${model} (${rawText?.length ?? 0} chars):`,
    rawText ? rawText.slice(0, 500) : "<empty>",
  );

  if (!rawText) {
    // Log the full response object to diagnose blocked/empty responses
    console.error(
      `[analyze] EMPTY_MODEL_RESPONSE from model=${model}. Full response object:`,
      JSON.stringify(
        {
          candidates: (response as unknown as Record<string, unknown>).candidates,
          promptFeedback: (response as unknown as Record<string, unknown>).promptFeedback,
          usageMetadata: (response as unknown as Record<string, unknown>).usageMetadata,
        },
        null,
        2,
      ),
    );
    throw new Error(`EMPTY_MODEL_RESPONSE (${model})`);
  }
  return rawText;
}

router.post("/analyze", async (req, res) => {
  const parsed = AnalyzeScanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Please upload a supported image and try again." });
    return;
  }

  const { imageData, mimeType } = parsed.data;
  const base64 = imageData.replace(/^data:[^;]+;base64,/, "");

  // Log image details before every request so size issues are immediately diagnosable
  const estimatedBytes = Math.ceil((base64.length * 3) / 4);
  const estimatedKB = (estimatedBytes / 1024).toFixed(1);
  console.log(`[analyze] Incoming image: mimeType=${mimeType}, estimatedSize=${estimatedKB} KB (base64 length=${base64.length})`);
  req.log.info({ mimeType, estimatedBytes, base64Length: base64.length }, "Incoming image details");

  // Enforce ~4 MB image cap (Vercel serverless payload ceiling is 4.5 MB total)
  const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
  if (estimatedBytes > MAX_BYTES) {
    console.error(`[analyze] Image too large: ${estimatedKB} KB exceeds 4 MB limit. Returning 413.`);
    res.status(413).json({
      error: `That image is too large to analyze (${estimatedKB} KB; limit: 4 MB). Please resize or compress it before uploading.`,
    });
    return;
  }

  try {
    let rawText: string;
    try {
      rawText = await requestModel(PRIMARY_MODEL, base64, mimeType);
    } catch (primaryError) {
      console.error(
        `[analyze] Primary model (${PRIMARY_MODEL}) failed — trying fallback (${FALLBACK_MODEL}):`,
        primaryError instanceof Error ? primaryError.message : primaryError,
      );
      req.log.warn({ err: primaryError, model: PRIMARY_MODEL }, "Primary Gemini model failed; trying fallback");
      rawText = await requestModel(FALLBACK_MODEL, base64, mimeType);
    }

    let data: unknown;
    try {
      const cleaned = cleanJsonText(rawText);
      data = JSON.parse(cleaned);
    } catch (parseError) {
      // Log the FULL raw text so we can see exactly what Gemini returned
      console.error(
        "[analyze] JSON.parse failed. Full raw Gemini text:",
        rawText,
      );
      console.error("[analyze] JSON parse error:", parseError);
      req.log.error({ err: parseError, rawText }, "Gemini returned invalid JSON");
      res.status(502).json({ error: "We couldn't read that image clearly. Please try a sharper photo." });
      return;
    }

    const candidate = data as Record<string, unknown>;
    const expiryDate =
      typeof candidate.expiryDate === "string" && candidate.expiryDate
        ? candidate.expiryDate
        : null;
    const expiry = expiryFromDate(expiryDate);
    const normalized = AnalyzeScanResponse.parse({
      category: candidate.category ?? "unknown",
      nameEnglish: candidate.nameEnglish || "Not clearly visible",
      nameHindi: candidate.nameHindi || "",
      treatsEnglish: candidate.treatsEnglish || "Not clearly visible",
      treatsHindi: candidate.treatsHindi || "",
      usage: candidate.usage || "Please confirm the intended use with a doctor or pharmacist.",
      usageHindi: candidate.usageHindi || "उपयोग की पुष्टि डॉक्टर या फार्मासिस्ट से करें।",
      dosage: candidate.dosage || "Dosage is not clearly visible. Please confirm with a doctor or pharmacist.",
      dosageHindi: candidate.dosageHindi || "खुराक स्पष्ट रूप से दिखाई नहीं दे रही है। डॉक्टर या फार्मासिस्ट से पुष्टि करें।",
      expiryDate,
      expiryStatus: expiry.status,
      expiryLabel: expiry.label,
      expiryLabelHindi: candidate.expiryLabelHindi || "समाप्ति की स्थिति उपलब्ध नहीं है",
      confidence: typeof candidate.confidence === "number" ? Math.min(1, Math.max(0, candidate.confidence)) : 0.4,
      notes: Array.isArray(candidate.notes)
        ? candidate.notes.filter((note): note is string => typeof note === "string").slice(0, 5)
        : [],
      notesHindi: Array.isArray(candidate.notesHindi)
        ? candidate.notesHindi.filter((note): note is string => typeof note === "string").slice(0, 5)
        : [],
    });

    res.json(normalized);
  } catch (error) {
    if (error instanceof Error && error.message === "GEMINI_API_KEY_MISSING") {
      console.error("[analyze] GEMINI_API_KEY is not set in environment variables.");
      req.log.error({ err: error }, "Gemini API key is not configured");
      res.status(502).json({ error: "Analysis is not connected yet. Add GEMINI_API_KEY in Secrets, then retry." });
      return;
    }

    if (error instanceof Error && error.message === "ANALYSIS_TIMEOUT") {
      console.error(`[analyze] Gemini analysis timed out after ${MODEL_TIMEOUT_MS}ms.`);
      req.log.error({ err: error }, "Gemini analysis timed out");
      res.status(408).json({ error: "This image is taking a little longer to analyze. Please retry." });
      return;
    }

    // Catch-all: log the full error object so root cause is always visible in Render logs
    console.error("[analyze] Unhandled error during medical image analysis:", error);
    req.log.error({ err: error }, "Medical image analysis failed");
    res.status(502).json({ error: "We couldn't analyze that image right now. Please try again." });
  }
});

export default router;
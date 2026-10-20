import { Router, type IRouter } from "express";
import { AnalyzeScanBody, AnalyzeScanResponse } from "@workspace/api-zod";
import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";

const router: IRouter = Router();

// Prioritized model fallback array in exact sequence:
// 1. Primary: "gemini-3.8-flash"
// 2. Fallback 1: "gemini-3.7-flash"
// 3. Fallback 2: "gemini-3.6-plus"
// 4. Fallback 3: "gemini-3.6-flash-lite"
const FALLBACK_MODELS: readonly string[] = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-plus",
  "gemini-3.6-flash-lite",
];

// Generous request timeout per Gemini model attempt (at least 45 seconds) to prevent premature aborts
const MODEL_TIMEOUT_MS = 45_000;

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

/**
 * Strips markdown code blocks (```json ... ``` or ``` ... ```) and extracts outermost JSON object.
 */
function cleanJsonText(value: string): string {
  if (!value) return "{}";
  let text = value.trim();

  // 1. Strip markdown code fence blocks
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced && fenced[1]) {
    text = fenced[1].trim();
  } else {
    text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  }

  // 2. Extract outermost JSON object from first '{' to last '}'
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1).trim();
  }

  return text;
}

/**
 * Robust JSON parser that strips markdown fences, extracts braces, and handles minor LLM quirks.
 */
function parseJsonSafely(rawText: string): Record<string, unknown> {
  const cleaned = cleanJsonText(rawText);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as unknown as Record<string, unknown>;
    }
    return {};
  } catch (err: unknown) {
    // Secondary attempt: remove trailing commas before closing braces/brackets
    try {
      const sanitized = cleaned.replace(/,\s*([}\]])/g, "$1");
      const parsed = JSON.parse(sanitized);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as unknown as Record<string, unknown>;
      }
    } catch {
      // Re-throw original parse error so caller can log full raw text
      throw err as unknown as Error;
    }
    return {};
  }
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

/**
 * Normalizes candidate data to guarantee every schema field is present and valid,
 * gracefully handling missing, null, or improperly typed fields returned by the AI.
 */
function normalizeScanResponse(candidate: Record<string, unknown>) {
  // 1. category: 'medicine' | 'lab_report' | 'unknown'
  let category: "medicine" | "lab_report" | "unknown" = "unknown";
  if (candidate.category === "medicine" || candidate.category === "lab_report") {
    category = candidate.category;
  } else if (typeof candidate.category === "string") {
    const catLower = candidate.category.toLowerCase();
    if (catLower.includes("lab") || catLower.includes("report") || catLower.includes("test")) {
      category = "lab_report";
    } else if (
      catLower.includes("med") ||
      catLower.includes("drug") ||
      catLower.includes("pill") ||
      catLower.includes("tablet") ||
      catLower.includes("capsule") ||
      catLower.includes("syrup")
    ) {
      category = "medicine";
    }
  }

  // 2. nameEnglish & nameHindi
  const nameEnglish =
    typeof candidate.nameEnglish === "string" && candidate.nameEnglish.trim()
      ? candidate.nameEnglish.trim()
      : "Not clearly visible";
  const nameHindi =
    typeof candidate.nameHindi === "string" ? candidate.nameHindi.trim() : "";

  // 3. treatsEnglish & treatsHindi
  const treatsEnglish =
    typeof candidate.treatsEnglish === "string" && candidate.treatsEnglish.trim()
      ? candidate.treatsEnglish.trim()
      : "Not clearly visible";
  const treatsHindi =
    typeof candidate.treatsHindi === "string" ? candidate.treatsHindi.trim() : "";

  // 4. usage & usageHindi
  const usage =
    typeof candidate.usage === "string" && candidate.usage.trim()
      ? candidate.usage.trim()
      : "Please confirm the intended use with a doctor or pharmacist.";
  const usageHindi =
    typeof candidate.usageHindi === "string" && candidate.usageHindi.trim()
      ? candidate.usageHindi.trim()
      : "उपयोग की पुष्टि डॉक्टर या फार्मासिस्ट से करें।";

  // 5. dosage & dosageHindi
  const dosage =
    typeof candidate.dosage === "string" && candidate.dosage.trim()
      ? candidate.dosage.trim()
      : "Dosage is not clearly visible. Please confirm with a doctor or pharmacist.";
  const dosageHindi =
    typeof candidate.dosageHindi === "string" && candidate.dosageHindi.trim()
      ? candidate.dosageHindi.trim()
      : "खुराक स्पष्ट रूप से दिखाई नहीं दे रही है। डॉक्टर या फार्मासिस्ट से पुष्टि करें।";

  // 6. expiryDate: string | null
  let expiryDate: string | null = null;
  if (typeof candidate.expiryDate === "string") {
    const trimmed = candidate.expiryDate.trim();
    if (
      trimmed &&
      trimmed.toLowerCase() !== "null" &&
      trimmed.toLowerCase() !== "unknown" &&
      trimmed.toLowerCase() !== "n/a"
    ) {
      expiryDate = trimmed;
    }
  }

  // 7. expiryStatus, expiryLabel, expiryLabelHindi
  const calculatedExpiry = expiryFromDate(expiryDate);
  let expiryStatus: "danger" | "soon" | "safe" | "unknown" = calculatedExpiry.status;
  if (expiryStatus === "unknown" && typeof candidate.expiryStatus === "string") {
    const s = candidate.expiryStatus.toLowerCase().trim();
    if (s === "danger" || s === "soon" || s === "safe" || s === "unknown") {
      expiryStatus = s;
    }
  }

  let expiryLabel = calculatedExpiry.label;
  if (typeof candidate.expiryLabel === "string" && candidate.expiryLabel.trim()) {
    expiryLabel = candidate.expiryLabel.trim();
  }

  let expiryLabelHindi = "समाप्ति की स्थिति उपलब्ध नहीं है";
  if (typeof candidate.expiryLabelHindi === "string" && candidate.expiryLabelHindi.trim()) {
    expiryLabelHindi = candidate.expiryLabelHindi.trim();
  } else if (expiryStatus === "danger") {
    expiryLabelHindi = "खतरा — तुरंत बदलें";
  } else if (expiryStatus === "soon") {
    expiryLabelHindi = "शीघ्र उपयोग करें";
  } else if (expiryStatus === "safe") {
    expiryLabelHindi = "उपयोग के लिए सुरक्षित";
  }

  // 8. confidence: number between 0 and 1
  let confidence = 0.5;
  if (typeof candidate.confidence === "number" && !Number.isNaN(candidate.confidence)) {
    confidence = Math.min(1, Math.max(0, candidate.confidence));
  } else if (typeof candidate.confidence === "string") {
    const num = parseFloat(candidate.confidence);
    if (!Number.isNaN(num)) {
      confidence = Math.min(1, Math.max(0, num));
    }
  }

  // 9. notes & notesHindi: string[]
  const notes: string[] = Array.isArray(candidate.notes)
    ? candidate.notes
        .map((n) => (typeof n === "string" ? n.trim() : String(n ?? "").trim()))
        .filter(Boolean)
        .slice(0, 5)
    : typeof candidate.notes === "string" && candidate.notes.trim()
      ? [candidate.notes.trim()]
      : [];

  const notesHindi: string[] = Array.isArray(candidate.notesHindi)
    ? candidate.notesHindi
        .map((n) => (typeof n === "string" ? n.trim() : String(n ?? "").trim()))
        .filter(Boolean)
        .slice(0, 5)
    : typeof candidate.notesHindi === "string" && candidate.notesHindi.trim()
      ? [candidate.notesHindi.trim()]
      : [];

  return AnalyzeScanResponse.parse({
    category,
    nameEnglish,
    nameHindi,
    treatsEnglish,
    treatsHindi,
    usage,
    usageHindi,
    dosage,
    dosageHindi,
    expiryDate,
    expiryStatus,
    expiryLabel,
    expiryLabelHindi,
    confidence,
    notes,
    notesHindi,
  });
}

// Threshold above which an uploaded image base64 payload is considered excessively large
// 800 KB raw byte size corresponds to ~1.07 MB base64 string
const LARGE_IMAGE_THRESHOLD_BYTES = 800 * 1024;
const MAX_IMAGE_DIMENSION = 1536;
const JPEG_COMPRESSION_QUALITY = 82;

interface ProcessedImagePayload {
  data: string;
  mimeType: string;
  originalBytes: number;
  finalBytes: number;
  compressed: boolean;
}

/**
 * Downscales and compresses base64 image data if the payload is excessively large
 * (either in byte size or resolution dimensions), reducing network payload size
 * for faster transmission to the Gemini API.
 */
async function optimizeImageIfLarge(
  base64Data: string,
  mimeType: string,
): Promise<ProcessedImagePayload> {
  const originalBytes = Math.ceil((base64Data.length * 3) / 4);

  try {
    const inputBuffer = Buffer.from(base64Data, "base64");
    const image = sharp(inputBuffer);
    const metadata = await image.metadata();

    const isExcessiveBytes = originalBytes > LARGE_IMAGE_THRESHOLD_BYTES;
    const isExcessiveResolution =
      (metadata.width !== undefined && metadata.width > MAX_IMAGE_DIMENSION) ||
      (metadata.height !== undefined && metadata.height > MAX_IMAGE_DIMENSION);

    if (!isExcessiveBytes && !isExcessiveResolution) {
      return {
        data: base64Data,
        mimeType,
        originalBytes,
        finalBytes: originalBytes,
        compressed: false,
      };
    }

    console.log(
      `[analyze] Image is excessively large (${(originalBytes / 1024).toFixed(1)} KB, ` +
        `dimensions: ${metadata.width}x${metadata.height}). Downscaling and compressing...`,
    );

    const pipeline = sharp(inputBuffer)
      .rotate() // Auto-orient according to EXIF
      .resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      });

    let compressedBuffer: Buffer;
    let targetMime = "image/jpeg";

    if (mimeType === "image/webp") {
      compressedBuffer = await pipeline
        .webp({ quality: JPEG_COMPRESSION_QUALITY })
        .toBuffer();
      targetMime = "image/webp";
    } else {
      // Default to JPEG for optimal text clarity and payload compression
      compressedBuffer = await pipeline
        .jpeg({ quality: JPEG_COMPRESSION_QUALITY, mozjpeg: true })
        .toBuffer();
      targetMime = "image/jpeg";
    }

    // Only adopt compressed buffer if it produced a smaller payload
    if (compressedBuffer.length < originalBytes) {
      const finalBytes = compressedBuffer.length;
      const reduction = (((originalBytes - finalBytes) / originalBytes) * 100).toFixed(1);
      console.log(
        `[analyze] Successfully compressed image: ${(originalBytes / 1024).toFixed(1)} KB -> ` +
          `${(finalBytes / 1024).toFixed(1)} KB (${reduction}% reduction).`,
      );
      return {
        data: compressedBuffer.toString("base64"),
        mimeType: targetMime,
        originalBytes,
        finalBytes,
        compressed: true,
      };
    }

    return {
      data: base64Data,
      mimeType,
      originalBytes,
      finalBytes: originalBytes,
      compressed: false,
    };
  } catch (err: unknown) {
    console.warn(
      "[analyze] Failed to downscale/compress image with sharp, proceeding with original payload:",
      err instanceof Error ? err.message : String(err),
    );
    return {
      data: base64Data,
      mimeType,
      originalBytes,
      finalBytes: originalBytes,
      compressed: false,
    };
  }
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  controller?: AbortController,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          if (controller && !controller.signal.aborted) {
            controller.abort(new Error("ANALYSIS_TIMEOUT"));
          }
          reject(new Error("ANALYSIS_TIMEOUT"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Safely extracts error details including status code, response body, cause, etc.,
 * avoiding TS2352 errors by casting through `unknown`.
 */
function formatErrorDetails(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const errorRec = err as unknown as Record<string, unknown>;
    const details: Record<string, unknown> = {
      message: err.message,
      name: err.name,
      stack: err.stack,
    };
    if ("cause" in err) {
      details.cause = (err as unknown as { cause: unknown }).cause;
    }
    for (const key of Object.keys(errorRec)) {
      try {
        const val = errorRec[key];
        if (typeof val !== "function") {
          details[key] = val;
        }
      } catch {
        // Ignore unreadable properties
      }
    }
    return details;
  }
  if (typeof err === "object" && err !== null) {
    return err as unknown as Record<string, unknown>;
  }
  return { error: String(err) };
}

/**
 * Safe stringifier that tolerates circular structures.
 */
function safeStringify(value: unknown): string {
  try {
    const seen = new WeakSet();
    return JSON.stringify(
      value,
      (_key, val) => {
        if (typeof val === "object" && val !== null) {
          if (seen.has(val)) return "[Circular]";
          seen.add(val);
        }
        return val;
      },
      2,
    );
  } catch {
    return String(value);
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
  const abortController = new AbortController();

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
          abortSignal: abortController.signal,
          httpOptions: {
            timeout: MODEL_TIMEOUT_MS,
          },
        },
      }),
      MODEL_TIMEOUT_MS,
      abortController,
    );
  } catch (sdkError: unknown) {
    if (abortController.signal.aborted) {
      console.warn(
        `[analyze] Request for model=${model} aborted after timeout (${MODEL_TIMEOUT_MS}ms)`,
      );
      throw new Error("ANALYSIS_TIMEOUT");
    }
    console.error(`[analyze] Gemini SDK call failed for model=${model}:`);
    console.error(sdkError as unknown as Error);
    console.error(
      `[analyze] Gemini SDK full error details for model=${model}:`,
      safeStringify(formatErrorDetails(sdkError)),
    );
    throw sdkError;
  }

  const responseRec = response as unknown as Record<string, unknown>;
  const rawText: string | undefined =
    typeof responseRec.text === "function"
      ? (responseRec.text as unknown as () => string | undefined)()
      : (responseRec.text as unknown as string | undefined);

  console.log(
    `[analyze] Raw Gemini response from model=${model} (${rawText?.length ?? 0} chars):`,
    rawText ? (rawText.length > 500 ? `${rawText.slice(0, 500)}...` : rawText) : "<empty>",
  );

  if (!rawText || !rawText.trim()) {
    console.error(
      `[analyze] EMPTY_MODEL_RESPONSE from model=${model}. Full raw response object:`,
      safeStringify({
        candidates: responseRec.candidates,
        promptFeedback: responseRec.promptFeedback,
        usageMetadata: responseRec.usageMetadata,
        rawResponse: responseRec,
      }),
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
  console.log(
    `[analyze] Incoming image: mimeType=${mimeType}, estimatedSize=${estimatedKB} KB (base64 length=${base64.length})`,
  );
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

  // Downscale and compress image payload if excessively large to accelerate transmission to Gemini
  const optimized = await optimizeImageIfLarge(base64, mimeType);
  const payloadBase64 = optimized.data;
  const payloadMimeType = optimized.mimeType;

  if (optimized.compressed) {
    req.log.info(
      {
        originalBytes: optimized.originalBytes,
        finalBytes: optimized.finalBytes,
        mimeType: payloadMimeType,
      },
      "Image downscaled and compressed for Gemini transmission",
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error("[analyze] GEMINI_API_KEY is not set in environment variables.");
    req.log.error("Gemini API key is not configured");
    res.status(502).json({
      error: "Analysis is not connected yet. Add GEMINI_API_KEY in Secrets, then retry.",
    });
    return;
  }

  try {
    let rawText: string | null = null;
    let successfulModel: string | null = null;
    const cascadeErrors: Array<{
      model: string;
      error: unknown;
      errorDetails: Record<string, unknown>;
    }> = [];

    // Cascade through prioritized model fallback array
    for (const model of FALLBACK_MODELS) {
      try {
        console.log(`[analyze] Attempting analysis with model: ${model}...`);
        rawText = await requestModel(model, payloadBase64, payloadMimeType);
        successfulModel = model;
        console.log(`[analyze] Successfully received response from model: ${model}`);
        break;
      } catch (err: unknown) {
        console.error(`[analyze] Model "${model}" failed or timed out:`);
        console.error(err as unknown as Error);
        const details = formatErrorDetails(err);
        console.error(
          `[analyze] Full error details for model "${model}":`,
          safeStringify(details),
        );
        cascadeErrors.push({ model, error: err, errorDetails: details });
        req.log.warn(
          { model, err: details },
          `Gemini model ${model} failed; trying next fallback`,
        );
      }
    }

    if (!rawText) {
      console.error(
        `[analyze] All ${FALLBACK_MODELS.length} Gemini models in fallback cascade failed.`,
      );
      console.error(
        "[analyze] Full raw cascade error breakdown:",
        safeStringify(cascadeErrors),
      );
      for (const item of cascadeErrors) {
        console.error(`[analyze] Failure on ${item.model}:`, item.error as unknown as Error);
        console.error(`[analyze] Raw details for ${item.model}:`, safeStringify(item.errorDetails));
      }
      req.log.error(
        { cascadeErrors },
        "All Gemini fallback models failed for image analysis",
      );

      const hasTimeout = cascadeErrors.some((e) => {
        const err = e.error as unknown as Error;
        return (
          err?.message === "ANALYSIS_TIMEOUT" ||
          err?.name === "AbortError" ||
          err?.message?.includes("aborted") ||
          err?.message?.includes("timeout")
        );
      });
      if (hasTimeout) {
        res.status(408).json({
          error: "Image analysis timed out across all models. Please retry.",
        });
        return;
      }

      res.status(502).json({
        error: "We couldn't analyze that image right now. Please try again.",
      });
      return;
    }


    let candidateData: Record<string, unknown>;
    try {
      candidateData = parseJsonSafely(rawText);
    } catch (parseError: unknown) {
      console.error(
        `[analyze] JSON.parse failed for response from model=${successfulModel}. Full raw Gemini text:`,
        rawText,
      );
      console.error("[analyze] JSON parse error:", parseError as unknown as Error);
      console.error(parseError as unknown as Error);
      req.log.error(
        { err: formatErrorDetails(parseError), rawText, model: successfulModel },
        "Gemini returned invalid JSON",
      );
      res.status(502).json({
        error: "We couldn't read that image clearly. Please try a sharper photo.",
      });
      return;
    }

    const normalized = normalizeScanResponse(candidateData);
    res.json(normalized);
  } catch (error: unknown) {
    const errObj = error as unknown as Error;
    if (errObj?.message === "GEMINI_API_KEY_MISSING") {
      console.error("[analyze] GEMINI_API_KEY is not set in environment variables.");
      req.log.error({ err: formatErrorDetails(error) }, "Gemini API key is not configured");
      res.status(502).json({
        error: "Analysis is not connected yet. Add GEMINI_API_KEY in Secrets, then retry.",
      });
      return;
    }

    console.error("[analyze] Unhandled error during medical image analysis:", error);
    console.error(error as unknown as Error);
    console.error(
      "[analyze] Full unhandled error details:",
      safeStringify(formatErrorDetails(error)),
    );
    req.log.error({ err: formatErrorDetails(error) }, "Medical image analysis failed");
    res.status(502).json({
      error: "We couldn't analyze that image right now. Please try again.",
    });
  }
});

export default router;
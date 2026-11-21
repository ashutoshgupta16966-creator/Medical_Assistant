import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";

/**
 * Model tier definition.
 */
export interface ModelTier {
  readonly id: string;
  readonly provider: "anthropic" | "gemini";
}

/**
 * Fallback chain in exact order:
 * Tier 1: claude-opus-4.8 (Anthropic API ID: claude-opus-4-8)
 * Tier 2: claude-sonnet-4.6 (Anthropic API ID: claude-sonnet-4-6)
 * Tier 3: gemini-3.8-flash
 * Tier 4: gemini-3.7-flash
 * Tier 5: gemini-3.6-flash
 *
 * Note on Anthropic IDs: Anthropic's official API uses hyphens rather than dots
 * in version numbers (e.g. claude-opus-4-8, claude-sonnet-4-6). We normalize
 * dot notation automatically if provided via environment overrides.
 */
export const DEFAULT_FALLBACK_TIERS: readonly ModelTier[] = [
  { id: "claude-opus-4-8", provider: "anthropic" },
  { id: "claude-sonnet-4-6", provider: "anthropic" },
  { id: "gemini-3.8-flash", provider: "gemini" },
  { id: "gemini-3.7-flash", provider: "gemini" },
  { id: "gemini-3.6-flash", provider: "gemini" },
];

export const FALLBACK_TIERS = DEFAULT_FALLBACK_TIERS;

/** Per-call timeout for stuck calls (35 seconds). */
export const MODEL_TIMEOUT_MS = 35_000;

/** Stall timeout: fail if no new chunk arrives within 15 seconds. */
export const STALL_TIMEOUT_MS = 15_000;

/**
 * Normalizes Claude model IDs: maps dot notation (e.g. claude-opus-4.8) to hyphens (claude-opus-4-8).
 */
export function normalizeModelId(model: string, provider: "anthropic" | "gemini"): string {
  const trimmed = model.trim();
  if (provider === "anthropic") {
    return trimmed.replace(/claude-([a-z]+)-(\d+)\.(\d+)/i, "claude-$1-$2-$3");
  }
  return trimmed;
}

/**
 * Resolves the active model fallback tiers.
 * Reads optional GEMINI_MODELS or AI_MODELS environment overrides (comma-separated).
 */
export function resolveFallbackTiers(): readonly ModelTier[] {
  const envOverride = process.env.AI_MODELS || process.env.GEMINI_MODELS;
  if (!envOverride || !envOverride.trim()) {
    return DEFAULT_FALLBACK_TIERS;
  }

  const items = envOverride
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return DEFAULT_FALLBACK_TIERS;
  }

  return items.map((id) => {
    const isClaude = id.toLowerCase().startsWith("claude");
    const provider: "anthropic" | "gemini" = isClaude ? "anthropic" : "gemini";
    return {
      id: normalizeModelId(id, provider),
      provider,
    };
  });
}

/**
 * Joins a previous partial answer and a continuation text cleanly,
 * removing repeated words or partial word completions at the boundary,
 * and repairing spacing.
 */
export function joinContinuation(existing: string, continuation: string): string {
  if (!existing) return continuation;
  if (!continuation) return existing;

  const trimmedContinuation = continuation.trimStart();

  // 1. Check for suffix/prefix character overlap (up to 120 chars)
  const maxOverlap = Math.min(existing.length, trimmedContinuation.length, 120);
  for (let len = maxOverlap; len >= 3; len--) {
    const end = existing.slice(-len).toLowerCase();
    const start = trimmedContinuation.slice(0, len).toLowerCase();
    if (end === start) {
      return existing + trimmedContinuation.slice(len);
    }
  }

  // 2. Check for word boundary overlap
  const existingWords = existing.trimEnd().split(/\s+/);
  const continuationWords = trimmedContinuation.split(/\s+/);

  if (existingWords.length > 0 && continuationWords.length > 0) {
    const lastWordRaw = existingWords[existingWords.length - 1];
    const firstWordRaw = continuationWords[0];
    const lastWordClean = lastWordRaw.replace(/[^\w]/g, "").toLowerCase();
    const firstWordClean = firstWordRaw.replace(/[^\w]/g, "").toLowerCase();

    if (lastWordClean && firstWordClean) {
      if (lastWordClean === firstWordClean) {
        // Repeated word at boundary (e.g. "...take paracetamol" + "paracetamol twice daily")
        const afterFirstWord = trimmedContinuation.slice(firstWordRaw.length).trimStart();
        return `${existing.trimEnd()} ${afterFirstWord}`;
      }
      if (firstWordClean.startsWith(lastWordClean)) {
        // Incomplete word completed (e.g. "...take dehydra" + "dehydration is common")
        const existingWithoutLast = existing.trimEnd().slice(0, -lastWordRaw.length);
        return `${existingWithoutLast}${trimmedContinuation}`;
      }
    }
  }

  // 3. Fix spacing between existing and continuation
  const endsWithWhitespace = /\s$/.test(existing);
  const startsWithPunctuation = /^[\s.,!?;:)}\]"']/.test(continuation);

  if (!endsWithWhitespace && !startsWithPunctuation) {
    return `${existing} ${continuation}`;
  }

  return existing + continuation;
}

/**
 * Builds the continuation instruction prompt for the next tier when partialText exists.
 */
export function buildContinuationInstruction(partialText: string): string {
  return (
    `Here is the answer written so far:\n${partialText}\n\n` +
    `Continue exactly from where it stopped. Do not repeat anything already written. ` +
    `Do not restart, do not apologise, do not mention any error or model change. ` +
    `Keep the same language and style. ` +
    `If the text stopped in the middle of a word or sentence, finish that sentence first.`
  );
}

export interface ImagePayload {
  readonly mimeType: string;
  readonly base64: string;
}

export interface TierLogEntry {
  readonly model: string;
  readonly provider: "anthropic" | "gemini";
  readonly startIso: string;
  readonly endIso: string;
  readonly elapsedMs: number;
  readonly result: "success" | "timeout" | "stalled" | "error" | "empty" | "skipped_no_key";
  readonly errorType?: string;
  readonly charsCollectedSoFar: number;
  readonly continuationUsed: boolean;
}

export interface FallbackChainOptions {
  readonly systemPrompt: string;
  readonly originalUserPrompt: string;
  readonly imagePayload?: ImagePayload;
  readonly onTierLog?: (log: TierLogEntry) => void;
}

export interface FallbackChainResult {
  readonly text: string;
  readonly completed: boolean;
  readonly totalElapsedMs: number;
}

interface StreamAttemptResult {
  readonly completed: boolean;
  readonly text: string;
  readonly failureReason?: "timeout" | "stall" | "error" | "empty";
  readonly error?: unknown;
}

async function streamAnthropic(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  imagePayload: ImagePayload | undefined,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY_MISSING");

  const anthropic = new Anthropic({ apiKey });
  const normalizedModel = normalizeModelId(model, "anthropic");

  let content: Array<
    | { type: "text"; text: string }
    | {
        type: "image";
        source: {
          type: "base64";
          media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
          data: string;
        };
      }
  >;

  if (imagePayload) {
    const validMime =
      imagePayload.mimeType === "image/png" ||
      imagePayload.mimeType === "image/webp" ||
      imagePayload.mimeType === "image/gif"
        ? (imagePayload.mimeType as "image/png" | "image/webp" | "image/gif")
        : ("image/jpeg" as const);

    content = [
      {
        type: "image",
        source: {
          type: "base64",
          media_type: validMime,
          data: imagePayload.base64,
        },
      },
      {
        type: "text",
        text: userPrompt,
      },
    ];
  } else {
    content = [{ type: "text", text: userPrompt }];
  }

  const responseStream = await anthropic.messages.create(
    {
      model: normalizedModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content }],
      stream: true,
    },
    { signal },
  );

  for await (const chunk of responseStream) {
    if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
      const text = chunk.delta.text;
      if (text) {
        onChunk(text);
      }
    }
  }
}

async function streamGemini(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  imagePayload: ImagePayload | undefined,
  onChunk: (chunk: string) => void,
  signal: AbortSignal,
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY_MISSING");

  const ai = new GoogleGenAI({ apiKey });

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (imagePayload) {
    parts.push({
      inlineData: {
        mimeType: imagePayload.mimeType,
        data: imagePayload.base64,
      },
    });
  }
  parts.push({ text: userPrompt });

  const responseStream = await ai.models.generateContentStream({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: systemPrompt,
      temperature: 0.2,
      abortSignal: signal,
    },
  });

  for await (const chunk of responseStream) {
    const text = chunk.text;
    if (text) {
      onChunk(text);
    }
  }
}

async function executeTierWithTimeouts(
  tier: ModelTier,
  systemPrompt: string,
  userPrompt: string,
  imagePayload: ImagePayload | undefined,
): Promise<StreamAttemptResult> {
  const abortController = new AbortController();
  let accumulated = "";
  let failureReason: StreamAttemptResult["failureReason"];
  let overallTimer: NodeJS.Timeout | undefined;
  let stallTimer: NodeJS.Timeout | undefined;

  function resetStallTimer() {
    if (stallTimer) clearTimeout(stallTimer);
    stallTimer = setTimeout(() => {
      failureReason = "stall";
      abortController.abort(new Error("STREAM_STALLED"));
    }, STALL_TIMEOUT_MS);
  }

  overallTimer = setTimeout(() => {
    failureReason = "timeout";
    abortController.abort(new Error("CALL_TIMEOUT"));
  }, MODEL_TIMEOUT_MS);

  resetStallTimer();

  const onChunk = (chunk: string) => {
    accumulated += chunk;
    resetStallTimer();
  };

  try {
    if (tier.provider === "anthropic") {
      await streamAnthropic(
        tier.id,
        systemPrompt,
        userPrompt,
        imagePayload,
        onChunk,
        abortController.signal,
      );
    } else {
      await streamGemini(
        tier.id,
        systemPrompt,
        userPrompt,
        imagePayload,
        onChunk,
        abortController.signal,
      );
    }

    if (!accumulated || accumulated.trim().length === 0) {
      return { completed: false, text: "", failureReason: "empty" };
    }

    return { completed: true, text: accumulated };
  } catch (err: unknown) {
    if (!failureReason) {
      failureReason = "error";
    }
    return {
      completed: false,
      text: accumulated,
      failureReason,
      error: err,
    };
  } finally {
    if (overallTimer) clearTimeout(overallTimer);
    if (stallTimer) clearTimeout(stallTimer);
  }
}

/**
 * Executes the multi-model fallback chain across tiers in order.
 * If a tier fails with partialText, continues seamlessly on the next tier.
 */
export async function executeFallbackChain(
  tiers: readonly ModelTier[],
  options: FallbackChainOptions,
): Promise<FallbackChainResult> {
  const requestStart = Date.now();
  let partialText = "";
  let successfullyCompleted = false;

  for (const tier of tiers) {
    const hasKey =
      tier.provider === "anthropic"
        ? Boolean(process.env.ANTHROPIC_API_KEY)
        : Boolean(process.env.GEMINI_API_KEY);

    if (!hasKey) {
      const nowIso = new Date().toISOString();
      options.onTierLog?.({
        model: tier.id,
        provider: tier.provider,
        startIso: nowIso,
        endIso: nowIso,
        elapsedMs: 0,
        result: "skipped_no_key",
        charsCollectedSoFar: partialText.length,
        continuationUsed: partialText.length > 0,
      });
      continue;
    }

    const continuationUsed = partialText.trim().length > 0;
    const promptForTier = continuationUsed
      ? `${options.originalUserPrompt}\n\n${buildContinuationInstruction(partialText)}`
      : options.originalUserPrompt;

    const tierStartDate = new Date();
    const tierStart = Date.now();
    const result = await executeTierWithTimeouts(
      tier,
      options.systemPrompt,
      promptForTier,
      options.imagePayload,
    );
    const tierEndDate = new Date();
    const elapsedMs = Date.now() - tierStart;

    if (result.text && result.text.length > 0) {
      partialText = continuationUsed
        ? joinContinuation(partialText, result.text)
        : result.text;
    }

    let logResult: TierLogEntry["result"] = "error";
    if (result.completed) {
      logResult = "success";
    } else if (result.failureReason === "timeout") {
      logResult = "timeout";
    } else if (result.failureReason === "stall") {
      logResult = "stalled";
    } else if (result.failureReason === "empty") {
      logResult = "empty";
    }

    let errorType: string | undefined;
    if (result.error) {
      const errObj = result.error as { status?: number; name?: string; message?: string };
      if (typeof errObj.status === "number") {
        errorType = `HTTP ${errObj.status}`;
      } else if (errObj.name && errObj.name !== "Error") {
        errorType = errObj.name;
      } else if (errObj.message) {
        errorType = errObj.message.slice(0, 40);
      } else {
        errorType = "error";
      }
    }

    options.onTierLog?.({
      model: tier.id,
      provider: tier.provider,
      startIso: tierStartDate.toISOString(),
      endIso: tierEndDate.toISOString(),
      elapsedMs,
      result: logResult,
      errorType,
      charsCollectedSoFar: partialText.length,
      continuationUsed,
    });

    if (result.completed) {
      successfullyCompleted = true;
      break;
    }
  }

  const totalElapsedMs = Date.now() - requestStart;
  return {
    text: partialText,
    completed: successfullyCompleted,
    totalElapsedMs,
  };
}

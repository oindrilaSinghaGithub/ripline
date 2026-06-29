/**
 * ExtractionPipeline
 *
 * Orchestrates the full processing flow for a single input:
 *
 *   ┌─────────────┐     ┌─────────────┐     ┌──────────────────┐
 *   │  File/text  │────▶│  OCR layer  │────▶│  LLM extraction  │
 *   │  (any type) │     │  (optional) │     │  + validation    │
 *   └─────────────┘     └─────────────┘     └──────┬───────────┘
 *                                                   │ failure
 *                                                   ▼
 *                                         ┌──────────────────┐
 *                                         │ Heuristic fallback│
 *                                         │ (MockExtraction)  │
 *                                         └──────────────────┘
 *
 * Key contracts:
 * - Never saves anything to the DB — that happens only after user confirmation.
 * - All errors are returned as { success: false, error } not thrown.
 * - Every stage is individually logged for traceability.
 */

import { getOCRService } from "./ocr";
import { getExtractionService } from "./index";
import { MockAIExtractionService } from "./mock-extraction-service";
import { prepareTextForExtraction } from "./preprocess-extraction-text";
import { refineSuggestions } from "./suggestion-quality";
import type { ExtractionResult, SourceMimeType } from "./types";
import type { OCRMimeType } from "./ocr/types";

export type PipelineInput =
  | { kind: "text"; text: string }
  | { kind: "file"; buffer: Buffer; mimeType: OCRMimeType; fileName?: string };

export type PipelineResult = ExtractionResult & {
  /** Which backend actually produced the result */
  provider: "llm" | "heuristic" | "none";
  /** OCR confidence 0–1 if OCR was performed, null otherwise */
  ocrConfidence: number | null;
};

const TEXT_MIME: SourceMimeType = "text/plain";

export async function runExtractionPipeline(
  input: PipelineInput
): Promise<PipelineResult> {
  // ─── Step 1: resolve text from the input ──────────────────────────────────
  let extractedText: string;
  let sourceMime: SourceMimeType;
  let ocrConfidence: number | null = null;

  if (input.kind === "text") {
    extractedText = input.text.trim();
    sourceMime = TEXT_MIME;
  } else {
    // Run OCR
    const ocrService = getOCRService();
    const label = input.fileName ? `"${input.fileName}"` : input.mimeType;
    console.info(`[pipeline] Running OCR on ${label}`);

    const ocrResult = await ocrService.extractText(input.buffer, input.mimeType);

    if (!ocrResult.success) {
      console.error(`[pipeline] OCR failed for ${label}: ${ocrResult.error}`);
      return {
        success: false,
        error: `OCR failed: ${ocrResult.error}`,
        provider: "none",
        ocrConfidence: null,
      };
    }

    extractedText = ocrResult.text.trim();
    ocrConfidence = ocrResult.confidence ?? null;
    sourceMime = input.mimeType as SourceMimeType;

    console.info(
      `[pipeline] OCR succeeded — ${extractedText.length} chars extracted` +
        (ocrConfidence != null ? `, confidence ${(ocrConfidence * 100).toFixed(1)}%` : "")
    );
  }

  if (!extractedText || extractedText.length < 5) {
    return {
      success: false,
      error: "No usable text was found in the input.",
      provider: "none",
      ocrConfidence,
    };
  }

  // Merge fragmented OCR lines before LLM / heuristic extraction
  extractedText = prepareTextForExtraction(extractedText);
  console.info(`[pipeline] Prepared text for extraction — ${extractedText.length} chars`);

  // ─── Step 2: LLM extraction ───────────────────────────────────────────────
  const llmService = getExtractionService();
  const isLLMReal = !(llmService instanceof MockAIExtractionService);

  if (isLLMReal) {
    console.info("[pipeline] Attempting LLM extraction");
    try {
      const llmResult = await llmService.extractFromText(extractedText, sourceMime);

      if (llmResult.success && llmResult.suggestions.length > 0) {
        console.info(
          `[pipeline] LLM returned ${llmResult.suggestions.length} suggestion(s)`
        );
        return { ...llmResult, provider: "llm", ocrConfidence };
      }

      // LLM succeeded but returned nothing useful — fall through to heuristic
      if (llmResult.success && llmResult.suggestions.length === 0) {
        console.warn("[pipeline] LLM returned 0 suggestions, falling back to heuristic");
      } else if (!llmResult.success) {
        console.error(`[pipeline] LLM extraction failed: ${llmResult.error} — falling back`);
      }
    } catch (err) {
      console.error("[pipeline] Unhandled LLM error, falling back:", err);
    }
  }

  // ─── Step 3: heuristic fallback ──────────────────────────────────────────
  console.info("[pipeline] Using heuristic (mock) extractor");
  const fallback = new MockAIExtractionService();
  const heuristicResult = await fallback.extractFromText(extractedText, sourceMime);

  if (heuristicResult.success) {
    return {
      ...heuristicResult,
      suggestions: refineSuggestions(heuristicResult.suggestions),
      provider: "heuristic",
      ocrConfidence,
    };
  }

  return {
    ...heuristicResult,
    provider: "heuristic",
    ocrConfidence,
  };
}

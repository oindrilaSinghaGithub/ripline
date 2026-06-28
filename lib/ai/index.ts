/**
 * AI service factory.
 *
 * Resolution order:
 *   1. OPENAI_API_KEY is set           → OpenAIExtractionService (Structured Outputs)
 *   2. AI_PROVIDER=mock explicitly set → MockAIExtractionService (heuristic, dev/test)
 *   3. No API key                      → MockAIExtractionService (fallback, logs warning)
 *
 * To add another provider (Anthropic, AWS Bedrock, Groq, …):
 *   - Create lib/ai/llm/<provider>-extraction-service.ts implementing AIExtractionService
 *   - Add an AI_PROVIDER check here; no other code changes required.
 */

import { OpenAIExtractionService } from "./llm/openai-extraction-service";
import { MockAIExtractionService } from "./mock-extraction-service";
import type { AIExtractionService } from "./types";

export type {
  AIExtractionService,
  ExtractionResult,
  TaskSuggestion,
  SourceMimeType,
} from "./types";

export function getExtractionService(): AIExtractionService {
  // Explicit mock override — useful for tests or offline dev
  if (process.env.AI_PROVIDER === "mock") {
    return new MockAIExtractionService();
  }

  // OpenAI (or compatible provider) — requires API key
  if (process.env.OPENAI_API_KEY) {
    return new OpenAIExtractionService();
  }

  // No API key — warn once and use heuristic fallback
  console.warn(
    "[ai/factory] OPENAI_API_KEY is not set. " +
      "Using heuristic (mock) extractor as fallback. " +
      "Set OPENAI_API_KEY in .env to enable real AI extraction."
  );
  return new MockAIExtractionService();
}

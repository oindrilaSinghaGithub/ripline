/**
 * AI Extraction Types
 *
 * TaskSuggestion is inferred directly from the Zod schema in
 * suggestion-schema.ts — there is no manual type definition to keep in sync.
 *
 * Import TaskSuggestion from here (not from suggestion-schema.ts) so that
 * consumers are isolated from the schema internals.
 */

import type { ValidatedTaskSuggestion } from "./suggestion-schema";

/** A single AI-extracted task suggestion, ready for the review UI. */
export type TaskSuggestion = ValidatedTaskSuggestion;

export type ExtractionResult =
  | { success: true; suggestions: TaskSuggestion[] }
  | { success: false; error: string };

export type SourceMimeType =
  | "text/plain"
  | "image/png"
  | "image/jpeg"
  | "application/pdf";

export interface AIExtractionService {
  /**
   * Extract task suggestions from raw text content.
   * For image/PDF sources, the caller is responsible for converting to text
   * first (OCR layer), then passing the extracted text here.
   */
  extractFromText(
    text: string,
    mimeType: SourceMimeType
  ): Promise<ExtractionResult>;
}

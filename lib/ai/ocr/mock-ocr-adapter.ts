/**
 * MockOCRAdapter
 *
 * Used when no real OCR provider is configured.
 * Returns a descriptive placeholder so the extraction pipeline can still run.
 *
 * Replace with TextractOCRAdapter or another adapter by updating
 * getOCRService() in lib/ai/ocr/index.ts — no other code changes needed.
 */

import type { OCRMimeType, OCRResult, OCRService } from "./types";

export class MockOCRAdapter implements OCRService {
  async extractText(buffer: Buffer, mimeType: OCRMimeType): Promise<OCRResult> {
    // Simulate async I/O latency
    await new Promise((r) => setTimeout(r, 200));

    const sizeKB = (buffer.byteLength / 1024).toFixed(1);
    const label = mimeType === "application/pdf" ? "PDF" : "image";

    return {
      success: true,
      confidence: 0,
      text: [
        `[Mock OCR — ${label}, ${sizeKB} KB]`,
        "",
        "Real text extraction requires a configured OCR provider.",
        "Set AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_REGION to enable Amazon Textract,",
        "or implement your own OCRService and return it from getOCRService().",
        "",
        "For now, the AI extraction pipeline will attempt to produce suggestions",
        "based on this placeholder. In production, this will be replaced with",
        "actual extracted text from the uploaded file.",
      ].join("\n"),
    };
  }
}

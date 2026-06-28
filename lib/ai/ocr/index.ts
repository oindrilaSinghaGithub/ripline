/**
 * OCR service factory.
 *
 * Swap provider by changing the condition below — or by setting
 * OCR_PROVIDER=textract in your .env.  No other code changes required.
 */
import { MockOCRAdapter } from "./mock-ocr-adapter";
import { TextractOCRAdapter } from "./textract-ocr-adapter";
import type { OCRService } from "./types";

export type { OCRService, OCRResult, OCRMimeType } from "./types";

export function getOCRService(): OCRService {
  const provider = process.env.OCR_PROVIDER?.toLowerCase();

  if (
    provider === "textract" ||
    (process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_REGION)
  ) {
    return new TextractOCRAdapter();
  }

  return new MockOCRAdapter();
}

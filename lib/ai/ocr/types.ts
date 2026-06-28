/**
 * OCR Service abstraction.
 *
 * Any OCR provider (Amazon Textract, Google Vision, Azure AI Vision, Tesseract)
 * must implement this interface. The rest of the pipeline never touches
 * provider-specific SDKs.
 */

export type OCRMimeType = "image/png" | "image/jpeg" | "application/pdf";

export type OCRResult =
  | { success: true; text: string; confidence?: number }
  | { success: false; error: string };

export interface OCRService {
  /**
   * Extract plain text from a binary buffer.
   * @param buffer  Raw file bytes
   * @param mimeType  MIME type of the file
   */
  extractText(buffer: Buffer, mimeType: OCRMimeType): Promise<OCRResult>;
}

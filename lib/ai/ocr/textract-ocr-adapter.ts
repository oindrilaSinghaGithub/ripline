/**
 * TextractOCRAdapter
 *
 * Amazon Textract implementation of OCRService.
 *
 * Required environment variables:
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *   AWS_REGION              (e.g. "us-east-1")
 *
 * The AWS SDK is a peer dependency:
 *   npm install @aws-sdk/client-textract
 */

import type { OCRMimeType, OCRResult, OCRService } from "./types";

// Ensure this runs only on Node.js runtime (Next.js App Router safety)
export const runtime = "nodejs";

// Internal response shapes — loosely typed
interface TextractBlock {
  BlockType?: string;
  Text?: string;
  Confidence?: number;
}

interface TextractResponse {
  Blocks?: TextractBlock[];
}

export class TextractOCRAdapter implements OCRService {
  async extractText(
    buffer: Buffer,
    _mimeType: OCRMimeType
  ): Promise<OCRResult> {
    // -----------------------------
    // 1. Validate AWS credentials
    // -----------------------------
    if (
      !process.env.AWS_ACCESS_KEY_ID ||
      !process.env.AWS_SECRET_ACCESS_KEY
    ) {
      return {
        success: false,
        error: "AWS credentials missing (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY)",
      };
    }

    const region = process.env.AWS_REGION ?? "us-east-1";

    // -----------------------------
    // 2. Dynamically import SDK
    // -----------------------------
    let sdk: any;

    try {
      sdk = await import("@aws-sdk/client-textract");
    } catch {
      return {
        success: false,
        error:
          "@aws-sdk/client-textract is not installed. Run: npm install @aws-sdk/client-textract",
      };
    }

    const { TextractClient, DetectDocumentTextCommand } = sdk;

    // -----------------------------
    // 3. Create client
    // -----------------------------
    const client = new TextractClient({
      region,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        ...(process.env.AWS_SESSION_TOKEN
          ? { sessionToken: process.env.AWS_SESSION_TOKEN }
          : {}),
      },
    });

    // -----------------------------
    // 4. Call Textract
    // -----------------------------
    try {
      const command = new DetectDocumentTextCommand({
        Document: { Bytes: buffer },
      });

      const response: TextractResponse = await client.send(command);

      if (!response?.Blocks?.length) {
        return {
          success: false,
          error: "Textract returned no text blocks.",
        };
      }

      // -----------------------------
      // 5. Extract LINE blocks
      // -----------------------------
      const lineBlocks = response.Blocks.filter(
        (b) => b.BlockType === "LINE"
      );

      const lines = lineBlocks
        .map((b) => b.Text ?? "")
        .filter(Boolean);

      if (lines.length === 0) {
        return {
          success: false,
          error: "No text was detected in the document.",
        };
      }

      // -----------------------------
      // 6. Compute confidence
      // -----------------------------
      const confidenceValues = lineBlocks
        .filter((b) => typeof b.Confidence === "number")
        .map((b) => b.Confidence as number);

      const avgConfidence =
        confidenceValues.length > 0
          ? confidenceValues.reduce((a, b) => a + b, 0) /
            confidenceValues.length /
            100
          : undefined;

      // -----------------------------
      // 7. Return result
      // -----------------------------
      return {
        success: true,
        text: lines.join("\n"),
        confidence: avgConfidence,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      console.error("[TextractOCRAdapter] error:", message);

      return {
        success: false,
        error: `Textract error: ${message}`,
      };
    }
  }
}
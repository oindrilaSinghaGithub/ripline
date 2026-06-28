/**
 * POST /api/inbox/process
 *
 * Accepts two content types:
 *
 * 1. application/json   — { text: string, mimeType: SourceMimeType }
 *    Used for plain-text input (no OCR needed).
 *
 * 2. multipart/form-data — fields: file (Blob), mimeType (string)
 *    Used for image/PDF uploads. The server runs OCR before LLM extraction.
 *
 * The response is always ApiResponse<ExtractionResult> plus a `provider` field
 * indicating which backend was used ("llm" | "heuristic" | "none").
 *
 * Nothing is persisted here — all suggestions must be confirmed by the user
 * through the review workflow before being saved.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runExtractionPipeline } from "@/lib/ai/extraction-pipeline";
import type { ApiResponse } from "@/types";
import type { SourceMimeType } from "@/lib/ai/types";
import type { OCRMimeType } from "@/lib/ai/ocr/types";
import type { PipelineResult } from "@/lib/ai/extraction-pipeline";

const MAX_TEXT_BYTES = 50_000;       // 50 KB plain text
const MAX_FILE_BYTES = 10_485_760;   // 10 MB file upload
const ALLOWED_MIME_TYPES: SourceMimeType[] = [
  "text/plain",
  "image/png",
  "image/jpeg",
  "application/pdf",
];
const OCR_MIME_TYPES: OCRMimeType[] = ["image/png", "image/jpeg", "application/pdf"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const contentType = req.headers.get("content-type") ?? "";

  // ─── Branch A: multipart/form-data (file upload) ─────────────────────────
  if (contentType.includes("multipart/form-data")) {
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Failed to parse multipart form data." },
        { status: 400 }
      );
    }

    const file = formData.get("file");
    const mimeTypeRaw = formData.get("mimeType");

    if (!(file instanceof Blob)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Missing `file` field in form data." },
        { status: 400 }
      );
    }

    if (typeof mimeTypeRaw !== "string") {
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Missing `mimeType` field in form data." },
        { status: 400 }
      );
    }

    const mimeType = mimeTypeRaw as OCRMimeType;
    if (!OCR_MIME_TYPES.includes(mimeType)) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `Unsupported mimeType for file upload: ${mimeType}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json<ApiResponse>(
        { success: false, error: `File exceeds the 10 MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).` },
        { status: 413 }
      );
    }

    const fileName =
      file instanceof File ? file.name : `upload.${mimeType.split("/")[1]}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    try {
      const result: PipelineResult = await runExtractionPipeline({
        kind: "file",
        buffer,
        mimeType,
        fileName,
      });

      return NextResponse.json<ApiResponse<PipelineResult>>({
        success: true,
        data: result,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[inbox/process] pipeline error (file):", msg);
      return NextResponse.json<ApiResponse>(
        { success: false, error: "Extraction failed. Please try again." },
        { status: 500 }
      );
    }
  }

  // ─── Branch B: application/json (plain text) ──────────────────────────────
  const body = await req.json().catch(() => null);

  if (!body || typeof body.text !== "string" || typeof body.mimeType !== "string") {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        error:
          "Request must include `text` (string) and `mimeType` (string), " +
          "or be a multipart/form-data upload with a `file` field.",
      },
      { status: 400 }
    );
  }

  const mimeType = body.mimeType as SourceMimeType;
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: `Unsupported mimeType: ${mimeType}` },
      { status: 400 }
    );
  }

  const text: string = body.text;
  if (Buffer.byteLength(text, "utf8") > MAX_TEXT_BYTES) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Input text exceeds the 50 KB limit." },
      { status: 413 }
    );
  }

  try {
    const result: PipelineResult = await runExtractionPipeline({
      kind: "text",
      text,
    });

    return NextResponse.json<ApiResponse<PipelineResult>>({ success: true, data: result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[inbox/process] pipeline error (text):", msg);
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Extraction failed. Please try again." },
      { status: 500 }
    );
  }
}

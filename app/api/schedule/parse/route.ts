import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { parseNLCommand } from "@/lib/ai/nl-parser";
import type { ApiResponse } from "@/types";
import type { NLParseResult } from "@/lib/ai/nl-parser";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json<ApiResponse>({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body.command !== "string") {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Request must include a `command` string." },
      { status: 400 }
    );
  }

  const command: string = body.command.trim();
  if (command.length < 3 || command.length > 2000) {
    return NextResponse.json<ApiResponse>(
      { success: false, error: "Command must be between 3 and 2000 characters." },
      { status: 400 }
    );
  }

  const result: NLParseResult = parseNLCommand(command);
  return NextResponse.json<ApiResponse<NLParseResult>>({ success: true, data: result });
}

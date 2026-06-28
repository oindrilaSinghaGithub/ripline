/**
 * OpenAIExtractionService — production LLM extraction using Structured Outputs.
 *
 * Uses OpenAI's `response_format.type = "json_schema"` (Structured Outputs API)
 * which GUARANTEES the response matches the declared JSON schema exactly.
 * No free-form text is ever returned — the model is forced into the schema.
 *
 * Compatible providers (must support Structured Outputs / json_schema):
 *   - OpenAI: gpt-4o, gpt-4o-mini, gpt-4o-2024-08-06+  ← recommended
 *   - Azure OpenAI (same models via OPENAI_BASE_URL)
 *   - Any provider that implements the json_schema response_format spec
 *
 * Providers that only support json_object (Groq, Together, etc.) will
 * automatically fall back to the json_object mode via OPENAI_STRUCTURED=false.
 *
 * Environment variables:
 *   OPENAI_API_KEY         — required
 *   OPENAI_BASE_URL        — optional, default https://api.openai.com/v1
 *   OPENAI_MODEL           — optional, default gpt-4o-mini
 *   OPENAI_MAX_TOKENS      — optional, default 4096
 *   OPENAI_STRUCTURED      — set to "false" to downgrade to json_object mode
 *   OPENAI_API_TYPE        — set to "azure" for Azure OpenAI header style
 */

import { validateLLMOutput } from "../output-validator";
import type { AIExtractionService, ExtractionResult, SourceMimeType } from "../types";

// ─── JSON Schema for TaskSuggestion[] ────────────────────────────────────────
// This is the exact schema OpenAI enforces at the model level.
// All fields that can be null must be listed in "required" and typed as
// ["string","null"] — Structured Outputs does not support optional properties.

const TASK_SUGGESTION_SCHEMA = {
  name: "task_extraction_result",
  description: "Structured list of actionable tasks extracted from the input text.",
  strict: true,
  schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        description: "All actionable tasks found in the text. Empty array if none found.",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description:
                "Short, action-oriented task title. Start with a verb. Max 200 characters.",
            },
            description: {
              type: ["string", "null"],
              description:
                "Additional context, details, or notes for the task. Null if none.",
            },
            dueDate: {
              type: ["string", "null"],
              description:
                "ISO 8601 datetime (e.g. '2025-07-15T23:59:00.000Z'). " +
                "Extract from any date/time expression in the text. " +
                "Use the current year if no year is specified. " +
                "For vague terms: 'today'=today 23:59, 'tomorrow'=tomorrow 23:59, " +
                "'this week'=nearest Sunday 23:59, 'next week'=following Sunday 23:59, " +
                "'this month'=last day of current month 23:59. " +
                "Null only if absolutely no deadline is expressed or implied.",
            },
            priority: {
              type: "string",
              enum: ["LOW", "MEDIUM", "HIGH"],
              description:
                "Task priority. HIGH if text contains: urgent, ASAP, critical, deadline, " +
                "must, immediately, overdue, final. MEDIUM if: important, soon, should, need. " +
                "LOW for everything else.",
            },
            category: {
              type: "string",
              enum: ["ACADEMIC", "WORK", "PERSONAL", "OTHER"],
              description:
                "ACADEMIC: assignments, exams, lectures, studying, courses, thesis, grades. " +
                "WORK: meetings, reports, clients, projects, deployments, invoices, sprints. " +
                "PERSONAL: health, family, finances, errands, shopping, fitness, social. " +
                "OTHER: anything that doesn't fit the above.",
            },
            recurrenceRule: {
              type: ["string", "null"],
              description:
                "iCal RRULE string if the task repeats. Examples: " +
                "'FREQ=DAILY' (every day), " +
                "'FREQ=WEEKLY;BYDAY=MO,WE,FR' (every Mon/Wed/Fri), " +
                "'FREQ=MONTHLY;BYMONTHDAY=1' (1st of every month), " +
                "'FREQ=WEEKLY;BYDAY=FR' (every Friday). " +
                "Null if the task is one-time.",
            },
            reminderOffsets: {
              type: "array",
              description:
                "ISO 8601 duration strings representing how long BEFORE the due date " +
                "to send a reminder. Negative durations. Examples: " +
                "'-PT30M' (30 min before), '-PT1H' (1 hour before), " +
                "'-PT2H' (2 hours before), '-P1D' (1 day before), '-P3D' (3 days before). " +
                "Infer from text: 'remind me 1 hour before' → ['-PT1H']. " +
                "For HIGH priority tasks with a dueDate always include at minimum ['-PT1H','-P1D']. " +
                "For MEDIUM priority tasks with dueDate include ['-PT1H']. " +
                "Empty array [] if no reminders are appropriate.",
              items: {
                type: "string",
              },
            },
            confidenceScore: {
              type: "number",
              description:
                "Float 0.0–0.99 representing extraction confidence. " +
                "0.9–0.99: task is explicit with clear deadline. " +
                "0.7–0.89: task is clear but deadline inferred or vague. " +
                "0.5–0.69: task is implied, not directly stated. " +
                "0.1–0.49: very uncertain extraction.",
            },
            extractedSourceSnippet: {
              type: "string",
              description:
                "The verbatim phrase or sentence from the source text that " +
                "produced this task suggestion. Max 300 characters.",
            },
          },
          required: [
            "title",
            "description",
            "dueDate",
            "priority",
            "category",
            "recurrenceRule",
            "reminderOffsets",
            "confidenceScore",
            "extractedSourceSnippet",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["tasks"],
    additionalProperties: false,
  },
} as const;

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert task extraction and scheduling assistant.

Your job is to read a piece of text and extract every actionable task it contains.

## Extraction rules

### What counts as a task
- Any action item, to-do, commitment, obligation, or deadline mentioned
- Inferred tasks from context (e.g. "the report is due Friday" → task: "Submit report")
- Recurring commitments ("I study DSA every Friday" → task with recurrence)

### Title
- Start with an action verb (Submit, Finish, Review, Call, Pay, Study, Book, etc.)
- Be specific and concise — max 200 characters
- Do NOT include date/time in the title (put it in dueDate)

### Deadline extraction (critical)
Extract a dueDate whenever the text contains ANY of:
- Explicit dates: "July 15", "15th", "next Monday", "this Friday", "tomorrow"
- Relative terms: "in 3 days", "by end of week", "before the weekend"
- Implicit deadlines: "the report is due", "exam is on", "meeting at 3pm"
- Time expressions: "at 10 AM", "by noon", "tonight", "this evening"
Always resolve relative dates against the CURRENT DATE provided in the user message.
When in doubt, assign a dueDate rather than leaving it null.

### Priority
Read urgency signals carefully:
- HIGH: urgent, ASAP, critical, must, deadline, overdue, final, immediately, last chance
- MEDIUM: important, should, need to, soon, don't forget, please
- LOW: when possible, eventually, consider, might, could

### Recurrence
Look for: every [day/week/month/weekday/weekend/Monday/etc.], daily, weekly, monthly, each [day].
Convert to a valid iCal RRULE string.

### Reminders
- Always add reminders for tasks with a dueDate
- HIGH priority: remind 1 day before AND 1 hour before
- MEDIUM priority: remind 1 hour before
- LOW priority: remind 30 minutes before
- Also extract explicit reminder requests: "remind me 2 hours before" → "-PT2H"

### What NOT to do
- Do not invent tasks that have no basis in the text
- Do not include prose, explanations, or commentary in any field
- Do not return anything except the structured JSON

If the text contains no actionable tasks, return an empty tasks array.`;

// ─── Request / response types ────────────────────────────────────────────────

interface ChatCompletionRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  max_tokens: number;
  temperature: number;
  response_format:
    | { type: "json_schema"; json_schema: typeof TASK_SUGGESTION_SCHEMA }
    | { type: "json_object" };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string; code?: string };
  usage?: { prompt_tokens: number; completion_tokens: number };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class OpenAIExtractionService implements AIExtractionService {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly useStructuredOutputs: boolean;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = (
      process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1"
    ).replace(/\/$/, "");
    this.model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
    this.maxTokens = parseInt(process.env.OPENAI_MAX_TOKENS ?? "4096", 10);
    // Default ON — set OPENAI_STRUCTURED=false for providers that don't support it
    this.useStructuredOutputs = process.env.OPENAI_STRUCTURED !== "false";
  }

  async extractFromText(
    text: string,
    mimeType: SourceMimeType
  ): Promise<ExtractionResult> {
    if (!this.apiKey) {
      return { success: false, error: "OPENAI_API_KEY is not configured." };
    }

    const now = new Date();
    const userPrompt = [
      `Current date and time: ${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })})`,
      `Source type: ${mimeType}`,
      "",
      "Text to analyse:",
      "────────────────────────────────────────",
      text.slice(0, 14000), // ~3500 tokens — leave room for output
      "────────────────────────────────────────",
    ].join("\n");

    const requestBody: ChatCompletionRequest = {
      model: this.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: this.maxTokens,
      temperature: 0, // Deterministic — structured extraction is not creative
      response_format: this.useStructuredOutputs
        ? { type: "json_schema", json_schema: TASK_SUGGESTION_SCHEMA }
        : { type: "json_object" },
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    };

    // Azure OpenAI uses api-key header instead of Authorization Bearer
    if (process.env.OPENAI_API_TYPE === "azure") {
      headers["api-key"] = this.apiKey;
      delete headers["Authorization"];
    }

    let rawContent: string;

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      });

      const json = (await response.json()) as ChatCompletionResponse;

      // Surface API-level errors
      if (!response.ok || json.error?.message) {
        const msg = json.error?.message ?? `HTTP ${response.status}`;
        console.error("[OpenAIExtractionService] API error:", msg);

        // If structured outputs is unsupported (e.g. older model / different provider)
        // retry once with json_object mode
        if (
          this.useStructuredOutputs &&
          (response.status === 400 || json.error?.code === "unsupported_value")
        ) {
          console.warn(
            "[OpenAIExtractionService] Structured Outputs not supported by this model/provider — retrying with json_object"
          );
          return this.extractWithJsonObject(userPrompt, headers);
        }

        return { success: false, error: `LLM API error: ${msg}` };
      }

      const choice = json.choices?.[0];

      // Structured Outputs refusal (model declined to generate)
      if (choice?.finish_reason === "refusal") {
        console.warn("[OpenAIExtractionService] Model refused to generate output");
        return { success: false, error: "The model refused to process this content." };
      }

      rawContent = choice?.message?.content ?? "";
      if (!rawContent.trim()) {
        return { success: false, error: "LLM returned an empty response." };
      }

      if (json.usage) {
        console.info(
          `[OpenAIExtractionService] tokens used — prompt: ${json.usage.prompt_tokens}, completion: ${json.usage.completion_tokens}`
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[OpenAIExtractionService] network error:", message);
      return { success: false, error: `Network error: ${message}` };
    }

    // Validate and coerce the structured response
    return this.parseAndValidate(rawContent);
  }

  // ─── Fallback: json_object mode ─────────────────────────────────────────

  private async extractWithJsonObject(
    userPrompt: string,
    headers: Record<string, string>
  ): Promise<ExtractionResult> {
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          max_tokens: this.maxTokens,
          temperature: 0,
          response_format: { type: "json_object" },
        }),
      });

      const json = (await response.json()) as ChatCompletionResponse;
      const content = json.choices?.[0]?.message?.content ?? "";
      if (!content.trim()) {
        return { success: false, error: "LLM returned empty response (json_object fallback)." };
      }
      return this.parseAndValidate(content);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `json_object fallback failed: ${message}` };
    }
  }

  // ─── Parse + validate ────────────────────────────────────────────────────

  private parseAndValidate(rawContent: string): ExtractionResult {
    const validated = validateLLMOutput(rawContent, `OpenAI/${this.model}`);

    if (!validated.success) {
      console.error("[OpenAIExtractionService] validation failed:", validated.error);
      console.error(
        "[OpenAIExtractionService] raw (first 600 chars):",
        rawContent.slice(0, 600)
      );
      return { success: false, error: validated.error };
    }

    if (validated.skipped > 0) {
      console.warn(
        `[OpenAIExtractionService] ${validated.skipped} item(s) dropped (no title)`
      );
    }

    const needsReview = validated.suggestions.filter((s) => s.needsReview).length;
    if (needsReview > 0) {
      console.warn(
        `[OpenAIExtractionService] ${needsReview} item(s) flagged needsReview=true`
      );
    }

    console.info(
      `[OpenAIExtractionService] extracted ${validated.suggestions.length} task(s)`
    );

    return { success: true, suggestions: validated.suggestions };
  }
}

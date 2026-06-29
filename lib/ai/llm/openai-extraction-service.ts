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
import { extractAllDates, refineSuggestions } from "../suggestion-quality";
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
                "Short, complete, human-readable task title (3–8 words preferred). " +
                "Describes the underlying action or event — never a metadata label alone. " +
                "\n\nMETADATA LABEL RULE: words like 'Deadline', 'Due Date', 'Submission Ends', " +
                "'Submission Window Ends', 'Submission Closes', 'Exam Date', 'Meeting Time', " +
                "'Due', 'Date', 'Time', 'Scheduled', 'Opens', 'Closes', 'Starts', 'Ends' " +
                "are metadata — they describe WHEN, not WHAT. " +
                "The date/time they introduce goes in dueDate. The title must describe the event. " +
                "\n\nGOOD examples: 'Meeting with Rahul', 'Measure Theory Exam', " +
                "'Submit PRD Document', 'Hackathon Begins', 'Pay Electricity Bill', " +
                "'Submission Deadline', 'Doctor Appointment', 'Team Meeting'. " +
                "\n\nBAD examples (never output): " +
                "'Deadline: June 15' (metadata label + date), " +
                "'Submission Ends: June 15' (metadata label + date), " +
                "'13 June' (date alone), '03:00 PM' (time alone), " +
                "'Room 204' (location alone), 'MA51002' (subject code alone), " +
                "'Meeting with R' (truncated word), 'the technical s' (truncated mid-word). " +
                "\n\nTRUNCATION RULE: NEVER cut a title in the middle of a word. " +
                "If a concise title cannot be found, return the COMPLETE first sentence. " +
                "Only shorten at natural word boundaries. Max 200 chars.",
            },
            description: {
              type: ["string", "null"],
              description:
                "Additional context: location, room number, subject code, invigilator, notes. " +
                "Null if no extra detail is available.",
            },
            dueDate: {
              type: ["string", "null"],
              description:
                "ISO 8601 UTC datetime (e.g. '2026-06-30T15:00:00.000Z'). " +
                "Associate THIS specific date/time with THIS task — never create a separate task for a date alone. " +
                "Recognised formats: 2026-06-30, 30 June, 30 Jun, 30th June, June 30, " +
                "30/06/2026, 30-06-2026, Friday, Tomorrow, Today, Next Monday, " +
                "This Weekend, This Evening, July 15, 15th July, 'in 3 days', 'by end of week'. " +
                "Use the current year when no year is specified. " +
                "'Today'=today 23:59, 'Tomorrow'=tomorrow 23:59, 'This Evening'=today 20:00, " +
                "'This Weekend'=nearest Saturday 10:00. " +
                "For date ranges (start and end): create TWO tasks with their respective dates. " +
                "Null ONLY when absolutely no date is expressed or implied.",
            },
            priority: {
              type: "string",
              enum: ["LOW", "MEDIUM", "HIGH"],
              description:
                "HIGH: urgent, ASAP, critical, must, deadline, exam, final, overdue, immediately. " +
                "MEDIUM: important, soon, should, need to, submit, meeting, appointment, interview. " +
                "LOW: when possible, eventually, optional, FYI.",
            },
            category: {
              type: "string",
              enum: ["ACADEMIC", "WORK", "PERSONAL", "OTHER"],
              description:
                "ACADEMIC: exams, assignments, lectures, study, course, thesis, lab, quiz, grade, submit (academic). " +
                "WORK: meetings, client, report, sprint, deploy, review, standup, project, invoice, proposal. " +
                "PERSONAL: health, family, finance, bills, errands, shopping, fitness, social, birthday, travel. " +
                "OTHER: anything that doesn't clearly fit the above.",
            },
            recurrenceRule: {
              type: ["string", "null"],
              description:
                "iCal RRULE if the task repeats. Must start with FREQ=. " +
                "Examples: 'FREQ=DAILY', 'FREQ=WEEKLY;BYDAY=MO,WE,FR', " +
                "'FREQ=MONTHLY;BYMONTHDAY=1', 'FREQ=WEEKLY;BYDAY=FR'. " +
                "Null for one-time tasks.",
            },
            reminderOffsets: {
              type: "array",
              description:
                "Negative ISO 8601 durations: how long BEFORE dueDate to remind. " +
                "HIGH + dueDate → ['-P1D', '-PT1H']. " +
                "MEDIUM + dueDate → ['-PT1H']. " +
                "LOW + dueDate → ['-PT30M']. " +
                "If text says 'remind me X before', use that value. " +
                "Empty array [] if no dueDate or reminders not appropriate.",
              items: { type: "string" },
            },
            confidenceScore: {
              type: "number",
              description:
                "Float 0.0–0.99. Start at 0.55. " +
                "Boost +0.20 for: deadline / due / submit / submission / final keyword. " +
                "Boost +0.18 for: exam / test / quiz / viva. " +
                "Boost +0.15 for: meeting / appointment / interview / presentation / payment / invoice. " +
                "Boost +0.12 for: starts / begins / opens / ends / closes / hackathon. " +
                "Boost +0.08 if dueDate is set. " +
                "Cap at 0.99. Lower toward 0.45 only when title had to be inferred from fragments " +
                "with no surrounding context. Never output 0 or exactly 1.",
            },
            extractedSourceSnippet: {
              type: "string",
              description:
                "The verbatim phrase or sentence from the source text that produced this task. Max 300 chars.",
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

════════════════════════════════════════════════════════════════
CRITICAL PROCESS — follow these steps IN ORDER, every time
════════════════════════════════════════════════════════════════

STEP 1 — Read the ENTIRE document first
  Do not produce any output until you have read from the first line to the last.
  Understand the overall context: exam schedule, hackathon notice, invoice,
  agenda, assignment list, timetable, or mixed content.

STEP 2 — Identify every logical event
  An event is anything that happens at a date/time or requires an action.
  Types: meeting, exam, interview, deadline, submission, payment, appointment,
  workshop, hackathon, assignment, reminder, invoice due, bill, renewal,
  birthday, conference, registration, opening, closing, release.
  Mark EVERY event in the document before writing any JSON.

STEP 3 — Associate fields to the SAME event
  For each event, identify:
    • title  (event/action name — the most descriptive label in the document)
    • action (what to do, if any)
    • date   (when — becomes dueDate)
    • time   (part of dueDate)
    • location / room (goes in description, NOT in title)
    • people (goes in title or description)
    • subject codes (goes in description, NOT as the title)
  A date or time is NEVER its own task — always attach it to the event.

STEP 4 — One task per event
  Create exactly one task object per logical event.
  When one paragraph describes multiple events (e.g. start date + end date +
  submission window), create a SEPARATE task for each.
  Example:
    "Hackathon starts June 13, ends June 14. Submission opens June 15 8 AM,
     closes June 15 11:59 PM."
  → 4 tasks: Hackathon Begins (Jun 13) | Hackathon Ends (Jun 14) |
             Submission Opens (Jun 15 08:00) | Submission Deadline (Jun 15 23:59)

════════════════════════════════════════════════════════════════
TITLE SELECTION PRIORITY — follow this algorithm every time
════════════════════════════════════════════════════════════════

PRIORITY 1 — First meaningful non-empty line
  Use the first line that describes an action, event, subject, or person.
  Skip any line that contains ONLY metadata. These words are NEVER titles:
    Deadline   Due   Due Date   Date   Time   Scheduled
    Submission Opens   Submission Ends   Submission Closes
    Venue   Location   Room   Place   Hall   Lab
    Opens   Closes   Starts   Ends   Begins   Commences   Concludes
  Skip any line that is ONLY a date or time — dates go in dueDate.

PRIORITY 2 — Heading word + next descriptive line
  If the first meaningful line is a single heading-category word such as:
    Assignment  Project  Report  Presentation  Exam  Invoice  Receipt
    Meeting  Workshop  Conference  Hackathon  Interview  Resume
    Application  Registration  Notice  Circular
  Then COMBINE it with the next descriptive line to form the title.
  Examples:
    "Assignment\nDatabase Systems\nDeadline: 17 July"
    → title = "Database Systems Assignment"  (combine heading + subject, dueDate = 17 July)

    "Project\nSmart Parking System\nDeadline: 30 June"
    → title = "Smart Parking System Project"

    "Meeting\nMarketing Team\nDate: Friday 3 PM"
    → title = "Marketing Team Meeting"

    "Hackathon Submission\nSubmission Ends: 15 June 2025"
    → title = "Hackathon Submission"  (already meaningful — no combination needed)
    → dueDate = 15 June 2025

  The combination format is: [Subject/Name] [HeadingWord]
  e.g.  "Assignment" + "Machine Learning"  →  "Machine Learning Assignment"
  e.g.  "Exam"       + "Measure Theory"    →  "Measure Theory Exam"

PRIORITY 3 — Generate a concise title
  If no heading exists, generate a short human-readable title (3–8 words):
    "Pay Electricity Bill"   "Complete AI Assignment"   "Hackathon Begins"
    "Submission Deadline"    "Doctor Appointment"        "Prepare Final Report"

PRIORITY 4 — Generic fallback
  If the document contains only dates/metadata with no meaningful text, use:
    "Upcoming Deadline"   "Upcoming Event"   "Reminder"
  NEVER use a date as the title.

  EXPECTED RESULTS:
    Input:  "Assignment\nDatabase Systems\nDeadline: 17 July 2026"
    Output: title="Database Systems Assignment", dueDate=2026-07-17

    Input:  "Hackathon Submission\nSubmission Ends: 15 June 2025"
    Output: title="Hackathon Submission", dueDate=2025-06-15

    Input:  "17 July 2026\nDeadline: 17 July 2026"
    Output: title="Upcoming Deadline", dueDate=2026-07-17
    NOT:    title="17 July 2026"

════════════════════════════════════════════════════════════════
TITLE RULES (strict — enforced by a post-processing filter)
════════════════════════════════════════════════════════════════

GOOD titles (3–8 words, summarise the event):
  "Meeting with Rahul"
  "Measure Theory Exam"
  "Submit PRD Document"
  "Pay Electricity Bill"
  "Hackathon Begins"
  "Hackathon Ends"
  "Submission Opens"
  "Submission Deadline"
  "Operating Systems Exam"
  "Complete Machine Learning Assignment"
  "Doctor Appointment"
  "Team Meeting"
  "Invoice Payment"
  "Prepare Presentation"

BAD titles — NEVER output these:
  "13 June"                        ← date alone
  "03:00 PM"                        ← time alone
  "03:00 PM-05:00 PM"               ← time range alone
  "2026-06-30"                      ← ISO date alone
  "Room 204"                        ← location alone
  "CS501"                           ← subject code alone
  "MA51002"                         ← subject code alone
  "Deadline"                        ← metadata label alone
  "Due Date"                        ← metadata label alone
  "Submission Ends: June 15, 2025"  ← metadata label + date (should be title + dueDate)
  "Deadline: June 15"               ← metadata label + date (should be title + dueDate)
  "Exam Date: 30 June"              ← metadata label + date
  "Rahul tomorrow"                  ← fragment
  "Meeting with R"                  ← truncated word
  "the technical s"                 ← truncated mid-word
  "Submissi"                        ← truncated mid-word

METADATA LABEL RULE (critical):
  Words like "Deadline", "Due Date", "Submission Ends", "Submission Window Ends",
  "Submission Closes", "Exam Date", "Meeting Time", "Due", "Date", "Time",
  "Opens", "Closes", "Starts", "Ends", "Begins", "Commences", "Scheduled"
  describe WHEN something happens, not WHAT the task is.
  When you see "Label: Date" or "Label: Date Time", extract:
    → dueDate = the date/time value
    → title   = the underlying event inferred from context
  Do NOT put the label word in the title.

  Examples:
    Input:  "Submit PRD document. Deadline: June 15, 2025 11:59 PM"
    Output: title="Submit PRD Document", dueDate="2025-06-15T18:29:00.000Z"

    Input:  "Submission Window Ends: June 15, 2025"
    Output: title="Submission Deadline", dueDate="2025-06-15T23:59:00.000Z"

    Input:  "Exam Date: 30 June | Subject: Measure Theory"
    Output: title="Measure Theory Exam", dueDate=June 30

HEADING PREFERENCE RULE:
  When the document has section headings or subject names near a date/time,
  prefer the heading/subject name as the title — not the date label.
  Examples:
    "Assignment\nComplete ML Project\nDeadline: 15 July"
    → title="Complete ML Project", dueDate=July 15

    "MA51002 Measure Theory and Integration | 2026-06-30 | 03:00 PM"
    → title="Measure Theory and Integration Exam", dueDate=2026-06-30T09:30Z

TRUNCATION RULE (strict):
  NEVER cut a title in the middle of a word.
  If a concise title cannot be formed, return the COMPLETE first sentence.
  Only shorten at natural word boundaries.
  Bad:  "Common problem: business users often have valuable data but lack the technical s"
  Good: "Business Users Lack Technical Skills"
   or:  "Common Problem: Business Users Lack Technical Skills"

Title generation rules:
  • Prefer exam/event names, document headings, or meeting subjects
  • Start action items with a verb: Submit, Pay, Attend, Complete, Review, Call, Register
  • Do NOT include date/time in the title — use dueDate
  • Never use a subject code as the title — use the full subject name
  • Never use a single word unless it is an unambiguous complete event name

════════════════════════════════════════════════════════════════
DATE RECOGNITION
════════════════════════════════════════════════════════════════
Recognise and resolve ALL of these to a UTC ISO 8601 dueDate:
  2026-06-30        → "2026-06-30T23:59:00.000Z" (or extract time if given)
  30 June           → June 30 of current/next year
  30 Jun            → same
  30th June         → same
  June 30           → same
  Jun 30th          → same
  30/06/2026        → June 30 2026
  30-06-2026        → June 30 2026
  Friday            → nearest upcoming Friday
  Tomorrow          → tomorrow 23:59
  Today             → today 23:59
  Next Monday       → nearest upcoming Monday
  This Weekend      → nearest Saturday 10:00
  This Evening      → today 20:00
  July 15           → July 15 of current/next year
  15th July         → same
  in 3 days         → 3 days from today
  by end of week    → nearest Sunday 23:59
  Start/end ranges  → use exact dates for separate tasks

When multiple dates appear, match each date to its correct event — do not
merge all dates into one task, and do not create a date-only task.

════════════════════════════════════════════════════════════════
MULTI-LINE OCR CONTEXT
════════════════════════════════════════════════════════════════
OCR often splits one sentence across lines, and pipe " | " separators in the
input are added by the pre-processor to attach date/time/room fragments to
their event line. Treat everything between " | " separators as ONE event.

Example input line (after pre-processing):
  "MA51002 Measure Theory and Integration | 2026-06-30 | 03:00 PM-05:00 PM | Room LH-1"
→ ONE task:
  title: "Measure Theory and Integration Exam"
  dueDate: 2026-06-30T09:30:00.000Z  (03:00 PM IST)
  description: "Subject: MA51002 | Room: LH-1 | Time: 03:00–05:00 PM"

Example OCR fragments:
  "Meeting with" / "Rahul tomorrow" / "at 5 PM"
→ ONE task:
  title: "Meeting with Rahul"
  dueDate: tomorrow at 17:00

════════════════════════════════════════════════════════════════
TABLES AND STRUCTURED DOCUMENTS
════════════════════════════════════════════════════════════════
For exam timetables, schedules, agendas, invoices:
  • Process EVERY data row — do not skip any
  • Do not merge multiple rows into one task
  • Use the subject/event name column as the title
  • Put subject code, room, invigilator in description
  • If the document uses a pattern like "Subject Code | Subject Name | Date | Time | Room",
    infer that it is an exam row and set title = "Subject Name Exam"

════════════════════════════════════════════════════════════════
CONFIDENCE SCORING
════════════════════════════════════════════════════════════════
Start at 0.55, then apply these boosts (they stack):
  +0.20  deadline / due / submit / submission / final
  +0.18  exam / test / quiz / viva / assessment
  +0.15  meeting / appointment / interview / presentation / payment / invoice / bill
  +0.12  starts / begins / opens / ends / closes / hackathon / registration
  +0.08  dueDate is set
  Cap at 0.99.
Lower toward 0.45 only when the title was inferred from heavily fragmented text
with no clear surrounding context.

════════════════════════════════════════════════════════════════
PRIORITY
════════════════════════════════════════════════════════════════
HIGH:   urgent, ASAP, critical, must, exam, final, deadline, overdue, immediately
MEDIUM: important, submit, meeting, appointment, interview, should, need to, soon
LOW:    when possible, eventually, optional, FYI, note

════════════════════════════════════════════════════════════════
RECURRENCE
════════════════════════════════════════════════════════════════
Convert patterns like "every Monday", "weekly", "daily" to iCal RRULE:
  "every Monday"   → FREQ=WEEKLY;BYDAY=MO
  "every weekday"  → FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR
  "monthly"        → FREQ=MONTHLY
  "every 1st"      → FREQ=MONTHLY;BYMONTHDAY=1

════════════════════════════════════════════════════════════════
REMINDERS
════════════════════════════════════════════════════════════════
HIGH + dueDate   → ["-P1D", "-PT1H"]
MEDIUM + dueDate → ["-PT1H"]
LOW + dueDate    → ["-PT30M"]
No dueDate       → []

════════════════════════════════════════════════════════════════
DO NOT
════════════════════════════════════════════════════════════════
  • Do not invent tasks not found in the text
  • Do not treat each OCR line as an independent task
  • Do not return any text commentary — only the JSON object
  • Do not create a task whose title is only a date, time, room, or code
  • If no actionable tasks exist, return { "tasks": [] }`;

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
    const maxInputChars = parseInt(
      process.env.OPENAI_MAX_INPUT_CHARS ?? "100000",
      10
    );
    const llmInput =
      text.length > maxInputChars ? text.slice(0, maxInputChars) : text;

    if (text.length > maxInputChars) {
      console.warn(
        `[OpenAIExtractionService] input truncated: ${text.length} → ${maxInputChars} chars`
      );
    }

    console.info(`[OpenAIExtractionService] LLM input length=${llmInput.length}`);

    // Deterministic date scan — gives the LLM a complete date inventory
    // so it never misses a date that appears anywhere in the document.
    const detectedDates = extractAllDates(llmInput);
    const dateInventoryLine = detectedDates.length > 0
      ? `Detected dates in document (ISO): ${detectedDates.join(", ")}`
      : "No dates detected by deterministic scanner.";

    const userPrompt = [
      `Current date and time: ${now.toISOString()} (${now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })})`,
      `Source type: ${mimeType}`,
      dateInventoryLine,
      "",
      "Instructions: Read the FULL document below before extracting.",
      "TITLE PRIORITY: Use the first meaningful non-empty line as the title.",
      "SKIP metadata-only lines: Deadline, Due, Date, Time, Venue, Room, Location,",
      "Submission Opens, Submission Ends, Starts, Ends, Commences, Concludes.",
      "If a heading word (Assignment, Project, Exam, Meeting, Hackathon, etc.) appears",
      "on its own line, combine it with the NEXT descriptive line as the title.",
      "Examples: 'Assignment' + 'Database Systems' → 'Database Systems Assignment'",
      "          'Project' + 'Smart Parking System' → 'Smart Parking System Project'",
      "          'Meeting' + 'Marketing Team' → 'Marketing Team Meeting'",
      "Group related lines. Associate dates/times with the correct event.",
      "",
      "Document text:",
      "────────────────────────────────────────",
      llmInput,
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

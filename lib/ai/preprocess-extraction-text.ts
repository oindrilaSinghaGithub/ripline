/**
 * Pre-LLM text normalisation — merges OCR line fragments into readable units
 * and attaches orphaned metadata (dates, times, room numbers, subject codes)
 * to the nearest logical event line.
 *
 * CONTRACT: does NOT summarise, shorten, or remove content.
 * The LLM receives the complete document; only unnecessary whitespace and
 * obvious OCR fragmentation is normalised.
 */

// Matches a line that contains ONLY metadata — a date, time, room, code,
// a standalone metadata label word, or a "Label: value" metadata line
// like "Deadline: 17 July" / "Due Date:" / "Submission Ends: 15 June".
// Such lines are attached to the preceding event line rather than kept standalone.
const METADATA_LINE =
  /^(?:\d{4}-\d{2}-\d{2}|\d{1,2}[\/\-\.]\d{1,2}(?:[\/\-\.]\d{2,4})?|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+\d{2,4})?|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{1,2}(?:st|nd|rd|th)?(?:\s+\d{2,4})?|(?:tomorrow|today|yesterday|tonight|this\s+evening|this\s+weekend)|(?:next|this)\s+\w+|\d{1,2}(?::\d{2})?\s*(?:am|pm)(?:\s*[-–]\s*\d{1,2}(?::\d{2})?\s*(?:am|pm))?|\d{1,2}:\d{2}|(?:room|venue|location|hall|lab|auditorium|block)\s*[\w\-]*|[A-Z]?\d{2,4}[A-Z]?|[A-Z]{1,3}[\s\-]?\d{3,5}[A-Z]?|(?:deadline|due\s+date|due|submission\s+(?:ends?|opens?|closes?|window|deadline|date)|exam\s+(?:date|time)|meeting\s+(?:date|time)|event\s+(?:date|time)|last\s+date|closing\s+date|date|time|scheduled|schedule|starts?|ends?|opens?|closes?|begins?|commences?|concludes?|venue|location|room|place)\s*[:\-]?.*)$/i;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** True if the line looks like a table row (pipe/tab/multi-space delimited). */
function isTableRow(line: string): boolean {
  if (line.includes("|")) return true;
  if (line.includes("\t")) return true;
  if (/\s{3,}/.test(line)) return true;
  return false;
}

/** True if the line is a section heading (ALL CAPS or ends with colon). */
function isHeading(line: string): boolean {
  if (/^[A-Z][A-Z0-9 &:\/\-]{4,}$/.test(line)) return true;
  if (/:\s*$/.test(line) && line.length < 80) return true;
  return false;
}

/**
 * True if this short line is likely an incomplete OCR fragment that should be
 * merged with its neighbours.
 */
function looksLikeIncompleteLine(line: string): boolean {
  if (line.length >= 90) return false;
  if (isTableRow(line)) return false;
  if (isHeading(line)) return false;
  if (METADATA_LINE.test(line)) return false;
  if (/[.!?;:]$/.test(line)) return false;
  // Lines starting with a bullet or list marker are usually complete items
  if (/^[-•*>✓✗→]\s/.test(line)) return false;
  return true;
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Merge fragmented OCR lines into readable multi-word units and attach
 * orphaned metadata (date / time / room / code) to the nearest event line.
 *
 * Behaviour:
 *   1. Lines that look incomplete are accumulated in a buffer and flushed when
 *      a natural boundary is detected.
 *   2. After the initial merge pass, any line matching METADATA_LINE is
 *      appended to the preceding event line with " | " as separator.
 *   3. Paragraph breaks (blank lines) are preserved.
 */
export function prepareTextForExtraction(text: string): string {
  const rawLines = text.split(/\n/);
  const merged: string[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer.trim()) {
      merged.push(buffer.trim());
      buffer = "";
    }
  };

  for (const raw of rawLines) {
    const line = raw.trim();

    if (!line) {
      flush();
      merged.push("");
      continue;
    }

    if (isTableRow(line) || isHeading(line)) {
      flush();
      merged.push(line);
      continue;
    }

    if (!buffer) {
      if (looksLikeIncompleteLine(line)) {
        buffer = line;
      } else {
        merged.push(line);
      }
      continue;
    }

    // Active buffer — extend or flush
    if (looksLikeIncompleteLine(line)) {
      buffer += ` ${line}`;
      if (buffer.length >= 140 || /[.!?]$/.test(line)) {
        flush();
      }
    } else {
      flush();
      merged.push(line);
    }
  }

  flush();

  // Pass 2: attach metadata-only lines to the preceding event line
  const withContext: string[] = [];
  for (const line of merged) {
    if (!line) {
      withContext.push("");
      continue;
    }

    if (METADATA_LINE.test(line.trim())) {
      // Find the last non-blank, non-metadata line to attach to
      let attachIdx = withContext.length - 1;
      while (
        attachIdx >= 0 &&
        (!withContext[attachIdx] || METADATA_LINE.test(withContext[attachIdx].trim()))
      ) {
        attachIdx--;
      }
      if (attachIdx >= 0) {
        withContext[attachIdx] += ` | ${line.trim()}`;
      } else {
        withContext.push(line);
      }
    } else {
      withContext.push(line);
    }
  }

  return withContext.join("\n").trimEnd().replace(/\n{3,}/g, "\n\n");
}

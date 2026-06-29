# Ripline- Turn Documents Into Actions with AI

An AI-powered productivity platform that turns documents, PDFs, and natural language into structured tasks, schedules, and actionable insights.

Built on **Next.js 16 App Router**, **Prisma**, **Auth.js v5**, and **Aurora PostgreSQL** — with a real OCR + LLM extraction pipeline and a fully functional recurring task system.

---

## What Actually Works

| Feature | Status |
|---|---|
| Google + GitHub OAuth 
| Task CRUD (create / edit / delete / complete) 
| Recurring tasks (daily / weekly / monthly / yearly) 
| Per-occurrence calendar completion 
| AI Inbox — text paste + file upload 
| OCR via AWS Textract (falls back to mock) 
| LLM extraction via OpenAI (falls back to heuristic) 
| Source history with task counts 
| Natural language scheduler ("Ask Ripline") 
| Calendar — month + week views 
| Workload scoring + AI insights 
| Dark / light theme (persisted) 
| REST API for tasks 
| Workspaces / Members / Settings profile 
| Reminder delivery 

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router, React 19) |
| Language | TypeScript |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix UI) |
| ORM | Prisma v7 with `@prisma/adapter-pg` |
| Database | PostgreSQL (Amazon Aurora) |
| Auth | Auth.js v5 (NextAuth) — GitHub + Google OAuth, DB sessions |
| OCR | AWS Textract (or mock fallback) |
| LLM | OpenAI (`gpt-4o-mini` Structured Outputs, or heuristic fallback) |
| Deployment | Vercel (or any Node host) |

---

## Project Architecture

```
app/
├── page.tsx                        # Marketing landing page
├── layout.tsx                      # Root layout (fonts, providers)
│
├── (auth)/                         # Auth group — centered layout
│   ├── login/page.tsx              # OAuth sign-in
│   └── register/page.tsx           # Same as login (first OAuth = account creation)
│
├── (dashboard)/                    # Dashboard group — requires auth
│   ├── layout.tsx                  # Sidebar + header shell
│   └── dashboard/
│       ├── page.tsx                # Overview: stats, insights, Ask Ripline, recent tasks
│       ├── tasks/page.tsx          # Full task list with filters and CRUD
│       ├── calendar/page.tsx       # Month/week calendar, workload view, recurring tasks
│       ├── inbox/page.tsx          # AI extraction — paste text or upload file
│       ├── workspaces/page.tsx     # Space to collaborate with teams
│       ├── members/page.tsx        # List of members 
│       └── settings/page.tsx       # Theme toggle (real) + profile edit (localStorage only)
│
└── api/
    ├── auth/[...nextauth]/         # Auth.js catch-all handler
    ├── inbox/process/              # POST — runs OCR + LLM pipeline
    ├── schedule/parse/             # POST — NL parser (no LLM required)
    └── tasks/
        ├── route.ts                # GET (list) / POST (create)
        └── [id]/route.ts           # GET / PATCH / DELETE

components/
├── auth/                           # sign-in-form (GitHub + Google buttons)
├── calendar/                       # calendar-grid, insights-panel, task-detail-panel
├── dashboard/                      # sidebar, header (with avatar dropdown)
├── inbox/                          # input-panel, review-panel, suggestion-card, confidence-badge,
│                                   # inbox-controller, source-history, source-preview-modal
├── marketing/                      # nav, footer
├── schedule/                       # ask-ripline (NL scheduler widget)
├── tasks/                          # task-list, task-card, task-form-modal, delete-task-dialog
├── ui/                             # shadcn/ui primitives (button, card, dialog, select, …)
├── profile-provider.tsx            # localStorage profile context (display only)
└── providers.tsx                   # SessionProvider + ThemeProvider

lib/
├── auth.ts                         # Auth.js config (providers, PrismaAdapter, session callback)
├── db.ts                           # Prisma client — standard URL or Aurora IAM rotation
├── tz.ts                           # IST timezone helpers (all display uses Asia/Kolkata)
├── recurrence.ts                   # iCal RRULE parser, expandRecurringTasks, nextOccurrenceAfter
├── calendar-utils.ts               # buildMonthGrid, buildWeekGrid, scoreDay, computeInsights
├── utils.ts                        # cn(), slugify(), formatDate(), absoluteUrl()
│
├── actions/
│   ├── tasks.ts                    # createTask, updateTask, deleteTask, toggleTaskComplete,
│   │                               # toggleOccurrenceComplete, getTaskStats
│   └── inbox.ts                    # saveSource, confirmSuggestions, getSourceHistory
│
└── ai/
    ├── extraction-pipeline.ts      # Orchestrator: OCR → LLM → heuristic fallback
    ├── index.ts                    # AI service factory (OpenAI or mock)
    ├── types.ts                    # AIExtractionService interface + shared types
    ├── suggestion-schema.ts        # Zod schema for TaskSuggestion
    ├── output-validator.ts         # Two-pass LLM output validation + JSON fence stripping
    ├── nl-parser.ts                # Regex NL scheduler (no LLM — used by Ask Ripline)
    ├── mock-extraction-service.ts  # Heuristic verb-detection fallback extractor
    └── llm/
        └── openai-extraction-service.ts  # OpenAI Structured Outputs (gpt-4o-mini default)
    └── ocr/
        ├── index.ts                # OCR factory (Textract or mock)
        ├── textract-ocr-adapter.ts # AWS Textract — DetectDocumentText
        ├── mock-ocr-adapter.ts     # Mock OCR (no AWS creds needed)
        └── types.ts                # OCRService interface + OCRResult

prisma/
├── schema.prisma                   # DB schema (see Data Model below)
├── migrations/                     # Applied migration history
└── rds-ca.pem                      # AWS RDS CA bundle for Aurora TLS
```

---

## Data Model

```prisma
model User           # id, name, email, image — linked to auth accounts + tasks
model Account        # NextAuth OAuth account (provider tokens)
model Session        # NextAuth DB session
model VerificationToken

model Workspace      # id, name, slug, plan (FREE/PRO/ENTERPRISE), ownerId
model WorkspaceMember # userId + workspaceId + role (OWNER/ADMIN/MEMBER)

model Source         # Uploaded document — sourceType (TEXT/IMAGE/PDF/EXTENSION), originalContent
model Task           # title, dueDate, priority, category, status, recurrenceRule,
                     # nextOccurrence, lastCompletedOccurrence, completedOccurrences[]
model Reminder       # remindAt, sent — linked to a Task 
```

---

## AI Pipeline

```
User pastes text or uploads file
          │
          ▼
   [Stage 1 — OCR]
   AWS Textract (if file) → extracts text + confidence
   Mock OCR (if no AWS creds)
          │
          ▼
   [Stage 2 — LLM Extraction]
   OpenAI gpt-4o-mini with Structured Outputs
   → TaskSuggestion[] (title, dueDate, recurrenceRule, priority, category, confidence)
   Falls back to json_object mode for Azure / non-standard endpoints
          │
          ▼ (if LLM unavailable or returns nothing)
   [Stage 3 — Heuristic Fallback]
   Verb-detection chunk splitting + regex date/priority/category extraction
          │
          ▼
   Two-pass Zod validation (strict → lenient with needsReview flag)
          │
          ▼
   Returned to client — NOT saved yet
          │
          ▼
   User reviews suggestions in ReviewPanel (edit/reject/accept)
          │
          ▼
   confirmSuggestions() server action → Tasks saved to DB
```

**Ask Ripline (NL Scheduler — separate path)**

```
User types "every Friday practice DSA at 8 PM"
          │
          ▼
   /api/schedule/parse → nl-parser.ts (pure regex, no LLM)
          │
          ▼
   TaskSuggestion[] with recurrenceRule="FREQ=WEEKLY;BYDAY=FR"
          │
          ▼
   Same ReviewPanel → confirmSuggestions() → saved to DB
```

---

## Recurring Task System

Each recurring task stores one DB row (the master record). The system tracks:

- `recurrenceRule` — iCal RRULE subset (e.g. `FREQ=WEEKLY;BYDAY=MO`)
- `nextOccurrence` — the next due date shown on the Tasks page
- `lastCompletedOccurrence` — last date completed via the Tasks page
- `completedOccurrences[]` — per-occurrence dates completed via the calendar

**Tasks page behaviour**: checking off an occurrence advances `nextOccurrence` to the next matching date via `nextOccurrenceAfter()`. The series never transitions to `COMPLETED`.

**Calendar behaviour**: `expandRecurringTasks()` generates virtual instances across the current view window. Each instance's `status` is derived from `completedOccurrences` — completing June 6 only marks June 6, leaving June 13 pending.

---

## Timezone

All dates are stored as UTC in the database. All display and date-grouping logic uses `Asia/Kolkata` (IST, UTC+5:30). The `lib/tz.ts` module provides `localDateKey()` and `formatInIST()` — no raw `toISOString().slice(0,10)` calls appear in the codebase.

---

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL (or Aurora PostgreSQL)
- Google and/or GitHub OAuth app credentials

### Setup

```bash
git clone <repo>
cd ripline
npm install
```

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

Run the database migrations:

```bash
npx prisma migrate deploy
```

Start the dev server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Environment Variables

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/ripline?sslmode=require"

# Auth.js
AUTH_SECRET="generate with: openssl rand -base64 32"
AUTH_URL="http://localhost:3000"

# OAuth (at least one required)
AUTH_GITHUB_ID=""
AUTH_GITHUB_SECRET=""
AUTH_GOOGLE_ID=""
AUTH_GOOGLE_SECRET=""

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NEXT_PUBLIC_APP_NAME="Ripline"

# OpenAI — optional, falls back to heuristic extractor
OPENAI_API_KEY=""
# OPENAI_BASE_URL="https://api.openai.com/v1"
# OPENAI_MODEL="gpt-4o-mini"

# OCR — optional, falls back to mock
# OCR_PROVIDER="textract"
# AWS_ACCESS_KEY_ID=""
# AWS_SECRET_ACCESS_KEY=""
# AWS_REGION=""
```

### Aurora IAM Auth (optional)

To use IAM token auth instead of a password:

```env
AURORA_IAM_AUTH=true
AWS_AURORA_HOST=your-cluster.region.rds.amazonaws.com
AWS_AURORA_PORT=5432
AWS_AURORA_USER=postgres
AWS_AURORA_DB=ripline
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Tokens are automatically rotated every 12 minutes (IAM tokens expire in 15).

---

## Deployment

Ripline is a standard Next.js app and deploys to any Node host.

**Vercel (recommended):**
1. Push to GitHub
2. Import into Vercel
3. Add all environment variables
4. Deploy — `prisma generate` runs automatically via the `build` script

**Other hosts:** Run `npm run build && npm start`. Ensure the `DATABASE_URL` is reachable from the host.

---


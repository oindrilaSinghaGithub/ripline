-- Add nextOccurrence and lastCompletedOccurrence to tasks for recurring task series tracking

ALTER TABLE "tasks" ADD COLUMN "nextOccurrence" TIMESTAMP(3);
ALTER TABLE "tasks" ADD COLUMN "lastCompletedOccurrence" TIMESTAMP(3);

-- Backfill: for any existing recurring task, set nextOccurrence = dueDate
UPDATE "tasks" SET "nextOccurrence" = "dueDate" WHERE "recurrenceRule" IS NOT NULL AND "dueDate" IS NOT NULL;

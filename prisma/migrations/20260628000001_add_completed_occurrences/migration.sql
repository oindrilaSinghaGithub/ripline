-- Add completedOccurrences array for per-occurrence calendar completion tracking.
-- This is distinct from lastCompletedOccurrence (Tasks page series pointer).
-- The array stores one entry per calendar occurrence the user has checked off.

ALTER TABLE "tasks"
  ADD COLUMN "completedOccurrences" TIMESTAMP(3)[] NOT NULL DEFAULT ARRAY[]::TIMESTAMP(3)[];

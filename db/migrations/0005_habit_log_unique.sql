-- Remove any duplicate habit logs that may have slipped in before this constraint.
-- Keep only the earliest log per (habit_id, date) pair.
DELETE FROM habit_logs
WHERE id NOT IN (
  SELECT MIN(id) FROM habit_logs GROUP BY habit_id, date
);

-- Enforce one completion record per habit per calendar day going forward.
CREATE UNIQUE INDEX IF NOT EXISTS habit_logs_habit_date_uix
  ON habit_logs(habit_id, date);

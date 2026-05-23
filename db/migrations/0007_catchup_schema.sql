-- ── Catch-up migration ────────────────────────────────────────────────────────
-- Migrations 0002-0006 used timestamps from 2025, but 0000/0001 used 2026
-- timestamps. The Drizzle migrator skips any migration whose `when` is less
-- than the last applied migration's `created_at`, so 0002-0006 were silently
-- skipped on existing databases. This migration re-applies everything they
-- should have done, using IF NOT EXISTS guards so it is safe on databases that
-- already have the columns/tables.

-- (from 0002) completion_note on plan_sessions
ALTER TABLE `plan_sessions` ADD COLUMN IF NOT EXISTS `completion_note` text;
--> statement-breakpoint

-- (from 0003) weekly goals on user_profile
ALTER TABLE `user_profile` ADD COLUMN IF NOT EXISTS `weekly_goal_km` real;
--> statement-breakpoint
ALTER TABLE `user_profile` ADD COLUMN IF NOT EXISTS `weekly_goal_sessions` integer;
--> statement-breakpoint

-- (from 0004) Performance OS tables
CREATE TABLE IF NOT EXISTS `habits` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `emoji` text NOT NULL DEFAULT '⚡',
  `color` text NOT NULL DEFAULT 'blue',
  `created_at` integer NOT NULL,
  `archived_at` integer
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `habit_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `habit_id` integer NOT NULL REFERENCES `habits`(`id`) ON DELETE CASCADE,
  `date` text NOT NULL,
  `completed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `daily_checkins` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `date` text NOT NULL UNIQUE,
  `morning_energy` integer,
  `morning_clarity` integer,
  `morning_intention` text,
  `evening_rating` integer,
  `evening_wins` text,
  `evening_note` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `body_metrics` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `date` text NOT NULL,
  `weight_kg` real,
  `body_fat_pct` real,
  `note` text,
  `created_at` integer NOT NULL
);
--> statement-breakpoint

-- (from 0005) Unique index on habit_logs to prevent duplicate completions
DELETE FROM `habit_logs`
WHERE `id` NOT IN (
  SELECT MIN(`id`) FROM `habit_logs` GROUP BY `habit_id`, `date`
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `habit_logs_habit_date_uix`
  ON `habit_logs`(`habit_id`, `date`);

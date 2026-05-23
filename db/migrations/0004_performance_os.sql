CREATE TABLE `habits` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `name` text NOT NULL,
  `emoji` text NOT NULL DEFAULT '⚡',
  `color` text NOT NULL DEFAULT 'blue',
  `created_at` integer NOT NULL,
  `archived_at` integer
);

CREATE TABLE `habit_logs` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `habit_id` integer NOT NULL REFERENCES `habits`(`id`) ON DELETE CASCADE,
  `date` text NOT NULL,
  `completed_at` integer NOT NULL
);

CREATE TABLE `daily_checkins` (
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

CREATE TABLE `body_metrics` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `date` text NOT NULL,
  `weight_kg` real,
  `body_fat_pct` real,
  `note` text,
  `created_at` integer NOT NULL
);

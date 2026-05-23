-- Idempotent: adds completion_note if migration 0002 was skipped or never applied
ALTER TABLE `plan_sessions` ADD COLUMN IF NOT EXISTS `completion_note` text;

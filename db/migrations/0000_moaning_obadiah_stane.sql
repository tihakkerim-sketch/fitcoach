CREATE TABLE `activities` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`date` text NOT NULL,
	`created_at` integer NOT NULL,
	`source` text NOT NULL,
	`garmin_file_name` text,
	`avg_hr` integer,
	`max_hr` integer,
	`duration_min` real,
	`start_time` text,
	`distance_km` real,
	`hr_zone_distribution` text,
	`perceived_effort` integer,
	`surface_type` text,
	`notes` text,
	`avg_cadence` integer,
	`bedtime` text,
	`wake_time` text,
	`sleep_quality` integer,
	`exercises` text,
	`type_label` text,
	`raw_garmin_data` text
);
--> statement-breakpoint
CREATE TABLE `coach_conversations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `coach_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`conversation_id` integer NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`conversation_id`) REFERENCES `coach_conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `hr_zones` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`zone_number` integer NOT NULL,
	`min_hr` integer NOT NULL,
	`max_hr` integer NOT NULL,
	`label` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `plan_phases` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`plan_id` integer NOT NULL,
	`name` text NOT NULL,
	`order_index` integer NOT NULL,
	`duration_weeks` integer NOT NULL,
	FOREIGN KEY (`plan_id`) REFERENCES `training_plans`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `plan_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_id` integer NOT NULL,
	`day_of_week` integer NOT NULL,
	`type` text NOT NULL,
	`target_duration_min` integer,
	`target_hr_zone` integer,
	`intensity_label` text,
	`coaching_note` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`linked_activity_id` integer,
	`completed_at` integer,
	FOREIGN KEY (`week_id`) REFERENCES `plan_weeks`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`linked_activity_id`) REFERENCES `activities`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `plan_weeks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`phase_id` integer NOT NULL,
	`week_number` integer NOT NULL,
	`notes` text,
	FOREIGN KEY (`phase_id`) REFERENCES `plan_phases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `training_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`goal_event` text,
	`goal_date` text,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user_profile` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`age` integer,
	`max_hr` integer,
	`resting_hr` integer,
	`goal_event` text,
	`goal_finish_time` text,
	`training_days_per_week` integer,
	`fixed_rest_days` text,
	`injury_notes` text,
	`theme` text DEFAULT 'dark' NOT NULL,
	`ollama_model` text DEFAULT 'llama3.1:8b' NOT NULL,
	`ollama_url` text DEFAULT 'http://localhost:11434' NOT NULL
);

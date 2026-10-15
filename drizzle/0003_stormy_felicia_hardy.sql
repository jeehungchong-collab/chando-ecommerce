CREATE TABLE `lazada_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_key` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL,
	`r2_key` text
);
--> statement-breakpoint
CREATE TABLE `lazada_sessions` (
	`session_key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`fingerprint` text NOT NULL,
	`revision` integer NOT NULL
);

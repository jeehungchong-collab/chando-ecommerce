CREATE TABLE `admin_users` (
	`email` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`start_date` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaigns_slug_idx` ON `campaigns` (`slug`);--> statement-breakpoint
CREATE TABLE `listing_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`item_id` text NOT NULL,
	`listing_title` text NOT NULL,
	`sales` real NOT NULL,
	`orders` integer NOT NULL,
	`units` integer NOT NULL,
	`reminder_clicks` integer NOT NULL,
	`impressions` integer NOT NULL,
	`clicks` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `listing_metrics_upload_idx` ON `listing_metrics` (`upload_id`);--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`session_key` text NOT NULL,
	`session_start` text NOT NULL,
	`session_end` text NOT NULL,
	`source_file` text NOT NULL,
	`r2_key` text,
	`revision` integer NOT NULL,
	`active` integer NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_session_revision_idx` ON `uploads` (`campaign_id`,`session_key`,`revision`);--> statement-breakpoint
CREATE INDEX `uploads_active_idx` ON `uploads` (`campaign_id`,`active`);--> statement-breakpoint
CREATE TABLE `variation_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`upload_id` text NOT NULL,
	`item_id` text NOT NULL,
	`listing_title` text NOT NULL,
	`variation_id` text NOT NULL,
	`variation_title` text NOT NULL,
	`sku` text NOT NULL,
	`sales` real NOT NULL,
	`orders` integer NOT NULL,
	`units` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `variation_metrics_upload_idx` ON `variation_metrics` (`upload_id`);
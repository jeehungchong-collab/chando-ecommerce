CREATE TABLE `restart_campaigns` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`source_campaign_id` text NOT NULL,
	`source_cycle` integer NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `restart_campaigns_source_idx` ON `restart_campaigns` (`source_campaign_id`);--> statement-breakpoint
CREATE TABLE `restart_items` (
	`campaign_id` text NOT NULL,
	`item_id` text NOT NULL,
	`listing_title` text NOT NULL,
	`baseline_upload_id` text NOT NULL,
	`baseline_session_start` text NOT NULL,
	`baseline_session_end` text NOT NULL,
	`baseline_sales` real NOT NULL,
	`baseline_orders` integer NOT NULL,
	`baseline_units` integer NOT NULL,
	`baseline_reminder_clicks` integer NOT NULL,
	`baseline_impressions` integer NOT NULL,
	`baseline_clicks` integer NOT NULL,
	PRIMARY KEY(`campaign_id`, `item_id`)
);
--> statement-breakpoint
CREATE INDEX `restart_items_baseline_upload_idx` ON `restart_items` (`baseline_upload_id`);
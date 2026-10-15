CREATE TABLE `listing_completion_overrides` (
	`item_id` text PRIMARY KEY NOT NULL,
	`listing_title` text NOT NULL,
	`completed` integer NOT NULL,
	`completed_by` text,
	`completed_at` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `listing_completion_overrides_completed_idx` ON `listing_completion_overrides` (`completed`);
CREATE TABLE `report_uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`uploaded_by_email` text NOT NULL,
	`file_names_json` text NOT NULL,
	`file_count` integer NOT NULL,
	`row_count` integer NOT NULL,
	`date_range` text NOT NULL,
	`total_gmv` real NOT NULL,
	`total_orders` integer NOT NULL,
	`total_views` integer NOT NULL,
	`unclear_rows` integer NOT NULL,
	`report_json` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_report_uploads_created_at` ON `report_uploads` (`created_at`);--> statement-breakpoint
CREATE TABLE `uploaded_files` (
	`id` text PRIMARY KEY NOT NULL,
	`report_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`r2_key` text NOT NULL,
	FOREIGN KEY (`report_id`) REFERENCES `report_uploads`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_uploaded_files_report_id` ON `uploaded_files` (`report_id`);
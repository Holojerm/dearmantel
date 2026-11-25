CREATE TABLE `mantel_handovers` (
	`mantel_id` text PRIMARY KEY NOT NULL,
	`email` text,
	`named_by` text,
	`invited_at` integer,
	`keepers_told_at` integer,
	`child_id` text,
	`accepted_at` integer,
	`wrapped` text,
	`key_version` integer,
	`given_by` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mantel_handovers_email_idx` ON `mantel_handovers` (`email`);--> statement-breakpoint
CREATE TABLE `handover_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`mantel_id` text NOT NULL,
	`letter_id` text NOT NULL,
	`wrapped_key` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `handover_keys_letter_idx` ON `handover_keys` (`mantel_id`,`letter_id`);--> statement-breakpoint
ALTER TABLE `mantel_proposals` ADD `handover_on` text;--> statement-breakpoint
ALTER TABLE `mantels` ADD `handover_on` text;--> statement-breakpoint
ALTER TABLE `mantels` ADD `handed_over_at` integer;--> statement-breakpoint
ALTER TABLE `mantels` ADD `handed_over_to` text;
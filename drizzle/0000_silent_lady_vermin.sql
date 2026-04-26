CREATE TABLE `accounts` (
	`user_id` varchar(255) NOT NULL,
	`type` varchar(64) NOT NULL,
	`provider` varchar(64) NOT NULL,
	`provider_account_id` varchar(255) NOT NULL,
	`refresh_token` text,
	`access_token` text,
	`expires_at` int,
	`token_type` varchar(64),
	`scope` varchar(255),
	`id_token` text,
	`session_state` varchar(255),
	CONSTRAINT `accounts_provider_provider_account_id_pk` PRIMARY KEY(`provider`,`provider_account_id`)
);
--> statement-breakpoint
CREATE TABLE `answers` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`section_id` bigint unsigned NOT NULL,
	`question_key` varchar(64) NOT NULL,
	`raw_text` text,
	`draft_text` text,
	`adequacy_score` tinyint,
	`judge_feedback` json,
	`llm_suggestions` json,
	`revision_count` int NOT NULL DEFAULT 0,
	`is_soft_warned` boolean NOT NULL DEFAULT false,
	`last_judged_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `answers_section_key_unique` UNIQUE(`section_id`,`question_key`)
);
--> statement-breakpoint
CREATE TABLE `document_exports` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`document_instance_id` bigint unsigned NOT NULL,
	`format` enum('md','pdf','docx') NOT NULL,
	`file_path` varchar(512) NOT NULL,
	`generated_by` varchar(255) NOT NULL,
	`generated_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `document_exports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_instances` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`project_id` bigint unsigned NOT NULL,
	`doc_type` varchar(32) NOT NULL,
	`name` varchar(255) NOT NULL,
	`question_bank_version` varchar(16) NOT NULL,
	`status` enum('draft','in_progress','complete','archived') NOT NULL DEFAULT 'draft',
	`current_section_key` varchar(64),
	`parent_snapshot_id` bigint unsigned,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_at` timestamp(3),
	CONSTRAINT `document_instances_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `document_snapshots` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`document_instance_id` bigint unsigned NOT NULL,
	`name` varchar(255) NOT NULL,
	`parent_snapshot_id` bigint unsigned,
	`branch_name` varchar(64),
	`state_json` json NOT NULL,
	`created_by` varchar(255) NOT NULL,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `document_snapshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `llm_call_logs` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`project_id` bigint unsigned,
	`document_instance_id` bigint unsigned,
	`user_id` varchar(255) NOT NULL,
	`call_type` enum('judge','coach','suggester','synthesizer') NOT NULL,
	`model` varchar(64) NOT NULL,
	`prompt_version` varchar(16) NOT NULL,
	`tokens_in` int NOT NULL DEFAULT 0,
	`tokens_out` int NOT NULL DEFAULT 0,
	`cost_usd` decimal(10,6) NOT NULL DEFAULT '0.000000',
	`latency_ms` int NOT NULL DEFAULT 0,
	`status` enum('ok','error','rate_limited','budget_exceeded') NOT NULL,
	`error_message` text,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	CONSTRAINT `llm_call_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`owner_id` varchar(255) NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`status` enum('active','archived','deleted') NOT NULL DEFAULT 'active',
	`cost_budget_usd` decimal(10,4) NOT NULL DEFAULT '5.0000',
	`cost_used_usd` decimal(10,4) NOT NULL DEFAULT '0.0000',
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`deleted_at` timestamp(3),
	CONSTRAINT `projects_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `question_banks` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`doc_type` varchar(32) NOT NULL,
	`version` varchar(16) NOT NULL,
	`schema_json` json NOT NULL,
	`is_active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`deprecated_at` timestamp(3),
	CONSTRAINT `question_banks_id` PRIMARY KEY(`id`),
	CONSTRAINT `qbanks_type_version_unique` UNIQUE(`doc_type`,`version`)
);
--> statement-breakpoint
CREATE TABLE `rate_limit_buckets` (
	`user_id` varchar(255) NOT NULL,
	`bucket_key` varchar(64) NOT NULL,
	`window_start` timestamp(3) NOT NULL,
	`count` int NOT NULL DEFAULT 0,
	CONSTRAINT `rate_limit_buckets_user_id_bucket_key_window_start_pk` PRIMARY KEY(`user_id`,`bucket_key`,`window_start`)
);
--> statement-breakpoint
CREATE TABLE `sections` (
	`id` bigint unsigned AUTO_INCREMENT NOT NULL,
	`document_instance_id` bigint unsigned NOT NULL,
	`section_key` varchar(64) NOT NULL,
	`order_index` int NOT NULL,
	`status` enum('pending','in_progress','complete') NOT NULL DEFAULT 'pending',
	`has_soft_warnings` boolean NOT NULL DEFAULT false,
	`completed_at` timestamp(3),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `sections_id` PRIMARY KEY(`id`),
	CONSTRAINT `sections_doc_key_unique` UNIQUE(`document_instance_id`,`section_key`)
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`session_token` varchar(255) NOT NULL,
	`user_id` varchar(255) NOT NULL,
	`expires` timestamp(3) NOT NULL,
	CONSTRAINT `sessions_session_token` PRIMARY KEY(`session_token`)
);
--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`user_id` varchar(255) NOT NULL,
	`wizard_mode` enum('section','chat') NOT NULL DEFAULT 'section',
	`theme` enum('system','light','dark') NOT NULL DEFAULT 'system',
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `user_preferences_user_id` PRIMARY KEY(`user_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` varchar(255) NOT NULL,
	`name` varchar(255),
	`email` varchar(255) NOT NULL,
	`email_verified` timestamp(3),
	`image` varchar(1024),
	`created_at` timestamp(3) NOT NULL DEFAULT (now()),
	`updated_at` timestamp(3) NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `users_id` PRIMARY KEY(`id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `verification_tokens` (
	`identifier` varchar(255) NOT NULL,
	`token` varchar(255) NOT NULL,
	`expires` timestamp(3) NOT NULL,
	CONSTRAINT `verification_tokens_identifier_token_pk` PRIMARY KEY(`identifier`,`token`)
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD CONSTRAINT `accounts_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `answers` ADD CONSTRAINT `answers_section_id_sections_id_fk` FOREIGN KEY (`section_id`) REFERENCES `sections`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_exports` ADD CONSTRAINT `document_exports_document_instance_id_document_instances_id_fk` FOREIGN KEY (`document_instance_id`) REFERENCES `document_instances`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_exports` ADD CONSTRAINT `document_exports_generated_by_users_id_fk` FOREIGN KEY (`generated_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_instances` ADD CONSTRAINT `document_instances_project_id_projects_id_fk` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_snapshots` ADD CONSTRAINT `document_snapshots_document_instance_id_document_instances_id_fk` FOREIGN KEY (`document_instance_id`) REFERENCES `document_instances`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `document_snapshots` ADD CONSTRAINT `document_snapshots_created_by_users_id_fk` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `llm_call_logs` ADD CONSTRAINT `llm_call_logs_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `projects` ADD CONSTRAINT `projects_owner_id_users_id_fk` FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `rate_limit_buckets` ADD CONSTRAINT `rate_limit_buckets_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sections` ADD CONSTRAINT `sections_document_instance_id_document_instances_id_fk` FOREIGN KEY (`document_instance_id`) REFERENCES `document_instances`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sessions` ADD CONSTRAINT `sessions_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_preferences` ADD CONSTRAINT `user_preferences_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `accounts_user_idx` ON `accounts` (`user_id`);--> statement-breakpoint
CREATE INDEX `answers_section_idx` ON `answers` (`section_id`);--> statement-breakpoint
CREATE INDEX `answers_soft_warn_idx` ON `answers` (`is_soft_warned`);--> statement-breakpoint
CREATE INDEX `exports_doc_idx` ON `document_exports` (`document_instance_id`);--> statement-breakpoint
CREATE INDEX `doc_instances_project_idx` ON `document_instances` (`project_id`);--> statement-breakpoint
CREATE INDEX `doc_instances_type_idx` ON `document_instances` (`doc_type`);--> statement-breakpoint
CREATE INDEX `doc_instances_status_idx` ON `document_instances` (`status`);--> statement-breakpoint
CREATE INDEX `snapshots_doc_idx` ON `document_snapshots` (`document_instance_id`);--> statement-breakpoint
CREATE INDEX `snapshots_branch_idx` ON `document_snapshots` (`branch_name`);--> statement-breakpoint
CREATE INDEX `llm_logs_project_idx` ON `llm_call_logs` (`project_id`);--> statement-breakpoint
CREATE INDEX `llm_logs_user_idx` ON `llm_call_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `llm_logs_time_idx` ON `llm_call_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `llm_logs_status_idx` ON `llm_call_logs` (`status`);--> statement-breakpoint
CREATE INDEX `projects_owner_idx` ON `projects` (`owner_id`);--> statement-breakpoint
CREATE INDEX `projects_status_idx` ON `projects` (`status`);--> statement-breakpoint
CREATE INDEX `qbanks_active_idx` ON `question_banks` (`doc_type`,`is_active`);--> statement-breakpoint
CREATE INDEX `rate_limit_time_idx` ON `rate_limit_buckets` (`window_start`);--> statement-breakpoint
CREATE INDEX `sections_doc_idx` ON `sections` (`document_instance_id`);
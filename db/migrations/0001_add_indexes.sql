CREATE INDEX IF NOT EXISTS `idx_categories_project_id` ON `categories` (`project_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_payment_methods_project_id` ON `payment_methods` (`project_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_members_project_id` ON `members` (`project_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_expenses_project_id` ON `expenses` (`project_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_expenses_category_id` ON `expenses` (`category_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_expenses_payment_method_id` ON `expenses` (`payment_method_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_payments_expense_id` ON `payments` (`expense_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_payments_member_id` ON `payments` (`member_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_splits_expense_id` ON `splits` (`expense_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_splits_member_id` ON `splits` (`member_id`);

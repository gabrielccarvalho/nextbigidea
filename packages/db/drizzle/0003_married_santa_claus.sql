ALTER TABLE "purchases" ADD COLUMN "provider_subscription_id" text;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "period_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "period_end" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "purchases_provider_subscription_idx" ON "purchases" USING btree ("provider_subscription_id");
ALTER TABLE "purchases" ALTER COLUMN "currency" SET DEFAULT 'USD';--> statement-breakpoint
ALTER TABLE "purchases" ADD COLUMN "provider_payment_intent_id" text;--> statement-breakpoint
CREATE INDEX "purchases_provider_payment_intent_idx" ON "purchases" USING btree ("provider_payment_intent_id");
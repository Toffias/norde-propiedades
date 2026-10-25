ALTER TABLE "core"."notifications" ALTER COLUMN "title" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."notifications" ADD COLUMN "client_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "core"."notifications" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "notifications_client_ids_idx" ON "core"."notifications" USING gin ("client_ids");
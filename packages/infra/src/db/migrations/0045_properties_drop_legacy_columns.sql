DROP INDEX "core"."properties_listing_idx";--> statement-breakpoint
DROP INDEX "core"."properties_price_idx";--> statement-breakpoint
ALTER TABLE "core"."properties" DROP COLUMN "operation";--> statement-breakpoint
ALTER TABLE "core"."properties" DROP COLUMN "price_cents";--> statement-breakpoint
ALTER TABLE "core"."properties" DROP COLUMN "currency";--> statement-breakpoint
ALTER TABLE "core"."properties" DROP COLUMN "amenities";--> statement-breakpoint
ALTER TABLE "core"."properties" DROP COLUMN "image_urls";
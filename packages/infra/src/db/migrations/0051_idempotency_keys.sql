CREATE TABLE "core"."idempotency_keys" (
	"actor_id" text NOT NULL,
	"command" text NOT NULL,
	"key" uuid NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_scope_uq" ON "core"."idempotency_keys" USING btree ("actor_id","command","key");
CREATE TABLE "core"."development_agent_chances" (
	"development_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "development_agent_chances_development_id_user_id_pk" PRIMARY KEY("development_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "core"."developments" ADD COLUMN "inquiry_route_cursor" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "core"."development_agent_chances" ADD CONSTRAINT "development_agent_chances_development_id_developments_id_fk" FOREIGN KEY ("development_id") REFERENCES "core"."developments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "development_agent_chances_user_idx" ON "core"."development_agent_chances" USING btree ("user_id");
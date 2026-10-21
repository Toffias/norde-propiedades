CREATE INDEX "opportunity_bulk_operations_active_requester_idx" ON "core"."opportunity_bulk_operations" USING btree ("requested_by") WHERE status in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "opportunity_bulk_operations_requester_updated_idx" ON "core"."opportunity_bulk_operations" USING btree ("requested_by","updated_at");--> statement-breakpoint
CREATE INDEX "opportunity_bulk_operations_updated_idx" ON "core"."opportunity_bulk_operations" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "import_jobs_active_creator_idx" ON "core"."import_jobs" USING btree ("created_by") WHERE status in ('pending', 'running');--> statement-breakpoint
CREATE INDEX "import_jobs_creator_updated_idx" ON "core"."import_jobs" USING btree ("created_by","updated_at");--> statement-breakpoint
CREATE INDEX "import_jobs_updated_idx" ON "core"."import_jobs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "portal_listings_pending_idx" ON "core"."portal_listings" USING btree ("updated_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "portal_listings_updated_idx" ON "core"."portal_listings" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "media_items_pending_uploader_idx" ON "core"."media_items" USING btree ("uploaded_by") WHERE processing_status = 'pending';--> statement-breakpoint
CREATE INDEX "media_items_uploader_created_idx" ON "core"."media_items" USING btree ("uploaded_by","created_at");--> statement-breakpoint
CREATE INDEX "media_items_created_idx" ON "core"."media_items" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "property_documents_pending_requester_idx" ON "core"."property_documents" USING btree ("requested_by") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "property_documents_requester_updated_idx" ON "core"."property_documents" USING btree ("requested_by","updated_at");--> statement-breakpoint
CREATE INDEX "property_documents_updated_idx" ON "core"."property_documents" USING btree ("updated_at");--> statement-breakpoint
-- Procesos en segundo plano (ADR 0040): ver los de todos, los del sistema y los de los portales.
-- Lo tiene el administrador. Idempotente.
INSERT INTO "core"."role_permissions" ("role_id", "permission", "created_at", "created_by")
SELECT r."id", 'background-tasks:*', now(), 'system:import'
FROM "core"."roles" r
WHERE r."key" = 'admin'
ON CONFLICT ("role_id", "permission") DO NOTHING;

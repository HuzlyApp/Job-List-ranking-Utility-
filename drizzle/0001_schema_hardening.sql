ALTER TABLE "msp_programs" ADD COLUMN "created_by" uuid;--> statement-breakpoint
ALTER TABLE "requisition_analysis_results" ADD COLUMN "batch_id" uuid;--> statement-breakpoint
ALTER TABLE "requisition_source_files" ADD COLUMN "detected_encoding" varchar(50);--> statement-breakpoint
ALTER TABLE "scoring_weights" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "msp_programs" ADD CONSTRAINT "msp_programs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requisition_analysis_results" ADD CONSTRAINT "requisition_analysis_results_batch_id_requisition_analysis_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."requisition_analysis_batches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "batches_program_status_idx" ON "requisition_analysis_batches" USING btree ("tenant_id","msp_program_id","status");--> statement-breakpoint
CREATE INDEX "results_batch_idx" ON "requisition_analysis_results" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "results_tenant_opportunity_idx" ON "requisition_analysis_results" USING btree ("tenant_id","opportunity_score");--> statement-breakpoint
CREATE INDEX "requisitions_first_seen_idx" ON "requisitions" USING btree ("first_seen_at");--> statement-breakpoint
CREATE INDEX "requisitions_last_analyzed_idx" ON "requisitions" USING btree ("last_analyzed_at");--> statement-breakpoint
CREATE INDEX "requisitions_released_idx" ON "requisitions" USING btree ("released_date");--> statement-breakpoint
CREATE INDEX "requisitions_status_idx" ON "requisitions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "requisitions_tenant_program_status_idx" ON "requisitions" USING btree ("tenant_id","msp_program_id","status");--> statement-breakpoint
CREATE INDEX "requisitions_recruiter_status_idx" ON "requisitions" USING btree ("tenant_id","recruiter_owner_id","recruiting_status");
ALTER TABLE "devices" ADD COLUMN "is_authorized" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "auth_requested_at" timestamp;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "authorized_at" timestamp;--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "authorized_by_id" uuid;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_authorized_by_id_users_id_fk" FOREIGN KEY ("authorized_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;

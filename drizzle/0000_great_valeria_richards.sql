CREATE TABLE "camera_evidences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"file_path" varchar(500) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size" integer NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"ocr_status" varchar(50) DEFAULT 'pending' NOT NULL,
	"ocr_raw_text" text,
	"flood_detected" boolean DEFAULT false NOT NULL,
	"flood_confidence" double precision,
	"water_level_cm" double precision,
	"flood_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_heartbeats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"battery_level" integer,
	"is_charging" boolean DEFAULT false,
	"battery_temp" double precision,
	"cpu_temp" double precision,
	"wifi_ssid" varchar(100),
	"signal_strength" integer,
	"storage_free_mb" integer,
	"memory_free_mb" integer,
	"is_online" boolean DEFAULT true NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device_telemetries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid NOT NULL,
	"accel_x" double precision,
	"accel_y" double precision,
	"accel_z" double precision,
	"accel_magnitude" double precision,
	"is_seismic_alert" boolean DEFAULT false NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"altitude" double precision,
	"accuracy" double precision,
	"speed" double precision,
	"raw_data" jsonb,
	"captured_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(150) NOT NULL,
	"device_identifier" varchar(100) NOT NULL,
	"api_key" varchar(255) NOT NULL,
	"model" varchar(100),
	"os_version" varchar(50),
	"app_version" varchar(50),
	"status" varchar(30) DEFAULT 'offline' NOT NULL,
	"last_heartbeat_at" timestamp,
	"last_latitude" double precision,
	"last_longitude" double precision,
	"last_altitude" double precision,
	"last_battery_level" integer,
	"is_charging" boolean DEFAULT false,
	"last_battery_temp" double precision,
	"last_cpu_temp" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "devices_device_identifier_unique" UNIQUE("device_identifier"),
	CONSTRAINT "devices_api_key_unique" UNIQUE("api_key")
);
--> statement-breakpoint
CREATE TABLE "incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_id" uuid,
	"evidence_id" uuid,
	"incident_type" varchar(50) NOT NULL,
	"severity" varchar(20) NOT NULL,
	"status" varchar(30) DEFAULT 'activa' NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"latitude" double precision,
	"longitude" double precision,
	"address" varchar(255),
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by_id" uuid,
	"sensor_snapshot" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"name" varchar(150) NOT NULL,
	"role" varchar(50) DEFAULT 'admin' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "camera_evidences" ADD CONSTRAINT "camera_evidences_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_heartbeats" ADD CONSTRAINT "device_heartbeats_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_telemetries" ADD CONSTRAINT "device_telemetries_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_evidence_id_camera_evidences_id_fk" FOREIGN KEY ("evidence_id") REFERENCES "public"."camera_evidences"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_resolved_by_id_users_id_fk" FOREIGN KEY ("resolved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
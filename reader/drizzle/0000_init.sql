CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TABLE "auth"."account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collection_items" (
	"collection_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"position" text NOT NULL,
	"note" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_items_collection_id_work_id_pk" PRIMARY KEY("collection_id","work_id")
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_sub" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"emoji" text,
	"position" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collections_user_name" UNIQUE("user_sub","name")
);
--> statement-breakpoint
CREATE TABLE "favorites" (
	"user_sub" text NOT NULL,
	"work_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "favorites_user_sub_work_id_pk" PRIMARY KEY("user_sub","work_id")
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"user_sub" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reading_progress" (
	"user_sub" text NOT NULL,
	"edition_id" uuid NOT NULL,
	"work_id" uuid NOT NULL,
	"revision" integer NOT NULL,
	"seq" integer NOT NULL,
	"offset" integer DEFAULT 0 NOT NULL,
	"quote" jsonb NOT NULL,
	"progress" real NOT NULL,
	"section_path" text[],
	"started_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "reading_progress_user_sub_edition_id_pk" PRIMARY KEY("user_sub","edition_id")
);
--> statement-breakpoint
CREATE TABLE "auth"."session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sync_cursors" (
	"name" text PRIMARY KEY NOT NULL,
	"cursor" text NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth"."user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"sub" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_sub_unique" UNIQUE("sub")
);
--> statement-breakpoint
CREATE TABLE "auth"."verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_cache" (
	"work_id" uuid PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth"."account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_items" ADD CONSTRAINT "collection_items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "public"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth"."session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "auth"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_id" ON "auth"."account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reading_progress_recent" ON "reading_progress" USING btree ("user_sub","updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "reading_progress_edition" ON "reading_progress" USING btree ("edition_id");--> statement-breakpoint
CREATE INDEX "session_user_id" ON "auth"."session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier" ON "auth"."verification" USING btree ("identifier");
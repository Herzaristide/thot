-- Progression par œuvre : une seule ligne par (lecteur, œuvre), quelle que soit la traduction.
-- On garde la position la plus récente et la date de début la plus ancienne.
UPDATE "reading_progress" AS rp
SET "started_at" = m."started_at"
FROM (
	SELECT "user_sub", "work_id", min("started_at") AS "started_at"
	FROM "reading_progress" GROUP BY "user_sub", "work_id"
) AS m
WHERE rp."user_sub" = m."user_sub" AND rp."work_id" = m."work_id";--> statement-breakpoint
DELETE FROM "reading_progress" AS rp
USING "reading_progress" AS newer
WHERE newer."user_sub" = rp."user_sub" AND newer."work_id" = rp."work_id"
	AND (newer."updated_at", newer."edition_id") > (rp."updated_at", rp."edition_id");--> statement-breakpoint
ALTER TABLE "reading_progress" DROP CONSTRAINT "reading_progress_user_sub_edition_id_pk";--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_sub_work_id_pk" PRIMARY KEY("user_sub","work_id");

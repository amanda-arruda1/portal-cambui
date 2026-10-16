import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "pastas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"pasta_pai_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "media" ADD COLUMN "pasta_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "pastas_id" integer;
  ALTER TABLE "pastas" ADD CONSTRAINT "pastas_pasta_pai_id_pastas_id_fk" FOREIGN KEY ("pasta_pai_id") REFERENCES "public"."pastas"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "pastas_pasta_pai_idx" ON "pastas" USING btree ("pasta_pai_id");
  CREATE INDEX "pastas_updated_at_idx" ON "pastas" USING btree ("updated_at");
  CREATE INDEX "pastas_created_at_idx" ON "pastas" USING btree ("created_at");
  ALTER TABLE "media" ADD CONSTRAINT "media_pasta_id_pastas_id_fk" FOREIGN KEY ("pasta_id") REFERENCES "public"."pastas"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_pastas_fk" FOREIGN KEY ("pastas_id") REFERENCES "public"."pastas"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "media_pasta_idx" ON "media" USING btree ("pasta_id");
  CREATE INDEX "payload_locked_documents_rels_pastas_id_idx" ON "payload_locked_documents_rels" USING btree ("pastas_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "pastas" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "pastas" CASCADE;
  ALTER TABLE "media" DROP CONSTRAINT "media_pasta_id_pastas_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_pastas_fk";
  
  DROP INDEX "media_pasta_idx";
  DROP INDEX "payload_locked_documents_rels_pastas_id_idx";
  ALTER TABLE "media" DROP COLUMN "pasta_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "pastas_id";`)
}

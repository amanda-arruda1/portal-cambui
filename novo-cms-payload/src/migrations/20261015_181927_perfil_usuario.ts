import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "fotos_perfil" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_avatar_url" varchar,
  	"sizes_avatar_width" numeric,
  	"sizes_avatar_height" numeric,
  	"sizes_avatar_mime_type" varchar,
  	"sizes_avatar_filesize" numeric,
  	"sizes_avatar_filename" varchar
  );
  
  ALTER TABLE "users" ADD COLUMN "nome_exibicao" varchar;
  ALTER TABLE "users" ADD COLUMN "matricula" varchar;
  ALTER TABLE "users" ADD COLUMN "foto_perfil_id" integer;
  ALTER TABLE "users" ADD COLUMN "data_aceite_termos" timestamp(3) with time zone;
  ALTER TABLE "users" ADD COLUMN "ultimo_login_ip" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "fotos_perfil_id" integer;
  CREATE INDEX "fotos_perfil_updated_at_idx" ON "fotos_perfil" USING btree ("updated_at");
  CREATE INDEX "fotos_perfil_created_at_idx" ON "fotos_perfil" USING btree ("created_at");
  CREATE UNIQUE INDEX "fotos_perfil_filename_idx" ON "fotos_perfil" USING btree ("filename");
  CREATE INDEX "fotos_perfil_sizes_avatar_sizes_avatar_filename_idx" ON "fotos_perfil" USING btree ("sizes_avatar_filename");
  ALTER TABLE "users" ADD CONSTRAINT "users_foto_perfil_id_fotos_perfil_id_fk" FOREIGN KEY ("foto_perfil_id") REFERENCES "public"."fotos_perfil"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_fotos_perfil_fk" FOREIGN KEY ("fotos_perfil_id") REFERENCES "public"."fotos_perfil"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_foto_perfil_idx" ON "users" USING btree ("foto_perfil_id");
  CREATE INDEX "payload_locked_documents_rels_fotos_perfil_id_idx" ON "payload_locked_documents_rels" USING btree ("fotos_perfil_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "fotos_perfil" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "fotos_perfil" CASCADE;
  ALTER TABLE "users" DROP CONSTRAINT "users_foto_perfil_id_fotos_perfil_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_fotos_perfil_fk";
  
  DROP INDEX "users_foto_perfil_idx";
  DROP INDEX "payload_locked_documents_rels_fotos_perfil_id_idx";
  ALTER TABLE "users" DROP COLUMN "nome_exibicao";
  ALTER TABLE "users" DROP COLUMN "matricula";
  ALTER TABLE "users" DROP COLUMN "foto_perfil_id";
  ALTER TABLE "users" DROP COLUMN "data_aceite_termos";
  ALTER TABLE "users" DROP COLUMN "ultimo_login_ip";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "fotos_perfil_id";`)
}

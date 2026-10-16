import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_servicos_necessidade" AS ENUM('casa', 'saude', 'educacao', 'trabalho', 'documentos', 'transparencia');
  ALTER TABLE "links_uteis" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "links_uteis" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_links_uteis_fk";
  
  ALTER TABLE "users_modulos_permitidos" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_users_modulos_permitidos";
  CREATE TYPE "public"."enum_users_modulos_permitidos" AS ENUM('secretarias', 'noticias', 'servicos', 'documentos', 'paginas', 'selos', 'perguntas-frequentes', 'patrimonio-cultural', 'telefones-uteis', 'coleta-lixo', 'conselhos-municipais', 'licitacoes', 'obras');
  ALTER TABLE "users_modulos_permitidos" ALTER COLUMN "value" SET DATA TYPE "public"."enum_users_modulos_permitidos" USING "value"::"public"."enum_users_modulos_permitidos";
  DROP INDEX "payload_locked_documents_rels_links_uteis_id_idx";
  ALTER TABLE "servicos" ADD COLUMN "necessidade" "enum_servicos_necessidade";
  ALTER TABLE "servicos" ADD COLUMN "detalhe" varchar;
  ALTER TABLE "servicos" ADD COLUMN "destino" varchar;
  ALTER TABLE "servicos" ADD COLUMN "ordem" numeric;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "links_uteis_id";
  DROP TYPE "public"."enum_links_uteis_status";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_links_uteis_status" AS ENUM('rascunho', 'em_revisao', 'publicado', 'arquivado');
  ALTER TYPE "public"."enum_users_modulos_permitidos" ADD VALUE 'links-uteis' BEFORE 'selos';
  CREATE TABLE "links_uteis" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"descricao" varchar,
  	"grupo" varchar,
  	"ordem" numeric,
  	"status" "enum_links_uteis_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "links_uteis_id" integer;
  CREATE INDEX "links_uteis_status_idx" ON "links_uteis" USING btree ("status");
  CREATE UNIQUE INDEX "links_uteis_id_legado_idx" ON "links_uteis" USING btree ("id_legado");
  CREATE INDEX "links_uteis_updated_at_idx" ON "links_uteis" USING btree ("updated_at");
  CREATE INDEX "links_uteis_created_at_idx" ON "links_uteis" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_links_uteis_fk" FOREIGN KEY ("links_uteis_id") REFERENCES "public"."links_uteis"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_links_uteis_id_idx" ON "payload_locked_documents_rels" USING btree ("links_uteis_id");
  ALTER TABLE "servicos" DROP COLUMN "necessidade";
  ALTER TABLE "servicos" DROP COLUMN "detalhe";
  ALTER TABLE "servicos" DROP COLUMN "destino";
  ALTER TABLE "servicos" DROP COLUMN "ordem";
  DROP TYPE "public"."enum_servicos_necessidade";`)
}

import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_modulos_permitidos" AS ENUM('secretarias', 'noticias', 'servicos', 'documentos', 'paginas', 'links-uteis', 'selos', 'perguntas-frequentes', 'patrimonio-cultural', 'telefones-uteis', 'coleta-lixo', 'conselhos-municipais', 'licitacoes', 'obras');
  CREATE TYPE "public"."enum_contas_servico_tipo" AS ENUM('avisos_portal', 'avisos_entrega');
  ALTER TYPE "public"."enum_secretarias_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_noticias_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_servicos_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_documentos_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_paginas_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_links_uteis_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_selos_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_perguntas_frequentes_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_patrimonio_cultural_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_telefones_uteis_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_coleta_lixo_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_conselhos_municipais_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_licitacoes_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_licitacao_anexos_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_licitacao_lotes_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_licitacao_eventos_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_obras_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_obra_anexos_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  ALTER TYPE "public"."enum_obra_medicoes_status" ADD VALUE 'em_revisao' BEFORE 'publicado';
  CREATE TABLE "users_modulos_permitidos" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_users_modulos_permitidos",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "contas_servico" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"tipo" "enum_contas_servico_tipo" NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"enable_a_p_i_key" boolean,
  	"api_key" varchar,
  	"api_key_index" varchar
  );
  
  ALTER TABLE "users" ALTER COLUMN "papel" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "papel" SET DEFAULT 'autor'::text;
  -- Contas de serviço saem de "users" (passam a coleção "contas-servico"; as chaves são recriadas por scripts/criar-usuarios-servico-avisos.ts).
  DELETE FROM "users" WHERE "papel" LIKE 'servico_%';
  -- Papéis antigos → novos: administrador → admin; qualquer outro (editor, setor/leitor) → autor, SEM módulos (o admin libera).
  UPDATE "users" SET "papel" = CASE "papel" WHEN 'administrador' THEN 'admin' ELSE 'autor' END WHERE "papel" NOT IN ('admin', 'revisor', 'autor');
  DROP TYPE "public"."enum_users_papel";
  CREATE TYPE "public"."enum_users_papel" AS ENUM('admin', 'revisor', 'autor');
  ALTER TABLE "users" ALTER COLUMN "papel" SET DEFAULT 'autor'::"public"."enum_users_papel";
  ALTER TABLE "users" ALTER COLUMN "papel" SET DATA TYPE "public"."enum_users_papel" USING "papel"::"public"."enum_users_papel";
  ALTER TABLE "licitacao_anexos" ALTER COLUMN "status" SET DEFAULT 'publicado';
  ALTER TABLE "licitacao_lotes" ALTER COLUMN "status" SET DEFAULT 'publicado';
  ALTER TABLE "licitacao_eventos" ALTER COLUMN "status" SET DEFAULT 'publicado';
  ALTER TABLE "obra_anexos" ALTER COLUMN "status" SET DEFAULT 'publicado';
  ALTER TABLE "obra_medicoes" ALTER COLUMN "status" SET DEFAULT 'publicado';
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "contas_servico_id" integer;
  ALTER TABLE "payload_preferences_rels" ADD COLUMN "contas_servico_id" integer;
  ALTER TABLE "users_modulos_permitidos" ADD CONSTRAINT "users_modulos_permitidos_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "users_modulos_permitidos_order_idx" ON "users_modulos_permitidos" USING btree ("order");
  CREATE INDEX "users_modulos_permitidos_parent_idx" ON "users_modulos_permitidos" USING btree ("parent_id");
  CREATE UNIQUE INDEX "contas_servico_tipo_idx" ON "contas_servico" USING btree ("tipo");
  CREATE INDEX "contas_servico_updated_at_idx" ON "contas_servico" USING btree ("updated_at");
  CREATE INDEX "contas_servico_created_at_idx" ON "contas_servico" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_contas_servico_fk" FOREIGN KEY ("contas_servico_id") REFERENCES "public"."contas_servico"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_contas_servico_fk" FOREIGN KEY ("contas_servico_id") REFERENCES "public"."contas_servico"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_contas_servico_id_idx" ON "payload_locked_documents_rels" USING btree ("contas_servico_id");
  CREATE INDEX "payload_preferences_rels_contas_servico_id_idx" ON "payload_preferences_rels" USING btree ("contas_servico_id");
  ALTER TABLE "users" DROP COLUMN "enable_a_p_i_key";
  ALTER TABLE "users" DROP COLUMN "api_key";
  ALTER TABLE "users" DROP COLUMN "api_key_index";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "users_modulos_permitidos" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "contas_servico" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "users_modulos_permitidos" CASCADE;
  DROP TABLE "contas_servico" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_contas_servico_fk";
  
  ALTER TABLE "payload_preferences_rels" DROP CONSTRAINT "payload_preferences_rels_contas_servico_fk";
  
  ALTER TABLE "secretarias" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "secretarias" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_secretarias_status";
  CREATE TYPE "public"."enum_secretarias_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "secretarias" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_secretarias_status";
  ALTER TABLE "secretarias" ALTER COLUMN "status" SET DATA TYPE "public"."enum_secretarias_status" USING "status"::"public"."enum_secretarias_status";
  ALTER TABLE "noticias" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "noticias" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_noticias_status";
  CREATE TYPE "public"."enum_noticias_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "noticias" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_noticias_status";
  ALTER TABLE "noticias" ALTER COLUMN "status" SET DATA TYPE "public"."enum_noticias_status" USING "status"::"public"."enum_noticias_status";
  ALTER TABLE "servicos" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "servicos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_servicos_status";
  CREATE TYPE "public"."enum_servicos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "servicos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_servicos_status";
  ALTER TABLE "servicos" ALTER COLUMN "status" SET DATA TYPE "public"."enum_servicos_status" USING "status"::"public"."enum_servicos_status";
  ALTER TABLE "documentos" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "documentos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_documentos_status";
  CREATE TYPE "public"."enum_documentos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "documentos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_documentos_status";
  ALTER TABLE "documentos" ALTER COLUMN "status" SET DATA TYPE "public"."enum_documentos_status" USING "status"::"public"."enum_documentos_status";
  ALTER TABLE "paginas" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "paginas" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_paginas_status";
  CREATE TYPE "public"."enum_paginas_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "paginas" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_paginas_status";
  ALTER TABLE "paginas" ALTER COLUMN "status" SET DATA TYPE "public"."enum_paginas_status" USING "status"::"public"."enum_paginas_status";
  ALTER TABLE "links_uteis" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "links_uteis" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_links_uteis_status";
  CREATE TYPE "public"."enum_links_uteis_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "links_uteis" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_links_uteis_status";
  ALTER TABLE "links_uteis" ALTER COLUMN "status" SET DATA TYPE "public"."enum_links_uteis_status" USING "status"::"public"."enum_links_uteis_status";
  ALTER TABLE "selos" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "selos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_selos_status";
  CREATE TYPE "public"."enum_selos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "selos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_selos_status";
  ALTER TABLE "selos" ALTER COLUMN "status" SET DATA TYPE "public"."enum_selos_status" USING "status"::"public"."enum_selos_status";
  ALTER TABLE "perguntas_frequentes" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "perguntas_frequentes" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_perguntas_frequentes_status";
  CREATE TYPE "public"."enum_perguntas_frequentes_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "perguntas_frequentes" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_perguntas_frequentes_status";
  ALTER TABLE "perguntas_frequentes" ALTER COLUMN "status" SET DATA TYPE "public"."enum_perguntas_frequentes_status" USING "status"::"public"."enum_perguntas_frequentes_status";
  ALTER TABLE "patrimonio_cultural" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "patrimonio_cultural" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_patrimonio_cultural_status";
  CREATE TYPE "public"."enum_patrimonio_cultural_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "patrimonio_cultural" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_patrimonio_cultural_status";
  ALTER TABLE "patrimonio_cultural" ALTER COLUMN "status" SET DATA TYPE "public"."enum_patrimonio_cultural_status" USING "status"::"public"."enum_patrimonio_cultural_status";
  ALTER TABLE "telefones_uteis" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "telefones_uteis" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_telefones_uteis_status";
  CREATE TYPE "public"."enum_telefones_uteis_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "telefones_uteis" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_telefones_uteis_status";
  ALTER TABLE "telefones_uteis" ALTER COLUMN "status" SET DATA TYPE "public"."enum_telefones_uteis_status" USING "status"::"public"."enum_telefones_uteis_status";
  ALTER TABLE "coleta_lixo" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "coleta_lixo" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_coleta_lixo_status";
  CREATE TYPE "public"."enum_coleta_lixo_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "coleta_lixo" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_coleta_lixo_status";
  ALTER TABLE "coleta_lixo" ALTER COLUMN "status" SET DATA TYPE "public"."enum_coleta_lixo_status" USING "status"::"public"."enum_coleta_lixo_status";
  ALTER TABLE "conselhos_municipais" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "conselhos_municipais" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_conselhos_municipais_status";
  CREATE TYPE "public"."enum_conselhos_municipais_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "conselhos_municipais" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_conselhos_municipais_status";
  ALTER TABLE "conselhos_municipais" ALTER COLUMN "status" SET DATA TYPE "public"."enum_conselhos_municipais_status" USING "status"::"public"."enum_conselhos_municipais_status";
  ALTER TABLE "licitacoes" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "licitacoes" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_licitacoes_status";
  CREATE TYPE "public"."enum_licitacoes_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "licitacoes" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_licitacoes_status";
  ALTER TABLE "licitacoes" ALTER COLUMN "status" SET DATA TYPE "public"."enum_licitacoes_status" USING "status"::"public"."enum_licitacoes_status";
  ALTER TABLE "licitacao_anexos" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "licitacao_anexos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_licitacao_anexos_status";
  CREATE TYPE "public"."enum_licitacao_anexos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "licitacao_anexos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_licitacao_anexos_status";
  ALTER TABLE "licitacao_anexos" ALTER COLUMN "status" SET DATA TYPE "public"."enum_licitacao_anexos_status" USING "status"::"public"."enum_licitacao_anexos_status";
  ALTER TABLE "licitacao_lotes" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "licitacao_lotes" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_licitacao_lotes_status";
  CREATE TYPE "public"."enum_licitacao_lotes_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "licitacao_lotes" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_licitacao_lotes_status";
  ALTER TABLE "licitacao_lotes" ALTER COLUMN "status" SET DATA TYPE "public"."enum_licitacao_lotes_status" USING "status"::"public"."enum_licitacao_lotes_status";
  ALTER TABLE "licitacao_eventos" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "licitacao_eventos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_licitacao_eventos_status";
  CREATE TYPE "public"."enum_licitacao_eventos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "licitacao_eventos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_licitacao_eventos_status";
  ALTER TABLE "licitacao_eventos" ALTER COLUMN "status" SET DATA TYPE "public"."enum_licitacao_eventos_status" USING "status"::"public"."enum_licitacao_eventos_status";
  ALTER TABLE "obras" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "obras" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_obras_status";
  CREATE TYPE "public"."enum_obras_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "obras" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_obras_status";
  ALTER TABLE "obras" ALTER COLUMN "status" SET DATA TYPE "public"."enum_obras_status" USING "status"::"public"."enum_obras_status";
  ALTER TABLE "obra_anexos" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "obra_anexos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_obra_anexos_status";
  CREATE TYPE "public"."enum_obra_anexos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "obra_anexos" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_obra_anexos_status";
  ALTER TABLE "obra_anexos" ALTER COLUMN "status" SET DATA TYPE "public"."enum_obra_anexos_status" USING "status"::"public"."enum_obra_anexos_status";
  ALTER TABLE "obra_medicoes" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "obra_medicoes" ALTER COLUMN "status" SET DEFAULT 'rascunho'::text;
  DROP TYPE "public"."enum_obra_medicoes_status";
  CREATE TYPE "public"."enum_obra_medicoes_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  ALTER TABLE "obra_medicoes" ALTER COLUMN "status" SET DEFAULT 'rascunho'::"public"."enum_obra_medicoes_status";
  ALTER TABLE "obra_medicoes" ALTER COLUMN "status" SET DATA TYPE "public"."enum_obra_medicoes_status" USING "status"::"public"."enum_obra_medicoes_status";
  ALTER TABLE "users" ALTER COLUMN "papel" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "papel" SET DEFAULT 'editor'::text;
  DROP TYPE "public"."enum_users_papel";
  CREATE TYPE "public"."enum_users_papel" AS ENUM('administrador', 'editor', 'setor_licitacoes', 'leitor_licitacoes', 'setor_obras', 'leitor_obras', 'servico_avisos_portal', 'servico_avisos_entrega');
  ALTER TABLE "users" ALTER COLUMN "papel" SET DEFAULT 'editor'::"public"."enum_users_papel";
  ALTER TABLE "users" ALTER COLUMN "papel" SET DATA TYPE "public"."enum_users_papel" USING "papel"::"public"."enum_users_papel";
  DROP INDEX "payload_locked_documents_rels_contas_servico_id_idx";
  DROP INDEX "payload_preferences_rels_contas_servico_id_idx";
  ALTER TABLE "users" ADD COLUMN "enable_a_p_i_key" boolean;
  ALTER TABLE "users" ADD COLUMN "api_key" varchar;
  ALTER TABLE "users" ADD COLUMN "api_key_index" varchar;
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "contas_servico_id";
  ALTER TABLE "payload_preferences_rels" DROP COLUMN "contas_servico_id";
  DROP TYPE "public"."enum_users_modulos_permitidos";
  DROP TYPE "public"."enum_contas_servico_tipo";`)
}

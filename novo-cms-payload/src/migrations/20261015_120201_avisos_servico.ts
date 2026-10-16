import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_licitacao_envios_tipo" AS ENUM('confirmacao', 'aviso');
  CREATE TYPE "public"."enum_licitacao_envios_estado" AS ENUM('pendente', 'enviado', 'falhou', 'desistiu');
  ALTER TYPE "public"."enum_users_papel" ADD VALUE 'servico_avisos_portal';
  ALTER TYPE "public"."enum_users_papel" ADD VALUE 'servico_avisos_entrega';
  CREATE TABLE "licitacao_envios" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"destinatario" varchar NOT NULL,
  	"assunto" varchar NOT NULL,
  	"corpo_texto" varchar NOT NULL,
  	"corpo_html" varchar NOT NULL,
  	"tipo" "enum_licitacao_envios_tipo" NOT NULL,
  	"estado" "enum_licitacao_envios_estado" DEFAULT 'pendente' NOT NULL,
  	"tentativas" numeric DEFAULT 0,
  	"ultimo_erro" varchar,
  	"criado_em" timestamp(3) with time zone,
  	"enviado_em" timestamp(3) with time zone,
  	"assinante_id" integer,
  	"licitacao_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "enable_a_p_i_key" boolean;
  ALTER TABLE "users" ADD COLUMN "api_key" varchar;
  ALTER TABLE "users" ADD COLUMN "api_key_index" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "licitacao_envios_id" integer;
  ALTER TABLE "licitacao_envios" ADD CONSTRAINT "licitacao_envios_assinante_id_licitacao_assinantes_id_fk" FOREIGN KEY ("assinante_id") REFERENCES "public"."licitacao_assinantes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "licitacao_envios" ADD CONSTRAINT "licitacao_envios_licitacao_id_licitacoes_id_fk" FOREIGN KEY ("licitacao_id") REFERENCES "public"."licitacoes"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "licitacao_envios_estado_idx" ON "licitacao_envios" USING btree ("estado");
  CREATE INDEX "licitacao_envios_assinante_idx" ON "licitacao_envios" USING btree ("assinante_id");
  CREATE INDEX "licitacao_envios_licitacao_idx" ON "licitacao_envios" USING btree ("licitacao_id");
  CREATE INDEX "licitacao_envios_updated_at_idx" ON "licitacao_envios" USING btree ("updated_at");
  CREATE INDEX "licitacao_envios_created_at_idx" ON "licitacao_envios" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_licitacao_envios_fk" FOREIGN KEY ("licitacao_envios_id") REFERENCES "public"."licitacao_envios"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_licitacao_envios_id_idx" ON "payload_locked_documents_rels" USING btree ("licitacao_envios_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "licitacao_envios" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "licitacao_envios" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_licitacao_envios_fk";
  
  ALTER TABLE "users" ALTER COLUMN "papel" SET DATA TYPE text;
  ALTER TABLE "users" ALTER COLUMN "papel" SET DEFAULT 'editor'::text;
  DROP TYPE "public"."enum_users_papel";
  CREATE TYPE "public"."enum_users_papel" AS ENUM('administrador', 'editor', 'setor_licitacoes', 'leitor_licitacoes');
  ALTER TABLE "users" ALTER COLUMN "papel" SET DEFAULT 'editor'::"public"."enum_users_papel";
  ALTER TABLE "users" ALTER COLUMN "papel" SET DATA TYPE "public"."enum_users_papel" USING "papel"::"public"."enum_users_papel";
  DROP INDEX "payload_locked_documents_rels_licitacao_envios_id_idx";
  ALTER TABLE "users" DROP COLUMN "enable_a_p_i_key";
  ALTER TABLE "users" DROP COLUMN "api_key";
  ALTER TABLE "users" DROP COLUMN "api_key_index";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "licitacao_envios_id";
  DROP TYPE "public"."enum_licitacao_envios_tipo";
  DROP TYPE "public"."enum_licitacao_envios_estado";`)
}

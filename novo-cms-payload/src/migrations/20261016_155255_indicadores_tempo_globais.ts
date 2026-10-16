import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_indicadores_economicos_itens_chave" AS ENUM('ipca', 'selic', 'cdi', 'dolar');
  CREATE TYPE "public"."enum_indicadores_economicos_itens_unidade" AS ENUM('percentual', 'moeda');
  ALTER TYPE "public"."enum_contas_servico_tipo" ADD VALUE 'dados_externos';
  CREATE TABLE "indicadores_economicos_itens" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"chave" "enum_indicadores_economicos_itens_chave" NOT NULL,
  	"rotulo" varchar NOT NULL,
  	"descricao" varchar,
  	"valor" numeric,
  	"unidade" "enum_indicadores_economicos_itens_unidade" NOT NULL,
  	"variacao" numeric,
  	"referencia" varchar,
  	"fonte" varchar
  );
  
  CREATE TABLE "indicadores_economicos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"atualizado_em" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "previsao_tempo" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"temperatura" numeric,
  	"sensacao_termica" numeric,
  	"codigo_tempo" numeric,
  	"umidade" numeric,
  	"vento_kmh" numeric,
  	"atualizado_em" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "indicadores_economicos_itens" ADD CONSTRAINT "indicadores_economicos_itens_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."indicadores_economicos"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "indicadores_economicos_itens_order_idx" ON "indicadores_economicos_itens" USING btree ("_order");
  CREATE INDEX "indicadores_economicos_itens_parent_id_idx" ON "indicadores_economicos_itens" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "indicadores_economicos_itens" CASCADE;
  DROP TABLE "indicadores_economicos" CASCADE;
  DROP TABLE "previsao_tempo" CASCADE;
  ALTER TABLE "contas_servico" ALTER COLUMN "tipo" SET DATA TYPE text;
  DROP TYPE "public"."enum_contas_servico_tipo";
  CREATE TYPE "public"."enum_contas_servico_tipo" AS ENUM('avisos_portal', 'avisos_entrega');
  ALTER TABLE "contas_servico" ALTER COLUMN "tipo" SET DATA TYPE "public"."enum_contas_servico_tipo" USING "tipo"::"public"."enum_contas_servico_tipo";
  DROP TYPE "public"."enum_indicadores_economicos_itens_chave";
  DROP TYPE "public"."enum_indicadores_economicos_itens_unidade";`)
}

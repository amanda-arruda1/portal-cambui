import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "menu_principal" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"itens" jsonb,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  -- Copia o menu que já estava cadastrado em Navegação (botões e subitens, na ordem) para a árvore nova ANTES de apagar as tabelas antigas.
  INSERT INTO "menu_principal" ("itens", "created_at", "updated_at")
  SELECT jsonb_agg(t.item ORDER BY t.ord), now(), now()
  FROM (
    SELECT m."_order" AS ord,
      jsonb_strip_nulls(jsonb_build_object(
        'rotulo', m."rotulo",
        'destino', NULLIF(m."destino", ''),
        'filhos', (
          SELECT jsonb_agg(jsonb_build_object('rotulo', s."rotulo", 'destino', s."destino") ORDER BY s."_order")
          FROM "navegacao_menu_principal_subitens" s WHERE s."_parent_id" = m."id"
        )
      )) AS item
    FROM "navegacao_menu_principal" m
  ) t
  HAVING count(*) > 0;

  DROP TABLE "navegacao_menu_principal_subitens" CASCADE;
  DROP TABLE "navegacao_menu_principal" CASCADE;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "navegacao_menu_principal_subitens" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"rotulo" varchar NOT NULL,
  	"destino" varchar NOT NULL
  );
  
  CREATE TABLE "navegacao_menu_principal" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"rotulo" varchar NOT NULL,
  	"destino" varchar
  );
  
  DROP TABLE "menu_principal" CASCADE;
  ALTER TABLE "navegacao_menu_principal_subitens" ADD CONSTRAINT "navegacao_menu_principal_subitens_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navegacao_menu_principal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "navegacao_menu_principal" ADD CONSTRAINT "navegacao_menu_principal_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navegacao"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "navegacao_menu_principal_subitens_order_idx" ON "navegacao_menu_principal_subitens" USING btree ("_order");
  CREATE INDEX "navegacao_menu_principal_subitens_parent_id_idx" ON "navegacao_menu_principal_subitens" USING btree ("_parent_id");
  CREATE INDEX "navegacao_menu_principal_order_idx" ON "navegacao_menu_principal" USING btree ("_order");
  CREATE INDEX "navegacao_menu_principal_parent_id_idx" ON "navegacao_menu_principal" USING btree ("_parent_id");`)
}

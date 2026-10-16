import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "configuracoes_portal_telefones" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"rotulo" varchar NOT NULL,
  	"numero" varchar NOT NULL
  );
  
  CREATE TABLE "configuracoes_portal_redes_sociais" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"url" varchar NOT NULL
  );
  
  CREATE TABLE "configuracoes_portal_autarquias" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"sigla" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"descricao" varchar
  );
  
  CREATE TABLE "configuracoes_portal" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo_site" varchar NOT NULL,
  	"descricao_site" varchar NOT NULL,
  	"nome_municipio" varchar NOT NULL,
  	"uf" varchar NOT NULL,
  	"nome_completo" varchar NOT NULL,
  	"gentilico" varchar,
  	"cnpj" varchar,
  	"endereco_logradouro" varchar,
  	"endereco_numero" varchar,
  	"endereco_bairro" varchar,
  	"endereco_cidade" varchar,
  	"endereco_uf" varchar,
  	"endereco_cep" varchar,
  	"email_contato" varchar,
  	"horario_atendimento" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
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
  
  CREATE TABLE "navegacao_colunas_rodape_itens" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"rotulo" varchar NOT NULL,
  	"destino" varchar NOT NULL
  );
  
  CREATE TABLE "navegacao_colunas_rodape" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"titulo" varchar NOT NULL
  );
  
  CREATE TABLE "navegacao" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "links_externos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"ouvidoria_url" varchar,
  	"ouvidoria_rotulo" varchar,
  	"ouvidoria_descricao" varchar,
  	"transparencia_url" varchar,
  	"transparencia_rotulo" varchar,
  	"transparencia_descricao" varchar,
  	"diario_amm_url" varchar,
  	"diario_amm_rotulo" varchar,
  	"diario_amm_descricao" varchar,
  	"legislacao_url" varchar,
  	"legislacao_rotulo" varchar,
  	"legislacao_descricao" varchar,
  	"pncp_url" varchar,
  	"pncp_rotulo" varchar,
  	"pncp_descricao" varchar,
  	"tce_url" varchar,
  	"tce_rotulo" varchar,
  	"tce_descricao" varchar,
  	"iptu_url" varchar,
  	"iptu_rotulo" varchar,
  	"iptu_descricao" varchar,
  	"licenciamento_url" varchar,
  	"licenciamento_rotulo" varchar,
  	"licenciamento_descricao" varchar,
  	"atende_cidadao_url" varchar,
  	"atende_cidadao_rotulo" varchar,
  	"atende_cidadao_descricao" varchar,
  	"nfse_url" varchar,
  	"nfse_rotulo" varchar,
  	"nfse_descricao" varchar,
  	"protocolo_url" varchar,
  	"protocolo_rotulo" varchar,
  	"protocolo_descricao" varchar,
  	"portal_turistico_url" varchar,
  	"portal_turistico_rotulo" varchar,
  	"portal_turistico_descricao" varchar,
  	"ponto_url" varchar,
  	"ponto_rotulo" varchar,
  	"ponto_descricao" varchar,
  	"holerite_url" varchar,
  	"holerite_rotulo" varchar,
  	"holerite_descricao" varchar,
  	"webmail_url" varchar,
  	"webmail_rotulo" varchar,
  	"webmail_descricao" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  CREATE TABLE "pagina_inicial_tarefas" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"rotulo" varchar NOT NULL,
  	"detalhe" varchar NOT NULL,
  	"destino" varchar NOT NULL,
  	"externo" boolean DEFAULT false
  );
  
  CREATE TABLE "pagina_inicial" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"heroi_selo" varchar,
  	"heroi_titulo" varchar,
  	"heroi_subtitulo" varchar,
  	"cidade_chamada" varchar,
  	"cidade_texto" varchar,
  	"cidade_portal_turistico" varchar,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  ALTER TABLE "configuracoes_portal_telefones" ADD CONSTRAINT "configuracoes_portal_telefones_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."configuracoes_portal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "configuracoes_portal_redes_sociais" ADD CONSTRAINT "configuracoes_portal_redes_sociais_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."configuracoes_portal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "configuracoes_portal_autarquias" ADD CONSTRAINT "configuracoes_portal_autarquias_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."configuracoes_portal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "navegacao_menu_principal_subitens" ADD CONSTRAINT "navegacao_menu_principal_subitens_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navegacao_menu_principal"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "navegacao_menu_principal" ADD CONSTRAINT "navegacao_menu_principal_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navegacao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "navegacao_colunas_rodape_itens" ADD CONSTRAINT "navegacao_colunas_rodape_itens_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navegacao_colunas_rodape"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "navegacao_colunas_rodape" ADD CONSTRAINT "navegacao_colunas_rodape_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."navegacao"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "pagina_inicial_tarefas" ADD CONSTRAINT "pagina_inicial_tarefas_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."pagina_inicial"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "configuracoes_portal_telefones_order_idx" ON "configuracoes_portal_telefones" USING btree ("_order");
  CREATE INDEX "configuracoes_portal_telefones_parent_id_idx" ON "configuracoes_portal_telefones" USING btree ("_parent_id");
  CREATE INDEX "configuracoes_portal_redes_sociais_order_idx" ON "configuracoes_portal_redes_sociais" USING btree ("_order");
  CREATE INDEX "configuracoes_portal_redes_sociais_parent_id_idx" ON "configuracoes_portal_redes_sociais" USING btree ("_parent_id");
  CREATE INDEX "configuracoes_portal_autarquias_order_idx" ON "configuracoes_portal_autarquias" USING btree ("_order");
  CREATE INDEX "configuracoes_portal_autarquias_parent_id_idx" ON "configuracoes_portal_autarquias" USING btree ("_parent_id");
  CREATE INDEX "navegacao_menu_principal_subitens_order_idx" ON "navegacao_menu_principal_subitens" USING btree ("_order");
  CREATE INDEX "navegacao_menu_principal_subitens_parent_id_idx" ON "navegacao_menu_principal_subitens" USING btree ("_parent_id");
  CREATE INDEX "navegacao_menu_principal_order_idx" ON "navegacao_menu_principal" USING btree ("_order");
  CREATE INDEX "navegacao_menu_principal_parent_id_idx" ON "navegacao_menu_principal" USING btree ("_parent_id");
  CREATE INDEX "navegacao_colunas_rodape_itens_order_idx" ON "navegacao_colunas_rodape_itens" USING btree ("_order");
  CREATE INDEX "navegacao_colunas_rodape_itens_parent_id_idx" ON "navegacao_colunas_rodape_itens" USING btree ("_parent_id");
  CREATE INDEX "navegacao_colunas_rodape_order_idx" ON "navegacao_colunas_rodape" USING btree ("_order");
  CREATE INDEX "navegacao_colunas_rodape_parent_id_idx" ON "navegacao_colunas_rodape" USING btree ("_parent_id");
  CREATE INDEX "pagina_inicial_tarefas_order_idx" ON "pagina_inicial_tarefas" USING btree ("_order");
  CREATE INDEX "pagina_inicial_tarefas_parent_id_idx" ON "pagina_inicial_tarefas" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "configuracoes_portal_telefones" CASCADE;
  DROP TABLE "configuracoes_portal_redes_sociais" CASCADE;
  DROP TABLE "configuracoes_portal_autarquias" CASCADE;
  DROP TABLE "configuracoes_portal" CASCADE;
  DROP TABLE "navegacao_menu_principal_subitens" CASCADE;
  DROP TABLE "navegacao_menu_principal" CASCADE;
  DROP TABLE "navegacao_colunas_rodape_itens" CASCADE;
  DROP TABLE "navegacao_colunas_rodape" CASCADE;
  DROP TABLE "navegacao" CASCADE;
  DROP TABLE "links_externos" CASCADE;
  DROP TABLE "pagina_inicial_tarefas" CASCADE;
  DROP TABLE "pagina_inicial" CASCADE;`)
}

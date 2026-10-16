import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_secretarias_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_noticias_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_servicos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_documentos_tipo" AS ENUM('edital', 'licitacao', 'diario_oficial', 'lei', 'decreto', 'portaria', 'outro');
  CREATE TYPE "public"."enum_documentos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_paginas_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_links_uteis_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_selos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_perguntas_frequentes_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_patrimonio_cultural_categoria" AS ENUM('livro', 'dossie', 'inventario', 'legislacao', 'outro');
  CREATE TYPE "public"."enum_patrimonio_cultural_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_telefones_uteis_categoria" AS ENUM('emergencias', 'escolas_creches', 'unidades_saude', 'assistencia_social', 'departamentos', 'diversos');
  CREATE TYPE "public"."enum_telefones_uteis_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_coleta_lixo_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_conselhos_municipais_categoria" AS ENUM('assistencia_social', 'educacao', 'saude');
  CREATE TYPE "public"."enum_conselhos_municipais_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_licitacoes_modalidade" AS ENUM('pregao_eletronico', 'pregao_presencial', 'concorrencia', 'concurso', 'leilao', 'dialogo_competitivo', 'dispensa', 'dispensa_eletronica', 'inexigibilidade', 'chamamento_publico', 'credenciamento', 'pre_qualificacao', 'adesao_ata', 'cotacao_eletronica');
  CREATE TYPE "public"."enum_licitacoes_forma" AS ENUM('eletronica', 'presencial');
  CREATE TYPE "public"."enum_licitacoes_criterio_julgamento" AS ENUM('menor_preco', 'maior_desconto', 'melhor_tecnica', 'tecnica_e_preco', 'maior_lance', 'maior_retorno_economico');
  CREATE TYPE "public"."enum_licitacoes_modo_disputa" AS ENUM('aberto', 'fechado', 'aberto_fechado', 'fechado_aberto', 'nao_se_aplica');
  CREATE TYPE "public"."enum_licitacoes_situacao" AS ENUM('publicada', 'aberta', 'em_sessao', 'em_julgamento', 'homologada', 'adjudicada', 'contratada', 'suspensa', 'retificada', 'revogada', 'anulada', 'fracassada', 'deserta');
  CREATE TYPE "public"."enum_licitacoes_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_licitacao_anexos_tipo" AS ENUM('edital', 'anexo_do_edital', 'termo_de_referencia', 'planilha', 'minuta_de_contrato', 'retificacao', 'errata', 'impugnacao', 'resposta_a_impugnacao', 'esclarecimento', 'ata_da_sessao', 'resultado_do_julgamento', 'mapa_de_lances', 'homologacao', 'contrato', 'ata_de_registro_de_precos');
  CREATE TYPE "public"."enum_licitacao_anexos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_licitacao_lotes_situacao" AS ENUM('em_disputa', 'homologado', 'fracassado', 'deserto', 'cancelado');
  CREATE TYPE "public"."enum_licitacao_lotes_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_licitacao_eventos_tipo" AS ENUM('publicacao', 'retificacao', 'suspensao', 'impugnacao', 'esclarecimento', 'sessao', 'resultado', 'homologacao', 'adjudicacao', 'contratacao', 'revogacao', 'anulacao');
  CREATE TYPE "public"."enum_licitacao_eventos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_obras_categoria" AS ENUM('pavimentacao', 'construcao', 'reforma', 'drenagem', 'saneamento', 'iluminacao_publica', 'praca_area_lazer', 'edificacao_publica', 'ponte_viaduto', 'outra');
  CREATE TYPE "public"."enum_obras_fonte_recurso" AS ENUM('municipal', 'estadual', 'federal', 'financiamento', 'misto');
  CREATE TYPE "public"."enum_obras_situacao" AS ENUM('planejada', 'em_licitacao', 'nao_iniciada', 'em_execucao', 'paralisada', 'concluida', 'cancelada');
  CREATE TYPE "public"."enum_obras_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_obra_anexos_categoria" AS ENUM('projeto_basico', 'projeto_executivo', 'art_rrt', 'edital_licitacao', 'contrato', 'aditivo', 'ordem_servico', 'relatorio_fiscalizacao', 'foto', 'outro');
  CREATE TYPE "public"."enum_obra_anexos_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_obra_medicoes_status" AS ENUM('rascunho', 'publicado', 'arquivado');
  CREATE TYPE "public"."enum_audit_logs_operacao" AS ENUM('create', 'update', 'delete');
  CREATE TABLE "secretarias" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"sigla" varchar,
  	"palavras_chave" varchar,
  	"descricao" jsonb,
  	"responsavel" varchar,
  	"cargo_responsavel" varchar,
  	"biografia_responsavel" jsonb,
  	"endereco" varchar,
  	"telefone" varchar,
  	"email" varchar,
  	"horario_atendimento" varchar,
  	"ordem" numeric,
  	"status" "enum_secretarias_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "noticias" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"resumo" varchar,
  	"conteudo" jsonb,
  	"texto_busca" varchar,
  	"imagem_id" integer,
  	"imagem_descricao" varchar,
  	"arquivo_id" integer,
  	"data_publicacao" timestamp(3) with time zone NOT NULL,
  	"destaque" boolean DEFAULT false,
  	"secretaria_id" integer,
  	"status" "enum_noticias_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "servicos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"descricao" varchar,
  	"categoria" varchar,
  	"publico_alvo" varchar,
  	"como_solicitar" jsonb,
  	"url_externa" varchar,
  	"secretaria_id" integer,
  	"status" "enum_servicos_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "documentos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar NOT NULL,
  	"tipo" "enum_documentos_tipo" NOT NULL,
  	"numero" varchar,
  	"data_documento" timestamp(3) with time zone NOT NULL,
  	"descricao" varchar,
  	"arquivo_id" integer,
  	"url_externa" varchar,
  	"secretaria_id" integer,
  	"status" "enum_documentos_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "paginas" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"conteudo" jsonb,
  	"atualizado_em" timestamp(3) with time zone,
  	"status" "enum_paginas_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
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
  
  CREATE TABLE "selos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"orgao_emissor" varchar NOT NULL,
  	"descricao" varchar,
  	"imagem_id" integer NOT NULL,
  	"data_concessao" timestamp(3) with time zone,
  	"url_comprovacao" varchar,
  	"ordem" numeric,
  	"status" "enum_selos_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "perguntas_frequentes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"pergunta" varchar NOT NULL,
  	"resposta" jsonb NOT NULL,
  	"categoria" varchar,
  	"secretaria_id" integer,
  	"ordem" numeric,
  	"status" "enum_perguntas_frequentes_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "patrimonio_cultural" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"titulo" varchar NOT NULL,
  	"categoria" "enum_patrimonio_cultural_categoria" NOT NULL,
  	"periodo" varchar,
  	"descricao" varchar,
  	"arquivo_id" integer,
  	"url_externa" varchar,
  	"secretaria_id" integer,
  	"ordem" numeric,
  	"status" "enum_patrimonio_cultural_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "telefones_uteis" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"categoria" "enum_telefones_uteis_categoria" NOT NULL,
  	"endereco" varchar,
  	"telefone" varchar,
  	"email" varchar,
  	"ordem" numeric,
  	"status" "enum_telefones_uteis_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "coleta_lixo" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"dias" varchar NOT NULL,
  	"horario" varchar NOT NULL,
  	"status" "enum_coleta_lixo_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "conselhos_municipais" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar NOT NULL,
  	"categoria" "enum_conselhos_municipais_categoria" NOT NULL,
  	"conteudo" jsonb,
  	"ordem" numeric,
  	"status" "enum_conselhos_municipais_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "licitacoes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"numero_processo" varchar NOT NULL,
  	"numero" numeric NOT NULL,
  	"ano" numeric NOT NULL,
  	"slug" varchar NOT NULL,
  	"modalidade" "enum_licitacoes_modalidade" NOT NULL,
  	"forma" "enum_licitacoes_forma" DEFAULT 'eletronica' NOT NULL,
  	"justificativa_presencial" varchar,
  	"criterio_julgamento" "enum_licitacoes_criterio_julgamento" NOT NULL,
  	"modo_disputa" "enum_licitacoes_modo_disputa" DEFAULT 'aberto',
  	"registro_precos" boolean DEFAULT false,
  	"secretaria_id" integer,
  	"objeto_resumo" varchar NOT NULL,
  	"objeto" jsonb,
  	"valor_estimado" numeric,
  	"orcamento_sigiloso" boolean DEFAULT false,
  	"data_publicacao" timestamp(3) with time zone NOT NULL,
  	"data_abertura_propostas" timestamp(3) with time zone,
  	"data_sessao" timestamp(3) with time zone,
  	"prazo_impugnacao" timestamp(3) with time zone,
  	"prazo_esclarecimentos" timestamp(3) with time zone,
  	"situacao" "enum_licitacoes_situacao" DEFAULT 'publicada' NOT NULL,
  	"motivo_situacao" varchar,
  	"pncp_id" varchar,
  	"pncp_url" varchar,
  	"sistema_sessao_url" varchar,
  	"demonstracao" boolean DEFAULT false,
  	"status" "enum_licitacoes_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "licitacao_anexos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"licitacao_id" integer NOT NULL,
  	"titulo" varchar NOT NULL,
  	"tipo" "enum_licitacao_anexos_tipo" NOT NULL,
  	"arquivo_id" integer,
  	"url_externa" varchar,
  	"data_publicacao" timestamp(3) with time zone NOT NULL,
  	"versao" numeric DEFAULT 1,
  	"substitui_id" integer,
  	"superado" boolean DEFAULT false,
  	"ordem" numeric,
  	"demonstracao" boolean DEFAULT false,
  	"status" "enum_licitacao_anexos_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "licitacao_lotes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"licitacao_id" integer NOT NULL,
  	"numero" numeric NOT NULL,
  	"descricao" varchar NOT NULL,
  	"valor_estimado" numeric,
  	"situacao" "enum_licitacao_lotes_situacao" DEFAULT 'em_disputa',
  	"vencedor_razao_social" varchar,
  	"vencedor_cnpj" varchar,
  	"valor_homologado" numeric,
  	"demonstracao" boolean DEFAULT false,
  	"status" "enum_licitacao_lotes_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "licitacao_eventos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"licitacao_id" integer NOT NULL,
  	"data" timestamp(3) with time zone NOT NULL,
  	"tipo" "enum_licitacao_eventos_tipo" NOT NULL,
  	"descricao" varchar,
  	"anexo_id" integer,
  	"demonstracao" boolean DEFAULT false,
  	"status" "enum_licitacao_eventos_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "licitacao_assinantes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"modalidades" varchar,
  	"palavras_chave" varchar,
  	"confirmado" boolean DEFAULT false,
  	"token" varchar,
  	"criado_em" timestamp(3) with time zone,
  	"confirmado_em" timestamp(3) with time zone,
  	"id_legado" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "obras" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"numero_processo" varchar NOT NULL,
  	"numero_contrato" varchar,
  	"licitacao_id" integer,
  	"slug" varchar NOT NULL,
  	"categoria" "enum_obras_categoria" NOT NULL,
  	"secretaria_id" integer,
  	"objeto_resumo" varchar NOT NULL,
  	"objeto" jsonb,
  	"endereco" varchar,
  	"empresa_executora" varchar,
  	"empresa_cnpj" varchar,
  	"responsavel_tecnico" varchar,
  	"art_rrt" varchar,
  	"fonte_recurso" "enum_obras_fonte_recurso" NOT NULL,
  	"numero_convenio" varchar,
  	"valor_contratado" numeric,
  	"valor_aditivado" numeric DEFAULT 0,
  	"valor_pago" numeric DEFAULT 0,
  	"data_ordem_servico" timestamp(3) with time zone,
  	"data_prevista_termino" timestamp(3) with time zone,
  	"data_termino_real" timestamp(3) with time zone,
  	"situacao" "enum_obras_situacao" DEFAULT 'planejada' NOT NULL,
  	"motivo_situacao" varchar,
  	"percentual_execucao" numeric DEFAULT 0,
  	"observacoes" varchar,
  	"data_publicacao" timestamp(3) with time zone NOT NULL,
  	"demonstracao" boolean DEFAULT false,
  	"status" "enum_obras_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "obra_anexos" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"obra_id" integer NOT NULL,
  	"titulo" varchar NOT NULL,
  	"categoria" "enum_obra_anexos_categoria" NOT NULL,
  	"arquivo_id" integer,
  	"data_referencia" timestamp(3) with time zone NOT NULL,
  	"descricao" varchar,
  	"ordem" numeric,
  	"demonstracao" boolean DEFAULT false,
  	"status" "enum_obra_anexos_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "obra_medicoes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"obra_id" integer NOT NULL,
  	"numero" numeric NOT NULL,
  	"data_referencia" timestamp(3) with time zone NOT NULL,
  	"percentual_acumulado" numeric,
  	"valor_medido" numeric,
  	"valor_acumulado" numeric,
  	"boletim_id" integer,
  	"observacoes" varchar,
  	"demonstracao" boolean DEFAULT false,
  	"status" "enum_obra_medicoes_status" DEFAULT 'rascunho' NOT NULL,
  	"id_legado" varchar,
  	"autoria_legado" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"id_legado" varchar,
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
  	"focal_y" numeric
  );
  
  CREATE TABLE "users_sessions" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"created_at" timestamp(3) with time zone,
  	"expires_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"nome" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"reset_password_requested_at" timestamp(3) with time zone,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE "audit_logs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"operacao" "enum_audit_logs_operacao" NOT NULL,
  	"colecao" varchar NOT NULL,
  	"documento_id" varchar NOT NULL,
  	"resumo" varchar,
  	"usuario_id" varchar,
  	"usuario_email" varchar,
  	"antes" jsonb,
  	"depois" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_kv" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"data" jsonb NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"secretarias_id" integer,
  	"noticias_id" integer,
  	"servicos_id" integer,
  	"documentos_id" integer,
  	"paginas_id" integer,
  	"links_uteis_id" integer,
  	"selos_id" integer,
  	"perguntas_frequentes_id" integer,
  	"patrimonio_cultural_id" integer,
  	"telefones_uteis_id" integer,
  	"coleta_lixo_id" integer,
  	"conselhos_municipais_id" integer,
  	"licitacoes_id" integer,
  	"licitacao_anexos_id" integer,
  	"licitacao_lotes_id" integer,
  	"licitacao_eventos_id" integer,
  	"licitacao_assinantes_id" integer,
  	"obras_id" integer,
  	"obra_anexos_id" integer,
  	"obra_medicoes_id" integer,
  	"media_id" integer,
  	"users_id" integer,
  	"audit_logs_id" integer
  );
  
  CREATE TABLE "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "noticias" ADD CONSTRAINT "noticias_imagem_id_media_id_fk" FOREIGN KEY ("imagem_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "noticias" ADD CONSTRAINT "noticias_arquivo_id_media_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "noticias" ADD CONSTRAINT "noticias_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "servicos" ADD CONSTRAINT "servicos_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "documentos" ADD CONSTRAINT "documentos_arquivo_id_media_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "documentos" ADD CONSTRAINT "documentos_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "selos" ADD CONSTRAINT "selos_imagem_id_media_id_fk" FOREIGN KEY ("imagem_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "perguntas_frequentes" ADD CONSTRAINT "perguntas_frequentes_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "patrimonio_cultural" ADD CONSTRAINT "patrimonio_cultural_arquivo_id_media_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "patrimonio_cultural" ADD CONSTRAINT "patrimonio_cultural_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "licitacoes" ADD CONSTRAINT "licitacoes_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "licitacao_anexos" ADD CONSTRAINT "licitacao_anexos_licitacao_id_licitacoes_id_fk" FOREIGN KEY ("licitacao_id") REFERENCES "public"."licitacoes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "licitacao_anexos" ADD CONSTRAINT "licitacao_anexos_arquivo_id_media_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "licitacao_anexos" ADD CONSTRAINT "licitacao_anexos_substitui_id_licitacao_anexos_id_fk" FOREIGN KEY ("substitui_id") REFERENCES "public"."licitacao_anexos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "licitacao_lotes" ADD CONSTRAINT "licitacao_lotes_licitacao_id_licitacoes_id_fk" FOREIGN KEY ("licitacao_id") REFERENCES "public"."licitacoes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "licitacao_eventos" ADD CONSTRAINT "licitacao_eventos_licitacao_id_licitacoes_id_fk" FOREIGN KEY ("licitacao_id") REFERENCES "public"."licitacoes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "licitacao_eventos" ADD CONSTRAINT "licitacao_eventos_anexo_id_licitacao_anexos_id_fk" FOREIGN KEY ("anexo_id") REFERENCES "public"."licitacao_anexos"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "obras" ADD CONSTRAINT "obras_licitacao_id_licitacoes_id_fk" FOREIGN KEY ("licitacao_id") REFERENCES "public"."licitacoes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "obras" ADD CONSTRAINT "obras_secretaria_id_secretarias_id_fk" FOREIGN KEY ("secretaria_id") REFERENCES "public"."secretarias"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "obra_anexos" ADD CONSTRAINT "obra_anexos_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "obra_anexos" ADD CONSTRAINT "obra_anexos_arquivo_id_media_id_fk" FOREIGN KEY ("arquivo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "obra_medicoes" ADD CONSTRAINT "obra_medicoes_obra_id_obras_id_fk" FOREIGN KEY ("obra_id") REFERENCES "public"."obras"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "obra_medicoes" ADD CONSTRAINT "obra_medicoes_boletim_id_media_id_fk" FOREIGN KEY ("boletim_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "users_sessions" ADD CONSTRAINT "users_sessions_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_secretarias_fk" FOREIGN KEY ("secretarias_id") REFERENCES "public"."secretarias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_noticias_fk" FOREIGN KEY ("noticias_id") REFERENCES "public"."noticias"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_servicos_fk" FOREIGN KEY ("servicos_id") REFERENCES "public"."servicos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_documentos_fk" FOREIGN KEY ("documentos_id") REFERENCES "public"."documentos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_paginas_fk" FOREIGN KEY ("paginas_id") REFERENCES "public"."paginas"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_links_uteis_fk" FOREIGN KEY ("links_uteis_id") REFERENCES "public"."links_uteis"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_selos_fk" FOREIGN KEY ("selos_id") REFERENCES "public"."selos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_perguntas_frequentes_fk" FOREIGN KEY ("perguntas_frequentes_id") REFERENCES "public"."perguntas_frequentes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_patrimonio_cultural_fk" FOREIGN KEY ("patrimonio_cultural_id") REFERENCES "public"."patrimonio_cultural"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_telefones_uteis_fk" FOREIGN KEY ("telefones_uteis_id") REFERENCES "public"."telefones_uteis"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_coleta_lixo_fk" FOREIGN KEY ("coleta_lixo_id") REFERENCES "public"."coleta_lixo"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_conselhos_municipais_fk" FOREIGN KEY ("conselhos_municipais_id") REFERENCES "public"."conselhos_municipais"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_licitacoes_fk" FOREIGN KEY ("licitacoes_id") REFERENCES "public"."licitacoes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_licitacao_anexos_fk" FOREIGN KEY ("licitacao_anexos_id") REFERENCES "public"."licitacao_anexos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_licitacao_lotes_fk" FOREIGN KEY ("licitacao_lotes_id") REFERENCES "public"."licitacao_lotes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_licitacao_eventos_fk" FOREIGN KEY ("licitacao_eventos_id") REFERENCES "public"."licitacao_eventos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_licitacao_assinantes_fk" FOREIGN KEY ("licitacao_assinantes_id") REFERENCES "public"."licitacao_assinantes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_obras_fk" FOREIGN KEY ("obras_id") REFERENCES "public"."obras"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_obra_anexos_fk" FOREIGN KEY ("obra_anexos_id") REFERENCES "public"."obra_anexos"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_obra_medicoes_fk" FOREIGN KEY ("obra_medicoes_id") REFERENCES "public"."obra_medicoes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_audit_logs_fk" FOREIGN KEY ("audit_logs_id") REFERENCES "public"."audit_logs"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "secretarias_slug_idx" ON "secretarias" USING btree ("slug");
  CREATE INDEX "secretarias_status_idx" ON "secretarias" USING btree ("status");
  CREATE UNIQUE INDEX "secretarias_id_legado_idx" ON "secretarias" USING btree ("id_legado");
  CREATE INDEX "secretarias_updated_at_idx" ON "secretarias" USING btree ("updated_at");
  CREATE INDEX "secretarias_created_at_idx" ON "secretarias" USING btree ("created_at");
  CREATE UNIQUE INDEX "noticias_slug_idx" ON "noticias" USING btree ("slug");
  CREATE INDEX "noticias_imagem_idx" ON "noticias" USING btree ("imagem_id");
  CREATE INDEX "noticias_arquivo_idx" ON "noticias" USING btree ("arquivo_id");
  CREATE INDEX "noticias_secretaria_idx" ON "noticias" USING btree ("secretaria_id");
  CREATE INDEX "noticias_status_idx" ON "noticias" USING btree ("status");
  CREATE UNIQUE INDEX "noticias_id_legado_idx" ON "noticias" USING btree ("id_legado");
  CREATE INDEX "noticias_updated_at_idx" ON "noticias" USING btree ("updated_at");
  CREATE INDEX "noticias_created_at_idx" ON "noticias" USING btree ("created_at");
  CREATE UNIQUE INDEX "servicos_slug_idx" ON "servicos" USING btree ("slug");
  CREATE INDEX "servicos_secretaria_idx" ON "servicos" USING btree ("secretaria_id");
  CREATE INDEX "servicos_status_idx" ON "servicos" USING btree ("status");
  CREATE UNIQUE INDEX "servicos_id_legado_idx" ON "servicos" USING btree ("id_legado");
  CREATE INDEX "servicos_updated_at_idx" ON "servicos" USING btree ("updated_at");
  CREATE INDEX "servicos_created_at_idx" ON "servicos" USING btree ("created_at");
  CREATE INDEX "documentos_arquivo_idx" ON "documentos" USING btree ("arquivo_id");
  CREATE INDEX "documentos_secretaria_idx" ON "documentos" USING btree ("secretaria_id");
  CREATE INDEX "documentos_status_idx" ON "documentos" USING btree ("status");
  CREATE UNIQUE INDEX "documentos_id_legado_idx" ON "documentos" USING btree ("id_legado");
  CREATE INDEX "documentos_updated_at_idx" ON "documentos" USING btree ("updated_at");
  CREATE INDEX "documentos_created_at_idx" ON "documentos" USING btree ("created_at");
  CREATE UNIQUE INDEX "paginas_slug_idx" ON "paginas" USING btree ("slug");
  CREATE INDEX "paginas_status_idx" ON "paginas" USING btree ("status");
  CREATE UNIQUE INDEX "paginas_id_legado_idx" ON "paginas" USING btree ("id_legado");
  CREATE INDEX "paginas_updated_at_idx" ON "paginas" USING btree ("updated_at");
  CREATE INDEX "paginas_created_at_idx" ON "paginas" USING btree ("created_at");
  CREATE INDEX "links_uteis_status_idx" ON "links_uteis" USING btree ("status");
  CREATE UNIQUE INDEX "links_uteis_id_legado_idx" ON "links_uteis" USING btree ("id_legado");
  CREATE INDEX "links_uteis_updated_at_idx" ON "links_uteis" USING btree ("updated_at");
  CREATE INDEX "links_uteis_created_at_idx" ON "links_uteis" USING btree ("created_at");
  CREATE INDEX "selos_imagem_idx" ON "selos" USING btree ("imagem_id");
  CREATE INDEX "selos_status_idx" ON "selos" USING btree ("status");
  CREATE UNIQUE INDEX "selos_id_legado_idx" ON "selos" USING btree ("id_legado");
  CREATE INDEX "selos_updated_at_idx" ON "selos" USING btree ("updated_at");
  CREATE INDEX "selos_created_at_idx" ON "selos" USING btree ("created_at");
  CREATE INDEX "perguntas_frequentes_secretaria_idx" ON "perguntas_frequentes" USING btree ("secretaria_id");
  CREATE INDEX "perguntas_frequentes_status_idx" ON "perguntas_frequentes" USING btree ("status");
  CREATE UNIQUE INDEX "perguntas_frequentes_id_legado_idx" ON "perguntas_frequentes" USING btree ("id_legado");
  CREATE INDEX "perguntas_frequentes_updated_at_idx" ON "perguntas_frequentes" USING btree ("updated_at");
  CREATE INDEX "perguntas_frequentes_created_at_idx" ON "perguntas_frequentes" USING btree ("created_at");
  CREATE INDEX "patrimonio_cultural_arquivo_idx" ON "patrimonio_cultural" USING btree ("arquivo_id");
  CREATE INDEX "patrimonio_cultural_secretaria_idx" ON "patrimonio_cultural" USING btree ("secretaria_id");
  CREATE INDEX "patrimonio_cultural_status_idx" ON "patrimonio_cultural" USING btree ("status");
  CREATE UNIQUE INDEX "patrimonio_cultural_id_legado_idx" ON "patrimonio_cultural" USING btree ("id_legado");
  CREATE INDEX "patrimonio_cultural_updated_at_idx" ON "patrimonio_cultural" USING btree ("updated_at");
  CREATE INDEX "patrimonio_cultural_created_at_idx" ON "patrimonio_cultural" USING btree ("created_at");
  CREATE INDEX "telefones_uteis_status_idx" ON "telefones_uteis" USING btree ("status");
  CREATE UNIQUE INDEX "telefones_uteis_id_legado_idx" ON "telefones_uteis" USING btree ("id_legado");
  CREATE INDEX "telefones_uteis_updated_at_idx" ON "telefones_uteis" USING btree ("updated_at");
  CREATE INDEX "telefones_uteis_created_at_idx" ON "telefones_uteis" USING btree ("created_at");
  CREATE INDEX "coleta_lixo_status_idx" ON "coleta_lixo" USING btree ("status");
  CREATE UNIQUE INDEX "coleta_lixo_id_legado_idx" ON "coleta_lixo" USING btree ("id_legado");
  CREATE INDEX "coleta_lixo_updated_at_idx" ON "coleta_lixo" USING btree ("updated_at");
  CREATE INDEX "coleta_lixo_created_at_idx" ON "coleta_lixo" USING btree ("created_at");
  CREATE INDEX "conselhos_municipais_status_idx" ON "conselhos_municipais" USING btree ("status");
  CREATE UNIQUE INDEX "conselhos_municipais_id_legado_idx" ON "conselhos_municipais" USING btree ("id_legado");
  CREATE INDEX "conselhos_municipais_updated_at_idx" ON "conselhos_municipais" USING btree ("updated_at");
  CREATE INDEX "conselhos_municipais_created_at_idx" ON "conselhos_municipais" USING btree ("created_at");
  CREATE UNIQUE INDEX "licitacoes_numero_processo_idx" ON "licitacoes" USING btree ("numero_processo");
  CREATE INDEX "licitacoes_ano_idx" ON "licitacoes" USING btree ("ano");
  CREATE UNIQUE INDEX "licitacoes_slug_idx" ON "licitacoes" USING btree ("slug");
  CREATE INDEX "licitacoes_modalidade_idx" ON "licitacoes" USING btree ("modalidade");
  CREATE INDEX "licitacoes_secretaria_idx" ON "licitacoes" USING btree ("secretaria_id");
  CREATE INDEX "licitacoes_data_publicacao_idx" ON "licitacoes" USING btree ("data_publicacao");
  CREATE INDEX "licitacoes_data_sessao_idx" ON "licitacoes" USING btree ("data_sessao");
  CREATE INDEX "licitacoes_situacao_idx" ON "licitacoes" USING btree ("situacao");
  CREATE INDEX "licitacoes_status_idx" ON "licitacoes" USING btree ("status");
  CREATE UNIQUE INDEX "licitacoes_id_legado_idx" ON "licitacoes" USING btree ("id_legado");
  CREATE INDEX "licitacoes_updated_at_idx" ON "licitacoes" USING btree ("updated_at");
  CREATE INDEX "licitacoes_created_at_idx" ON "licitacoes" USING btree ("created_at");
  CREATE INDEX "licitacao_anexos_licitacao_idx" ON "licitacao_anexos" USING btree ("licitacao_id");
  CREATE INDEX "licitacao_anexos_arquivo_idx" ON "licitacao_anexos" USING btree ("arquivo_id");
  CREATE INDEX "licitacao_anexos_substitui_idx" ON "licitacao_anexos" USING btree ("substitui_id");
  CREATE INDEX "licitacao_anexos_status_idx" ON "licitacao_anexos" USING btree ("status");
  CREATE UNIQUE INDEX "licitacao_anexos_id_legado_idx" ON "licitacao_anexos" USING btree ("id_legado");
  CREATE INDEX "licitacao_anexos_updated_at_idx" ON "licitacao_anexos" USING btree ("updated_at");
  CREATE INDEX "licitacao_anexos_created_at_idx" ON "licitacao_anexos" USING btree ("created_at");
  CREATE INDEX "licitacao_lotes_licitacao_idx" ON "licitacao_lotes" USING btree ("licitacao_id");
  CREATE INDEX "licitacao_lotes_status_idx" ON "licitacao_lotes" USING btree ("status");
  CREATE UNIQUE INDEX "licitacao_lotes_id_legado_idx" ON "licitacao_lotes" USING btree ("id_legado");
  CREATE INDEX "licitacao_lotes_updated_at_idx" ON "licitacao_lotes" USING btree ("updated_at");
  CREATE INDEX "licitacao_lotes_created_at_idx" ON "licitacao_lotes" USING btree ("created_at");
  CREATE INDEX "licitacao_eventos_licitacao_idx" ON "licitacao_eventos" USING btree ("licitacao_id");
  CREATE INDEX "licitacao_eventos_anexo_idx" ON "licitacao_eventos" USING btree ("anexo_id");
  CREATE INDEX "licitacao_eventos_status_idx" ON "licitacao_eventos" USING btree ("status");
  CREATE UNIQUE INDEX "licitacao_eventos_id_legado_idx" ON "licitacao_eventos" USING btree ("id_legado");
  CREATE INDEX "licitacao_eventos_updated_at_idx" ON "licitacao_eventos" USING btree ("updated_at");
  CREATE INDEX "licitacao_eventos_created_at_idx" ON "licitacao_eventos" USING btree ("created_at");
  CREATE UNIQUE INDEX "licitacao_assinantes_email_idx" ON "licitacao_assinantes" USING btree ("email");
  CREATE UNIQUE INDEX "licitacao_assinantes_id_legado_idx" ON "licitacao_assinantes" USING btree ("id_legado");
  CREATE INDEX "licitacao_assinantes_updated_at_idx" ON "licitacao_assinantes" USING btree ("updated_at");
  CREATE INDEX "licitacao_assinantes_created_at_idx" ON "licitacao_assinantes" USING btree ("created_at");
  CREATE INDEX "obras_licitacao_idx" ON "obras" USING btree ("licitacao_id");
  CREATE UNIQUE INDEX "obras_slug_idx" ON "obras" USING btree ("slug");
  CREATE INDEX "obras_secretaria_idx" ON "obras" USING btree ("secretaria_id");
  CREATE INDEX "obras_situacao_idx" ON "obras" USING btree ("situacao");
  CREATE INDEX "obras_status_idx" ON "obras" USING btree ("status");
  CREATE UNIQUE INDEX "obras_id_legado_idx" ON "obras" USING btree ("id_legado");
  CREATE INDEX "obras_updated_at_idx" ON "obras" USING btree ("updated_at");
  CREATE INDEX "obras_created_at_idx" ON "obras" USING btree ("created_at");
  CREATE INDEX "obra_anexos_obra_idx" ON "obra_anexos" USING btree ("obra_id");
  CREATE INDEX "obra_anexos_arquivo_idx" ON "obra_anexos" USING btree ("arquivo_id");
  CREATE INDEX "obra_anexos_status_idx" ON "obra_anexos" USING btree ("status");
  CREATE UNIQUE INDEX "obra_anexos_id_legado_idx" ON "obra_anexos" USING btree ("id_legado");
  CREATE INDEX "obra_anexos_updated_at_idx" ON "obra_anexos" USING btree ("updated_at");
  CREATE INDEX "obra_anexos_created_at_idx" ON "obra_anexos" USING btree ("created_at");
  CREATE INDEX "obra_medicoes_obra_idx" ON "obra_medicoes" USING btree ("obra_id");
  CREATE INDEX "obra_medicoes_boletim_idx" ON "obra_medicoes" USING btree ("boletim_id");
  CREATE INDEX "obra_medicoes_status_idx" ON "obra_medicoes" USING btree ("status");
  CREATE UNIQUE INDEX "obra_medicoes_id_legado_idx" ON "obra_medicoes" USING btree ("id_legado");
  CREATE INDEX "obra_medicoes_updated_at_idx" ON "obra_medicoes" USING btree ("updated_at");
  CREATE INDEX "obra_medicoes_created_at_idx" ON "obra_medicoes" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_id_legado_idx" ON "media" USING btree ("id_legado");
  CREATE INDEX "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX "users_sessions_order_idx" ON "users_sessions" USING btree ("_order");
  CREATE INDEX "users_sessions_parent_id_idx" ON "users_sessions" USING btree ("_parent_id");
  CREATE INDEX "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");
  CREATE INDEX "audit_logs_colecao_idx" ON "audit_logs" USING btree ("colecao");
  CREATE INDEX "audit_logs_documento_id_idx" ON "audit_logs" USING btree ("documento_id");
  CREATE INDEX "audit_logs_updated_at_idx" ON "audit_logs" USING btree ("updated_at");
  CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");
  CREATE UNIQUE INDEX "payload_kv_key_idx" ON "payload_kv" USING btree ("key");
  CREATE INDEX "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX "payload_locked_documents_rels_secretarias_id_idx" ON "payload_locked_documents_rels" USING btree ("secretarias_id");
  CREATE INDEX "payload_locked_documents_rels_noticias_id_idx" ON "payload_locked_documents_rels" USING btree ("noticias_id");
  CREATE INDEX "payload_locked_documents_rels_servicos_id_idx" ON "payload_locked_documents_rels" USING btree ("servicos_id");
  CREATE INDEX "payload_locked_documents_rels_documentos_id_idx" ON "payload_locked_documents_rels" USING btree ("documentos_id");
  CREATE INDEX "payload_locked_documents_rels_paginas_id_idx" ON "payload_locked_documents_rels" USING btree ("paginas_id");
  CREATE INDEX "payload_locked_documents_rels_links_uteis_id_idx" ON "payload_locked_documents_rels" USING btree ("links_uteis_id");
  CREATE INDEX "payload_locked_documents_rels_selos_id_idx" ON "payload_locked_documents_rels" USING btree ("selos_id");
  CREATE INDEX "payload_locked_documents_rels_perguntas_frequentes_id_idx" ON "payload_locked_documents_rels" USING btree ("perguntas_frequentes_id");
  CREATE INDEX "payload_locked_documents_rels_patrimonio_cultural_id_idx" ON "payload_locked_documents_rels" USING btree ("patrimonio_cultural_id");
  CREATE INDEX "payload_locked_documents_rels_telefones_uteis_id_idx" ON "payload_locked_documents_rels" USING btree ("telefones_uteis_id");
  CREATE INDEX "payload_locked_documents_rels_coleta_lixo_id_idx" ON "payload_locked_documents_rels" USING btree ("coleta_lixo_id");
  CREATE INDEX "payload_locked_documents_rels_conselhos_municipais_id_idx" ON "payload_locked_documents_rels" USING btree ("conselhos_municipais_id");
  CREATE INDEX "payload_locked_documents_rels_licitacoes_id_idx" ON "payload_locked_documents_rels" USING btree ("licitacoes_id");
  CREATE INDEX "payload_locked_documents_rels_licitacao_anexos_id_idx" ON "payload_locked_documents_rels" USING btree ("licitacao_anexos_id");
  CREATE INDEX "payload_locked_documents_rels_licitacao_lotes_id_idx" ON "payload_locked_documents_rels" USING btree ("licitacao_lotes_id");
  CREATE INDEX "payload_locked_documents_rels_licitacao_eventos_id_idx" ON "payload_locked_documents_rels" USING btree ("licitacao_eventos_id");
  CREATE INDEX "payload_locked_documents_rels_licitacao_assinantes_id_idx" ON "payload_locked_documents_rels" USING btree ("licitacao_assinantes_id");
  CREATE INDEX "payload_locked_documents_rels_obras_id_idx" ON "payload_locked_documents_rels" USING btree ("obras_id");
  CREATE INDEX "payload_locked_documents_rels_obra_anexos_id_idx" ON "payload_locked_documents_rels" USING btree ("obra_anexos_id");
  CREATE INDEX "payload_locked_documents_rels_obra_medicoes_id_idx" ON "payload_locked_documents_rels" USING btree ("obra_medicoes_id");
  CREATE INDEX "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX "payload_locked_documents_rels_audit_logs_id_idx" ON "payload_locked_documents_rels" USING btree ("audit_logs_id");
  CREATE INDEX "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "secretarias" CASCADE;
  DROP TABLE "noticias" CASCADE;
  DROP TABLE "servicos" CASCADE;
  DROP TABLE "documentos" CASCADE;
  DROP TABLE "paginas" CASCADE;
  DROP TABLE "links_uteis" CASCADE;
  DROP TABLE "selos" CASCADE;
  DROP TABLE "perguntas_frequentes" CASCADE;
  DROP TABLE "patrimonio_cultural" CASCADE;
  DROP TABLE "telefones_uteis" CASCADE;
  DROP TABLE "coleta_lixo" CASCADE;
  DROP TABLE "conselhos_municipais" CASCADE;
  DROP TABLE "licitacoes" CASCADE;
  DROP TABLE "licitacao_anexos" CASCADE;
  DROP TABLE "licitacao_lotes" CASCADE;
  DROP TABLE "licitacao_eventos" CASCADE;
  DROP TABLE "licitacao_assinantes" CASCADE;
  DROP TABLE "obras" CASCADE;
  DROP TABLE "obra_anexos" CASCADE;
  DROP TABLE "obra_medicoes" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "users_sessions" CASCADE;
  DROP TABLE "users" CASCADE;
  DROP TABLE "audit_logs" CASCADE;
  DROP TABLE "payload_kv" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TYPE "public"."enum_secretarias_status";
  DROP TYPE "public"."enum_noticias_status";
  DROP TYPE "public"."enum_servicos_status";
  DROP TYPE "public"."enum_documentos_tipo";
  DROP TYPE "public"."enum_documentos_status";
  DROP TYPE "public"."enum_paginas_status";
  DROP TYPE "public"."enum_links_uteis_status";
  DROP TYPE "public"."enum_selos_status";
  DROP TYPE "public"."enum_perguntas_frequentes_status";
  DROP TYPE "public"."enum_patrimonio_cultural_categoria";
  DROP TYPE "public"."enum_patrimonio_cultural_status";
  DROP TYPE "public"."enum_telefones_uteis_categoria";
  DROP TYPE "public"."enum_telefones_uteis_status";
  DROP TYPE "public"."enum_coleta_lixo_status";
  DROP TYPE "public"."enum_conselhos_municipais_categoria";
  DROP TYPE "public"."enum_conselhos_municipais_status";
  DROP TYPE "public"."enum_licitacoes_modalidade";
  DROP TYPE "public"."enum_licitacoes_forma";
  DROP TYPE "public"."enum_licitacoes_criterio_julgamento";
  DROP TYPE "public"."enum_licitacoes_modo_disputa";
  DROP TYPE "public"."enum_licitacoes_situacao";
  DROP TYPE "public"."enum_licitacoes_status";
  DROP TYPE "public"."enum_licitacao_anexos_tipo";
  DROP TYPE "public"."enum_licitacao_anexos_status";
  DROP TYPE "public"."enum_licitacao_lotes_situacao";
  DROP TYPE "public"."enum_licitacao_lotes_status";
  DROP TYPE "public"."enum_licitacao_eventos_tipo";
  DROP TYPE "public"."enum_licitacao_eventos_status";
  DROP TYPE "public"."enum_obras_categoria";
  DROP TYPE "public"."enum_obras_fonte_recurso";
  DROP TYPE "public"."enum_obras_situacao";
  DROP TYPE "public"."enum_obras_status";
  DROP TYPE "public"."enum_obra_anexos_categoria";
  DROP TYPE "public"."enum_obra_anexos_status";
  DROP TYPE "public"."enum_obra_medicoes_status";
  DROP TYPE "public"."enum_audit_logs_operacao";`)
}

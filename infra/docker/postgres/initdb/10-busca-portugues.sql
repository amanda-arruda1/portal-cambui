-- Portal Cambuí — preparação da busca em português.
-- Roda uma única vez, na criação do cluster (docker-entrypoint-initdb.d).
--
-- Objetivo: o cidadão que digitar "educacao" tem de encontrar "Educação".
-- O dicionário 'portuguese' embutido faz o stemming, mas não tira acento;
-- por isso combinamos com unaccent numa configuração própria.

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- similaridade, para "você quis dizer"

-- Configuração de busca: unaccent antes do stemmer português.
CREATE TEXT SEARCH CONFIGURATION public.portugues_sem_acento ( COPY = pg_catalog.portuguese );

ALTER TEXT SEARCH CONFIGURATION public.portugues_sem_acento
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, portuguese_stem;

-- Passa a ser o padrão da conexão, para que to_tsvector/to_tsquery sem
-- argumento explícito já usem a configuração correta.
-- O entrypoint não expõe POSTGRES_DB como variável do psql, então o nome do
-- banco vem de current_database() via SQL dinâmico.
DO $$
BEGIN
  EXECUTE format('ALTER DATABASE %I SET default_text_search_config = %L',
                 current_database(), 'public.portugues_sem_acento');
END
$$;

-- Prova de que a imutabilidade do Diário está valendo no BANCO.
-- Roda inteiro dentro de uma transação e desfaz tudo: não deixa resíduo.
--
--   docker exec -e PGPASSWORD=... -i portal-postgres \
--     psql -U <user> -d <db> -f - < infra/directus/diario/testar-imutabilidade.sql
BEGIN;
\set ON_ERROR_STOP off

INSERT INTO diario_edicoes (id,status,numero,ano,tipo,situacao,data_disponibilizacao,data_publicacao_legal,codigo_verificador)
VALUES (gen_random_uuid(),'publicado',999999,2026,'ordinaria','publicada',now(),current_date,'PROVA-TRIGGER');

\echo ''
\echo '1. alterar PDF/hash de edição publicada     → deve dar ERROR'
UPDATE diario_edicoes SET sha256='outro' WHERE numero=999999;
\echo '2. mudar situação de edição publicada       → deve dar ERROR'
UPDATE diario_edicoes SET situacao='em_montagem' WHERE numero=999999;
\echo '3. apagar edição publicada                  → deve dar ERROR'
DELETE FROM diario_edicoes WHERE numero=999999;
\echo '4. marcar como anulada                      → deve dar UPDATE 1'
UPDATE diario_edicoes SET anulada=true, anulada_motivo='erro_material', anulada_em=now() WHERE numero=999999;

INSERT INTO diario_auditoria (id,acao,quando,detalhe) VALUES (gen_random_uuid(),'edicao_publicada',now(),'linha de prova');
\echo '5. editar linha de auditoria                → deve dar ERROR'
UPDATE diario_auditoria SET detalhe='mexido' WHERE detalhe='linha de prova';
\echo '6. apagar linha de auditoria                → deve dar ERROR'
DELETE FROM diario_auditoria WHERE detalhe='linha de prova';
\echo ''

ROLLBACK;

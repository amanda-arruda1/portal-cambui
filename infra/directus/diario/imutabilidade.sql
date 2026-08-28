-- ---------------------------------------------------------------------------
-- Imutabilidade do Diário Oficial, no banco.
--
-- Por que aqui e não só na aplicação: a aplicação é UMA das portas. O painel do
-- Directus é outra, um script de manutenção é outra, e um psql às 23h é outra.
-- Regra que só existe no código da aplicação não é regra, é convenção — e a
-- razão de existir de um diário oficial é justamente não depender de convenção.
--
-- O que fica proibido:
--   • alterar edição já publicada, salvo os campos da própria anulação
--   • apagar edição publicada, sempre
--   • alterar ou apagar matéria já publicada
--   • alterar ou apagar qualquer linha do log de auditoria
--
-- Correção de erro se faz por ERRATA ou REPUBLICAÇÃO em edição posterior.
-- Idempotente: pode rodar quantas vezes quiser.
-- ---------------------------------------------------------------------------

-- Campos que a anulação pode tocar numa edição publicada. Anular é um ato
-- administrativo novo, não uma alteração do que circulou: o PDF, o número, as
-- datas e a assinatura continuam intocáveis.
CREATE OR REPLACE FUNCTION diario_edicao_imutavel() RETURNS trigger AS $$
BEGIN
  IF OLD.situacao <> 'publicada' THEN
    RETURN NEW;
  END IF;

  IF NEW.situacao IS DISTINCT FROM OLD.situacao THEN
    RAISE EXCEPTION 'Edição % já foi publicada: a situação não muda mais. Corrija por errata ou republicação.', OLD.numero
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  IF (NEW.numero, NEW.ano, NEW.tipo, NEW.data_disponibilizacao, NEW.data_publicacao_legal,
      NEW.arquivo_pdf, NEW.sha256, NEW.codigo_verificador, NEW.total_paginas,
      NEW.assinatura_signatario, NEW.assinatura_em, NEW.assinatura_emissor)
     IS DISTINCT FROM
     (OLD.numero, OLD.ano, OLD.tipo, OLD.data_disponibilizacao, OLD.data_publicacao_legal,
      OLD.arquivo_pdf, OLD.sha256, OLD.codigo_verificador, OLD.total_paginas,
      OLD.assinatura_signatario, OLD.assinatura_em, OLD.assinatura_emissor)
  THEN
    RAISE EXCEPTION 'Edição % está publicada: número, datas, PDF, hash e assinatura são imutáveis.', OLD.numero
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Escotilha para o ambiente de demonstração, e SÓ para ele. Exige DUAS
-- condições ao mesmo tempo: a linha estar marcada como demonstração E a sessão
-- declarar a intenção com SET LOCAL. Uma edição real nunca satisfaz a primeira,
-- então nenhum comando de limpeza consegue alcançá-la por engano.
CREATE OR REPLACE FUNCTION diario_limpeza_de_demo_autorizada() RETURNS boolean AS $$
BEGIN
  RETURN coalesce(current_setting('diario.limpar_demonstracao', true), '') = 'sim';
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION diario_edicao_sem_exclusao() RETURNS trigger AS $$
BEGIN
  IF coalesce(OLD.demonstracao, false) AND diario_limpeza_de_demo_autorizada() THEN
    RETURN OLD;
  END IF;
  IF OLD.situacao = 'publicada' THEN
    RAISE EXCEPTION 'Edição % foi publicada e não pode ser removida. Se circulou com vício, marque como anulada — ela continua acessível.', OLD.numero
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION diario_materia_imutavel() RETURNS trigger AS $$
BEGIN
  IF OLD.situacao <> 'publicada' THEN
    RETURN NEW;
  END IF;
  IF (NEW.ementa, NEW.corpo, NEW.tipo_ato, NEW.numero_ato, NEW.ano_ato, NEW.slug,
      NEW.edicao, NEW.caderno, NEW.situacao, NEW.pagina_inicial, NEW.pagina_final)
     IS DISTINCT FROM
     (OLD.ementa, OLD.corpo, OLD.tipo_ato, OLD.numero_ato, OLD.ano_ato, OLD.slug,
      OLD.edicao, OLD.caderno, OLD.situacao, OLD.pagina_inicial, OLD.pagina_final)
  THEN
    RAISE EXCEPTION 'Matéria já publicada (%): o texto publicado é imutável. Publique uma errata ou uma republicação.', COALESCE(OLD.numero_ato, OLD.slug)
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION diario_materia_sem_exclusao() RETURNS trigger AS $$
BEGIN
  IF coalesce(OLD.demonstracao, false) AND diario_limpeza_de_demo_autorizada() THEN
    RETURN OLD;
  END IF;
  IF OLD.situacao = 'publicada' THEN
    RAISE EXCEPTION 'Matéria publicada não é removida. Use revogação, errata ou republicação.'
      USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- O log de auditoria só cresce. Uma linha que pode ser editada não é prova.
CREATE OR REPLACE FUNCTION diario_auditoria_so_cresce() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' AND diario_limpeza_de_demo_autorizada() THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'O log de auditoria do Diário Oficial é imutável: só aceita inserção.'
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tg_diario_edicao_imutavel      ON diario_edicoes;
DROP TRIGGER IF EXISTS tg_diario_edicao_sem_exclusao  ON diario_edicoes;
DROP TRIGGER IF EXISTS tg_diario_materia_imutavel     ON diario_materias;
DROP TRIGGER IF EXISTS tg_diario_materia_sem_exclusao ON diario_materias;
DROP TRIGGER IF EXISTS tg_diario_auditoria_update     ON diario_auditoria;
DROP TRIGGER IF EXISTS tg_diario_auditoria_delete     ON diario_auditoria;

CREATE TRIGGER tg_diario_edicao_imutavel      BEFORE UPDATE ON diario_edicoes   FOR EACH ROW EXECUTE FUNCTION diario_edicao_imutavel();
CREATE TRIGGER tg_diario_edicao_sem_exclusao  BEFORE DELETE ON diario_edicoes   FOR EACH ROW EXECUTE FUNCTION diario_edicao_sem_exclusao();
CREATE TRIGGER tg_diario_materia_imutavel     BEFORE UPDATE ON diario_materias  FOR EACH ROW EXECUTE FUNCTION diario_materia_imutavel();
CREATE TRIGGER tg_diario_materia_sem_exclusao BEFORE DELETE ON diario_materias  FOR EACH ROW EXECUTE FUNCTION diario_materia_sem_exclusao();
CREATE TRIGGER tg_diario_auditoria_update     BEFORE UPDATE ON diario_auditoria FOR EACH ROW EXECUTE FUNCTION diario_auditoria_so_cresce();
CREATE TRIGGER tg_diario_auditoria_delete     BEFORE DELETE ON diario_auditoria FOR EACH ROW EXECUTE FUNCTION diario_auditoria_so_cresce();

-- A sequência de edições não pode ter lacuna nem repetição. O UNIQUE já veio
-- do esquema; aqui garantimos que ninguém reaproveita número de edição anulada.
CREATE UNIQUE INDEX IF NOT EXISTS ix_diario_edicoes_numero ON diario_edicoes (numero);

-- Busca: índices que sustentam a listagem e o filtro por período.
CREATE INDEX IF NOT EXISTS ix_diario_edicoes_data     ON diario_edicoes (data_publicacao_legal DESC);
CREATE INDEX IF NOT EXISTS ix_diario_materias_edicao  ON diario_materias (edicao);
CREATE INDEX IF NOT EXISTS ix_diario_materias_slug    ON diario_materias (slug);
CREATE INDEX IF NOT EXISTS ix_diario_materias_ato     ON diario_materias (tipo_ato, numero_ato, ano_ato);
CREATE INDEX IF NOT EXISTS ix_diario_materias_situa   ON diario_materias (situacao);

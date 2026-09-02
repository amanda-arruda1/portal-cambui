#!/usr/bin/env node
/**
 * Indicadores econômicos (IPCA, Selic, CDI, Dólar) — coleção, política e
 * conta de serviço.
 *
 *   DIRECTUS_TOKEN=<token de admin> node infra/directus/indicadores/aplicar.mjs
 *
 * POR QUE UM SINGLETON COM UM CAMPO JSON, E NÃO QUATRO SEÇÕES DE CAMPOS: os
 * quatro indicadores têm o MESMO formato (chave, rótulo, valor, variação,
 * referência, fonte) — são item de uma lista, não quatro entidades diferentes.
 * Um campo por indicador duplicaria essa estrutura quatro vezes e qualquer
 * indicador novo (câmbio do euro, por exemplo) exigiria migração de esquema.
 * `itens` guarda o array pronto para o cartão renderizar; ver o formato
 * exato em apps/web/src/lib/indicadores.ts.
 *
 * POR QUE FICA FORA DO FLUXO EDITORIAL (comStatus: false): não é conteúdo que
 * uma secretaria escreve — é o resultado de uma consulta automática, sem
 * "rascunho" nem "revisão" fazendo sentido aqui. Mesmo modelo de
 * `diario_veiculo` (ver infra/directus/diario/aplicar-esquema.mjs).
 *
 * POR QUE UMA CONTA DE SERVIÇO SEPARADA: o token que ESCREVE aqui roda no
 * portal-indicadores.service (fora do portal-web, que não alcança a
 * internet — ver a nota "Serviço SEPARADO" em
 * infra/directus/licitacoes/aplicar-avisos.mjs, mesmo raciocínio). Só a
 * leitura pública é anônima; a escrita exige este token.
 */
import { abrirApi, aplicarColecoes } from '../aplicador.mjs';

const api = await abrirApi({});

const COLECOES = [
  {
    nome: 'indicadores_economicos',
    comStatus: false,
    meta: {
      icon: 'monitoring',
      singleton: true,
      note: 'IPCA, Selic, CDI e Dólar exibidos na home. Escrito pelo portal-indicadores.service — não editar pelo painel.',
    },
    campos: [
      { campo: 'itens', tipo: 'json', obrigatorio: true,
        nota: 'Array com os 4 indicadores: {chave, rotulo, descricao, valor, unidade, variacao, referencia, fonte}.' },
      { campo: 'atualizado_em', tipo: 'timestamp',
        nota: 'Quando o portal-indicadores.service escreveu com sucesso pela última vez.' },
    ],
  },
];

await aplicarColecoes(api, COLECOES);

/* ---------- política pública: só leitura ---------- */
const NOME_POLITICA_PUBLICA = '$t:public_label';
const politicas = await api('/policies?limit=-1');
const publica = politicas.find((p) => p.name === NOME_POLITICA_PUBLICA);
if (!publica) {
  throw new Error(`Política pública "${NOME_POLITICA_PUBLICA}" não encontrada — conferir no banco desta instalação.`);
}
const permissoesExistentes = await api('/permissions?limit=-1');
const permPublica = {
  collection: 'indicadores_economicos', action: 'read',
  permissions: {}, validation: null, presets: null, fields: 'itens,atualizado_em',
};
const antigaPublica = permissoesExistentes.find(
  (x) => x.policy === publica.id && x.collection === permPublica.collection && x.action === permPublica.action,
);
if (antigaPublica) await api(`/permissions/${antigaPublica.id}`, { method: 'PATCH', body: JSON.stringify({ ...permPublica, policy: publica.id }) });
else await api('/permissions', { method: 'POST', body: JSON.stringify({ ...permPublica, policy: publica.id }) });
console.log('  read   indicadores_economicos  (público)');

/* ---------- política e conta de serviço: só escrita ---------- */
const NOME_POLITICA = 'Serviço — indicadores econômicos';
let politica = politicas.find((p) => p.name === NOME_POLITICA);
const corpoPolitica = {
  name: NOME_POLITICA, icon: 'smart_toy', app_access: false, admin_access: false, enforce_tfa: false,
  description: 'Token do portal-indicadores.service (fora do portal-web — ver ARQUITETURA.md). Só escreve indicadores_economicos.',
};
if (politica) { await api(`/policies/${politica.id}`, { method: 'PATCH', body: JSON.stringify(corpoPolitica) }); console.log(`~ política "${NOME_POLITICA}"`); }
else { politica = await api('/policies', { method: 'POST', body: JSON.stringify(corpoPolitica) }); console.log(`+ política "${NOME_POLITICA}"`); }

const permServico = {
  collection: 'indicadores_economicos', action: 'update',
  permissions: {}, validation: null, presets: null, fields: 'itens,atualizado_em',
};
const antigaServico = permissoesExistentes.find(
  (x) => x.policy === politica.id && x.collection === permServico.collection && x.action === permServico.action,
);
if (antigaServico) await api(`/permissions/${antigaServico.id}`, { method: 'PATCH', body: JSON.stringify({ ...permServico, policy: politica.id }) });
else await api('/permissions', { method: 'POST', body: JSON.stringify({ ...permServico, policy: politica.id }) });
console.log('  update indicadores_economicos  (serviço)');

/* Singleton nasce sem linha — sem UPDATE que valha, a primeira escrita do
   serviço precisa de CREATE também, uma única vez. */
const permServicoCreate = { ...permServico, action: 'create' };
const antigaCreate = permissoesExistentes.find(
  (x) => x.policy === politica.id && x.collection === permServicoCreate.collection && x.action === 'create',
);
if (antigaCreate) await api(`/permissions/${antigaCreate.id}`, { method: 'PATCH', body: JSON.stringify({ ...permServicoCreate, policy: politica.id }) });
else await api('/permissions', { method: 'POST', body: JSON.stringify({ ...permServicoCreate, policy: politica.id }) });
console.log('  create indicadores_economicos  (serviço, só a primeira escrita)');

/* Conta de serviço com token estático — mesmo padrão de
   infra/directus/licitacoes/aplicar-avisos.mjs. O Directus mascara o token na
   leitura, então rodar de novo ROTACIONA a credencial — comportamento
   desejado, não efeito colateral. */
const EMAIL_SERVICO = 'servico-indicadores@prefeituradecambui.mg.gov.br';
const novoToken = 'indicadores_' + [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
const usuarios = await api(`/users?limit=-1&fields=id,email&filter[email][_eq]=${encodeURIComponent(EMAIL_SERVICO)}`);
let usuario = usuarios[0];
if (!usuario) {
  usuario = await api('/users', { method: 'POST', body: JSON.stringify({
    email: EMAIL_SERVICO, first_name: 'Serviço', last_name: 'Indicadores econômicos', status: 'active', token: novoToken,
  }) });
  await api('/access', { method: 'POST', body: JSON.stringify({ user: usuario.id, policy: politica.id }) });
  console.log('+ usuário de serviço criado');
} else {
  await api(`/users/${usuario.id}`, { method: 'PATCH', body: JSON.stringify({ token: novoToken, status: 'active' }) });
  const acessos = await api(`/access?limit=-1&filter[user][_eq]=${usuario.id}`);
  if (!acessos.some((a) => a.policy === politica.id)) {
    await api('/access', { method: 'POST', body: JSON.stringify({ user: usuario.id, policy: politica.id }) });
  }
  console.log('~ usuário de serviço já existia — token ROTACIONADO');
}

console.log(`
  Token para /opt/portal-cambui/.env (lido pelo portal-indicadores.service,
  o único processo que sai para a internet — portal-web continua com
  IPAddressDeny=any, sem exceção):

    INDICADORES_TOKEN=${novoToken}

  PASSO MANUAL OBRIGATÓRIO (a API do Directus não cria o campo 'json' já como
  jsonb — ver a nota em infra/directus/aplicador.mjs): sem isto, PATCH com o
  token de serviço acima falha com 500 "could not identify an ordering
  operator for type json".

    docker exec -i portal-postgres psql -U portal_cambui -d portal_cambui -c \\
      "ALTER TABLE indicadores_economicos ALTER COLUMN itens TYPE jsonb USING itens::jsonb;"
`);

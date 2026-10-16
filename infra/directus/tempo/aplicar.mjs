#!/usr/bin/env node
/**
 * Previsão do tempo de Cambuí — coleção, política e conta de serviço.
 *
 *   DIRECTUS_TOKEN=<token de admin> node infra/directus/tempo/aplicar.mjs
 *
 * Mesmo raciocínio de infra/directus/indicadores/aplicar.mjs, ponto por
 * ponto — só a fonte muda (Open-Meteo em vez de BCB/AwesomeAPI):
 *
 *   - singleton, comStatus: false — não é conteúdo editorial, é o resultado
 *     de uma consulta automática;
 *   - campos ESCALARES (decimal/integer/timestamp), não um `itens: json` —
 *     é UMA leitura atual, não uma lista, então nem se aplica a pegadinha do
 *     tipo 'json'/jsonb já paga em indicadores_economicos (ver a nota em
 *     infra/directus/aplicador.mjs);
 *   - conta de serviço separada, token só de escrita nesta coleção — quem
 *     grava é o portal-tempo.service (fora do portal-web, que não alcança a
 *     internet).
 */
import { abrirApi, aplicarColecoes } from '../aplicador.mjs';

const api = await abrirApi({});

const COLECOES = [
  {
    nome: 'previsao_tempo',
    comStatus: false,
    meta: {
      icon: 'partly_cloudy_day',
      singleton: true,
      note: 'Previsão atual de Cambuí/MG, exibida na faixa do brasão. Escrito pelo portal-tempo.service (Open-Meteo) — não editar pelo painel.',
    },
    campos: [
      { campo: 'temperatura', tipo: 'decimal', obrigatorio: true, nota: 'Temperatura atual, °C.' },
      { campo: 'sensacao_termica', tipo: 'decimal', nota: 'Sensação térmica, °C.' },
      { campo: 'codigo_tempo', tipo: 'integer', obrigatorio: true, nota: 'Código WMO de condição do tempo (open-meteo.com/en/docs — WMO Weather interpretation codes).' },
      { campo: 'umidade', tipo: 'integer', nota: 'Umidade relativa do ar, %.' },
      { campo: 'vento_kmh', tipo: 'decimal', nota: 'Velocidade do vento, km/h.' },
      { campo: 'atualizado_em', tipo: 'timestamp', nota: 'Quando o portal-tempo.service escreveu com sucesso pela última vez.' },
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
const CAMPOS_PUBLICOS = 'temperatura,sensacao_termica,codigo_tempo,umidade,vento_kmh,atualizado_em';
const permissoesExistentes = await api('/permissions?limit=-1');
const permPublica = {
  collection: 'previsao_tempo', action: 'read',
  permissions: {}, validation: null, presets: null, fields: CAMPOS_PUBLICOS,
};
const antigaPublica = permissoesExistentes.find(
  (x) => x.policy === publica.id && x.collection === permPublica.collection && x.action === permPublica.action,
);
if (antigaPublica) await api(`/permissions/${antigaPublica.id}`, { method: 'PATCH', body: JSON.stringify({ ...permPublica, policy: publica.id }) });
else await api('/permissions', { method: 'POST', body: JSON.stringify({ ...permPublica, policy: publica.id }) });
console.log('  read   previsao_tempo  (público)');

/* ---------- política e conta de serviço: só escrita ---------- */
const NOME_POLITICA = 'Serviço — previsão do tempo';
let politica = politicas.find((p) => p.name === NOME_POLITICA);
const corpoPolitica = {
  name: NOME_POLITICA, icon: 'smart_toy', app_access: false, admin_access: false, enforce_tfa: false,
  description: 'Token do portal-tempo.service (fora do portal-web — ver ARQUITETURA.md). Só escreve previsao_tempo.',
};
if (politica) { await api(`/policies/${politica.id}`, { method: 'PATCH', body: JSON.stringify(corpoPolitica) }); console.log(`~ política "${NOME_POLITICA}"`); }
else { politica = await api('/policies', { method: 'POST', body: JSON.stringify(corpoPolitica) }); console.log(`+ política "${NOME_POLITICA}"`); }

for (const acao of ['update', 'create']) {
  const perm = { collection: 'previsao_tempo', action: acao, permissions: {}, validation: null, presets: null, fields: CAMPOS_PUBLICOS };
  const antiga = permissoesExistentes.find((x) => x.policy === politica.id && x.collection === perm.collection && x.action === acao);
  if (antiga) await api(`/permissions/${antiga.id}`, { method: 'PATCH', body: JSON.stringify({ ...perm, policy: politica.id }) });
  else await api('/permissions', { method: 'POST', body: JSON.stringify({ ...perm, policy: politica.id }) });
  console.log(`  ${acao === 'update' ? 'update' : 'create'} previsao_tempo  (serviço${acao === 'create' ? ', só a primeira escrita' : ''})`);
}

/* Conta de serviço com token estático — mesmo padrão de
   infra/directus/indicadores/aplicar.mjs. Rodar de novo ROTACIONA a
   credencial (o Directus mascara o token na leitura). */
const EMAIL_SERVICO = 'servico-tempo@prefeituradecambui.mg.gov.br';
const novoToken = 'tempo_' + [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(16).padStart(2, '0')).join('');
const usuarios = await api(`/users?limit=-1&fields=id,email&filter[email][_eq]=${encodeURIComponent(EMAIL_SERVICO)}`);
let usuario = usuarios[0];
if (!usuario) {
  usuario = await api('/users', { method: 'POST', body: JSON.stringify({
    email: EMAIL_SERVICO, first_name: 'Serviço', last_name: 'Previsão do tempo', status: 'active', token: novoToken,
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
  Token para /opt/portal-cambui/.env (lido pelo portal-tempo.service, o
  único processo que sai para a internet para consultar a Open-Meteo — o
  portal-web continua com IPAddressDeny=any, sem exceção):

    TEMPO_TOKEN=${novoToken}

  Campos são todos escalares (decimal/integer/timestamp) — SEM a pegadinha
  do tipo 'json'/jsonb já paga em indicadores_economicos, então não há passo
  manual de ALTER TABLE aqui.
`);

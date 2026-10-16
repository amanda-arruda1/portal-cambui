/**
 * Carrega nos 4 Globals os valores que o site tinha FIXOS no código (apps/web/src/dados/), sem mudar nada do que aparece no ar.
 * Só preenche Global ainda VAZIO (sem `tituloSite`/`menuPrincipal`/…); com `--forcar` sobrescreve.
 * Uso: npx payload run scripts/semear-globais.ts [--forcar]
 */
import { getPayload } from 'payload'
import config from '../src/payload.config'
import { AUTARQUIAS, CNPJ, COLUNAS_RODAPE, EMAIL_CONTATO, ENDERECO, HORARIO_ATENDIMENTO, LINKS_EXTERNOS, MENU_PRINCIPAL, MUNICIPIO, REDES_SOCIAIS, SITE, TELEFONES } from '../../apps/web/src/dados/instituicional'
import { A_CIDADE, TAREFAS } from '../../apps/web/src/dados/cidade'

const forcar = process.argv.includes('--forcar')
const payload = await getPayload({ config })

const grava = async (slug: 'configuracoes-portal' | 'navegacao' | 'links-externos' | 'pagina-inicial', marca: string, data: Record<string, unknown>) => {
  const atual = (await payload.findGlobal({ slug, overrideAccess: true, depth: 0 })) as unknown as Record<string, unknown>
  const marcaAtual = atual[marca]
  const vazio = !marcaAtual || (Array.isArray(marcaAtual) && marcaAtual.length === 0) || (typeof marcaAtual === 'object' && !Array.isArray(marcaAtual) && !Object.values(marcaAtual as object).some(Boolean))
  if (!forcar && !vazio) {
    console.log(`= ${slug}: já preenchido, mantido (use --forcar para sobrescrever)`)
    return
  }
  await payload.updateGlobal({ slug, overrideAccess: true, data: data as never, context: { semAuditoria: true } })
  console.log(`+ ${slug}: carregado`)
}

await grava('configuracoes-portal', 'tituloSite', {
  tituloSite: SITE.titulo,
  descricaoSite: SITE.descricao,
  nomeMunicipio: MUNICIPIO.nome,
  uf: MUNICIPIO.uf,
  nomeCompleto: MUNICIPIO.nomeCompleto,
  gentilico: MUNICIPIO.gentilico,
  cnpj: CNPJ ?? undefined,
  endereco: ENDERECO ?? undefined,
  telefones: TELEFONES,
  emailContato: EMAIL_CONTATO ?? undefined,
  horarioAtendimento: HORARIO_ATENDIMENTO ?? undefined,
  redesSociais: REDES_SOCIAIS,
  autarquias: AUTARQUIAS,
})
await grava('navegacao', 'menuPrincipal', { menuPrincipal: MENU_PRINCIPAL, colunasRodape: COLUNAS_RODAPE })
await grava('links-externos', 'ouvidoria', LINKS_EXTERNOS)
await grava('pagina-inicial', 'tarefas', {
  heroi: { selo: 'Serra da Mantiqueira', titulo: 'Cambuí\nresolve o seu dia.', subtitulo: 'Trate com a Prefeitura sem fila e sem adivinhar em qual secretaria bater.' },
  // A Ouvidoria vira referência ao link nomeado (a URL deixa de se repetir).
  tarefas: TAREFAS.map((t) => ({ ...t, destino: t.destino === LINKS_EXTERNOS.ouvidoria.url ? '@ouvidoria' : t.destino === LINKS_EXTERNOS.iptu.url ? '@iptu' : t.destino === LINKS_EXTERNOS.licenciamento.url ? '@licenciamento' : t.destino })),
  cidade: { chamada: A_CIDADE.chamada, texto: A_CIDADE.texto, portalTuristico: A_CIDADE.portalTuristico },
})
process.exit(0)

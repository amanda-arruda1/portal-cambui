import type { Field, GlobalConfig } from 'payload'
import { global } from './_base'

const link = (name: string, label: string, ajuda?: string): Field => ({
  name,
  label,
  type: 'group',
  admin: ajuda ? { description: ajuda } : undefined,
  fields: [
    { name: 'url', label: 'Endereço (URL)', type: 'text', admin: { description: 'Em branco = o link não aparece em lugar nenhum do site.' } },
    { name: 'rotulo', label: 'Nome exibido', type: 'text' },
    { name: 'descricao', label: 'Descrição curta', type: 'text' },
  ],
})

/** Cada sistema de terceiro fica num lugar só; o site usa o mesmo link em todas as páginas que o citam (ex.: a Ouvidoria aparecia em 6 pontos). */
export const LinksExternos: GlobalConfig = global({
  slug: 'links-externos',
  label: 'Links externos',
  fields: [
    link('ouvidoria', 'Ouvidoria e e-SIC (e-Ouve)'),
    link('transparencia', 'Portal da Transparência (SGP Cloud)'),
    link('diarioAmm', 'Diário Oficial na AMM-MG', 'Botão do Diário Oficial externo. Aparece em Serviços; não fica mais dentro de Transparência.'),
    link('legislacao', 'Legislação municipal'),
    link('pncp', 'Contratações públicas (PNCP)'),
    link('tce', 'Fiscalizando com o TCE'),
    link('iptu', 'Tributos e IPTU (SGP Cloud)'),
    link('licenciamento', 'Licenciamento: empresa, alvará, habite-se (Aprova)'),
    link('atendeCidadao', 'Atende Cidadão'),
    link('nfse', 'Nota fiscal de serviço (NFS-e)'),
    link('protocolo', 'Acompanhar protocolo'),
    link('portalTuristico', 'Portal turístico'),
    link('ponto', 'Ponto eletrônico (Área do Servidor)'),
    link('holerite', 'Holerite eletrônico (Área do Servidor)'),
    link('webmail', 'Webmail (Área do Servidor)'),
  ],
})

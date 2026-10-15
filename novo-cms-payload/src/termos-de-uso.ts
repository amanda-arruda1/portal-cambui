/**
 * Termo de uso do painel — texto e versão. Aumentar TERMOS_VERSAO obriga todos a aceitar de novo no próximo acesso.
 * RASCUNHO: o texto precisa de revisão do jurídico/encarregado de dados (LGPD) da Prefeitura antes de valer como termo definitivo.
 */
export const TERMOS_VERSAO = '2026-10-15'

export const TERMOS_TITULO = 'Termo de uso do painel do Portal Cambuí'

export const TERMOS_TEXTO: { titulo: string; texto: string }[] = [
  { titulo: '1. Uso institucional', texto: 'O painel é uma ferramenta de trabalho da Prefeitura Municipal de Cambuí. Use-o somente para publicar e manter informações públicas do Município, dentro dos módulos liberados para o seu perfil.' },
  { titulo: '2. Conta pessoal e senha', texto: 'Sua conta é individual e intransferível. Não compartilhe a senha nem deixe a sessão aberta em computador de uso comum. Você responde pelas ações feitas com a sua conta. Suspeita de acesso indevido deve ser comunicada de imediato à administração do portal.' },
  { titulo: '3. Publicação e aprovação', texto: 'O conteúdo segue o fluxo de aprovação: o autor salva como rascunho ou envia para revisão; publicar e arquivar é do revisor ou do administrador. Não publique informação sem fundamento, sigilosa ou que contenha dados pessoais desnecessários.' },
  { titulo: '4. Dados pessoais (LGPD)', texto: 'Documentos publicados são públicos. Antes de enviar um arquivo, confira se ele traz dados pessoais (CPF, endereço, telefone, dados de saúde) que não devam ser divulgados, conforme a Lei nº 13.709/2018 (LGPD) e a Lei de Acesso à Informação.' },
  { titulo: '5. Registro de acessos e ações', texto: 'Para segurança e prestação de contas, o sistema registra o seu e-mail, o endereço IP e a data do último acesso, o aceite deste termo e as alterações feitas no conteúdo (quem, o quê e quando). Esses registros são usados apenas para auditoria e segurança.' },
  { titulo: '6. Arquivos enviados', texto: 'Só são aceitos os tipos de arquivo permitidos pelo painel, que são verificados contra arquivos maliciosos. É proibido enviar conteúdo ilícito, ofensivo ou que viole direitos autorais.' },
  { titulo: '7. Descumprimento', texto: 'O uso em desacordo com este termo pode levar à suspensão do acesso e à apuração de responsabilidade administrativa, civil e penal, nos termos da lei.' },
]

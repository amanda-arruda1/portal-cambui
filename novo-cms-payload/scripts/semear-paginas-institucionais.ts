/**
 * Leva para a coleção Páginas os textos longos que estavam FIXOS nos modelos do site (acessibilidade, privacidade, transparência).
 * O texto é o MESMO que estava no ar; a única troca é <kbd> → <code> (o editor não tem tecla de teclado).
 * Idempotente: pula slug que já existe (não sobrescreve edição feita no painel). Uso: npx payload run scripts/semear-paginas-institucionais.ts
 */
import { JSDOM } from 'jsdom'
import { getPayload } from 'payload'
import { convertHTMLToLexical, editorConfigFactory } from '@payloadcms/richtext-lexical'
import config from '../src/payload.config'
import { LINKS_EXTERNOS } from '../../apps/web/src/dados/instituicional'

const editorConfig = await editorConfigFactory.default({ config: await config })
const paraLexical = (html: string) => convertHTMLToLexical({ editorConfig, html, JSDOM: JSDOM as any })
const OUVIDORIA = LINKS_EXTERNOS.ouvidoria.url

const PAGINAS: Array<{ slug: string; titulo: string; html: string }> = [
  {
    slug: 'acessibilidade',
    titulo: 'Acessibilidade',
    html: `<p>Este portal é desenvolvido seguindo as diretrizes de acessibilidade da WCAG 2.1 nível AA e o Modelo de Acessibilidade em Governo Eletrônico (eMAG), em atendimento à Lei nº 13.146/2015 (Estatuto da Pessoa com Deficiência).</p>
<h2>Recursos disponíveis</h2>
<ul>
<li>Navegação completa por teclado, com indicador de foco sempre visível.</li>
<li>Link “Pular para o conteúdo principal” como primeiro item de cada página.</li>
<li>Estrutura de títulos hierárquica e marcos de página para leitores de tela.</li>
<li>Textos alternativos nas imagens informativas.</li>
<li>Contraste mínimo de 4,5:1 entre texto e fundo.</li>
<li>Menu que funciona mesmo com o JavaScript desativado.</li>
<li>Respeito à preferência de “reduzir movimento” do sistema operacional.</li>
</ul>
<h2>Atalhos do navegador</h2>
<p>O aumento e a redução de fonte são feitos pelos atalhos do próprio navegador: <code>Ctrl</code> + <code>+</code> para aumentar, <code>Ctrl</code> + <code>−</code> para reduzir e <code>Ctrl</code> + <code>0</code> para voltar ao tamanho original. Em computadores Apple, use <code>Cmd</code> no lugar do <code>Ctrl</code>.</p>
<h2>Encontrou uma barreira?</h2>
<p>Se alguma página deste portal impediu você de obter uma informação, queremos saber. O relato pode ser feito pelos canais de <a href="/contato">contato</a> da prefeitura, e a correção é tratada como manutenção do portal.</p>`,
  },
  {
    slug: 'privacidade-essencial',
    titulo: 'Privacidade — o essencial, em três frases',
    html: `<p>Este portal <strong>não pede cadastro</strong> para nada que o cidadão vá fazer nele, e <strong>não usa cookies de publicidade nem de rastreamento</strong>.</p>
<p>O único cookie que gravamos é de <strong>sessão</strong>, e só para quem entra no painel de conteúdo das secretarias — servidores da Prefeitura. Ele guarda apenas um identificador aleatório, expira ao sair e não acompanha navegação.</p>
<p>Vários serviços do município acontecem em <strong>sistemas de terceiros</strong> (tributos, ouvidoria, licenciamento, transparência). Quando você sai daqui para um deles, passa a valer a política daquele sistema — e nós avisamos, em texto, sempre que um link leva para fora.</p>`,
  },
  {
    slug: 'privacidade-registros',
    titulo: 'Privacidade — o que é registrado',
    html: `<h2>Registros de acesso</h2>
<p>O servidor do portal guarda registros técnicos de acesso — endereço IP, data, hora, página pedida e navegador. São necessários para operar o serviço com segurança e identificar ataques, e é a base legal do cumprimento de obrigação e do exercício regular de direitos. Não são usados para traçar perfil de ninguém.</p>
<h2>Formulários</h2>
<p>A busca do portal não guarda o que você digita associado a você. Manifestações de ouvidoria e pedidos de informação são feitos no sistema próprio do município (e-Ouve), com política e prazos próprios.</p>
<h2>Ferramenta de acessibilidade</h2>
<p>O <strong>VLibras</strong>, tradutor oficial para Libras do Governo Federal, é carregado a partir de <code>vlibras.gov.br</code>. Ao usá-lo, seu navegador se comunica com aquele serviço, sob a política do gov.br.</p>
<h2>Suas preferências</h2>
<p>Tamanho de texto e alto contraste ficam guardados no seu próprio navegador (<code>localStorage</code>) e nunca são enviados ao servidor. Limpar os dados do site apaga essas escolhas.</p>`,
  },
  {
    slug: 'privacidade-direitos',
    titulo: 'Privacidade — seus direitos',
    html: `<p>A Lei Geral de Proteção de Dados garante a você, entre outros direitos:</p>
<ul>
<li>saber se tratamos dados seus e quais são;</li>
<li>pedir correção de dado incompleto ou desatualizado;</li>
<li>pedir anonimização, bloqueio ou eliminação de dado desnecessário;</li>
<li>saber com quem compartilhamos;</li>
<li>revogar consentimento.</li>
</ul>
<p>Para exercer qualquer um deles, procure a Prefeitura pelos canais abaixo ou registre um pedido na <a href="${OUVIDORIA}">Ouvidoria / e-SIC</a>, que tem prazo legal de resposta.</p>
<h2>Encarregado pelo tratamento de dados</h2>
<p><strong>TODO(cliente):</strong> a LGPD exige a indicação pública de um encarregado (DPO), com nome e canal de contato. Assim que a Prefeitura designar, o dado entra aqui.</p>`,
  },
  {
    slug: 'transparencia-esic',
    titulo: 'Transparência — e-SIC: a Prefeitura tem prazo para responder',
    html: `<p>Qualquer pessoa pode pedir informação a um órgão público, sem justificar o motivo, e receber resposta em até <strong>20 dias</strong>, prorrogáveis por mais 10 — é o que diz a Lei 12.527/2011. O pedido é registrado no sistema de ouvidoria do município, que gera um número de protocolo para você acompanhar.</p>`,
  },
  {
    slug: 'transparencia-por-que-links',
    titulo: 'Transparência — por que os links saem do portal',
    html: `<p>A Transparência do município é mantida em sistema contábil homologado, com dado que sai direto da execução orçamentária. Republicar esses números aqui criaria uma segunda versão da verdade, sujeita a ficar desatualizada — e um portal de prefeitura com dois valores diferentes para a mesma despesa é pior do que um portal sem a informação.</p>`,
  },
]

const payload = await getPayload({ config })
let criadas = 0
for (const p of PAGINAS) {
  const ja = await payload.find({ collection: 'paginas', where: { slug: { equals: p.slug } }, limit: 1, overrideAccess: true, depth: 0 })
  if (ja.docs[0]) { console.log(`= ${p.slug}: já existe, mantida`); continue }
  await payload.create({
    collection: 'paginas',
    overrideAccess: true,
    context: { semAuditoria: true },
    data: { titulo: p.titulo, slug: p.slug, conteudo: paraLexical(p.html) as never, status: 'publicado' },
  })
  console.log(`+ ${p.slug}`)
  criadas++
}
console.log(`${criadas} página(s) criada(s)`)
process.exit(0)

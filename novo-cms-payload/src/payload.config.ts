import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { pt } from '@payloadcms/translations/languages/pt'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { AuditLogs } from './collections/AuditLogs'
import { ColetaLixo } from './collections/ColetaLixo'
import { ConselhosMunicipais } from './collections/ConselhosMunicipais'
import { Documentos } from './collections/Documentos'
import { LicitacaoAnexos } from './collections/LicitacaoAnexos'
import { LicitacaoAssinantes } from './collections/LicitacaoAssinantes'
import { LicitacaoEnvios } from './collections/LicitacaoEnvios'
import { LicitacaoEventos } from './collections/LicitacaoEventos'
import { LicitacaoLotes } from './collections/LicitacaoLotes'
import { Licitacoes } from './collections/Licitacoes'
import { LinksUteis } from './collections/LinksUteis'
import { Media } from './collections/Media'
import { Noticias } from './collections/Noticias'
import { ObraAnexos } from './collections/ObraAnexos'
import { ObraMedicoes } from './collections/ObraMedicoes'
import { Obras } from './collections/Obras'
import { Paginas } from './collections/Paginas'
import { PatrimonioCultural } from './collections/PatrimonioCultural'
import { PerguntasFrequentes } from './collections/PerguntasFrequentes'
import { Secretarias } from './collections/Secretarias'
import { Selos } from './collections/Selos'
import { Servicos } from './collections/Servicos'
import { TelefonesUteis } from './collections/TelefonesUteis'
import { Users } from './collections/Users'
import { Pastas } from './collections/Pastas'
import { FotosPerfil } from './collections/FotosPerfil'
import { ContasServico } from './collections/ContasServico'
import { comAuditoria } from './hooks-auditoria'
import { comPolitica } from './politica'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/* Origens (esquema + domínio) de onde o painel é acessado, separadas por vírgula. O túnel SSH (localhost) sempre vale.
 * SEM lista, o Payload aceita requisição autenticada por cookie de QUALQUER origem (sem proteção contra CSRF).
 * Ex.: PAYLOAD_ORIGENS_PERMITIDAS=https://cms.exemplo.mg.gov.br */
const origensPermitidas = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  ...(process.env.PAYLOAD_ORIGENS_PERMITIDAS ?? '').split(',').map((o) => o.trim()).filter(Boolean),
]

export default buildConfig({
  csrf: origensPermitidas,
  admin: {
    user: Users.slug,
    meta: { titleSuffix: ' — Portal Cambuí' },
    importMap: { baseDir: path.resolve(dirname) },
    // Controle de tamanho da fonte (A- / A / A+) no cabeçalho do painel.
    components: {
      actions: ['/components/AccessibilityControls#AccessibilityControls'],
      // Tela de aceite do termo de uso (bloqueia o painel até aceitar a versão atual).
      providers: ['/components/TermosDeUso#TermosProvider'],
      // Página inicial: boas-vindas, atalhos, métricas e, abaixo, a listagem padrão das coleções.
      views: { dashboard: { Component: '/components/CustomDashboard#default' } },
    },
  },
  // Idioma do painel: a Payload só traz `pt` (sem variante pt-BR separada).
  i18n: { supportedLanguages: { pt }, fallbackLanguage: 'pt' },
  collections: [
    Secretarias, Noticias, Servicos, Documentos, Paginas, LinksUteis, Selos, PerguntasFrequentes,
    PatrimonioCultural, TelefonesUteis, ColetaLixo, ConselhosMunicipais,
    Licitacoes, LicitacaoAnexos, LicitacaoLotes, LicitacaoEventos, LicitacaoAssinantes, LicitacaoEnvios,
    Obras, ObraAnexos, ObraMedicoes,
    Pastas, Media, FotosPerfil, Users, ContasServico, AuditLogs,
  ].map(comPolitica).map(comAuditoria),
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL || '' },
    // O esquema só muda por MIGRATION (npm run payload -- migrate:create <nome>, revisar, depois migrate).
    // O push automático do Payload alterava o banco sem deixar histórico e não reconstruía o esquema.
    push: false,
    migrationDir: path.resolve(dirname, 'migrations'),
  }),
  sharp,
  plugins: [],
})

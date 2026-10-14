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
import { comAuditoria } from './hooks-auditoria'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    meta: { titleSuffix: ' — Portal Cambuí' },
    importMap: { baseDir: path.resolve(dirname) },
  },
  // Idioma do painel: a Payload só traz `pt` (sem variante pt-BR separada).
  i18n: { supportedLanguages: { pt }, fallbackLanguage: 'pt' },
  collections: [
    Secretarias, Noticias, Servicos, Documentos, Paginas, LinksUteis, Selos, PerguntasFrequentes,
    PatrimonioCultural, TelefonesUteis, ColetaLixo, ConselhosMunicipais,
    Licitacoes, LicitacaoAnexos, LicitacaoLotes, LicitacaoEventos, LicitacaoAssinantes,
    Obras, ObraAnexos, ObraMedicoes,
    Media, Users, AuditLogs,
  ].map(comAuditoria),
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: { outputFile: path.resolve(dirname, 'payload-types.ts') },
  db: postgresAdapter({
    pool: { connectionString: process.env.DATABASE_URL || '' },
    // push automático só em dev; a migração roda com o schema já criado
  }),
  sharp,
  plugins: [],
})

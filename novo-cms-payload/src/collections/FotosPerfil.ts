import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { CollectionConfig } from 'payload'
import { inspecionarUpload } from '../upload/inspecionar'

/**
 * Fotos de perfil dos usuários do painel. Coleção própria (e não `media`) por dois motivos: foto de PESSOA não é conteúdo
 * público do portal — só quem tem conta no painel enxerga — e não deve se misturar às pastas de arquivos institucionais.
 * Passa pela mesma política de upload (assinatura real do arquivo) e pelo antivírus em lote.
 */
const logado = ({ req: { user } }: { req: { user?: { collection?: string } | null } }) => Boolean(user && user.collection === 'users')

const pasta = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../media/perfil') // subpasta de media/: já é a única com escrita liberada ao serviço e varrida pelo antivírus

export const FotosPerfil: CollectionConfig = {
  slug: 'fotos-perfil',
  labels: { singular: 'Foto de perfil', plural: 'Fotos de perfil' },
  admin: { hidden: true, group: 'Sistema' },
  // Trocar a foto = enviar outra (a anterior fica no disco; apagar é decisão de quem administra o servidor, como no resto do sistema).
  access: { read: logado, create: logado, update: () => false, delete: () => false },
  upload: {
    staticDir: pasta,
    mimeTypes: ['image/png', 'image/jpeg', 'image/webp'],
    imageSizes: [{ name: 'avatar', width: 160, height: 160, position: 'centre' }],
    adminThumbnail: 'avatar',
  },
  hooks: { beforeOperation: [inspecionarUpload] },
  fields: [{ name: 'alt', label: 'Descrição da foto', type: 'text' }],
}

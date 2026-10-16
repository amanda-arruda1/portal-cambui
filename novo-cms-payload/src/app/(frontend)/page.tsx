import { redirect } from 'next/navigation'

/** Não há site público neste app: a raiz do prefixo (/cms) leva direto ao painel. */
export default function HomePage() {
  redirect('/admin')
}

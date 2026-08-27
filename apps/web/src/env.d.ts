/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /** Preenchida pelo middleware em todas as rotas de /painel autenticadas. */
    sessao?: import('./lib/painel/sessao.ts').Sessao;
  }
}

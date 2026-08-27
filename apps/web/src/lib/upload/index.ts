/**
 * Inspeção de um arquivo enviado por uma secretaria.
 *
 * Ordem deliberada, do mais barato para o mais caro:
 *   1. tamanho          — descarta sem olhar o conteúdo
 *   2. nome/extensão    — descarta sem olhar o conteúdo
 *   3. assinatura       — lê alguns bytes
 *   4. coerência        — o conteúdo é mesmo o que a extensão promete?
 *   5. risco no formato — JavaScript em PDF, fórmula em CSV
 *   6. ClamAV           — o passo caro, só no que sobreviveu
 *
 * O motivo devolvido é escrito para uma pessoa da secretaria ler na tela, não
 * para o log: nada de código de erro, nada de jargão.
 */

import {
  TAMANHO_MINIMO,
  extensaoDe,
  sanitizarNome,
  tipoPorExtensao,
  tipoPorFormato,
  TIPOS_ACEITOS,
} from './politica.ts';
import { detectarFormato, riscoNoCsv, riscoNoPdf } from './assinatura.ts';
import { varrer } from './clamav.ts';
import { createHash } from 'node:crypto';

export interface Aprovado {
  aceito: true;
  nome: string;
  formato: string;
  tamanho: number;
  /** SHA-256 do conteúdo, para registrar no log de auditoria do envio. */
  digestao: string;
}

export interface Recusado {
  aceito: false;
  /** Frase pronta para mostrar a quem enviou. */
  motivo: string;
  /** Onde parou — usado só no log, para medir qual barreira está pegando. */
  etapa: 'tamanho' | 'extensao' | 'assinatura' | 'coerencia' | 'risco' | 'antivirus' | 'antivirus_indisponivel';
  /** Só quando o ClamAV acusou: nome da assinatura, para o log. */
  assinatura?: string;
}

export type Resultado = Aprovado | Recusado;

const listaAmigavel = (): string =>
  TIPOS_ACEITOS.map((t) => t.extensoes.join('/')).join(', ');

export async function inspecionar(
  dados: Uint8Array,
  nomeBruto: string,
  mimeDeclarado?: string,
): Promise<Resultado> {
  const nome = sanitizarNome(nomeBruto);
  const extensao = extensaoDe(nome);

  // 1. tamanho
  if (dados.length < TAMANHO_MINIMO) {
    return { aceito: false, etapa: 'tamanho', motivo: 'O arquivo chegou vazio. Verifique se o envio foi concluído e tente de novo.' };
  }

  // 2. extensão
  if (!extensao) {
    return { aceito: false, etapa: 'extensao', motivo: `O arquivo precisa ter extensão. Aceitamos: ${listaAmigavel()}.` };
  }
  const tipo = tipoPorExtensao(extensao);
  if (!tipo) {
    return { aceito: false, etapa: 'extensao', motivo: `Arquivos "${extensao}" não são aceitos. Aceitamos: ${listaAmigavel()}.` };
  }
  if (dados.length > tipo.tamanhoMaximo) {
    const teto = Math.round(tipo.tamanhoMaximo / (1024 * 1024));
    return { aceito: false, etapa: 'tamanho', motivo: `O limite para ${tipo.rotulo} é ${teto} MB e este arquivo tem ${(dados.length / (1024 * 1024)).toFixed(1)} MB.` };
  }

  // 3. assinatura
  const { formato, perigo } = detectarFormato(dados, extensao);
  if (perigo) {
    return { aceito: false, etapa: 'assinatura', motivo: `O conteúdo deste arquivo é ${perigo}, não ${tipo.rotulo}. Envio recusado.` };
  }
  if (!formato) {
    return { aceito: false, etapa: 'assinatura', motivo: `Não foi possível reconhecer o conteúdo como ${tipo.rotulo}. O arquivo pode estar corrompido ou ter sido renomeado.` };
  }

  // 4. coerência entre o que o nome promete e o que o conteúdo é
  if (!tipo.extensoes.includes(extensao) || formato !== tipo.formato) {
    const real = tipoPorFormato(formato);
    const descricao = real ? real.rotulo : `um arquivo do tipo "${formato}"`;
    return { aceito: false, etapa: 'coerencia', motivo: `A extensão diz ${tipo.rotulo}, mas o conteúdo é ${descricao}. Renomeie o arquivo com a extensão correta e envie de novo.` };
  }
  // O MIME do navegador não decide nada, mas divergir dele com o conteúdo já
  // conferido é sinal de envio montado à mão — vale recusar.
  if (mimeDeclarado) {
    const limpo = mimeDeclarado.split(';')[0].trim().toLowerCase();
    if (limpo && limpo !== 'application/octet-stream' && !tipo.mimes.includes(limpo)) {
      return { aceito: false, etapa: 'coerencia', motivo: `O tipo declarado pelo navegador ("${limpo}") não corresponde a ${tipo.rotulo}.` };
    }
  }

  // 5. risco dentro do próprio formato
  if (formato === 'pdf') {
    const risco = riscoNoPdf(dados);
    if (risco) {
      return { aceito: false, etapa: 'risco', motivo: `Este PDF ${risco}. Gere o documento novamente a partir do texto original (Salvar como PDF) e envie a nova versão.` };
    }
  }
  if (formato === 'csv') {
    const risco = riscoNoCsv(dados);
    if (risco) {
      return { aceito: false, etapa: 'risco', motivo: `Planilhas abrem fórmulas automaticamente: ${risco}. Remova o sinal de igual do início do campo e envie de novo.` };
    }
  }

  // 6. antivírus
  const veredito = await varrer(dados);
  if (veredito.estado === 'infectado') {
    return { aceito: false, etapa: 'antivirus', assinatura: veredito.assinatura, motivo: 'O antivírus identificou uma ameaça neste arquivo. O envio foi bloqueado e o arquivo não foi guardado.' };
  }
  if (veredito.estado === 'indisponivel') {
    // Falha fechada, e a mensagem diz o que fazer — não é culpa de quem envia.
    return { aceito: false, etapa: 'antivirus_indisponivel', motivo: 'O antivírus está indisponível no momento, então nenhum arquivo pode ser aceito. Avise a TI e tente novamente mais tarde.' };
  }

  return {
    aceito: true,
    nome,
    formato,
    tamanho: dados.length,
    digestao: createHash('sha256').update(dados).digest('hex'),
  };
}

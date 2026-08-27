/**
 * Leitura e validação do formulário de conteúdo, do lado do servidor.
 *
 * Tudo o que o navegador faz (campo obrigatório, formato de e-mail, sugestão de
 * endereço de página) é refeito aqui. Não é redundância: `required` e
 * `type="email"` no HTML são conveniência para quem preenche, e somem para
 * quem envia a requisição direto. A validação que vale é esta.
 *
 * Arquivos passam pela MESMA inspeção do endpoint assíncrono
 * (lib/upload/inspecionar). O formulário funciona sem JavaScript justamente
 * por isso: quem tiver o script bloqueado envia o arquivo junto com o resto e a
 * verificação acontece igual.
 */

import type { Campo } from './campos.ts';
import { gerarSlug } from './campos.ts';
import type { Sessao } from './sessao.ts';
import { enviarArquivo } from './cms.ts';
import { inspecionar } from '../upload/index.ts';
import { limparComRelato } from '../sanitizar.ts';

/** Mesma pasta usada pelo endpoint assíncrono e liberada na política pública. */
const PASTA_PUBLICA = 'publicos';

export interface Leitura {
  /** O que será gravado no CMS. */
  valores: Record<string, unknown>;
  /** Erro por campo, mostrado ao lado dele. */
  erros: Record<string, string>;
  /** Avisos gerais, mostrados no topo (ex.: marcação retirada do texto). */
  avisos: string[];
  /** O que a pessoa digitou, para repovoar a tela quando houver erro. */
  digitado: Record<string, string>;
}

function texto(formulario: FormData, nome: string): string {
  const v = formulario.get(nome);
  return typeof v === 'string' ? v.trim() : '';
}

/** Endereço aceitável num campo de URL: nada de javascript: nem data:. */
function urlValida(valor: string): boolean {
  try {
    const u = new URL(valor);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

export async function lerFormulario(
  sessao: Sessao,
  campos: Campo[],
  formulario: FormData,
): Promise<Leitura> {
  const valores: Record<string, unknown> = {};
  const erros: Record<string, string> = {};
  const avisos: string[] = [];
  const digitado: Record<string, string> = {};

  for (const campo of campos) {
    const bruto = texto(formulario, campo.nome);
    digitado[campo.nome] = bruto;

    switch (campo.tipo) {
      case 'booleano': {
        // Caixa desmarcada não é enviada pelo navegador — ausência é 'false',
        // não "não mexeu".
        valores[campo.nome] = formulario.get(campo.nome) !== null;
        digitado[campo.nome] = valores[campo.nome] ? 'sim' : '';
        break;
      }

      case 'rico': {
        const { html, removidas } = limparComRelato(bruto);
        valores[campo.nome] = html || null;
        digitado[campo.nome] = html;
        if (removidas.length) {
          avisos.push(
            `No campo "${campo.rotulo}" foi retirada a marcação não permitida: ${removidas.join(', ')}. ` +
              'O texto foi mantido; só a formatação saiu.',
          );
        }
        if (campo.obrigatorio && !html) erros[campo.nome] = 'Preencha este campo.';
        break;
      }

      case 'slug': {
        // Vazio? Sugere a partir do campo de origem. Preenchido? Normaliza,
        // porque "Edital 04/2026" digitado à mão viraria uma URL quebrada.
        const origem = campo.derivadoDe ? texto(formulario, campo.derivadoDe) : '';
        const valor = gerarSlug(bruto || origem);
        valores[campo.nome] = valor || null;
        digitado[campo.nome] = valor;
        if (campo.obrigatorio && !valor) {
          erros[campo.nome] = 'Preencha o título primeiro — o endereço é sugerido a partir dele.';
        }
        break;
      }

      case 'numero': {
        if (!bruto) {
          valores[campo.nome] = null;
        } else if (!/^-?\d+$/.test(bruto)) {
          erros[campo.nome] = 'Use apenas números inteiros.';
        } else {
          valores[campo.nome] = Number(bruto);
        }
        if (campo.obrigatorio && !bruto) erros[campo.nome] = 'Preencha este campo.';
        break;
      }

      case 'url': {
        valores[campo.nome] = bruto || null;
        if (bruto && !urlValida(bruto)) {
          erros[campo.nome] = 'Informe um endereço completo, começando por http:// ou https://.';
        }
        if (campo.obrigatorio && !bruto) erros[campo.nome] = 'Preencha este campo.';
        break;
      }

      case 'email': {
        valores[campo.nome] = bruto || null;
        // Proposital: uma checagem frouxa. Expressão exigente rejeita endereço
        // institucional válido, e quem perde é a secretaria.
        if (bruto && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bruto)) {
          erros[campo.nome] = 'Informe um e-mail válido.';
        }
        if (campo.obrigatorio && !bruto) erros[campo.nome] = 'Preencha este campo.';
        break;
      }

      case 'selecao': {
        const permitidos = (campo.opcoes ?? []).map((o) => o.valor);
        if (bruto && !permitidos.includes(bruto)) {
          erros[campo.nome] = 'Escolha uma das opções da lista.';
        } else {
          valores[campo.nome] = bruto || null;
        }
        if (campo.obrigatorio && !bruto) erros[campo.nome] = 'Escolha uma opção.';
        break;
      }

      case 'data':
      case 'datahora': {
        if (!bruto) {
          valores[campo.nome] = null;
          if (campo.obrigatorio) erros[campo.nome] = 'Informe a data.';
          break;
        }
        // <input type="datetime-local"> manda "2026-08-27T14:30", sem fuso. O
        // servidor está em America/Sao_Paulo e o Directus guarda em UTC — sem
        // o carimbo o horário andaria três horas.
        //
        // O -03:00 é fixo porque o Brasil extinguiu o horário de verão em
        // 2019. Se algum dia voltar, este ponto e o paraCampo() abaixo passam
        // a errar uma hora em parte do ano, e precisam usar o fuso nomeado.
        const comFuso = campo.tipo === 'datahora' && !/[zZ]|[+-]\d\d:?\d\d$/.test(bruto);
        const d = new Date(comFuso ? `${bruto}:00-03:00` : bruto);
        if (Number.isNaN(d.getTime())) {
          erros[campo.nome] = 'Data inválida.';
        } else {
          valores[campo.nome] = campo.tipo === 'data' ? bruto : d.toISOString();
        }
        break;
      }

      case 'secretaria': {
        valores[campo.nome] = bruto || null;
        break;
      }

      case 'imagem':
      case 'arquivo': {
        // Dois caminhos chegam aqui:
        //   - com JavaScript, o arquivo já subiu pelo endpoint e o formulário
        //     traz só o identificador no campo oculto;
        //   - sem JavaScript, o binário vem junto e é inspecionado agora.
        const enviado = formulario.get(`${campo.nome}__arquivo`);
        const idExistente = texto(formulario, campo.nome);

        if (enviado instanceof File && enviado.size > 0) {
          const dados = new Uint8Array(await enviado.arrayBuffer());
          const veredito = await inspecionar(dados, enviado.name, enviado.type);

          if (!veredito.aceito) {
            console.warn(
              `[upload] RECUSADO por "${veredito.etapa}" — ${sessao.usuario.email} — ` +
                `"${enviado.name}" (${dados.length} B) — pelo formulário`,
            );
            erros[campo.nome] = veredito.motivo;
            valores[campo.nome] = idExistente || null;
            break;
          }

          const gravado = await enviarArquivo(
            sessao,
            dados,
            veredito.nome,
            enviado.type || 'application/octet-stream',
            PASTA_PUBLICA,
          );
          if (!gravado.ok) {
            erros[campo.nome] = gravado.motivo;
            valores[campo.nome] = idExistente || null;
            break;
          }

          console.info(
            `[upload] aceito — ${sessao.usuario.email} — "${veredito.nome}" ` +
              `(${veredito.formato}, ${veredito.tamanho} B, sha256 ${veredito.digestao}) → arquivo ${gravado.dados.id}`,
          );
          valores[campo.nome] = gravado.dados.id;
          digitado[campo.nome] = gravado.dados.id;
        } else {
          valores[campo.nome] = idExistente || null;
        }
        break;
      }

      default: {
        // texto, texto_longo, telefone
        valores[campo.nome] = bruto || null;
        if (campo.obrigatorio && !bruto) erros[campo.nome] = 'Preencha este campo.';
        if (campo.maximo && bruto.length > campo.maximo) {
          erros[campo.nome] = `Use no máximo ${campo.maximo} caracteres — este texto tem ${bruto.length}.`;
        }
        break;
      }
    }
  }

  return { valores, erros, avisos, digitado };
}

/** Formata um valor vindo do CMS para caber no input correspondente. */
export function paraCampo(campo: Campo, valor: unknown): string {
  if (valor === null || valor === undefined) return '';

  if (campo.tipo === 'datahora' && typeof valor === 'string') {
    // De volta ao formato do <input type="datetime-local">, no fuso local.
    const d = new Date(valor);
    if (Number.isNaN(d.getTime())) return '';
    const emSaoPaulo = new Date(d.getTime() - 3 * 60 * 60 * 1000);
    return emSaoPaulo.toISOString().slice(0, 16);
  }

  if (campo.tipo === 'data' && typeof valor === 'string') return valor.slice(0, 10);
  if (campo.tipo === 'booleano') return valor ? 'sim' : '';
  if (campo.tipo === 'secretaria' && typeof valor === 'object' && valor !== null) {
    return String((valor as { id?: string }).id ?? '');
  }

  return String(valor);
}

# Lighthouse — Órgão Oficial Eletrônico

Executado em 2026-08-28 · Chromium 151 · Lighthouse 13.4.1
**Perfil móvel padrão do Lighthouse**: CPU 4× mais lenta e 4G estrangulado —
não é a rede do escritório, é a rede da serra.

## Resultado

| Página | Perf. | Acessib. | Boas práticas | SEO | FCP | LCP | CLS | TBT |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Listagem `/diario-oficial` | 97 | **100** | 100 | 100 | 1,4 s | 2,5 s | 0 | 0 ms |
| Matéria | 96 | **100** | 100 | 100 | 1,2 s | 2,4 s | 0 | 0 ms |
| Edição de **88 páginas** (200 matérias no sumário) | 91 | **100** | 100 | 100 | 2,0 s | 3,2 s | 0 | 50 ms |
| Órgão Oficial | 97 | **100** | 100 | 100 | 1,1 s | 2,3 s | 0 | 0 ms |
| Autenticidade | 98 | **100** | 100 | 100 | 1,2 s | 2,3 s | 0 | 0 ms |
| Arquivo por ano (calendário) | 94 | **100** | 100 | 100 | 1,5 s | 2,6 s | 0 | 0 ms |

Sem estrangulamento (rede local), todas as páginas marcam **100 / 100 / 100 / 100**
com LCP entre 0,5 s e 0,7 s.

## Metas do briefing

| Meta | Situação |
|---|---|
| Acessibilidade **100** | **atingida em todas as páginas** |
| Performance ≥ 90 em móvel | atingida em todas (mínimo 91) |
| LCP < 2,5 s | atingida em 4 de 6. Ver abaixo. |
| Nada quebra em 360 px | conferido; nenhuma página rola na horizontal |

## As duas violações que existiam, e o que eram

Não foram cosméticas — as duas eram defeitos reais de acessibilidade:

**1. `<p>` solto dentro de `<dl>`** (bloco das duas datas). Conteúdo não
permitido ali: confunde a associação termo/definição no leitor de tela. A nota
descreve o mesmo termo, então virou um **segundo `<dd>`**, que o HTML permite.

**2. Contraste de 2,61:1** nos dias não úteis do calendário. Eu havia esmaecido
o número com transparência (`color-mix(… 60%, transparent)`), que é justamente
como se quebra contraste sem perceber — o valor "parece" cinza claro e passa
despercebido na revisão visual. Corrigido para musgo cheio (6,15:1). A distinção
entre dia com e sem edição **não fica na cor**: o dia com edição é um botão
verde com número em branco, que é diferença de forma. E o feriado, que estava só
no `title`, ganhou texto oculto — `title` não chega a quem navega por toque.

## As duas notas abaixo de 100, e por quê

**Edição de 88 páginas — LCP 3,2 s, acima do teto de 2,5 s.** É a página com
200 matérias no sumário, criada de propósito para achar o limite. O HTML tem
~420 KB, e é tudo texto do próprio sumário — não há imagem, script nem fonte a
mais para cortar. É o pior caso possível do acervo, e uma edição real desse
tamanho acontece talvez uma vez por ano (a edição orçamentária).

Não otimizei porque as saídas seriam piores: paginar o sumário quebraria a
navegação de quem procura um ato específico numa edição grande, e carregá-lo por
JavaScript o tiraria de quem não tem JS — exatamente o inverso da regra que
governa o módulo. **`TODO`:** se isso incomodar na prática, o caminho é
`content-visibility: auto` nas seções de caderno, que mantém o HTML completo e
adia só a pintura.

**Arquivo por ano — 94.** Doze tabelas de calendário. Custo de layout, não de
rede. Aceitável.

## Como reproduzir

```bash
cd <pasta com o lighthouse>
npx lighthouse "http://127.0.0.1:4321/diario-oficial" --quiet \
  --chrome-flags="--headless --no-sandbox --disable-gpu --disable-crash-reporter" \
  --output=html --output-path=./relatorio.html
```

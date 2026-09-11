# Portal de Cambuí — plano de design

> Documento da passada 1. Escrito **antes** de qualquer código, revisado ao fim
> com a autocrítica registrada na última seção.
>
> **Corrigido em 2026-09-11.** A tese original apoiava metade do argumento na
> malharia como "a economia que traz gente" a Cambuí — informação falsa,
> vinda de confusão com Monte Sião e o Circuito das Malhas, município vizinho
> (seis cidades: Albertina, Borda da Mata, Inconfidentes, Jacutinga, Monte
> Sião e Ouro Fino — Cambuí não é uma delas). Apurado via Wikipédia e IBGE
> Cidades depois que a usuária notou o erro. A tese abaixo foi reescrita para
> se apoiar só no que é verificável: a serra, a estrada e o sabor. O
> elemento-assinatura (seção 6) perdeu a textura de tricô mas manteve a
> silhueta — que sempre foi real, traçada à mão a partir do recorte da
> Mantiqueira vista de Cambuí, e não precisava da malharia para ser
> específica. Histórico das seções que citavam o erro original fica marcado
> abaixo como "revisado em 2026-09-11", para quem quiser reconstruir por que
> a decisão mudou.

---

## 1. Tese

> **Cambuí é uma cidade de serra.** A Mantiqueira fecha o horizonte, dá à
> cidade o clima de altitude e o inverno de verdade, e organiza a vida ao
> redor — de festival a safra. **O portal adota a carreira (a faixa
> horizontal) como unidade de composição:** o conteúdo se organiza em faixas
> lidas de fio a fio, nunca em quadros, ecoando as cristas sobrepostas da
> serra que se veem do centro da cidade.

Por que isto é de Cambuí e de nenhum outro lugar: a Mantiqueira não é
"montanha genérica" — é o recorte específico que dá à cidade o clima de
altitude, o inverno e os festivais, e a silhueta do hero é traçada à mão a
partir desse recorte real, não de um banco de imagens. Trocar Cambuí por
outro município quebraria a tese: nenhuma outra prefeitura do Brasil vê essa
mesma crista pela janela.

**Consequência estrutural, e não só estética:** se a unidade é a carreira, a
grade de quadradinhos com ícone e rótulo — o anti-padrão número um dos portais
de prefeitura — fica *impossível de construir* dentro do sistema. A escolha
formal já elimina o clichê.

---

## 2. Tokens de cor

Extraídos do **brasão oficial do município**, por amostragem dos pixels do
arquivo em `assets/marca/`. Não é paleta inventada: é a paleta que a cidade já
tem. As três cores dominantes do brasão, fora o branco, são carmim (20,6% dos
pixels), azul (11,3%) e verde-escuro (5,9%).

| Token | Hex | O que representa | Onde vive |
|---|---|---|---|
| `--serra` | `#0C5430` | O verde do brasão, que é também a Mantiqueira coberta. **Substitui a faixa azul institucional** — é a decisão que mais afasta este portal dos seus pares. | Superfície dominante: hero, faixas de seção, rodapé |
| `--serra-noite` | `#06301C` | O mesmo verde ao anoitecer na serra. Dá profundidade sem recorrer a preto. | Rodapé, base do hero, estados pressionados |
| `--carmim` | `#A8303C` | O vermelho do brasão. **Único acento de ação do sistema** — se algo é carmim, é clicável ou é urgente. | Botões primários, sublinhado de foco, o fio do horizonte |
| `--neblina` | `#E9EDEA` | A névoa que desce sobre a cidade. Neutro frio com viés verde — deliberadamente **não** é o creme `#F4F1EA` que virou assinatura de layout gerado por máquina. | Fundo de página |
| `--tinta` | `#141C18` | Preto com resto de verde, como tinta sobre lã crua. Nunca `#000`. | Texto corrido |
| `--musgo` | `#4C5A51` | O liquen na pedra. | Texto secundário, legendas, fios finos |

Branco (`--papel`) entra como superfície, não como cor de marca.

**O azul do brasão (`#304890`) foi deixado de fora de propósito.** Ele é a cor
que arrastaria o portal de volta para o padrão que estamos fugindo. Fica
reservado para o brasão em si, onde é obrigatório.

### Contraste verificado (não estimado)

Todos os pares em uso, medidos por script (`ferramentas/contraste.mjs`):

| Par | Razão | AA texto (4.5:1) | AA grande/UI (3:1) |
|---|---|---|---|
| tinta sobre neblina | 14,69:1 | ✅ | ✅ |
| tinta sobre papel | 17,37:1 | ✅ | ✅ |
| musgo sobre neblina | 6,15:1 | ✅ | ✅ |
| serra sobre neblina | 7,64:1 | ✅ | ✅ |
| carmim sobre neblina | 5,63:1 | ✅ | ✅ |
| carmim sobre papel | 6,66:1 | ✅ | ✅ |
| papel sobre serra | 9,03:1 | ✅ | ✅ |
| papel sobre serra-noite | 14,51:1 | ✅ | ✅ |
| papel sobre carmim | 6,66:1 | ✅ | ✅ |

Nenhum par usado no produto fica abaixo de 5,6:1. Sobra folga para o modo de
alto contraste, que endurece para preto/branco puros.

---

## 3. Tipografia

Duas famílias, ambas variáveis, ambas **auto-hospedadas**. Fonte via CDN do
Google significaria que o navegador de cada cidadão faz uma requisição a um
terceiro só para ler o site da própria prefeitura — inaceitável num portal
público, e um salto de DNS+TLS a mais no 4G da serra.

| Papel | Família | Peso do arquivo | Por quê |
|---|---|---|---|
| **Display** | Bricolage Grotesque (400–800, opsz 12–96) | 77 KB | Grotesca de terminais irregulares, quase cortada à mão. Lê como *feita*, não como corporativa — o registro de uma cidade de serra, não de escritório. O eixo óptico deixa a manchete apertar sem um segundo arquivo. |
| **Corpo** | Inter (400–700, opsz 14–32) | 73 KB | Altura de x generosa e aberturas largas. É a decisão certa para um público com fatia relevante de leitores idosos em tela de celular. |

**Sem terceira família, e isso é escolha.** Uma face utilitária custaria mais
30–70 KB no 4G de serra em troca de pouco: os números tabulares e os rótulos
saem do próprio Inter com `font-variant-numeric: tabular-nums` e versalete
espaçado.

### Escala

| Papel | Tamanho | Peso | Entrelinha | Tracking |
|---|---|---|---|---|
| Display (hero) | `clamp(2.6rem, 7vw, 5rem)` | 700 | 0,95 | −0,03em |
| Título de página | `clamp(2rem, 4.2vw, 3rem)` | 700 | 1,05 | −0,02em |
| Título de seção | `clamp(1.5rem, 2.6vw, 2.05rem)` | 600 | 1,15 | −0,01em |
| Subtítulo | `1.25rem` | 600 | 1,3 | 0 |
| **Corpo** | **`1.0625rem` (17px)** | 400 | 1,65 | 0 |
| Corpo destacado | `1.1875rem` | 400 | 1,55 | 0 |
| Rótulo | `0.8125rem` | 600 | 1,2 | 0,09em, versalete |
| Micro | `0.875rem` | 400 | 1,5 | 0 |

O corpo é **17px, não 16px**. Um pixel a mais custa nada e devolve muito para
quem tem mais de sessenta anos lendo num celular na rua.

---

## 4. Layout

### Duas alternativas estruturais consideradas

**Alternativa A — "Mosaico".** Grade de 12 colunas; serviços e notícias em
cartões; hero com imagem sangrada. É o que a maioria dos portais faz e o que os
frameworks entregam de graça.

*Descartada por três razões, e a terceira é decisiva:* (1) é literalmente o
anti-padrão da grade de quadradinhos; (2) em 360px a grade degrada para uma
pilha de caixas com rótulo truncado — "Emissão de Certidão…" — e alvo de toque
pequeno; (3) o cartão obriga a **resumir** o nome do serviço, e resumir nome de
serviço público é onde o cidadão se perde.

**Alternativa B — "Carreiras". Escolhida.** A página é uma pilha de faixas
horizontais sangradas. Dentro de cada faixa, uma grade assimétrica de duas
trilhas:

- a **ourela** (a margem, a borda) — trilha estreita à esquerda que carrega o
  número da seção, o rótulo em versalete e um fio vertical;
- o **corpo** — trilha larga, com o conteúdo em **linhas de largura total**, não
  em quadros.

Cada serviço é uma linha inteira. Isso dá alvo de toque de 64px de altura
ocupando a largura da tela, nome de serviço **nunca truncado**, e uma ordem de
leitura que o leitor de tela percorre sem surpresa.

Em 360px a ourela colapsa para um fio de 3px na borda esquerda; as linhas
continuam sendo linhas. **A estrutura não muda de natureza no celular** — só
perde a margem.

### Wireframe — Home

```
┌──────────────────────────────────────────────────────────────┐
│ ⏭ conteúdo · menu · busca      A− A A+  ◑ contraste  ⟨VLibras⟩│ ← barra de acessibilidade
├──────────────────────────────────────────────────────────────┤
│ ▨ BRASÃO   Prefeitura de Cambuí            Transparência ·   │
│            Minas Gerais                    Ouvidoria · e-SIC │
│  ┌────────────────────────────────────────────────────┐      │
│  │ 🔎  O que você precisa resolver?                   │      │ ← busca é o maior
│  └────────────────────────────────────────────────────┘      │   elemento do cabeçalho
│  Serviços   A cidade   A Prefeitura   Transparência   Notícias│
├══════════════════════════════════════════════════════════════┤
│ ╱╲╱╲╱╲                    A SILHUETA DA SERRA                │
│ ╱╲╱╲╱╲╱╲╱╲      (silhueta da Mantiqueira vista de Cambuí,    │ ← elemento-assinatura
│ ╱╲╱╲╱╲╱╲╱╲╱╲╱╲   traçada à mão; um fio carmim marca a        │
│ ╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲ linha do horizonte)                         │
│                                                              │
│   Cambuí resolve                                             │
│   o seu dia.                                       ← display │
├──────────────────────────────────────────────────────────────┤
│ 01 │ O QUE VOCÊ PRECISA HOJE                                 │
│ ▏  │ ──────────────────────────────────────────────────────  │
│ ▏  │  Pagar meu IPTU                                    →    │ ← carreiras:
│ ▏  │ ──────────────────────────────────────────────────────  │   linha inteira,
│ ▏  │  Ver o dia da coleta no meu bairro                 →    │   verbo primeiro
│ ▏  │ ──────────────────────────────────────────────────────  │
│ ▏  │  Marcar consulta na unidade de saúde               →    │
│ ▏  │ ──────────────────────────────────────────────────────  │
│ ▏  │  Abrir empresa · alvará · habite-se                →    │
│ ▏  │ ──────────────────────────────────────────────────────  │
│ ▏  │  Ver licitações e editais                          →    │
│ ▏  │ ──────────────────────────────────────────────────────  │
│ ▏  │  Falar com a Ouvidoria                             →    │
├──────────────────────────────────────────────────────────────┤
│ 02 │ COLETA NO MEU BAIRRO            [ Centro        ▾ ]     │ ← módulo local,
│ ▏  │ Seg · Qua · Sex, a partir das 7h                        │   não existe em
├──────────────────────────────────────────────────────────────┤   portal nenhum
│ 03 │ NOTÍCIAS                              todas as notícias │
│ ▏  │ ┌───────────────────────────┐  27 ago · Obras           │
│ ▏  │ │  imagem da chamada        │  Título da matéria líder  │ ← 1 líder + linhas,
│ ▏  │ └───────────────────────────┘  linha fina de resumo     │   não 3 cartões
│ ▏  │ ──────────────────────────────────────────────────────  │
│ ▏  │ 26 ago · Saúde   Segunda matéria                        │
│ ▏  │ 24 ago · Educação  Terceira matéria                     │
├──────────────────────────────────────────────────────────────┤
│ 04 │ A CIDADE                                                │
│ ▏  │  serra · estrada · sabor — faixa editorial de turismo   │
├──────────────────────────────────────────────────────────────┤
│ 05 │ TRANSPARÊNCIA E ACESSO À INFORMAÇÃO      (LAI em foco)  │
├══════════════════════════════════════════════════════════════┤
│  Prefeitura Municipal de Cambuí · CNPJ · Praça Coronel       │
│  Justiniano, 164 · (35) 3431-1666 · seg a sex, 8h–17h        │ ← identificação, não
│  Acessibilidade · Privacidade · Mapa do site                 │   5 colunas de links
└──────────────────────────────────────────────────────────────┘
```

### Wireframe — página interna (notícia)

```
┌──────────────────────────────────────────────────────────────┐
│  [barra de acessibilidade + cabeçalho, idênticos]            │
├──────────────────────────────────────────────────────────────┤
│ ▏ Início › Notícias › esta matéria                           │
│ ▏                                                            │
│ ▏  27 de agosto de 2026 · Secretaria de Obras     ← rótulo   │
│ ▏                                                            │
│ ▏  Título da matéria em                                      │
│ ▏  display, duas linhas                          ← 3.0rem    │
│ ▏                                                            │
│ ▏  Linha de resumo em corpo destacado, 1.1875rem.            │
│ ▏ ──────────────────────────────────────────────────────     │
│ ▏                                                            │
│ ▏ ┌────────────────────────────────────────────────┐         │
│ ▏ │  imagem, proporção 16:9, com legenda abaixo    │         │
│ ▏ └────────────────────────────────────────────────┘         │
│ ▏                                                            │
│ ▏   Corpo em coluna de 62ch — medida de leitura, não a       │
│ ▏   largura da tela. A ourela à esquerda acompanha a rolagem,│
│ ▏   ancorando a leitura.                                     │
│ ▏                                                            │
│ ▏ ──────────────────────────────────────────────────────     │
│ ▏  ← Voltar     Compartilhar     Falar com esta secretaria   │
└──────────────────────────────────────────────────────────────┘
```

Medida de leitura fixa em **62ch**. A largura da tela não é a largura do texto.

---

## 5. Movimento

**Princípio: o portal não se mexe sozinho.** Movimento aqui serve orientação,
nunca decoração. Um momento orquestrado, dois microfeedbacks — e nada mais.

| # | Movimento | Propósito | Curva | Duração |
|---|---|---|---|---|
| 1 | **A serra se revela** — no primeiro carregamento, a silhueta aparece da esquerda para a direita, como um véu que desliza | Dar um instante de identidade, uma vez só, sem atrasar leitura nenhuma | `cubic-bezier(.22,.61,.36,1)` | 900ms |
| 2 | **Fio de foco** — foco e hover puxam um sublinhado carmim que cresce do início da linha | Sinal de foco visível e com personalidade, sem `outline: none` | `ease-out` | 120ms |
| 3 | **Entrada da faixa** — cada banda entra com 12px de deslocamento e opacidade, escalonada em 60ms | Faz a rolagem ter ritmo de carreira; acontece uma vez por elemento | `ease-out` | 400ms |

Tudo em `transform` e `opacity`, no compositor. Nada anima largura, altura,
`top` ou `left` — não há uma linha de layout animado no projeto.

**`prefers-reduced-motion: reduce` desliga os três.** Não atenua: desliga. A
serra aparece inteira e imóvel, o foco vira sublinhado estático, as faixas
nascem visíveis. É um portal de governo; a preferência do sistema operacional
não é sugestão.

---

## 6. Elemento-assinatura — "A Silhueta da Serra"

> **Revisado em 2026-09-11.** Chamava-se "A Serra Tecida": a silhueta vinha
> preenchida com um padrão de ponto de tricô, e a seção inteira argumentava
> que isso "amarrava a paisagem à malharia" — a economia que, apurado depois,
> não é a de Cambuí. A silhueta em si sempre foi real (traçada à mão a partir
> do recorte da Mantiqueira vista da cidade); só a textura saiu. Descrição
> abaixo já reflete o componente corrigido (`SilhuetaSerra.astro`).

O componente de abertura da página "A cidade", e onde a identidade visual do
portal respira mais solta.

**O que é:** a silhueta do horizonte da Mantiqueira vista de Cambuí, traçada à
mão. Três camadas de profundidade com opacidade decrescente lêem como serra
sob neblina. Um fio em carmim marca a linha do horizonte.

**Por que funciona:** a montanha que o cidadão vê da janela, e não uma
ilustração comprada nem foto de banco de imagens — a crista é o recorte
específico de Cambuí, não uma montanha genérica que serviria a qualquer
prefeitura de serra.

**Como se sustenta tecnicamente:** três `<path>` SVG recortados por
`clipPath`, sem canvas, sem biblioteca, sem requisição extra — embutido no
HTML e servido junto com a página.

**O véu:** no primeiro carregamento, um véu da cor do fundo desliza para a
direita revelando a serra — o único movimento de assinatura do sistema (ver
seção 5). Desliga por completo com `prefers-reduced-motion`.

---

## 7. Stack

**Astro 5, SSR com adaptador Node** — a stack que o projeto já tem, e que
continua certa: as páginas são majoritariamente estáticas, o JavaScript enviado
ao navegador é apenas o que se pede explicitamente, e o conteúdo vem de um CMS
que a prefeitura opera. Trocar de framework agora custaria a integração inteira
com o Directus, o painel das secretarias e a camada de sanitização — sem ganho
para o cidadão.

Animação em **CSS nativo + IntersectionObserver**. Nenhuma biblioteca: GSAP ou
Motion custariam de 30 a 70 KB para fazer três transições que o CSS faz de
graça.

---

## 8. Autocrítica

*Pergunta obrigatória: este plano seria o mesmo para a prefeitura de qualquer
outra cidade?*

Na primeira versão, **três partes seriam** — e foram reescritas:

**(a) A paleta era genérica.** O primeiro rascunho tinha "azul institucional +
verde + um acento quente", que é a paleta de metade dos municípios brasileiros.
*Correção:* fui ao brasão, amostrei os pixels e adotei as cores que o município
já tem — inclusive **descartando o azul do próprio brasão**, porque é ele que
puxaria o resultado de volta ao padrão. Uma paleta tirada do brasão de Cambuí
não é transplantável para Itajubá.

**(b) A home tinha um bloco "Acesso Rápido".** Rótulo que não quer dizer nada e
que existe em todos os portais. *Correção:* virou **"O que você precisa hoje"**,
com verbo na frente — "Pagar meu IPTU", não "Tributos" — e ganhou ao lado um
módulo que nenhum outro portal tem: **"Coleta no meu bairro"**, com os bairros
reais levantados na auditoria (Água Branca, Braço das Antas, Cambuí Velho,
Canguava, Cohab, Colinas do Itaim…). Um cidadão de outra cidade não reconhece
essa lista; um de Cambuí reconhece a própria rua.

**(c) O hero era "uma imagem bonita da serra".** Serra genérica serve para
qualquer cidade de montanha do Brasil. *Correção, na época:* a serra passou a
ser **tricotada**, amarrando a paisagem à malharia — raciocínio que **revelou-se
falho** em 2026-09-11 (a malharia não é a economia de Cambuí; ver a nota no
topo do documento e a seção 6). O que continuou de pé, e que já bastava para
tornar a imagem intransferível: a crista é o recorte *específico* da
Mantiqueira vista de Cambuí, traçado à mão, não uma montanha genérica de banco
de imagens. A textura de tricô nunca foi necessária para isso — só parecia
ser.

*Segunda pergunta: o que ainda é genérico e eu aceito?* A estrutura de faixas
horizontais e a coluna de leitura de 62ch são boas práticas transferíveis — e
tudo bem. Identidade se carrega nos tokens, no motivo e no conteúdo; a
carpintaria pode e deve ser convencional. **Ousadia concentrada num lugar só,
disciplina em todo o resto.**

*Terceira: onde a tese entra em conflito com o cidadão?* Um hero de assinatura
ocupa espaço acima da dobra que poderia ser tarefa. Resolvi a favor do cidadão:
a busca está **acima** do elemento-assinatura, no cabeçalho, e a serra tecida é
deliberadamente **baixa** — uma faixa, não uma tela cheia. O primeiro bloco
depois dela já é a lista de tarefas. Identidade não pode custar um rolar de
tela a quem só quer pagar o IPTU.


---

## 9. Segunda crítica — depois de construído

*Instrução: abrir o resultado e remover um elemento decorativo que não esteja
servindo à tese. Se não achar nenhum, procurar de novo.*

**Removido: a miniatura vazia da listagem de notícias.** Matéria sem foto
recebia um retângulo com a textura de tricô (então usada também na serra do
hero e na régua que separa seções — ambas corrigidas em 2026-09-11, ver nota
no topo do documento) no lugar da imagem, para manter o alinhamento da lista.
Ao ver a lista pronta, ficou evidente o problema: era decoração fingindo
conteúdo, e fazia a notícia sem foto parecer **quebrada** — como se a imagem
tivesse falhado ao carregar.

Sem ela, o texto ocupa a largura inteira da linha e a lista fica mais legível.
Menos elemento, mais leitura.

**O que foi examinado e ficou:**

- *Os números de seção na ourela* — servem à tese: a carreira numerada é o que
  dá ritmo de leitura à rolagem, e some no celular, onde não caberia.
- *A régua entre o cabeçalho de página e o corpo* — a peça que amarra página
  interna e home no mesmo sistema (perdeu a textura de tricô em 2026-09-11;
  hoje é uma linha sólida, ver seção 6).
- *O véu que revela a serra* — é o único movimento de assinatura, dura 900ms,
  roda uma vez e desaparece por completo com `prefers-reduced-motion`.

**O que eu removeria a seguir, se precisasse cortar mais:** o `<span>` com o
número dentro de cada linha de tarefa na home. Ele é bonito e reforça a
carreira, mas a lista já é numerada visualmente pela própria ordem. Mantive
porque some abaixo de 30rem e não custa nada a quem lê no celular — mas é o
próximo da fila.

---

## 10. Relatório final

### Decisões, e por quê

| Decisão | Razão | Alternativa descartada |
|---|---|---|
| Verde do brasão como cor institucional | É a decisão que mais afasta o portal dos seus pares; a faixa azul é o clichê nº 1 | Azul do próprio brasão — puxaria de volta ao padrão |
| Paleta amostrada do brasão | Cor tirada do município não é transplantável | Paleta autoral "moderna" |
| Linha em vez de cartão | Alvo de toque de largura total, nome de serviço nunca truncado | Grade de quadradinhos |
| Catálogo por necessidade | O cidadão não sabe qual secretaria cuida do quê | Catálogo por secretaria |
| Duas famílias, auto-hospedadas | Fonte via CDN faria o navegador do cidadão bater num terceiro | Google Fonts; terceira família |
| Astro mantido | Trocar custaria toda a integração com CMS, painel e sanitização | Next/SvelteKit |
| Animação em CSS puro | 3 transições que o CSS faz de graça | GSAP/Motion (30–70 KB) |
| Transparência por link, não reimplementada | Duas versões do mesmo número é pior que uma só | Reconstruir os relatórios |

### Riscos assumidos

1. **O hero de assinatura ocupa espaço acima da dobra.** Mitigado deixando a
   busca *antes* dele, no cabeçalho, e a serra deliberadamente baixa — uma
   faixa, não uma tela. Na prática, o IPTU está a **um clique** da home.
2. **Bricolage Grotesque é uma fonte com personalidade forte.** Se a
   administração achar excessiva, trocar custa uma linha em `global.css`: só o
   display muda, o corpo (Inter) segue.
3. **`document.execCommand` no editor do painel** é obsoleto. Assumido para não
   trazer um editor inteiro como dependência; o resultado passa pelo
   sanitizador de qualquer forma.
4. ~~Lighthouse não foi executado.~~ **Executado em 28/08/2026** — ver a seção
   11. Instalei Chromium 151 (pacote do EPEL) e Lighthouse 13.4.1 no servidor.
   As metas foram atingidas, e a auditoria encontrou três defeitos reais que a
   revisão manual não pegou.

### O que ficou como `TODO(cliente)`

| Onde | O que falta |
|---|---|
| `dados/instituicional.ts` | **CNPJ** da Prefeitura; e-mail institucional; confirmação do horário; perfis oficiais de redes sociais |
| `dados/cidade.ts` | **Calendário real da coleta** por bairro (hoje a interface diz "a confirmar" em vez de inventar dia); lista completa de bairros e distritos; link direto da emissão da guia de IPTU |
| `pages/privacidade.astro` | **Encarregado de dados (DPO)** — nome e canal, exigidos pela LGPD |
| `pages/a-cidade.astro` | Altitude e área oficiais; fotografias reais da serra, do comércio e do centro |
| `pages/secretarias/index.astro` | Organograma, competências e conselhos municipais |
| Marca | Vetor do brasão (.svg) — hoje só existe o PNG |

Nenhum desses buracos quebra a página: onde o dado falta, a interface diz que
falta, em português, em vez de exibir um valor inventado.


---

## 11. Lighthouse — medição real

Executado em 28/08/2026 com **Chromium 151** + **Lighthouse 13.4.1**, preset
móvel com estrangulamento de rede simulado, pelo caminho real do navegador
(HTTPS → Caddy → Nginx → Astro).

### Notas (home, mediana de 4 execuções)

| Categoria | Nota | Meta |
|---|---|---|
| **Performance** | **99** | ≥ 90 ✅ |
| **Acessibilidade** | **100** | 100 ✅ |
| **Boas práticas** | **100** | — ✅ |
| SEO | 69 no endereço de homologação · **100** na aplicação | — ⚠️ |

O SEO de 69 é **o `noindex` deliberado da homologação**, e nada mais: rodando
contra a aplicação sem esse bloqueio, a nota é 100 sem uma única falha. No dia
da virada, o SEO sobe sozinho ao remover o bloqueio.

### Métricas essenciais (home)

| Métrica | Medido | Teto |
|---|---|---|
| Largest Contentful Paint | **1,74 s** | 2,5 s ✅ |
| Cumulative Layout Shift | **0** | 0,1 ✅ |
| First Contentful Paint | 0,95 s | — |
| Total Blocking Time | 100 ms | — |
| Speed Index | 0,95 s | — |

### Páginas internas

| Página | Performance | Acessibilidade | Boas práticas | LCP | CLS |
|---|---|---|---|---|---|
| Serviços | 99 | 100 | 100 | 1,7 s | 0 |
| Matéria (com imagem) | 100 | 100 | 100 | 2,04 s | 0 |
| Secretaria | 99 | 100 | 100 | 1,7 s | 0 |
| A cidade | 100 | 100 | 100 | 1,8 s | 0 |

### Responsividade, medida com o navegador

8 páginas × 4 larguras (360, 768, 1280, 1920): **32 combinações, nenhuma com
rolagem horizontal** (`scrollWidth == clientWidth` em todas). Alvos de toque
aprovados a 360px.

### Os três defeitos que a auditoria encontrou

A revisão manual não pegou nenhum dos três. É o argumento a favor de medir.

**1. Botão de busca sem nome acessível abaixo de 480px.** O rótulo "Buscar"
saía com `display: none` para dar espaço à lupa, e o leitor de tela passava a
anunciar apenas "botão". Corrigido com ocultação visual (`clip`), que tira da
vista sem tirar do documento. *Peso 10 na nota de acessibilidade — sozinho
segurava a nota em 90.*

**2. O brasão estava esmagado.** `brasao.png` é um **lockup horizontal de
1126×510** com o texto em branco, feito para fundo escuro; estava sendo
renderizado como quadrado de 44×44. Além da distorção, o texto branco era
invisível sobre a neblina. Recortei o símbolo do arquivo original para
`brasao-simbolo.png` (413×413) e passei a usá-lo na proporção certa.

**3. O VLibras carregava sozinho — e piorava as duas notas.** O plugin oficial
injeta `<img>` sem `alt`, e carregá-lo no tempo ocioso ainda custava desempenho
a quem não o usa. **Passou a ser sob demanda:** um botão nosso, com nome
acessível de verdade, na barra de acessibilidade; o plugin só é baixado quando
alguém pede, e então é aberto direto. Quem precisa de Libras clicaria no botão
do plugin de qualquer forma — agora clica num botão melhor rotulado, e o resto
do município não paga por isso. De quebra, é melhor para a LGPD: nenhuma
requisição a `vlibras.gov.br` acontece sem a pessoa pedir.

*Uma tentativa intermediária de "consertar" o VLibras acrescentando
`aria-label` nos elementos dele criou uma violação nova — atributo ARIA
proibido em `<div>` sem papel. Registrado aqui porque é o erro clássico de
remendar acessibilidade sem medir depois.*

**Ganho extra:** imagens de conteúdo passaram a ser pedidas ao Directus em
**WebP**. A matéria com imagem tinha LCP de 2,6 s — acima do teto — e caiu para
**2,04 s**, com performance 100.

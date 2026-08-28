# Roteiro de validação — módulo de licitações

Dez minutos, na ordem. Onde aparece `<endereço>`, use
`https://portal.cambui.mg.gov.br` (homologação).

## Área pública — o fornecedor (4 min)

1. **`<endereço>/`** — role até a faixa **“Licitações abrindo”**. Deve mostrar
   **8 oportunidades**, com “abre em N dias” *e* a data absoluta em cada cartão.
2. Na faixa, aperte **Tab** até o botão **“Pausar avanço automático”** e tecle
   **Enter**. O rótulo troca para “Retomar” e o avanço para. Continue com Tab:
   a trilha recebe foco visível e as setas do teclado rolam os cartões.
3. **`<endereço>/licitacoes?q=merenda`** — deve retornar **2 licitações** de
   *gêneros alimentícios*. É o teste do dicionário de sinônimos.
4. **`<endereço>/licitacoes/modalidade/pregao-eletronico`** — copie a URL e
   abra numa **aba anônima**: o mesmo resultado, sem sessão. Repare nos
   contadores `(n)` em cada opção de filtro; as que dariam zero vêm
   desabilitadas.
5. Clique em **“Abertas agora”** e depois em **“Abrem em 7 dias”** — a URL muda,
   e os chips no topo mostram o que está filtrado, cada um removível.
6. Abra qualquer licitação. Na **primeira dobra**, sem rolar: o que é, a
   contagem regressiva com “(horário de Brasília)”, e o botão **Baixar o
   edital** com o peso do arquivo.
7. Clique em **“Adicionar ao calendário”** — baixa um `.ics` válido, com alarme
   de um dia antes.
8. **`<endereço>/licitacoes/2026/concorrencia-017`** — a licitação **retificada**:
   dois editais, o antigo **riscado e marcado “Superado”**, com o aviso no topo
   de que nada é removido do histórico.
9. Procure uma **suspensa** (filtro Situação → Suspensa): a etiqueta é vermelha,
   com ícone e texto, e o motivo aparece em destaque.

## Distribuição (1 min)

10. **`<endereço>/licitacoes/feed.xml`** — RSS válido, 40 itens.
11. **`<endereço>/api/licitacoes?q=merenda`** — JSON com `total: 2`, aviso legal
    e URL de cada licitação.
12. **`<endereço>/licitacoes/exportar.csv?tempo=proximos-30`** — abre no Excel
    com acento e colunas certos (BOM + ponto e vírgula), 8 linhas.

## Painel — o servidor do setor (4 min)

Entre em **`<endereço>/painel`** com as credenciais do README.

13. **Licitações** no menu → a listagem de trabalho, com busca, filtro por
    situação e por visibilidade, e **ações rápidas** em cada linha.
14. **“Publicar nova licitação”** — o rascunho é criado na hora e você cai no
    editor. Repare em *“salvo às HH:MM”* aparecendo sozinho enquanto digita.
15. Na etapa **Identificação**, cole no campo do PNCP:
    `https://pncp.gov.br/app/editais/18675983000121/2026/32` e clique em
    **Buscar no PNCP**. Se a API estiver fora — acontece com frequência — a
    mensagem diz para seguir manualmente, e o painel continua funcionando.
16. Vá à etapa **Datas** e ponha a **sessão para ontem**. Vá a **Revisão** e
    tente **Publicar**: a publicação é **bloqueada**, com os motivos escritos em
    português. O registro continua rascunho.
17. Corrija a data para dali a 3 dias e tente publicar de novo: agora aparece o
    **alerta do prazo do art. 55**, que exige justificativa — escreva qualquer
    coisa e publique. A justificativa entra no andamento do processo.
18. Na etapa **Anexos**, arraste um PDF: barra de progresso, título legível
    gerado a partir do nome do arquivo, tipo adivinhado e editável.
19. Volte à listagem, **Ações rápidas → Suspender**: o aviso aparece
    imediatamente na página pública.

## Acessibilidade e responsividade (1 min)

20. Ative **prefers-reduced-motion** no sistema (ou o modo de economia de
    animação do navegador) e recarregue a home: a faixa **não se move** e
    continua completa e rolável.
21. Estreite a janela para **360 px** e percorra `/licitacoes`, uma licitação e
    a home: **nenhuma barra de rolagem horizontal**.
22. Da home até o download de um edital, **só com o teclado**: Tab → faixa →
    Enter no cartão → Tab até “Baixar o edital” → Enter.
23. Clique em **Alto contraste** na barra do topo e confira a listagem.

## O que você deve ver em todo lugar

- A faixa vermelha de **demonstração** no topo — os 40 registros são fictícios.
- A **nota legal** no rodapé de cada listagem e de cada licitação: a divulgação
  oficial é no PNCP e no veículo oficial do Município.

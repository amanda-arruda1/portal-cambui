# Órgão Oficial Eletrônico — arquitetura

> Este módulo é um **instrumento de fé pública**. Um edital publicado errado,
> uma data de publicação calculada errado ou um PDF que não passa na validação
> de assinatura não é defeito de interface: é ato administrativo com vício,
> prazo perdido, licitação anulada. Onde houve escolha entre sofisticação e
> rastreabilidade, foi escolhida a rastreabilidade — e o parágrafo abaixo de
> cada decisão diz por quê.

---

## 1. Stack, e por quê

| Camada | Escolha | Razão |
|---|---|---|
| Aplicação | **Astro 5 SSR** (Node adapter) | Já é a stack do portal. Páginas de matéria e de edição precisam ser HTML de servidor: indexáveis, acessíveis e funcionais sem JavaScript. |
| Conteúdo | **Directus 11** sobre Postgres 16 | Já é o CMS do portal. Traz painel de administração, permissões por política e `directus_revisions` — que é o diff de cada alteração, e não vale a pena reconstruir. |
| Geração de PDF | **Chromium headless** pelo Chrome DevTools Protocol | Ver §4. |
| Assinatura | **OpenSSL** num serviço à parte | Ver §5. |
| Verificação | **Node puro** (`node:crypto` + leitor DER escrito à mão) | Ver §6. |
| Busca | **Índice em memória** no processo web | Ver §7. |
| E-mail | fila no banco + serviço `portal-avisos` | Mesma arquitetura dos avisos de licitação: o processo web enfileira e nunca fala com a internet. |

**Nenhuma dependência nova em produção** além do que já estava instalado. O
Chromium já existia para o Lighthouse; o OpenSSL existe em qualquer servidor; o
`qrcode` é a única biblioteca acrescentada, e só para o gerador de PDF.

---

## 2. Modelo de dados

Nove coleções (`infra/directus/diario/aplicar-esquema.mjs`):

| Coleção | Papel |
|---|---|
| `diario_veiculo` | **Singleton.** Qual é o órgão oficial deste município, sob qual lei, com que periodicidade e — o que mais importa — **qual regra de contagem de prazo**. |
| `diario_cadernos` | Executivo, Licitações e Contratos, Atos de Pessoal, Legislativo. Configurável. |
| `diario_edicoes` | A edição: número contínuo, as **duas datas**, PDF assinado, hash, código verificador, dados da assinatura, marca de anulação. |
| `diario_materias` | **A unidade que o cidadão procura.** Página e URL próprias. |
| `diario_devolucoes` | Histórico de devoluções, com motivo obrigatório. |
| `diario_auditoria` | Log **imutável**: só aceita inserção. |
| `diario_assinantes` / `diario_envios` | Avisos por e-mail e a fila de entrega. |
| `diario_certidoes` | Certidões de publicação emitidas, cada uma com o seu código. |

### 2.1. As quatro decisões de modelagem que importam

**(a) Não existe entidade "solicitação de publicação" separada da matéria.**
O briefing pedia as duas. A solicitação **é** a matéria nos seus estados
anteriores a `publicada` (`rascunho → enviada → em_revisao → devolvida →
aprovada → pautada → publicada`). Duas tabelas significariam duas cópias do
mesmo texto e, no dia em que divergirem — e divergem —, ninguém consegue dizer
qual foi o texto realmente aprovado. O que a solicitação tem de próprio, o
histórico de devoluções, vive em `diario_devolucoes`.
*Este é o conflito que o briefing pediu para eu apontar; resolvi a favor da
integridade, como ele mandou resolver.*

**(b) Remissão de errata/republicação/revogação é guardada em UM SÓ SENTIDO.**
A matéria nova aponta para a antiga (`retifica`, `republica`, `revoga`). O
sentido inverso — "esta matéria foi retificada por aquela" — é **consulta**, não
campo (`remissoesDe()` em `lib/diario/indice.ts`). Guardar os dois lados
permitiria o estado impossível em que A retifica B mas B não é retificada por A.
Numa publicação oficial isso é uma **remissão falsa**, e remissão falsa induz a
erro quem lê. Com um lado só, a consistência é estrutural.

**(c) `anulada` é marca, não situação.**
Uma edição anulada continua `publicada` e continua acessível, com faixa
vermelha. Sumir com ela apagaria também o histórico do próprio ato de anulação —
e o ato de anular é público como qualquer outro.

**(d) O número da edição é contínuo e jamais reaproveitado**, inclusive quando
a edição é anulada. Lacuna na sequência é a primeira coisa que um auditor
procura. Índice único no banco, e a validação de fechamento recusa salto ou
repetição.

### 2.2. As duas datas

`data_disponibilizacao` é quando o PDF foi ao ar. `data_publicacao_legal` é a
data **que conta prazo**, calculada pela regra do veículo — por padrão, o
primeiro dia útil seguinte, espelhando o art. 4º, §3º da Lei 11.419/2006.

As duas são armazenadas, exibidas lado a lado e **explicadas em português** em
toda página de edição, de matéria e na certidão (componente `DuasDatas.astro`).
Confundi-las é como se perde prazo, e é o defeito mais comum nos portais de
diário municipal que servem de referência para este mercado.

A regra é **configuração**, não constante: a lei municipal de cada ente define,
e a mesma base servirá outros municípios. O cálculo mora num único lugar
(`apps/web/src/lib/diario/dominio.mjs`), consumido tanto pelo portal quanto
pelos scripts de infraestrutura — uma segunda implementação, ainda que idêntica
hoje, é uma bomba com temporizador.

O calendário considera feriados nacionais (inclusive os móveis, por cálculo da
Páscoa) e os municipais cadastrados. **`TODO(cliente)`:** confirmar a lista
municipal com a Procuradoria; o padroeiro em 08/12 está como plausível.

---

## 3. Imutabilidade — no banco, não por convenção

`infra/directus/diario/imutabilidade.sql`. Gatilhos que valem para **qualquer**
porta de entrada: a aplicação é uma; o painel do Directus é outra; um `psql` às
23h é outra.

| Proibido | Como |
|---|---|
| Alterar edição publicada (número, datas, PDF, hash, assinatura, situação) | `BEFORE UPDATE` compara os campos e lança exceção |
| Apagar edição publicada | `BEFORE DELETE` |
| Alterar ou apagar matéria publicada | idem |
| Alterar ou apagar linha de auditoria | `BEFORE UPDATE/DELETE` — o log só cresce |

**Exceção única, e deliberadamente difícil:** a remoção do acervo de
demonstração exige **duas** condições simultâneas — a linha estar marcada
`demonstracao = true` **e** a sessão declarar `SET LOCAL
diario.limpar_demonstracao = 'sim'`. Uma edição real nunca satisfaz a primeira,
então nenhum comando de limpeza a alcança por engano. Provado nos dois sentidos
em `infra/directus/diario/testar-imutabilidade.sql`, que roda em transação e não
deixa resíduo.

Nenhuma política de permissão — **nem a do administrador** — tem `delete` em
`diario_edicoes` ou `diario_materias`. A interface é a primeira barreira; o
banco é a que vale.

---

## 4. Geração do PDF

**Chromium headless via CDP** (`infra/diario/cromo.mjs`), e não uma biblioteca
de desenho de PDF. Quatro razões, em ordem de importância:

1. **O PDF e a página HTML saem do MESMO HTML.** Isso não é economia de código,
   é garantia jurídica: o que o cidadão lê na tela acessível é literalmente o
   que está no documento assinado. Com dois geradores, um dia eles divergem — e
   divergência entre o que se leu e o que se assinou é vício de publicação.
2. **Sai marcado (Tagged PDF)**, com ordem de leitura e `/Lang (pt-BR)` na
   árvore de estrutura — que é do que um leitor de tela precisa. Bibliotecas de
   desenho produzem, por padrão, texto posicionado sem estrutura: ilegível para
   quem depende de leitor de tela.
3. **Sumário com links internos navegáveis** sai de `<a href="#âncora">`, e os
   marcadores do painel lateral saem dos `<h*>`.
4. **Zero dependência nova.**

O custo, declarado: cada renderização usa um processo Chromium. Com sessão
reaproveitada, ~0,28 s por documento (medido). Para um diário que fecha uma
edição por dia, é irrelevante.

### 4.1. O sumário e o problema das duas passadas

O número da página de cada matéria só existe **depois** de paginar, e paginar
depende do sumário, que precisa dos números. Resolvido assim:

1. Primeira passada imprime `00` dentro de uma caixa de **largura fixa**.
2. `pdftotext` diz em que página caiu cada matéria — localizadas por um código
   (`M00412-007`) impresso discretamente em cada uma, que também serve ao leitor
   para citar a matéria ao telefone.
3. Segunda passada troca só o texto dentro daquelas caixas. Como a largura não
   muda, a paginação é idêntica.
4. **Conferência:** as páginas são medidas outra vez no PDF final e comparadas.
   Se divergirem, o fechamento **falha** em vez de publicar um sumário que
   aponta para a página errada.

*Alternativa descartada:* medir posições no DOM e dividir pela altura da página.
Não funciona — quebra de página forçada não aparece nas coordenadas do fluxo
contínuo, e o sumário sairia errado justamente nas edições grandes.

### 4.2. O que vai em toda página

Cabeçalho com o nome do veículo, número e data. Rodapé com **QR Code, código
verificador, endereço de conferência e paginação contínua**. O QR não fica só
na capa porque folha de diário circula solta: alguém imprime a página 7 e a
anexa a um processo — aquela folha, sozinha, precisa dizer como se confere.

### 4.3. PDF/A — o que está e o que não está

Estão: fontes embutidas em subconjunto, texto pesquisável com acentuação
correta, estrutura marcada, idioma declarado, título no metadado. **Não está**
a conformidade formal PDF/A-2b, que exige XMP com `pdfaid`, OutputIntent com
perfil ICC e validação por veraPDF. **`TODO(implantação)`:** rodar veraPDF antes
da virada e acrescentar o pós-processamento. Preferi declarar a lacuna a
carimbar "PDF/A" sem ter validado — num módulo cuja razão de existir é a
confiança verificável, afirmação não conferida é exatamente o defeito.

---

## 5. Assinatura — e por que ela mora em outro processo

**A chave privada que assina como o Município é o ativo mais sensível do
portal: com ela se fabrica um ato administrativo.**

O processo web (`portal-web`) atende a internet, renderiza HTML vindo do CMS e
recebe upload de arquivo. É a maior superfície de ataque do sistema. Dar-lhe a
chave seria trocar toda a garantia do módulo por comodidade de arquitetura.

Então: **`portal-diario`** (`infra/diario/servico-assinatura.mjs`) é um serviço
separado, com usuário próprio, que detém a chave e o Chromium. Escuta em
`127.0.0.1:4322`, exige segredo compartilhado, não é exposto pelo Nginx.
`data/diario/certificados` é `750 root:portal-diario` — o `portal-web` não lê.
É a mesma separação já usada no envio de e-mail.

### 5.1. Como a assinatura é aplicada

PAdES por **atualização incremental** (`infra/diario/assinatura.mjs`): acrescenta
ao PDF um dicionário `/Type /Sig` com `/SubFilter /ETSI.CAdES.detached`, cujo
`/Contents` guarda uma estrutura CMS destacada que cobre todo o arquivo menos o
próprio `/Contents`. **O PDF original não tem um byte alterado** — e é
exatamente isso que dá para provar depois.

A parte criptográfica é do OpenSSL (`cms -sign -cades`). Montar CMS/PKCS#7 em
ASN.1 na mão para *assinar* é território de erro silencioso: uma assinatura mal
formada não "quebra", ela passa aqui e é recusada pelo validador do ITI seis
meses depois, no meio de uma auditoria.

### 5.2. Os dois caminhos de certificado

- **A1 (arquivo no servidor):** `DIARIO_CERT` / `DIARIO_CHAVE` em `.env.diario`,
  legível só pelo serviço. Assinatura automática no fechamento.
- **A3 (token/cartão):** o sistema gera o PDF, a autoridade baixa, assina
  localmente com o assinador ICP-Brasil ou o gov.br, e envia de volta. **A
  validação no upload é a mesma função que valida qualquer PDF** (§6): confere
  se é PAdES, se o conteúdo bate e se a cadeia é reconhecida. Assinatura
  reprovada bloqueia a publicação.
  **`TODO(implantação)`:** a tela de upload do A3 no painel ainda não existe —
  o caminho A1 está completo e é o que o seed exercita.

### 5.3. Carimbo do tempo

Não implementado: depende de contratar uma ACT credenciada. O gancho está em
`carimbar()`. **Sem carimbo, a data da assinatura vem do relógio de quem
assinou** — é aceito, mas prova menos, e a página da edição **diz isso ao
cidadão** em vez de omitir.

### 5.4. Certificado de demonstração

O seed gera uma AC e um certificado próprios (`certificado-demo.mjs`), com nome
comum em maiúsculas dizendo `NÃO É ICP-BRASIL`. A validade começa 4 anos atrás
— não é truque: o acervo cobre 24 meses e cada edição é assinada com a data em
que teria circulado; um certificado emitido hoje marcaria todas as edições
históricas como "assinadas fora da validade", um alarme falso em cada página que
ensinaria o avaliador a ignorar o alarme.

---

## 6. Verificação — duas implementações independentes

`apps/web/src/lib/diario/verificar.mjs`, em **Node puro**: leitor DER escrito à
mão + `node:crypto`. Sem subprocesso.

**Por que não chamar o OpenSSL aqui:** esta função roda dentro do processo web,
deliberadamente confinado pelo systemd (`SystemCallFilter`,
`ProtectSystem=strict`, sem capacidades). Chamar binário externo no caminho de
uma requisição desse processo é atrito garantido e superfície nova.

**E há um ganho maior:** quem assina (OpenSSL) e quem confere (Node) são duas
implementações independentes. Um erro na mesma cabeça não passa despercebido nas
duas.

### 6.1. Três perguntas, três respostas separadas

1. **Integridade** — o conteúdo confere com a assinatura? (SHA-256 do conteúdo
   contra o `messageDigest` assinado, e verificação RSA sobre os `signedAttrs`)
2. **Cobertura** — a `/ByteRange` cobre o arquivo inteiro, ou alguém **anexou
   conteúdo depois**? Este é o ataque clássico contra PDF assinado: a assinatura
   continua conferindo para a parte antiga, e o leitor desavisado vê selo verde
   num documento alterado. Aqui é reprovado.
3. **Confiança** — o certificado vem de uma âncora reconhecida?

Um documento pode ser íntegro e assinado por qualquer um. **Fundir as três
respostas num "válido" verde é como se produz o selo que não vale nada.** A
página de autenticidade exibe as três separadas, e aponta o cidadão para o
validador oficial do Governo Federal — confiança que só o próprio sistema atesta
não é confiança.

**Duas pegadinhas do CMS que custaram tempo e estão documentadas no código:**
os `signedAttrs` precisam ser reserializados como `SET` (`0x31`) e não com o
`[0] IMPLICIT` (`0xA0`) que aparece no arquivo; e o certificado do signatário é
o que a chave verifica, **não** o primeiro do pacote — que costuma ser a
autoridade certificadora. Exibir a AC como signatário seria erro grave numa
página de autenticidade.

**`TODO(implantação)`:** as âncoras hoje são a AC de demonstração. Baixar as
raízes da ICP-Brasil do ITI e colocá-las em `data/diario/confianca/`. Enquanto
isso, a página **diz em voz alta** que a âncora é de teste.

---

## 7. Busca

Índice **em memória** no processo web (`lib/diario/indice.ts`), com cache de 60 s
e carga compartilhada entre requisições simultâneas.

**Até quando isso serve.** Cambuí publica entre 1.500 e 3.000 matérias por ano.
Dez anos de acervo são ~25 mil matérias; com o corpo em texto puro, ~40 MB no
processo. O gatilho para migrar é a memória passar de ~150 MB ou a carga inicial
passar de 3 s — o que acontece perto de **100 mil matérias**. Antes disso, trocar
seria complexidade sem cliente.

**O caminho de migração está escrito e é curto:**

```sql
ALTER TABLE diario_materias ADD COLUMN busca tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('portuguese', coalesce(ementa,'')), 'A') ||
    setweight(to_tsvector('portuguese', coalesce(numero_ato,'') || ' ' || coalesce(ano_ato::text,'')), 'A') ||
    setweight(to_tsvector('portuguese', regexp_replace(coalesce(corpo,''), '<[^>]*>', ' ', 'g')), 'B')
  ) STORED;
CREATE INDEX ix_diario_busca ON diario_materias USING GIN (busca);
CREATE EXTENSION IF NOT EXISTS unaccent;
```

O que o índice em memória faz e um `tsvector` não faria sozinho: **dicionário de
sinônimos do cidadão** ("demissão" → "exoneração", "posto" → "unidade básica de
saúde"), tolerância a erro de digitação por distância de edição, e o **atalho por
número de ato** — digitar "Decreto 1.245/2026" leva direto à matéria, com
redirecionamento 302, em vez de listar quarenta resultados.

---

## 8. Preservação digital

- **Exportação completa** (`npm run export`): PDFs + metadados em JSON, com
  manifesto e hashes. Se o município trocar de fornecedor, leva o acervo inteiro.
  Isso é argumento comercial, não fraqueza.
- **Verificação periódica de integridade** (`npm run verificar`): recalcula o
  SHA-256 de cada PDF publicado e compara com o gravado. Detecta corrupção
  silenciosa de disco, que é como acervo digital morre de verdade.
- **`TODO(implantação)`:** agendar `npm run verificar` semanalmente e enviar o
  relatório; incluir `data/diario` e o dump do Postgres no backup para fora do
  servidor.

---

## 9. Conformidade

| Norma | Como aparece |
|---|---|
| **MP 2.200-2/2001** e **Lei 14.063/2020** | Assinatura PAdES com certificado ICP-Brasil (A1 ou A3); metadados da assinatura exibidos e conferíveis por terceiro. |
| **Lei 12.527/2011 (LAI)** | API JSON, CSV e RSS sem cadastro; CORS liberado; certidão sem exigir identificação (art. 10, §3º). |
| **Lei 14.133/2021** | Vínculo com o módulo de licitações; nota permanente de que **complementa e não substitui o PNCP**. |
| **Lei 13.709/2018 (LGPD)** | CPF mascarado; detector de padrões sensíveis avisa **antes** de publicar; caderno de pessoal fora do índice de buscadores; base de assinantes mínima; descadastro apaga o registro. |
| **Lei 11.419/2006** | Regra padrão de contagem de prazo, configurável pela lei municipal. |
| **WCAG 2.1 AA / eMAG** | Ver §10. |

**Limite institucional**, repetido no rodapé de toda página do módulo, na
certidão, no PDF e dentro do JSON da API: este veículo **não substitui** o PNCP
nem o Diário Oficial do Estado onde a lei os exigir, e em caso de divergência
**prevalece o arquivo assinado**.

---

## 10. Acessibilidade e desempenho

- A **versão HTML da matéria é o caminho acessível principal**; o PDF é o
  documento com fé pública. Os dois funcionam, e a página diz qual é qual.
- Busca, filtros, paginação, download e reordenação da pauta funcionam **sem
  JavaScript**. O que o JS acrescenta: envio automático do filtro, botão de
  copiar a citação, arrastar para reordenar. Nenhuma função existe só no
  caminho com script.
- Tabelas de matéria orçamentária rolam dentro da própria caixa
  (`overflow-x: auto`); a página nunca rola na horizontal. Hashes de 64
  caracteres quebram com `overflow-wrap: anywhere` — sem isso, estouram a
  largura em 360 px.
- Resultados medidos em §11.

---

## 11. Medido, não estimado

Nada nesta seção é estimativa.

| O quê | Valor | Como foi medido |
|---|---|---|
| Lighthouse — acessibilidade | **100 em todas as páginas** | Chromium 151 + Lighthouse 13.4.1, perfil móvel estrangulado |
| Lighthouse — desempenho móvel | 91 a 98 | idem; detalhe em [lighthouse-diario.md](lighthouse-diario.md) |
| LCP móvel | 2,3 s a 2,6 s (3,2 s na edição de 88 páginas) | idem |
| Renderização de um documento | **0,28 s** | 6 documentos numa sessão de Chromium reaproveitada |
| Seed completo | **~12 min** para 148 edições e ~1.800 matérias, com PDFs assinados | execução real |
| Páginas por matéria | **0,447** | 150 matérias renderam 67 páginas; usado para dimensionar a edição gigante |
| Maior edição do acervo | **88 páginas**, 200 matérias | seed |
| Assinatura | íntegra, cobrindo o arquivo inteiro, cadeia conferida | `npm run testar:assinatura`, 8 casos |
| Detecção de adulteração | 1 bit trocado → recusado; conteúdo anexado depois → recusado | idem |
| Paginação do sumário | conferida contra o texto extraído do PDF | `npm run testar:paginacao` |

### O defeito que os testes acharam

Durante a validação, o teste de paginação encontrou **9 de 9 matérias com o
número de página errado** numa edição. A causa: a lista de matérias em ordem do
**documento** estava sendo indexada pela lista em ordem de **inserção** —
`inseridas[k]` para `resultado.materias[k]`. Nada quebrava, nada aparecia no
log; só a referência de citação passou a mentir sobre a página, que é
exatamente o dano que este módulo existe para evitar.

Corrigido casando por `id` em vez de posição, em três lugares (seed, serviço de
assinatura e a documentação de `prepararMaterias`), e coberto por
`infra/diario/testar-paginacao.mjs`, que roda em `npm run testar` — a primeira
tentativa de teste, que comparava localizador com índice, **não pegava o
defeito**, porque os dois lados estavam embaralhados do mesmo jeito e o erro se
cancelava. O teste que vale confere pela identidade do texto.

---

## 12. O que ficou como `TODO`

| Onde | O quê | De quem depende |
|---|---|---|
| `.env.diario` | Certificado A1 do Município (ou fluxo A3) | Cliente — comprar/emitir o certificado |
| `dominio.mjs` | Confirmar a lista de **feriados municipais** | Cliente — Procuradoria |
| `seed.mjs` | **CNPJ real** da Prefeitura e nomes das autoridades do expediente | Cliente |
| `diario_veiculo` | Número, data e link da **lei instituidora** real | Cliente — hoje há um placeholder plausível |
| `assinatura.mjs` | **Carimbo do tempo** (PAdES-B-T) | Cliente — contratar ACT |
| `verificar.mjs` | Âncoras de confiança da **ICP-Brasil** | Implantação |
| PDF | Validação **PDF/A-2b** com veraPDF e pós-processamento XMP | Implantação |
| Painel | Tela de **upload de PDF assinado por A3** | Implantação |
| Painel | Tela de **importação de acervo retroativo** (o seed importa; falta a interface) | Implantação |
| Operação | Agendar `npm run verificar` e incluir `data/diario` no backup externo | Implantação |
| Ambos | Remover o acervo de demonstração: `npm run seed -- --reset` | Antes da virada |

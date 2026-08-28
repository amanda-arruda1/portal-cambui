# Roteiro de validação — Órgão Oficial Eletrônico

Quinze minutos, na ordem. Cada passo diz **o que você deve ver**; se vir outra
coisa, é defeito.

Substitua `SITE` pelo endereço que estiver usando:
`http://127.0.0.1:4321` (no servidor) ou `https://portal.cambui.mg.gov.br`.

> **Ambiente de demonstração.** Todo o acervo é fictício, marcado no banco e com
> marca d'água nos PDFs. Nomes de pessoas e empresas são inventados; CPFs são
> sintaticamente válidos e sempre exibidos mascarados.

---

## Parte 1 — A área pública (5 min)

**1. Página principal** → `SITE/diario-oficial`
Deve listar **matérias**, não edições. No alto, a última edição publicada e
quatro atalhos. À direita de cada filtro, o contador do que ele devolveria.

**2. Busca no texto integral** → digite `recapeamento` e busque.
Deve trazer matérias cujo **corpo** contém a palavra — não só o título — com o
termo **destacado** num trecho de contexto.

**3. Tolerância a erro** → busque `exoneracao` (sem acento) e depois `exoneraçao`.
Ambas devem funcionar.

**4. Sinônimo do cidadão** → busque `demissão`.
Deve encontrar atos de **exoneração**: as duas palavras não compartilham radical,
e é um dicionário explícito que faz a ponte.

**5. Atalho por número do ato** → copie um "Decreto nº N/AAAA" que apareceu na
lista e busque exatamente `Decreto N/AAAA`.
Deve **redirecionar direto para a matéria**, sem passar por lista de resultados.

**6. Filtros na URL** → escolha um caderno e uma secretaria. Copie a URL, abra
numa aba anônima. Deve reproduzir exatamente o mesmo resultado.

**7. Sem JavaScript** → desligue o JS no navegador (DevTools → Settings →
Debugger → Disable JavaScript) e repita 2, 5 e 6.
Busca, filtros, paginação e download devem continuar funcionando. O que se perde:
envio automático ao trocar o filtro, botão de copiar e arrastar na pauta.

**8. Estado vazio com direção** → busque `xyzabc`.
Não deve dizer só "nada encontrado": deve oferecer ampliar o período, explicar
desde quando o acervo começa e oferecer o aviso por e-mail.

---

## Parte 2 — A matéria e a citação (2 min)

**9. Página da matéria** → clique em qualquer resultado.

Confira, nesta ordem:
- O **texto integral em HTML**, selecionável — não um PDF embutido.
- **Referência para citação**, com botão de copiar. Deve estar assim:
  `Publicado no Diário Oficial Eletrônico do Município de Cambuí, Ano III, Edição nº NNN, de DD/MM/AAAA, páginas X a Y.`
  → **Este é o item que resolve, sozinho, a dor que originou o módulo.**
- **As duas datas**, lado a lado e rotuladas: *Disponibilização* e
  *Publicação legal* — com a frase explicando qual conta prazo.
- Links para o PDF da edição, para a certidão e para a página de autenticidade.

**10. Errata com remissão nos dois sentidos** →
`SITE/diario-oficial?tipo=errata`
Abra a errata: ela aponta para a matéria original. Clique nela: a **original
aponta de volta** para a errata, com faixa "Retificado por errata".
→ A remissão inversa é **calculada**, não gravada — por isso não pode
dessincronizar.

**11. Republicação** → `SITE/diario-oficial?tipo=republicacao`, mesmo teste.

---

## Parte 3 — Autenticidade (3 min) — *a parte do auditor*

**12. Pelo código** → abra uma edição, copie o **código verificador**, e vá a
`SITE/diario-oficial/autenticidade`. Cole no primeiro campo.
Deve confirmar edição, datas, páginas, signatário e o SHA-256.

**13. Pelo arquivo — o teste que importa** → baixe o PDF da edição e envie-o no
**segundo** campo.
Deve responder **DOCUMENTO AUTÊNTICO**, dizendo de que edição se trata, com as
três respostas separadas: *conteúdo confere*, *assinatura cobre o arquivo
inteiro*, *cadeia reconhecida*.

**14. Adulteração é recusada** → abra o PDF num editor de texto qualquer, troque
um caractere no meio, salve e envie de novo.
Deve responder **DOCUMENTO ADULTERADO**.

Ou, sem editor, pelo terminal:
```bash
cd /opt/portal-cambui && npm run testar:assinatura
```
Os oito casos incluem o mais perigoso: **conteúdo anexado depois da assinatura**,
em que a assinatura continua conferindo para a parte antiga — e que um
verificador ingênuo exibiria com selo verde.

**15. O PDF por dentro** →
```bash
pdfinfo  /caminho/do.pdf | grep -E 'Tagged|Pages'   # Tagged: yes
pdftotext /caminho/do.pdf - | head -30              # texto pesquisável, com acentos
```
Abra o PDF e confira: capa com as duas datas, **sumário com links que navegam**,
paginação contínua, e **QR Code + código verificador em todas as páginas** — não
só na capa, porque folha de diário circula solta.

**16. Certidão de publicação** → na página da matéria, clique em *Certidão de
publicação deste ato*.
Deve baixar um **PDF assinado** atestando a publicação, com a referência de
citação e as duas datas. É o que se anexa a processo administrativo — captura de
tela não prova nada.

---

## Parte 4 — O painel, de ponta a ponta (4 min)

Entre em `SITE/painel` e vá a **Diário Oficial**.

**17. Envio** → *Nova matéria*. Escolha "Portaria", clique em
**Usar um modelo pronto** → *Aplicar modelo*: ementa e texto vêm estruturados.
Preencha e **Enviar para revisão**.

**18. Validação que evita nulidade** → tente enviar uma matéria com um CPF
inteiro no texto (ex.: `123.456.789-09`).
Deve **exigir confirmação consciente** antes de seguir, dizendo que o CPF precisa
ser mascarado. Tente também um "Aviso de licitação" sem número de processo:
mesmo comportamento.

**19. Revisão e devolução** → abra a matéria como editor, use *Devolver* com um
motivo. O motivo aparece no **histórico de devoluções**, com autor e data.

**20. Ninguém aprova o próprio texto** → tente **Aprovar** uma matéria que você
mesmo redigiu.
Deve ser **bloqueado**. O autor é lido do banco, não do formulário — forjar um
campo escondido não contorna.

**21. Montagem** → *Abrir edição*. Escolha um **sábado** como data e deixe o tipo
"ordinária": deve recusar e mandar marcar como extraordinária com justificativa.
Abra a edição corretamente, inclua matérias aprovadas, reordene com ↑ ↓ (funciona
sem JS) ou arrastando.

**22. Fechar** → *Fechar e assinar a edição*.
Gera o PDF, calcula o sumário e assina. Tente fechar uma edição **sem matérias**:
deve recusar.

**23. Publicar** → confira o PDF e publique.

**24. Imutabilidade** → volte à edição publicada.
A tela é só de leitura e diz por quê. Prove que a regra é do **banco**, não da
tela:
```bash
cd /opt/portal-cambui && set -a && . ./.env && set +a
docker exec -e PGPASSWORD="$POSTGRES_PASSWORD" -i portal-postgres \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -f - < infra/directus/diario/testar-imutabilidade.sql
```
Seis operações; as cinco proibidas devem dar `ERROR`, e só a marcação de anulação
deve passar. Roda em transação e não deixa resíduo.

---

## Parte 5 — Dados abertos, integração e preservação (1 min)

**25. Integração com licitações** →
`SITE/diario-oficial?tipo=aviso_de_licitacao`
Abra um aviso: ele traz o vínculo com o registro do módulo de Licitações.

**26. Saídas legíveis por máquina**
```bash
curl -s 'SITE/api/diario-oficial?limite=2' | head -40
curl -s 'SITE/diario-oficial/exportar.csv?atalho=este-mes' | head -3
curl -s 'SITE/diario-oficial/feed.xml' | grep -c '<item>'
curl -s 'SITE/diario-oficial/sitemap.xml' | grep -c '<url>'
```
O CSV abre direto no Excel em português (BOM + ponto-e-vírgula).

**27. Aviso por e-mail** → `SITE/diario-oficial/avisos`.
Finalidade declarada, base mínima, duplo opt-in. Cadastre-se e confira a fila:
```bash
curl -s 'http://127.0.0.1:8055/items/diario_envios?limit=1&sort=-criado_em'
```

**28. Preservação**
```bash
cd /opt/portal-cambui
npm run verificar    # recalcula o SHA-256 de cada PDF e revalida a assinatura
npm run export       # acervo completo: PDFs + JSON + manifesto com hashes
```

**29. Página institucional** → `SITE/diario-oficial/orgao-oficial`
Responde qual é o veículo, qual lei o instituiu, desde quando, e **como se
contam os prazos** — com um exemplo calculado com a data de hoje.

**30. 360 px** → DevTools, largura 360.
Nada deve romper e a página **não deve rolar na horizontal** em nenhuma tela,
inclusive na da lei orçamentária, que tem tabelas grandes.

---

## Casos de borda no acervo de demonstração

Todos existem e podem ser conferidos:

| Caso | Como achar |
|---|---|
| 3 edições extraordinárias, uma em **sábado** | `SITE/diario-oficial/arquivo` — dias marcados fora da semana |
| 1 edição suplementar | mesma página |
| 1 **errata** com remissão nos dois sentidos | `?tipo=errata` |
| 1 **republicação** por incorreção | `?tipo=republicacao` |
| 1 edição **anulada**, ainda acessível | busque a faixa vermelha no arquivo |
| 1 **lei orçamentária** longa, com tabelas | `?tipo=lei` — a maior |
| 1 matéria de uma linha | `?tipo=outros` |
| 1 edição de **80+ páginas** | a maior do arquivo |
| 5 edições **importadas do acervo**, só PDF com OCR | as de número 1 a 5 |
| Avisos de licitação **ligados** ao módulo de Licitações | `?tipo=aviso_de_licitacao` |

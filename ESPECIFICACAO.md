# Especificação — Sistema de Representação Comercial (INOVE Representações)

> **Como usar este documento no Claude Code**
>
> 1. Crie uma pasta vazia para o projeto e entre nela.
> 2. Salve este arquivo dentro dela como `ESPECIFICACAO.md`.
> 3. Rode `claude` nessa pasta e cole o prompt da **seção 14 (Etapa 1)**.
> 4. Siga as etapas 2 a 8 na ordem — uma por vez, testando entre elas.
>
> Este documento é a fonte da verdade. Se algo aqui conflitar com uma
> decisão improvisada durante a implementação, este documento vence.

---

## 1. Objetivo

Sistema web de gestão para representante comercial autônomo, equivalente ao
Mercos, mas próprio e sem mensalidade. Um representante atende várias
**representadas** (fábricas/fornecedores) e vende para **clientes** (lojas,
mercados, adegas). O sistema precisa dar conta de:

- lançar **pedidos** e **cotações** na frente do cliente, inclusive pelo celular;
- cadastrar **produtos por representada**, com **tabelas de preço** e **foto**;
- cadastrar **clientes** puxando CNPJ e endereço automaticamente;
- controlar **metas** diária, mensal, anual e o histórico de anos anteriores;
- mostrar **painel** e **faturamento com projeção**;
- emitir **relatório de vendas** do mês ou de um período, para imprimir e mandar no WhatsApp;
- enviar **cópia do pedido** ao cliente por WhatsApp, e-mail ou PDF.

**Usuário-alvo:** representante comercial, pouca familiaridade com tecnologia.
Toda a interface, mensagens de erro, nomes de arquivo, variáveis e comentários
de código são em **português do Brasil**.

---

## 2. Restrições técnicas (obrigatórias)

| Item | Decisão |
|---|---|
| Runtime | **Node.js 22+**, sem framework |
| Dependências npm | **ZERO.** Nada de Express, better-sqlite3, bcrypt, pdfkit, React |
| Banco | `node:sqlite` (`DatabaseSync`), nativo do Node 22 |
| Servidor HTTP | `node:http` com roteador próprio |
| Senhas | `crypto.scryptSync` |
| Sessão | Token no formato JWT HS256 assinado com `crypto.createHmac`, em cookie `HttpOnly` |
| PDF | Gerador próprio em JS puro (Helvetica/Helvetica-Bold, WinAnsiEncoding) |
| Imagens no PDF | Leitor próprio de PNG (via `node:zlib`) e JPEG |
| Front-end | HTML + CSS + JavaScript puro (1 `index.html`, 1 `style.css`, 1 `app.js`), SPA com rotas por hash |
| Build step | Nenhum. `node server.js` e pronto |

**Motivo da regra de zero dependências:** o sistema roda no computador do
usuário final, muitas vezes sem internet liberada e sem conhecimento técnico
para instalar pacotes. Também elimina quebra por atualização de biblioteca.

---

## 3. Estrutura de arquivos

```
server.js                servidor HTTP, roteador, estáticos, fallback de porta
src/db.js                schema, migrações, config, usuário inicial
src/auth.js              scrypt, assinatura e verificação de token
src/rotas-cadastros.js   login, usuários, representadas, tabelas, prazos,
                         produtos, preços, foto de produto, clientes,
                         consulta CNPJ/CEP, logo, backup
src/rotas-pedidos.js     pedidos, cotações, PDF do pedido, catálogo, texto p/ WhatsApp
src/rotas-painel.js      metas, histórico, painel, faturamento, relatório de vendas
src/pdf.js               gerador de PDF (pedido, catálogo e relatório)
src/imagem.js            decodificação de PNG e JPEG
public/index.html        casca da SPA
public/style.css         estilo único
public/app.js            toda a interface
seed-exemplo.js          dados fictícios para teste
iniciar-windows.bat      atalho Windows
abrir-navegador.bat      abre o navegador só depois do servidor subir
liberar-firewall.bat     libera as portas 3000-3010 para acesso pelo Wi-Fi
iniciar-mac-linux.command
dados/repsys.db          banco (criado sozinho)
dados/produtos/          fotos dos produtos
dados/logo.png           logo da empresa
dados/porta.txt          porta em uso (lida pelo atalho do navegador)
dados/.chave             segredo das sessões (gerado na 1ª execução)
```

---

## 4. Modelo de dados (SQLite)

Criar com `CREATE TABLE IF NOT EXISTS`. `PRAGMA journal_mode = WAL` e
`PRAGMA foreign_keys = ON`.

```sql
usuarios(id, nome, email UNIQUE, senha_hash, papel['admin'|'representante'],
         telefone, ativo, criado_em)

representadas(id, nome, cnpj, contato, email, telefone,
              comissao_pct REAL, pedido_minimo REAL, observacoes, ativo, criado_em)

tabelas_preco(id, representada_id→representadas ON DELETE CASCADE, nome,
              vigencia_inicio, vigencia_fim, padrao, ativo)

condicoes_pagamento(id, representada_id→representadas ON DELETE CASCADE,
                    descricao, parcelas, prazo_medio, acrescimo_pct,
                    desconto_pct, padrao, ativo)

produtos(id, representada_id→representadas ON DELETE CASCADE, codigo, descricao,
         unidade, ncm, ipi_pct, st_pct, embalagem, peso, estoque, preco_base,
         desconto_max_pct, imagem, observacoes, ativo, criado_em,
         UNIQUE(representada_id, codigo))

precos(id, tabela_id→tabelas_preco CASCADE, produto_id→produtos CASCADE,
       preco, UNIQUE(tabela_id, produto_id))

clientes(id, cnpj, razao_social, nome_fantasia, ie, email, telefone, contato,
         cep, logradouro, numero, complemento, bairro, cidade, uf,
         situacao, abertura, atividade, usuario_id→usuarios, observacoes,
         ativo, criado_em)

pedidos(id, numero UNIQUE, tipo['pedido'|'cotacao'], status,
        cliente_id→clientes, representada_id→representadas, usuario_id→usuarios,
        tabela_id→tabelas_preco, condicao_id→condicoes_pagamento,
        data_emissao, data_entrega, validade, tipo_frete, transportadora,
        frete, desconto_pct, total_bruto, total_ipi, total, comissao_valor,
        origem_id→pedidos, observacoes, criado_em, atualizado_em)

pedido_itens(id, pedido_id→pedidos ON DELETE CASCADE, produto_id→produtos,
             codigo, descricao, unidade, quantidade, preco_unit,
             desconto_pct, ipi_pct, total)

metas(id, ano, mes NULL, representada_id NULL, usuario_id NULL,
      valor, dias_uteis, meta_diaria, observacoes)
-- UNIQUE(ano, IFNULL(mes,0), IFNULL(representada_id,0), IFNULL(usuario_id,0))
-- mes NULL = meta anual; representada_id NULL = todas; usuario_id NULL = equipe

historico_vendas(id, ano, mes, representada_id NULL, realizado, meta, observacoes)
-- UNIQUE(ano, mes, IFNULL(representada_id,0))

config(chave PRIMARY KEY, valor)
```

**Índices:** `clientes(cnpj)`, `pedidos(data_emissao)`, `pedidos(representada_id)`,
`pedido_itens(pedido_id)`.

**Migração de bancos já existentes:** função `garantirColuna(tabela, coluna, definicao)`
que lê `PRAGMA table_info` e faz `ALTER TABLE ADD COLUMN` se a coluna não existir.
Chamar para `produtos.imagem`. Toda coluna nova futura entra por aí — nunca
recriar tabela, porque o banco do usuário tem dados reais.

**Config padrão (inserida com `INSERT OR IGNORE`):**
```
empresa_nome = 'INOVE Representações'
empresa_cnpj, empresa_telefone, empresa_email, empresa_endereco = ''
contar_status = 'aberto,enviado,faturado'
logo_arquivo = ''
```

**Usuário inicial:** se `usuarios` estiver vazia, criar
`Administrador / admin@local / admin123 / papel admin` e imprimir isso no console.

---

## 5. Servidor e roteador

- Roteador próprio: `rota.get/post/put/del(padrao, handler, {publica, admin})`.
  O padrão aceita `:parametro`, convertido em regex `([^/]+)`.
- Middleware implícito em toda requisição `/api/*`: lê o cookie `repsys`
  (ou `Authorization: Bearer`), valida o token, carrega o usuário.
  Sem sessão → **401** com `{"erro":"Sessão expirada. Faça login novamente."}`.
  Rota `admin` com usuário representante → **403**.
- Erros: classe `ErroApi(mensagem, codigo)`. O handler devolve
  `{"erro": mensagem}` com o código HTTP. **A mensagem é lida pelo usuário
  final** — escrever em português claro, sem jargão técnico
  (ex.: *"Pedido mínimo de Vinícola Serra Alta é R$ 1.500,00. Total atual: R$ 738,80."*).
- Qualquer rota que não comece com `/api/` serve arquivo estático de `public/`;
  caminho desconhecido devolve `index.html` (SPA).
- **Porta:** começa em `process.env.PORT || 3000`. Em `EADDRINUSE`, tenta a
  próxima, até 12 vezes. Ao subir, grava a porta em `dados/porta.txt` e imprime
  um quadro no console com: endereço local, endereço na rede (IPv4 não interno,
  para acesso pelo celular), login inicial e o aviso *"NÃO FECHE ESTA JANELA"*.

---

## 6. Rotas da API

### Sessão e configuração
| Método | Rota | Acesso | O que faz |
|---|---|---|---|
| POST | `/api/login` | pública | `{email, senha}` → cookie de sessão (30 dias) |
| POST | `/api/logout` | pública | limpa o cookie |
| GET | `/api/eu` | logado | usuário + toda a config |
| POST | `/api/senha` | logado | `{atual, nova}` |
| GET/PUT | `/api/config` | GET logado / PUT admin | pares chave-valor |
| GET | `/api/backup` | admin | download do arquivo `.db` |
| GET | `/api/logo` | **pública** | logo (204 se não houver) — pública porque aparece na tela de login |
| POST/DELETE | `/api/logo` | admin | envia/remove logo (data URL, máx. 3 MB) |

### CRUD genérico
Uma função `crud(nome, tabela, campos, opcoes)` registra `GET /api/{nome}`,
`GET/POST/PUT/DELETE /api/{nome}/:id`. `opcoes`: `admin` (protege escrita),
`listar` (SQL customizado), `antes` (normaliza o corpo), `ordem`.
Nunca devolver `senha_hash` na resposta.

| Recurso | Escrita | Observações da listagem |
|---|---|---|
| `usuarios` | admin | sem `senha_hash`; `senha` no corpo vira `senha_hash` |
| `representadas` | admin | traz `qtd_produtos` e `qtd_tabelas` |
| `tabelas` | admin | filtro `?representada_id=`, traz `qtd_precos`; ao marcar `padrao`, desmarca as outras da mesma representada |
| `condicoes` | admin | filtro `?representada_id=` devolve as da representada **e** as globais (`representada_id IS NULL`) |
| `produtos` | admin | filtros `representada_id`, `ativo`, `busca`, `tabela_id`, `limite`; com `tabela_id` devolve `preco_tabela` e `preco_venda = preco_tabela ?? preco_base` |
| `clientes` | **qualquer logado** | busca por razão social, fantasia, CNPJ ou cidade; traz `qtd_pedidos`, `total_comprado`, `ultima_compra` |

Extras: `GET /api/clientes/:id/historico` (pedidos do cliente),
`GET|POST|DELETE /api/precos` (upsert em lote por `tabela_id`, admin).

### Foto do produto
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/produtos/:id/imagem` | logado — 204 se não houver |
| POST | `/api/produtos/:id/imagem` | admin — corpo `{dados: "data:image/jpeg;base64,..."}`, máx. 4 MB |
| DELETE | `/api/produtos/:id/imagem` | admin |

Grava em `dados/produtos/{id}.jpg|png` e salva o nome em `produtos.imagem`.
**A redução da imagem acontece no navegador antes do envio** (canvas, lado maior
900 px, JPEG qualidade 0.82) — o servidor não redimensiona.

### Consultas externas
| Rota | Fonte | Reserva |
|---|---|---|
| `GET /api/consulta/cnpj/:cnpj` | BrasilAPI `/api/cnpj/v1/{cnpj}` | ReceitaWS |
| `GET /api/consulta/cep/:cep` | BrasilAPI `/api/cep/v1/{cep}` | ViaCEP |

`fetch` nativo com `AbortSignal.timeout(10-12s)`. **Nunca lançar erro por falta
de internet** — devolver `{dados: null, aviso: "..."}` para o usuário preencher
à mão. Na consulta de CNPJ, avisar se já existe cliente com aquele CNPJ.

### Pedidos e cotações
| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/pedidos` | filtros `tipo, status, cliente_id, representada_id, usuario_id, de, ate, busca, limite` |
| GET | `/api/pedidos/:id` | pedido + itens + nomes de cliente/representada/condição |
| POST/PUT | `/api/pedidos[/:id]` | grava cabeçalho e itens em **transação** (BEGIN/COMMIT/ROLLBACK); no PUT apaga e regrava os itens |
| DELETE | `/api/pedidos/:id` | representante não exclui pedido faturado |
| POST | `/api/pedidos/:id/status` | valida contra a lista do tipo |
| POST | `/api/pedidos/:id/converter` | cotação → pedido; marca a cotação como `ganha`; guarda `origem_id` |
| POST | `/api/pedidos/:id/duplicar` | cópia com a data de hoje |
| GET | `/api/pedidos/:id/pdf` | PDF (`?download=1` força baixar) |
| GET | `/api/pedidos/:id/texto` | `{texto, whatsapp, email, assunto}` para envio da cópia |
| GET | `/api/catalogo` | catálogo PDF: `representada_id`, `tabela_id`, `com_foto=1` |

### Relatório de vendas
Filtros aceitos por todas as três rotas: `ano` + `mes` (mês fechado) **ou** `de` + `ate`
(período livre), mais `representada_id` e `cliente_id`. Uma única função `dadosRelatorio(query)`
monta os dados; as três rotas apenas mudam o formato de saída.

| Método | Rota | Devolve |
|---|---|---|
| GET | `/api/relatorio/vendas` | JSON: `periodo`, `filtros`, `resumo`, `meses`, `representadas`, `clientes`, `produtos`, `pedidos` |
| GET | `/api/relatorio/vendas/pdf` | PDF pronto para imprimir (`?download=1`, `?detalhado=0` omite a lista de pedidos) |
| GET | `/api/relatorio/vendas/texto` | `{texto, pdf, whatsapp}` — resumo formatado para colar no WhatsApp |

Conteúdo: faturamento, nº de pedidos, ticket médio, clientes atendidos e comissão;
quebra por mês (com meta e % da meta), por representada (com participação %),
top 15 clientes, top 15 produtos e a lista dos pedidos do período (até 300).
Considera apenas `tipo='pedido'` nos status de `contar_status`.

### Metas, histórico, painel e faturamento
| Método | Rota | Acesso |
|---|---|---|
| GET | `/api/metas` | logado |
| POST | `/api/metas` | admin — aceita `{itens:[...]}` em lote, com upsert |
| DELETE | `/api/metas/:id` | admin |
| GET | `/api/metas/grade?ano=` | logado — grade representada × 12 meses com meta e realizado |
| GET/POST/DELETE | `/api/historico` | GET logado, escrita admin |
| GET | `/api/painel` | logado — `ano, mes, representada_id, usuario_id` |
| GET | `/api/faturamento` | logado — `ano, representada_id` |

---

## 7. Regras de negócio

### 7.1 Numeração
`PED-2026-0001` e `COT-2026-0001`. Sequencial por ano e por tipo, obtido do
último número gravado com aquele prefixo.

### 7.2 Cálculo do pedido (fonte da verdade é o servidor)
```
item.total   = quantidade × preco_unit × (1 − desconto_pct_item/100)
total_bruto  = Σ item.total
base         = total_bruto × (1 − desconto_pct_pedido/100)
total_ipi    = Σ [ item.total × (1 − desconto_pct_pedido/100) × ipi_pct/100 ]
total        = base + total_ipi + frete
comissao_valor = base × representada.comissao_pct / 100
```
O front-end repete essa conta em tempo real só para exibição; **o servidor
sempre recalcula antes de gravar**.

### 7.3 Validações ao gravar
- cliente, representada e ao menos um item com quantidade > 0;
- itens com quantidade zero são descartados;
- se `representada.pedido_minimo > 0` e o pedido (tipo `pedido`) ficar abaixo,
  **bloquear** com a mensagem citando os dois valores;
- pedido `faturado` ou `cancelado` não pode ser editado.

### 7.4 Situações
- Pedido: `rascunho → aberto → enviado → faturado`, mais `cancelado`.
- Cotação: `rascunho → enviada → ganha | perdida`, mais `cancelado`.
- A config `contar_status` (padrão `aberto,enviado,faturado`) define o que
  conta como venda realizada nos indicadores.

### 7.5 Metas
- Busca da meta, do mais específico para o mais genérico:
  `(ano, mes, representada, usuario)` → `(ano, mes, representada)`.
- Meta do mês sem representada: usa a linha geral; se não existir, **soma** as
  metas das representadas naquele mês.
- Meta anual: linha com `mes NULL`; se não existir, soma os 12 meses.
- **Meta diária** = `meta_diaria` se > 0, senão `meta do mês ÷ dias_uteis`.
- `Distribuir meta anual`: reparte um valor anual pelos 12 meses em três modos —
  igual, crescente (+2 % ao mês) ou proporcional ao realizado do ano anterior.

### 7.6 Realizado e histórico
Para um mês: usa a soma dos pedidos do sistema; **se for zero**, cai para
`historico_vendas`. Assim o usuário lança os anos antigos à mão sem duplicar
com o que o sistema já registra.

### 7.7 Projeções (tela Faturamento)
```
projecao_mes = realizado_do_mes ÷ (dia_de_hoje ÷ dias_do_mes)
media_mensal = média do realizado dos meses já FECHADOS
projecao_ano = realizado_ano − realizado_mes_atual
             + projecao_mes
             + meses_restantes × media_mensal
```
Exibir na tela, em uma linha, como a projeção é calculada — o usuário precisa
confiar no número.

---

## 8. PDF (gerador próprio)

### Base
- A4 `595.28 × 841.89`, origem no canto inferior esquerdo (converter `y` de cima
  para baixo com `ALTURA − y`).
- Fontes `Helvetica` e `Helvetica-Bold` com `/WinAnsiEncoding`. Embutir as
  tabelas de largura dos glifos (32–126) para conseguir alinhar à direita,
  centralizar e truncar com `…`.
- Escapar `\ ( )`. Converter caracteres acima de Latin-1 para os códigos
  cp1252 (`•` → `\x95`, `—` → `\x97`, `…` → `\x85`, aspas curvas etc.),
  senão saem como lixo. Serializar com `Buffer.from(texto, 'latin1')`.
- Objetos: 1 Catalog, 2 Pages, 3 Helvetica, 4 Helvetica-Bold, depois as imagens,
  depois `Page` + `Contents` por página. Montar a `xref` com os deslocamentos
  reais em bytes — por isso o documento é montado como `Buffer`, não string.
- Imagens: JPEG entra direto com `/DCTDecode`; PNG é decodificado
  (inflate + desfiltragem dos scanlines + composição de transparência sobre
  branco) e regravado com `/FlateDecode`.

### Pedido / cotação
Cabeçalho em fundo branco com o logo à esquerda (altura máx. 44 pt) ou o nome da
empresa; à direita o título (`PEDIDO DE VENDA` / `COTAÇÃO / ORÇAMENTO`), o número
e a data; barra grafite de 2,4 pt embaixo. Depois três blocos com faixa cinza —
**REPRESENTADA**, **CLIENTE**, **CONDIÇÕES COMERCIAIS** — a tabela de itens com
cabeçalho grafite e zebra, os totais alinhados à direita, as observações com
quebra automática de linha e o rodapé com a ressalva legal. Paginação automática
repetindo o cabeçalho.

### Relatório de vendas
Cabeçalho com logo e o período. Faixa de 5 cartões (faturamento, pedidos, ticket médio,
clientes, comissão). Depois as seções com faixa cinza: **FATURAMENTO POR MÊS** (com linha
de total), **POR REPRESENTADA**, **CLIENTES QUE MAIS COMPRARAM**, **PRODUTOS MAIS VENDIDOS**
e **PEDIDOS DO PERÍODO**. Usar um helper `tabela(colunas, linhas, rodape)` com as larguras
somando exatamente a largura útil (`595.28 − 2×36`), quebrando de página sozinho e
repetindo o cabeçalho. Rodapé com contato e `página X de Y`.

### Catálogo
Grade 3 × 3 por página. Cada célula: foto (ou "sem foto"), código, descrição em
até 3 linhas, preço em destaque e unidade/embalagem/IPI. Rodapé com contato e
`Página X de Y`.

---

## 9. Interface

### Estrutura
`index.html` com duas áreas: `#tela-login` e `#app` (menu lateral + `#conteudo`).
`app.js` tem um objeto `telas = {}` e a função `rotear()` lê `location.hash`
(`#/pedidos`, `#/pedido/12`, `#/faturamento?ano=2026`). Cada tela é uma função
`async` que chama `titulo()`, `acoes()` (botões do topo) e `pintar()` (HTML).

### Telas
| Rota | Conteúdo |
|---|---|
| `#/painel` | KPIs (hoje × meta diária, mês × meta, ano × meta, projeção, ticket, comissão), gráfico realizado × meta dos 12 meses, comparativo por ano, desempenho por representada, funil de cotações, últimos lançamentos, top 10 clientes e produtos |
| `#/faturamento` | KPIs, gráfico realizado/meta/ano anterior, tabela mês a mês com acumulado e variação, quebra por representada, explicação da projeção |
| `#/relatorios` | filtro de mês fechado ou período livre + representada; os mesmos blocos do PDF na tela; botões **Ver PDF**, **Baixar**, **Imprimir** e **WhatsApp** |
| `#/pedidos` e `#/cotacoes` | mesma listagem com filtros (busca, período, representada, situação) e soma do período |
| `#/pedido/novo`, `#/pedido/:id` | editor (ver abaixo) |
| `#/clientes` | busca, lista com total comprado e última compra, formulário em modal |
| `#/produtos` | filtros, miniatura, formulário em modal com foto, importação CSV, botão Catálogo PDF |
| `#/representadas` | lista + modais de Tabelas e Prazos |
| `#/metas` | grade editável representada × 12 meses, com o realizado abaixo de cada campo, dias úteis por mês e "Distribuir meta anual" |
| `#/historico` | grade de lançamento das vendas de anos anteriores |
| `#/config` | dados da empresa, logo, senha, equipe, backup |

### Editor de pedido — comportamento esperado
1. Escolher cliente → mostra um resumo (CNPJ, endereço, nº de pedidos, última compra).
2. Escolher representada → carrega tabelas de preço e prazos **daquela** representada
   e já seleciona os marcados como padrão; carrega os produtos.
3. Trocar a tabela → pergunta se atualiza os preços dos itens já lançados.
4. Escolher o prazo → se a condição tiver acréscimo/desconto, preenche o desconto geral.
5. **+ Adicionar produto** → modal com busca por código ou descrição, mostrando
   miniatura, preço, embalagem, IPI e estoque. Clicar adiciona; clicar de novo
   soma a embalagem à quantidade.
6. **+ Item avulso** → linha em branco para produto fora do cadastro.
7. Totais recalculados a cada digitação, com comissão e pedido mínimo no rodapé.
8. Depois de salvo: **Ver PDF**, **Enviar cópia**, **Situação**, **⋯** (duplicar,
   converter, excluir).

### Enviar cópia
Modal com WhatsApp (`https://wa.me/55{telefone}?text=...`), e-mail (`mailto:` com
assunto e corpo), baixar PDF e o texto editável com botão de copiar.

### Aparência
Identidade INOVE Representações: preto/grafite `#2d2d31`, menu `#17171a`, fundo
`#f5f7fa`, cartões brancos com borda `#e3e6ea`. Verde/laranja/vermelho **apenas**
nos indicadores de meta. Logo em SVG desenhado como padrão, substituído pelo
arquivo enviado em Configurações.

**Impressão:** a tela de relatórios precisa sair bem no papel — CSS `@media print`
escondendo menu, topo e filtros, exibindo um cabeçalho próprio com o período e evitando
quebra dentro dos cartões (`break-inside: avoid`).

**Responsivo:** abaixo de 900 px o menu vira gaveta com botão ☰, as grades viram
uma coluna e as tabelas ganham rolagem horizontal. O sistema é usado no celular
na frente do cliente — testar nessa largura.

---

## 10. Segurança

- Toda rota `/api/*` exige sessão, exceto `login`, `logout` e `logo`.
- Escrita em representadas, tabelas, prazos, produtos, preços, metas, histórico,
  usuários, config, logo e backup: **somente admin**.
- Representante pode: lançar pedidos e cotações, cadastrar e editar clientes,
  ver tudo.
- O front-end esconde os botões que o representante não pode usar, mas
  **a checagem obrigatória é no servidor**.
- SQL sempre com parâmetros `?`. Nada de concatenar entrada do usuário.
- Escapar HTML de tudo que vem do banco antes de injetar na página.
- Upload aceita só `data:image/png` ou `data:image/jpeg`, com limite de tamanho.

---

## 11. Facilitar a vida do usuário final

Isto não é enfeite — é requisito. O usuário trava na instalação, não no sistema.

- `COMECE-AQUI.txt` na raiz, em texto puro, com o passo a passo numerado.
- `iniciar-windows.bat` precisa:
  1. detectar que está rodando **de dentro do ZIP** (caminho com `\Temp\`) e
     mandar extrair antes;
  2. detectar Node.js ausente, explicar e **abrir o nodejs.org sozinho**;
  3. apagar `dados/porta.txt`, abrir `abrir-navegador.bat` minimizado e só então
     rodar `node server.js`;
  4. dar `pause` no fim para o erro ficar legível.
- `abrir-navegador.bat` espera `dados/porta.txt` aparecer (até 25 s), espera mais
  2 s e abre `http://localhost:{porta}`.
  **Nunca abrir o navegador antes do servidor responder** — foi exatamente esse
  bug que impediu o primeiro acesso.
- `liberar-firewall.bat` se auto-eleva com PowerShell `Start-Process -Verb RunAs`
  e cria a regra `netsh advfirewall` para as portas 3000-3010 (acesso pelo celular).
- Backup em um clique, com aviso de que os dados vivem em `dados/repsys.db`.

---

## 12. Dados de exemplo (`seed-exemplo.js`)

Roda só com o banco vazio. Cria 2 representadas (comissão 6 % e 5 %, pedido
mínimo R$ 1.500 e R$ 800), 1 tabela de preço padrão e prazos para cada, 5 produtos,
3 clientes com CNPJ e cidade, metas mensais do ano corrente e `historico_vendas`
do ano anterior. Serve para o usuário ver o sistema cheio antes de cadastrar o
dele — e para o desenvolvedor testar.

---

## 13. Critérios de aceite

Só considerar pronto quando **todos** passarem:

**Cadastros**
- [ ] Login com `admin@local` / `admin123`; senha errada dá mensagem clara.
- [ ] Representante logado recebe 403 ao tentar criar representada.
- [ ] Criar usuário com senha funciona e a resposta **não** traz `senha_hash`.
- [ ] `PUT /api/clientes/:id` com apenas um campo não apaga os outros nem exige
      razão social.
- [ ] Consulta de CNPJ sem internet devolve aviso, não erro 500.

**Pedidos**
- [ ] Pedido com 3 itens, desconto por item, desconto geral, IPI e frete fecha
      com o total certo, conferido na mão.
- [ ] Pedido abaixo do mínimo é bloqueado com a mensagem citando os dois valores.
- [ ] Editar pedido não duplica itens.
- [ ] Cotação convertida gera pedido novo e marca a cotação como `ganha`.
- [ ] Numeração não repete ao criar vários pedidos seguidos.

**PDF**
- [ ] Abre no Chrome, no Acrobat e no celular.
- [ ] Acentuação e `•` corretos (o teste que pega o bug de encoding).
- [ ] 45 itens geram 2 páginas com o cabeçalho repetido.
- [ ] Com logo enviado, ele aparece no cabeçalho sem sobrepor o texto de contato.
- [ ] Catálogo mostra as fotos na grade.
- [ ] Relatório de um mês e de um período de 8 meses saem certos, sem coluna cortada.
- [ ] `window.print()` na tela de relatórios não imprime o menu nem os filtros.

**Indicadores**
- [ ] Faturamento do ano bate com a soma dos pedidos nos status contados.
- [ ] Comissão do ano ≠ 0 quando há pedidos (bug clássico: esquecer de somar
      `comissao_valor` na consulta).
- [ ] Projeção do mês bate com `realizado ÷ (dia ÷ dias do mês)`.
- [ ] Mês sem pedido no sistema mostra o valor do histórico.

**Logo da representada**
- [ ] Enviar PNG/JPG em *Representadas → Editar* grava em `dados/representadas/<id>.<ext>`
      e a miniatura aparece na primeira coluna da lista.
- [ ] O logo aparece no bloco REPRESENTADA do PDF do pedido e no topo do catálogo,
      sem sobrepor o texto ao lado.
- [ ] Representada sem logo: `GET /api/representadas/:id/logo` devolve 204 e o PDF
      sai normal, sem espaço vazio estranho.

**Prazo negociado e comissão por pedido**
- [ ] `condicao_texto` preenchido substitui a condição da lista no PDF e no WhatsApp.
- [ ] `comissao_pct` vazio no pedido herda a % da representada; preenchido, manda nela.
- [ ] Campo vazio grava `NULL`, **não** zero (senão a comissão some).
- [ ] Totais recalculados no servidor usam a % do pedido.

**Comissões**
- [ ] `POST /api/comissoes/marcar` com vários ids é transacional: ou marca todos ou nenhum.
- [ ] O resumo de `GET /api/comissoes` ignora o filtro de situação (mostra sempre
      pendente **e** recebida).
- [ ] Marcar como recebida grava a data; voltar para pendente limpa a data.
- [ ] O KPI "Comissão a receber" do painel bate com o total da tela de comissões.

**Painel com gráficos**
- [ ] Paleta validada para daltonismo; toda barra tem rótulo visível (não depende só da cor).
- [ ] Mês com realizado zero não desenha barra azul (nada de risquinho fantasma).
- [ ] Os 6 indicadores ficam 3×2 em tela grande e 1 por linha no celular.
- [ ] Gráfico de meses rola na horizontal no celular sem estourar a página.

**Formato brasileiro**
- [ ] Em Metas e Histórico, digitar `35.000,00` grava 35000 e volta escrito `35.000,00`.
- [ ] `35000`, `35.000` e `35000,50` também são aceitos.
- [ ] "Distribuir meta anual" preenche os 12 meses já formatados.

**Uso real**
- [ ] Em 390 px de largura dá para lançar um pedido inteiro.
- [ ] Nenhum erro no console do navegador em nenhuma tela.
- [ ] Subir dois servidores ao mesmo tempo: o segundo pula para a porta 3001 e
      grava isso em `porta.txt`.
- [ ] Descompactar o ZIP em uma pasta limpa e rodar funciona sem `npm install`.

---

## 14. Roteiro de prompts para o Claude Code

Uma etapa por vez. Testar antes de seguir.

**Etapa 1 — base**
> Leia `ESPECIFICACAO.md` por inteiro. Implemente as seções 2 a 5: estrutura de
> pastas, `src/db.js` com todo o schema e as migrações, `src/auth.js` com scrypt
> e token HS256, e `server.js` com o roteador próprio, servidor de estáticos,
> tratamento de erro e fallback de porta. Zero dependências npm — use só módulos
> nativos do Node 22. Ao final, rode o servidor e me mostre a saída do console.

**Etapa 2 — cadastros**
> Implemente `src/rotas-cadastros.js` conforme a seção 6: sessão, CRUD genérico,
> usuários, representadas, tabelas de preço, condições de pagamento, produtos,
> preços, clientes, consulta de CNPJ e CEP, logo e backup. Respeite as regras de
> permissão da seção 10. Teste cada rota com `curl` e me mostre os resultados.

**Etapa 3 — pedidos**
> Implemente `src/rotas-pedidos.js`: listagem com filtros, gravação em transação
> com o cálculo da seção 7.2, validações da 7.3, mudança de situação, conversão
> de cotação, duplicação e o texto para WhatsApp. Ainda sem PDF. Crie
> `seed-exemplo.js` (seção 12) e teste um pedido completo conferindo o total na mão.

**Etapa 4 — PDF**
> Implemente `src/pdf.js` e `src/imagem.js` conforme a seção 8, em JavaScript
> puro. Gere o PDF de um pedido com 45 itens, converta as páginas em imagem e me
> mostre — quero conferir acentuação, alinhamento e a quebra de página.

**Etapa 5 — interface**
> Implemente `public/index.html`, `public/style.css` e `public/app.js` conforme a
> seção 9, com a identidade da seção 9 (Aparência). Comece pelo login, menu,
> painel e listagem de pedidos. Depois abra as telas com Playwright, tire
> screenshots e verifique que não há erro no console.

**Etapa 6 — editor, clientes e produtos**
> Implemente o editor de pedido com todo o comportamento descrito, os cadastros
> de cliente (com busca por CNPJ) e de produto (com foto, incluindo a redução no
> navegador antes do envio) e a importação por CSV.

**Etapa 7 — metas, histórico e faturamento**
> Implemente `src/rotas-painel.js` e as telas de Metas, Histórico e Faturamento,
> com as regras das seções 7.5 a 7.7. Confira que a comissão do ano não vem zerada.

**Etapa 7b — relatório de vendas**
> Implemente as três rotas de relatório de vendas, o `gerarRelatorioPDF` e a tela
> `#/relatorios`, incluindo o CSS de impressão. Gere o relatório de um mês e o de um
> período de 8 meses, converta o PDF em imagem e me mostre — quero conferir se nenhuma
> coluna ficou cortada.

**Etapa 8 — empacotar**
> Crie os atalhos da seção 11 (`COMECE-AQUI.txt`, os `.bat`, o `.command`) e o
> `LEIA-ME.md` para o usuário final. Depois rode a lista inteira de critérios de
> aceite da seção 13 e me mostre o resultado item por item, incluindo o teste de
> instalação limpa a partir do ZIP.

---

## 15. Extensões previstas (não fazer agora)

Deixar o código preparado, implementar depois:
comissões a receber por representada · integração fiscal para importar XML de NF-e ·
tela de visitas e roteiro semanal · disparo automático do pedido por e-mail para a
representada · app instalável (PWA com manifest e service worker) · hospedagem em
VPS com HTTPS para acesso fora da rede local.

# INOVE Representações — Sistema de Pedidos

Pedidos, cotações, clientes, produtos com tabela de preço, prazos de pagamento e metas
(diária, mensal, anual e histórico de anos anteriores) — tudo em um sistema próprio,
sem mensalidade e com os dados no seu computador.

---

## 1. Instalação (uma vez só)

**Passo 1 — instalar o Node.js**
Baixe em <https://nodejs.org> a versão **LTS** (precisa ser 22 ou superior) e instale
clicando em "Avançar" até o fim.

**Passo 0 — extraia o ZIP antes de tudo**
Clique com o botão **direito** no arquivo ZIP baixado → *Extrair tudo…* → *Extrair*.
Clicar nos arquivos de dentro do ZIP não funciona — esse é o erro mais comum.

**Passo 2 — iniciar o sistema**

| Sistema | O que fazer |
|---|---|
| Windows | dê dois cliques em **`iniciar-windows.bat`** |
| Mac / Linux | dê dois cliques em **`iniciar-mac-linux.command`** (ou rode `bash iniciar-mac-linux.command` no terminal) |

Vai abrir uma janela preta com um quadro mostrando o endereço do sistema.
**Deixe essa janela aberta** — é ela que mantém o sistema rodando.

**Passo 3 — o navegador abre sozinho**
Em poucos segundos o sistema aparece na tela. Se não abrir, use o endereço que está
escrito na janela preta (normalmente <http://localhost:3000>).

```
E-mail:  admin@local
Senha:   admin123
```

> Troque essa senha em **Configurações → Minha senha** no primeiro acesso.

**Quer ver o sistema já preenchido para testar?** Antes de tudo, rode uma vez:
`npm run exemplo` — cria 2 representadas, 5 produtos, 3 clientes, metas e histórico
fictícios. Para voltar ao zero, apague a pasta `dados` e inicie de novo.

---

## 2. Ordem recomendada para começar

1. **Configurações** → confira o nome, CNPJ e telefone da INOVE
   (isso aparece no cabeçalho do PDF que o cliente recebe) e, em **Logo da empresa**,
   envie o arquivo oficial da marca (PNG ou JPG, até 3 MB). Enquanto você não enviar,
   o sistema usa uma versão desenhada do logotipo. Depois do envio, a marca aparece na
   tela de acesso, no menu lateral e no cabeçalho de todo pedido e cotação em PDF.
2. **Representadas** → cadastre cada empresa que você representa, com a **% de comissão**
   e o **pedido mínimo**.
3. Ainda em Representadas, no botão **Tabelas** → crie a tabela de preço
   (ex.: "Tabela 2026"); e no botão **Prazos** → cadastre as condições de pagamento
   (ex.: 30/60/90 dias, à vista com 3% de desconto).
4. **Produtos** → cadastre item a item ou use **Importar CSV** para colar uma lista
   inteira copiada do Excel. Depois de salvar cada produto, abra ele de novo em **Editar**
   e clique em **📷 Escolher / tirar foto** — pelo celular a câmera abre direto.
5. **Clientes** → digite o CNPJ e clique na **lupa 🔎**: razão social, endereço,
   cidade e situação cadastral vêm preenchidos automaticamente da Receita Federal.
6. **Metas** → digite a meta de cada representada em cada mês.
   O sistema calcula sozinho a meta diária e a meta anual.
7. **Histórico** → lance as vendas dos anos anteriores (quando você ainda não usava o
   sistema) para o painel mostrar a evolução ano a ano.
8. **Pedidos** → agora é só lançar.

---

## 3. Como funciona cada parte

### Pedidos e cotações
- **Novo pedido**: escolha cliente → representada → a tabela de preço e o prazo padrão
  entram sozinhos → clique em **+ Adicionar produto** e busque por código ou nome.
- Cada item aceita **desconto próprio** e **IPI**; há também desconto geral e frete.
- Se o total ficar abaixo do **pedido mínimo** da representada, o sistema avisa e não deixa salvar.
- **+ Item avulso** serve para produtos que não estão no cadastro.
- **Cotação** funciona igual, mas tem *validade* em vez de entrega. Quando o cliente
  fecha, use **⋯ → Converter em pedido**: gera o pedido e marca a cotação como *ganha*.
- **Duplicar** repete um pedido antigo com a data de hoje — ótimo para cliente de recompra.

### Enviar cópia do pedido
Dentro do pedido, botão **Enviar cópia**:
- **WhatsApp** — abre a conversa do cliente já com o pedido escrito;
- **E-mail** — abre seu programa de e-mail com o texto pronto;
- **Baixar PDF** — arquivo formatado com seu cabeçalho, dados do cliente,
  itens, condições e total, para anexar ou mandar para a representada.

### Situações
| Pedido | Cotação |
|---|---|
| Rascunho → Aberto → Enviado → Faturado (ou Cancelado) | Rascunho → Enviada → Ganha / Perdida |

Em **Configurações** você define quais situações contam como venda realizada nas metas
(por padrão: `aberto,enviado,faturado`).

### Metas
- Digite a meta de cada representada mês a mês na tela **Metas**.
- **Meta diária** = meta do mês ÷ dias úteis (você ajusta os dias úteis de cada mês na mesma tela).
- **Meta anual** = soma dos 12 meses.
- O botão **Distribuir meta anual** joga um valor do ano inteiro nos meses — igual,
  crescente 2% ao mês, ou proporcional ao que foi vendido no ano anterior.

### Produtos com foto
- A foto é adicionada dentro do próprio sistema, produto por produto: **Produtos → Editar → 📷**.
  Pelo celular, o botão abre a câmera — dá para fotografar o produto na hora da visita.
- A imagem é reduzida automaticamente antes de salvar, então não pesa nem enche o disco.
- A miniatura aparece na lista de produtos e na busca de itens do pedido, o que ajuda
  a não errar de item na frente do cliente.
- Botão **📕 Catálogo PDF** (escolha antes a representada no filtro): gera um catálogo com
  foto, código, descrição e preço de cada produto — pronto para mandar no WhatsApp do cliente.

### Faturamento e projeção
Tela **Faturamento**, com filtro por ano e por representada:
- faturamento de cada mês, quantidade de pedidos, meta, % da meta e acumulado;
- comparação mês a mês com o mesmo mês do ano anterior, com a variação em %;
- **projeção do mês**: o que entrou dividido pelos dias já corridos, multiplicado pelos
  dias do mês — mostra em quanto o mês deve fechar no ritmo atual;
- **projeção do ano**: o que já entrou + o fechamento previsto do mês + a média dos meses
  fechados nos meses que ainda faltam;
- comissão estimada no ano, ticket médio e a quebra por representada.

### Relatório de vendas (imprimir e mandar no WhatsApp)
Tela **Relatórios**:
- escolha **Mês fechado** (ex.: Agosto/2026) ou **Datas escolhidas**, e opcionalmente
  uma representada;
- a tela mostra faturamento, nº de pedidos, ticket médio, comissão, quebra por
  representada, clientes que mais compraram, produtos mais vendidos e a lista dos pedidos;
- **📄 Ver PDF** abre o relatório formatado; **⬇ Baixar** salva o arquivo;
- **🖨 Imprimir** manda direto para a impressora, sem o menu e sem os filtros;
- **WhatsApp** abre a conversa com o resumo já escrito e ainda permite baixar o PDF
  para anexar.

### Painel
Mostra em tempo real: vendido hoje x meta diária, mês x meta, ano x meta, projeção de
fechamento do mês, ticket médio, comissão estimada, gráfico realizado x meta dos 12 meses,
comparativo ano a ano, desempenho por representada, funil de cotações e os top 10
clientes e produtos.

### Logo e identidade
O sistema já vem nas cores da INOVE (preto e branco). Para trocar o logotipo a qualquer
momento: **Configurações → Logo da empresa → Escolher arquivo**. Use de preferência um PNG
com fundo transparente ou branco — ele é aplicado na hora, inclusive nos PDFs antigos.

### Equipe
Em **Configurações → Equipe** (só administrador) você cria usuários.
- **Administrador**: mexe em tudo.
- **Representante**: lança pedidos, cotações e cadastra clientes; não altera
  representadas, produtos, tabelas nem metas.

---

## 4. Usar no celular pelo Wi-Fi

1. Deixe o computador ligado com a janela preta aberta.
2. Nessa janela aparece uma linha assim:
   `No celular/tablet:  http://192.168.0.15:3000`
3. Digite esse endereço no navegador do celular. Ele precisa estar na **mesma rede Wi-Fi**.

Se o celular não abrir a página, o firewall do Windows está bloqueando: clique com o
**botão direito** em `liberar-firewall.bat` → *Executar como administrador*, e tente de novo.

Dica: depois que abrir no celular, use *Adicionar à tela de início* — fica com cara de
aplicativo. A tela se adapta ao celular e dá para lançar pedido na frente do cliente.

**Quer que outras pessoas usem sem instalar nada?** Coloque o sistema na internet —
o passo a passo completo está em **`PUBLICAR-NA-INTERNET.md`**. Custa cerca de
R$ 28 por mês, leva uns 20 minutos e depois é só abrir um endereço no navegador,
de qualquer lugar, sem Node.js e sem janela preta.

---

## 5. Backup — importante

Todos os seus dados ficam em **um único arquivo**: `dados/repsys.db`.

- Em **Configurações → Backup**, clique em *Baixar backup agora* e guarde o arquivo
  (pen drive, Google Drive, e-mail para você mesmo). Faça isso toda semana.
- Para restaurar: feche o sistema, substitua `dados/repsys.db` pelo backup e abra de novo.

---

## 6. Detalhes técnicos

- **Node.js 22+ apenas** — nenhuma biblioteca externa, nada para baixar da internet,
  nada que quebre com o tempo. Banco SQLite nativo, PDF gerado por código próprio,
  senhas com scrypt e sessão assinada.
- Porta padrão 3000. Para trocar: `PORT=8080 node server.js`.
- Consulta de CNPJ usa BrasilAPI (e ReceitaWS como reserva); CEP usa BrasilAPI e ViaCEP.
  Sem internet, é só preencher à mão — o resto do sistema funciona offline.

```
server.js               servidor e roteamento
src/db.js               banco de dados e tabelas
src/auth.js             senhas e sessão
src/rotas-cadastros.js  clientes, produtos, representadas, tabelas, prazos, CNPJ/CEP
src/rotas-pedidos.js    pedidos, cotações, PDF e envio de cópia
src/rotas-painel.js     metas, histórico e painel
src/pdf.js              gerador de PDF
src/imagem.js           leitura de PNG/JPEG (logo e fotos de produto)
public/                 interface (1 html + 1 css + 1 js)
dados/repsys.db         SEUS DADOS  ← faça backup
dados/produtos/         fotos dos produtos
dados/logo.png          logo da empresa
```

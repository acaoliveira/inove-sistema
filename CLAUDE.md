# Regras deste projeto

Sistema de representação comercial da **INOVE Representações**.
A especificação completa está em `ESPECIFICACAO.md` — leia antes de qualquer
alteração e trate-a como fonte da verdade.

## Inegociável

- **Zero dependências npm.** Só módulos nativos do Node 22 (`node:http`,
  `node:sqlite`, `node:crypto`, `node:zlib`, `node:fs`). Nada de Express,
  better-sqlite3, bcrypt, jsonwebtoken, pdfkit, React ou bundler.
  Se parecer que precisa de uma biblioteca, escreva a função.
- **Sem build step.** `node server.js` tem que rodar direto na pasta.
- **Tudo em português do Brasil**: interface, mensagens de erro, nomes de
  variáveis, funções, tabelas, colunas e comentários.
- **Front-end em 3 arquivos**: `public/index.html`, `public/style.css`,
  `public/app.js`. Não criar framework nem dividir em módulos ES.

## Quem usa isto

Um representante comercial, pouca familiaridade com tecnologia, muitas vezes
usando o celular na frente do cliente.

- Mensagem de erro é texto que ele vai ler. Escreva o que aconteceu e o que
  fazer: *"Pedido mínimo de Vinícola Serra Alta é R$ 1.500,00. Total atual:
  R$ 738,80."* — nunca "Bad Request" ou stack trace.
- Toda tela precisa funcionar em 390 px de largura.
- Falta de internet não pode quebrar nada: consulta de CNPJ e CEP falham
  devolvendo `{dados: null, aviso: "..."}`, e o resto do sistema segue.

## Dados

- O banco do usuário tem dados reais. **Nunca** recriar tabela nem apagar
  coluna. Coluna nova entra por `garantirColuna()` (PRAGMA + ALTER TABLE).
- Todo SQL com parâmetros `?`. Nada de concatenar entrada do usuário.
- Gravação de pedido é transação: `BEGIN` / `COMMIT` / `ROLLBACK`.
- Totais são recalculados **no servidor** antes de gravar, sempre. O cálculo do
  front-end é só para exibição.

## Segurança

- Toda rota `/api/*` exige sessão, exceto `login`, `logout` e `logo`.
- Escrita em cadastros, metas, histórico, config, logo e backup: só `admin`.
- Esconder botão no front-end não é controle de acesso — a checagem vale no servidor.
- Escapar HTML de qualquer conteúdo vindo do banco antes de injetar na página.
- Nunca devolver `senha_hash` em resposta de API.

## Ao terminar qualquer alteração

1. `node --check` em todos os arquivos alterados.
2. Subir o servidor e exercitar as rotas afetadas com `curl`.
3. Se mexeu na interface: abrir com Playwright, tirar screenshot e conferir que
   o console do navegador está limpo.
4. Se mexeu no PDF: gerar, converter a página em imagem e **olhar** — acentuação,
   alinhamento e quebra de página não aparecem em teste automatizado.
5. Rodar os critérios de aceite da seção 13 da especificação que tocam no que mudou.

## Comandos

```bash
node server.js        # sobe o sistema (porta 3000, pula para 3001 se ocupada)
npm run exemplo       # popula dados fictícios (só com o banco vazio)
rm -rf dados          # zera tudo e começa do zero
```

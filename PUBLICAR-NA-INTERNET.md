# Colocar o sistema na internet — passo a passo

Depois disso, o sistema fica no ar 24 horas em um endereço tipo
`https://inove.up.railway.app`. Qualquer pessoa que você autorizar abre no
navegador do celular ou do computador — **sem instalar nada, sem Node.js,
sem janela preta.**

- **Custo:** US$ 5/mês (~R$ 28) no plano Hobby do Railway. O espaço para os
  dados está incluído nesse valor.
- **Tempo:** cerca de 20 minutos, uma vez só.
- **Você precisa de:** um e-mail e um cartão de crédito.

---

## Parte 1 — Colocar os arquivos no GitHub (10 min)

O Railway pega o sistema de um repositório no GitHub. É de graça.

1. Acesse **<https://github.com/signup>** e crie sua conta.
   Confirme o e-mail que eles enviam.

2. Clique no **+** no canto superior direito → **New repository**.
   - **Repository name:** `inove-sistema`
   - Marque **Private** (só você enxerga)
   - **Não** marque nenhuma das caixas de "Initialize"
   - Clique em **Create repository**

3. Na tela que abrir, clique no link **uploading an existing file**
   (fica no meio do texto: *"…or push an existing repository…"* — procure por
   **upload an existing file**).

4. **Descompacte o ZIP do sistema** no seu computador, entre na pasta e
   **selecione tudo que está dentro dela** (Ctrl+A) — os arquivos e as pastas
   `src` e `public`. Arraste tudo para dentro da área de upload do GitHub.

   > Cuidado: arraste o **conteúdo** da pasta, não a pasta inteira.
   > Se você arrastar a pasta `repsys`, o Railway não acha o sistema.

5. Espere aparecerem todos os arquivos na lista e clique em
   **Commit changes** (botão verde, no fim da página).

---

## Parte 2 — Publicar no Railway (5 min)

1. Acesse **<https://railway.com>** → **Login** → **Login with GitHub**
   e autorize.

2. Clique em **New Project** → **Deploy from GitHub repo**.
   Se ele pedir permissão para ver seus repositórios, clique em
   **Configure GitHub App** e libere o `inove-sistema`.

3. Escolha o repositório **inove-sistema**.
   O Railway começa a montar o sistema sozinho (leva 1 a 2 minutos).

---

## Parte 3 — Espaço para os dados ⚠️ NÃO PULE

Sem este passo, **seus pedidos somem** a cada atualização do sistema.

1. Clique no quadrado do serviço que apareceu no projeto.
2. Vá na aba **Settings** (ou clique com o botão direito no quadrado) e
   escolha **Add Volume** / **Attach Volume**.
3. No campo **Mount path**, digite exatamente:

   ```
   /dados
   ```

4. Confirme. O serviço reinicia sozinho.

Esse é o "HD" do sistema: banco de dados, fotos dos produtos, logo e os
backups automáticos ficam todos aí, e sobrevivem a qualquer atualização.
No plano Hobby você tem 5 GB — dá para milhares de pedidos e centenas de fotos.

---

## Parte 4 — Definir a sua senha

1. No serviço, abra a aba **Variables** → **New Variable**.
2. Crie estas duas:

   | Nome | Valor |
   |---|---|
   | `REPSYS_ADMIN_EMAIL` | seu e-mail, ex.: `contato@inoverepresentacoes.com.br` |
   | `REPSYS_ADMIN_SENHA` | uma senha forte, com letras, números e um símbolo |

3. Salve. O sistema reinicia e cria o seu usuário com essa senha.

> Isso só vale na **primeira vez**, quando o banco ainda está vazio.
> Depois, a senha se troca dentro do sistema, em Configurações → Minha senha.

---

## Parte 5 — Pegar o endereço

1. Aba **Settings** → seção **Networking** → **Generate Domain**.
2. Se ele perguntar a porta, informe **3000**.
3. Vai aparecer algo como `inove-sistema-production.up.railway.app`.
   **Esse é o endereço do seu sistema.** Abra no navegador e entre com o
   e-mail e a senha que você definiu na Parte 4.

Pronto — está no ar. Salve o endereço nos favoritos e mande para quem precisar usar.

### Endereço próprio (opcional)
Se você tiver um domínio (ex.: `sistema.inoverepresentacoes.com.br`), em
**Settings → Networking → Custom Domain** o Railway mostra o registro CNAME
que você deve cadastrar no seu provedor de domínio. O certificado HTTPS é
automático.

---

## Depois de publicar

**No celular:** abra o endereço, toque no menu do navegador e escolha
*Adicionar à tela de início*. Fica com cara de aplicativo.

**Primeiras coisas a fazer:**
1. Configurações → **Logo da empresa** → enviar o arquivo oficial.
2. Configurações → conferir nome, CNPJ e telefone (saem no PDF).
3. Configurações → **Equipe** → criar um login para cada pessoa.
   Use o perfil **Representante** para quem só lança pedido — assim ninguém
   mexe em preço, produto ou meta sem querer.

**Backup:** o sistema guarda sozinho uma cópia por dia (as 7 últimas) dentro
do volume. Mesmo assim, uma vez por mês entre em **Configurações → Backup →
Baixar backup agora** e guarde o arquivo no seu computador ou no Drive. Volume
de servidor também pode falhar.

**Atualizações:** quando eu te mandar uma versão nova, é só subir os arquivos
alterados no GitHub (mesma tela de upload da Parte 1, botão **Add file →
Upload files**). O Railway percebe e atualiza o sistema em 1 minuto, **sem
perder nenhum dado** — eles estão no volume, separados do código.

**Conta:** o Railway cobra por uso, com o mínimo de US$ 5/mês. Um sistema desse
tamanho consome bem menos que isso, então na prática você paga o mínimo. Dá
para acompanhar em **Usage** no painel deles.

---

## Se algo der errado

| O que aparece | O que fazer |
|---|---|
| Build failed | Confira se você subiu o **conteúdo** da pasta, não a pasta inteira. O `server.js` e o `Dockerfile` precisam estar na raiz do repositório. |
| Application failed to respond | Espere 1 minuto e recarregue; o primeiro start demora. Se continuar, veja a aba **Deploy Logs** e me mande um print. |
| Entrei mas os dados sumiram | O volume não foi criado ou o *mount path* está diferente de `/dados`. Confira a Parte 3. |
| Não aceita minha senha | A senha só é criada no primeiro start com o banco vazio. Apague o volume e crie de novo, ou me chame que eu te ajudo a resetar. |

Qualquer erro: tire um print da aba **Deploy Logs** do Railway e me mande.

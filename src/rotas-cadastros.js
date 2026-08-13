'use strict';
const { db, config, setConfig, DB_FILE, DATA_DIR } = require('./db');
const { hashSenha, conferirSenha, assinar } = require('./auth');
const fs = require('node:fs');
const path = require('node:path');

const soDigitos = (v) => String(v || '').replace(/\D/g, '');

module.exports = function (rota, ErroApi) {

  // =============================================================== SESSÃO
  // trava simples contra tentativa de adivinhar senha (importante com o sistema na internet)
  const tentativas = new Map();
  const LIMITE = 6, JANELA = 15 * 60 * 1000;

  rota.post('/api/login', ({ corpo, res, req }) => {
    const origem = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
    const agora = Date.now();
    const t = tentativas.get(origem);
    if (t && t.bloqueado_ate > agora) {
      const min = Math.ceil((t.bloqueado_ate - agora) / 60000);
      throw new ErroApi(`Muitas tentativas de acesso. Tente de novo em ${min} minuto(s).`, 429);
    }

    const email = String(corpo.email || '').trim().toLowerCase();
    const u = db.prepare('SELECT * FROM usuarios WHERE lower(email) = ?').get(email);
    if (!u || !u.ativo || !conferirSenha(corpo.senha, u.senha_hash)) {
      const n = (t && t.desde > agora - JANELA ? t.contagem : 0) + 1;
      tentativas.set(origem, {
        contagem: n, desde: t && t.desde > agora - JANELA ? t.desde : agora,
        bloqueado_ate: n >= LIMITE ? agora + JANELA : 0,
      });
      throw new ErroApi('E-mail ou senha incorretos.', 401);
    }

    tentativas.delete(origem);
    const token = assinar({ uid: u.id }, 30);
    res.setHeader('Set-Cookie',
      `repsys=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${30 * 86400}${req.seguro ? '; Secure' : ''}`);
    return { usuario: { id: u.id, nome: u.nome, email: u.email, papel: u.papel }, token };
  }, { publica: true });

  rota.post('/api/logout', ({ res }) => {
    res.setHeader('Set-Cookie', 'repsys=; Path=/; HttpOnly; Max-Age=0');
    return { ok: true };
  }, { publica: true });

  rota.get('/api/eu', ({ usuario }) => ({
    usuario,
    config: Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor])),
  }));

  rota.post('/api/senha', ({ corpo, usuario }) => {
    const u = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(usuario.id);
    if (!conferirSenha(corpo.atual, u.senha_hash)) throw new ErroApi('Senha atual incorreta.');
    if (String(corpo.nova || '').length < 4) throw new ErroApi('A nova senha precisa ter ao menos 4 caracteres.');
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(corpo.nova), usuario.id);
    return { ok: true };
  });

  // =============================================================== CONFIGURAÇÕES
  rota.get('/api/config', () => Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor])));
  rota.put('/api/config', ({ corpo }) => {
    for (const [k, v] of Object.entries(corpo)) setConfig(k, v);
    return { ok: true };
  }, { admin: true });

  // =============================================================== CRUD GENÉRICO
  function crud(nome, tabela, campos, opcoes = {}) {
    const listar = opcoes.listar || (() => db.prepare(`SELECT * FROM ${tabela} ORDER BY ${opcoes.ordem || 'id DESC'}`).all());

    rota.get(`/api/${nome}`, (ctx) => listar(ctx));

    rota.get(`/api/${nome}/:id`, ({ params }) => {
      const r = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(Number(params.id));
      if (!r) throw new ErroApi('Registro não encontrado.', 404);
      return opcoes.detalhe ? opcoes.detalhe(r) : r;
    });

    rota.post(`/api/${nome}`, (ctx) => {
      const dados = opcoes.antes ? opcoes.antes(ctx.corpo, ctx) : ctx.corpo;
      const usar = campos.filter(c => dados[c] !== undefined);
      if (!usar.length) throw new ErroApi('Nenhum campo informado.');
      const info = db.prepare(`INSERT INTO ${tabela} (${usar.join(',')}) VALUES (${usar.map(() => '?').join(',')})`)
        .run(...usar.map(c => dados[c] ?? null));
      const criado = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(info.lastInsertRowid);
      if (opcoes.depois) opcoes.depois(criado, dados, ctx);
      delete criado.senha_hash;
      return criado;
    }, { admin: !!opcoes.admin });

    rota.put(`/api/${nome}/:id`, (ctx) => {
      const id = Number(ctx.params.id);
      const dados = opcoes.antes ? opcoes.antes(ctx.corpo, ctx) : ctx.corpo;
      const usar = campos.filter(c => dados[c] !== undefined);
      if (usar.length) {
        db.prepare(`UPDATE ${tabela} SET ${usar.map(c => c + ' = ?').join(', ')} WHERE id = ?`)
          .run(...usar.map(c => dados[c] ?? null), id);
      }
      const atual = db.prepare(`SELECT * FROM ${tabela} WHERE id = ?`).get(id);
      if (!atual) throw new ErroApi('Registro não encontrado.', 404);
      if (opcoes.depois) opcoes.depois(atual, dados, ctx);
      delete atual.senha_hash;
      return atual;
    }, { admin: !!opcoes.admin });

    rota.del(`/api/${nome}/:id`, ({ params }) => {
      const id = Number(params.id);
      try { db.prepare(`DELETE FROM ${tabela} WHERE id = ?`).run(id); }
      catch { throw new ErroApi('Não é possível excluir: existem registros vinculados. Marque como inativo.', 409); }
      return { ok: true };
    }, { admin: !!opcoes.admin });
  }

  // ---- usuários (equipe)
  crud('usuarios', 'usuarios', ['nome', 'email', 'papel', 'telefone', 'ativo', 'senha_hash'], {
    admin: true,
    ordem: 'nome',
    listar: () => db.prepare('SELECT id, nome, email, papel, telefone, ativo, criado_em FROM usuarios ORDER BY nome').all(),
    antes: (c) => {
      if (c.email) c.email = String(c.email).trim().toLowerCase();
      if (c.senha) c.senha_hash = hashSenha(c.senha);
      return c;
    },
  });
  // senha obrigatória ao criar usuário
  rota.post('/api/usuarios/:id/senha', ({ params, corpo }) => {
    if (String(corpo.senha || '').length < 4) throw new ErroApi('Senha muito curta.');
    db.prepare('UPDATE usuarios SET senha_hash = ? WHERE id = ?').run(hashSenha(corpo.senha), Number(params.id));
    return { ok: true };
  }, { admin: true });

  // ---- representadas
  crud('representadas', 'representadas',
    ['nome', 'cnpj', 'contato', 'email', 'telefone', 'comissao_pct', 'pedido_minimo', 'observacoes', 'ativo'],
    { admin: true, ordem: 'nome', listar: () => db.prepare(`
        SELECT r.*,
          (SELECT COUNT(*) FROM produtos p WHERE p.representada_id = r.id AND p.ativo = 1) AS qtd_produtos,
          (SELECT COUNT(*) FROM tabelas_preco t WHERE t.representada_id = r.id AND t.ativo = 1) AS qtd_tabelas
        FROM representadas r ORDER BY r.ativo DESC, r.nome`).all() });

  // ---- tabelas de preço
  crud('tabelas', 'tabelas_preco', ['representada_id', 'nome', 'vigencia_inicio', 'vigencia_fim', 'padrao', 'ativo'], {
    admin: true,
    listar: ({ query }) => {
      const cond = query.representada_id ? 'WHERE t.representada_id = ' + Number(query.representada_id) : '';
      return db.prepare(`SELECT t.*, r.nome AS representada_nome,
        (SELECT COUNT(*) FROM precos p WHERE p.tabela_id = t.id) AS qtd_precos
        FROM tabelas_preco t JOIN representadas r ON r.id = t.representada_id ${cond}
        ORDER BY r.nome, t.nome`).all();
    },
    depois: (t) => { if (t.padrao) db.prepare('UPDATE tabelas_preco SET padrao = 0 WHERE representada_id = ? AND id <> ?').run(t.representada_id, t.id); },
  });

  // ---- condições de pagamento (prazos)
  crud('condicoes', 'condicoes_pagamento', ['representada_id', 'descricao', 'parcelas', 'prazo_medio', 'acrescimo_pct', 'desconto_pct', 'padrao', 'ativo'], {
    admin: true,
    listar: ({ query }) => {
      const rep = Number(query.representada_id || 0);
      const sql = rep
        ? `SELECT c.*, r.nome AS representada_nome FROM condicoes_pagamento c
           LEFT JOIN representadas r ON r.id = c.representada_id
           WHERE c.representada_id = ${rep} OR c.representada_id IS NULL ORDER BY c.prazo_medio, c.descricao`
        : `SELECT c.*, r.nome AS representada_nome FROM condicoes_pagamento c
           LEFT JOIN representadas r ON r.id = c.representada_id ORDER BY r.nome, c.prazo_medio`;
      return db.prepare(sql).all();
    },
  });

  // ---- produtos
  crud('produtos', 'produtos',
    ['representada_id', 'codigo', 'descricao', 'unidade', 'ncm', 'ipi_pct', 'st_pct', 'embalagem', 'peso', 'estoque', 'preco_base', 'desconto_max_pct', 'observacoes', 'ativo'],
    {
      admin: true,
      listar: ({ query }) => {
        const cond = [], args = [];
        if (query.representada_id) { cond.push('p.representada_id = ?'); args.push(Number(query.representada_id)); }
        if (query.ativo !== undefined && query.ativo !== '') { cond.push('p.ativo = ?'); args.push(Number(query.ativo)); }
        if (query.busca) { cond.push('(p.descricao LIKE ? OR p.codigo LIKE ?)'); args.push('%' + query.busca + '%', '%' + query.busca + '%'); }
        const tabela = Number(query.tabela_id || 0);
        const sql = `SELECT p.*, r.nome AS representada_nome,
            ${tabela ? '(SELECT preco FROM precos pr WHERE pr.produto_id = p.id AND pr.tabela_id = ' + tabela + ')' : 'NULL'} AS preco_tabela
          FROM produtos p JOIN representadas r ON r.id = p.representada_id
          ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
          ORDER BY p.descricao LIMIT ${Number(query.limite || 500)}`;
        return db.prepare(sql).all(...args).map(p => ({ ...p, preco_venda: p.preco_tabela ?? p.preco_base }));
      },
    });

  // ---- foto do produto
  const PASTA_FOTOS = path.join(DATA_DIR, 'produtos');
  fs.mkdirSync(PASTA_FOTOS, { recursive: true });

  rota.get('/api/produtos/:id/imagem', ({ params, res }) => {
    const p = db.prepare('SELECT imagem FROM produtos WHERE id = ?').get(Number(params.id));
    const arq = p && p.imagem ? path.join(PASTA_FOTOS, p.imagem) : null;
    if (!arq || !fs.existsSync(arq)) { res.writeHead(204); return res.end(); }
    res.writeHead(200, { 'Content-Type': arq.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'max-age=86400' });
    res.end(fs.readFileSync(arq));
  });

  rota.post('/api/produtos/:id/imagem', ({ params, corpo }) => {
    const id = Number(params.id);
    if (!db.prepare('SELECT id FROM produtos WHERE id = ?').get(id)) throw new ErroApi('Produto não encontrado.', 404);
    const m = String(corpo.dados || '').match(/^data:image\/(png|jpe?g);base64,(.+)$/);
    if (!m) throw new ErroApi('Envie uma imagem PNG ou JPG.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 4 * 1024 * 1024) throw new ErroApi('Imagem muito grande (máximo 4 MB).');
    const ext = m[1] === 'png' ? 'png' : 'jpg';
    for (const e of ['png', 'jpg']) { const v = path.join(PASTA_FOTOS, `${id}.${e}`); if (fs.existsSync(v)) fs.unlinkSync(v); }
    fs.writeFileSync(path.join(PASTA_FOTOS, `${id}.${ext}`), buf);
    db.prepare('UPDATE produtos SET imagem = ? WHERE id = ?').run(`${id}.${ext}`, id);
    return { ok: true, imagem: `${id}.${ext}` };
  }, { admin: true });

  rota.del('/api/produtos/:id/imagem', ({ params }) => {
    const id = Number(params.id);
    const p = db.prepare('SELECT imagem FROM produtos WHERE id = ?').get(id);
    if (p && p.imagem) { const a = path.join(PASTA_FOTOS, p.imagem); if (fs.existsSync(a)) fs.unlinkSync(a); }
    db.prepare("UPDATE produtos SET imagem = '' WHERE id = ?").run(id);
    return { ok: true };
  }, { admin: true });

  // preços por tabela
  rota.get('/api/precos', ({ query }) => db.prepare(`
    SELECT pr.*, p.codigo, p.descricao, p.unidade FROM precos pr
    JOIN produtos p ON p.id = pr.produto_id WHERE pr.tabela_id = ? ORDER BY p.descricao`).all(Number(query.tabela_id)));

  rota.post('/api/precos', ({ corpo }) => {
    const itens = Array.isArray(corpo.itens) ? corpo.itens : [corpo];
    const st = db.prepare(`INSERT INTO precos (tabela_id, produto_id, preco) VALUES (?,?,?)
      ON CONFLICT(tabela_id, produto_id) DO UPDATE SET preco = excluded.preco`);
    for (const i of itens) st.run(Number(i.tabela_id || corpo.tabela_id), Number(i.produto_id), Number(i.preco || 0));
    return { ok: true, gravados: itens.length };
  }, { admin: true });

  rota.del('/api/precos/:id', ({ params }) => { db.prepare('DELETE FROM precos WHERE id = ?').run(Number(params.id)); return { ok: true }; }, { admin: true });

  // ---- clientes
  crud('clientes', 'clientes',
    ['cnpj', 'razao_social', 'nome_fantasia', 'ie', 'email', 'telefone', 'contato', 'cep', 'logradouro', 'numero',
      'complemento', 'bairro', 'cidade', 'uf', 'situacao', 'abertura', 'atividade', 'usuario_id', 'observacoes', 'ativo'],
    {
      antes: (c, ctx) => {
        if (c.cnpj) c.cnpj = soDigitos(c.cnpj);
        if (c.cep) c.cep = soDigitos(c.cep);
        if (c.uf) c.uf = String(c.uf).toUpperCase().slice(0, 2);
        if (!c.usuario_id && ctx.usuario && ctx.req.method === 'POST') c.usuario_id = ctx.usuario.id;
        if ('razao_social' in c && !String(c.razao_social).trim()) throw new ErroApi('Informe a razão social do cliente.');
        return c;
      },
      listar: ({ query }) => {
        const cond = [], args = [];
        if (query.busca) {
          cond.push('(razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ? OR cidade LIKE ?)');
          const b = '%' + query.busca + '%'; args.push(b, b, soDigitos(query.busca) ? '%' + soDigitos(query.busca) + '%' : b, b);
        }
        if (query.ativo !== undefined && query.ativo !== '') { cond.push('ativo = ?'); args.push(Number(query.ativo)); }
        return db.prepare(`SELECT c.*,
            (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = c.id AND p.tipo = 'pedido') AS qtd_pedidos,
            (SELECT IFNULL(SUM(p.total),0) FROM pedidos p WHERE p.cliente_id = c.id AND p.tipo='pedido' AND p.status <> 'cancelado') AS total_comprado,
            (SELECT MAX(p.data_emissao) FROM pedidos p WHERE p.cliente_id = c.id AND p.tipo='pedido') AS ultima_compra
          FROM clientes c ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
          ORDER BY c.razao_social LIMIT ${Number(query.limite || 500)}`).all(...args);
      },
    });

  rota.get('/api/clientes/:id/historico', ({ params }) => db.prepare(`
    SELECT p.id, p.numero, p.tipo, p.status, p.data_emissao, p.total, r.nome AS representada_nome
    FROM pedidos p JOIN representadas r ON r.id = p.representada_id
    WHERE p.cliente_id = ? ORDER BY p.data_emissao DESC, p.id DESC LIMIT 100`).all(Number(params.id)));

  // =============================================================== CONSULTAS EXTERNAS
  rota.get('/api/consulta/cnpj/:cnpj', async ({ params }) => {
    const cnpj = soDigitos(params.cnpj);
    if (cnpj.length !== 14) throw new ErroApi('CNPJ deve ter 14 dígitos.');
    const jaExiste = db.prepare('SELECT id, razao_social FROM clientes WHERE cnpj = ?').get(cnpj);
    let dados = null, aviso = '';

    // BrasilAPI (principal)
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, { signal: AbortSignal.timeout(12000) });
      if (r.ok) {
        const j = await r.json();
        dados = {
          cnpj,
          razao_social: j.razao_social || '',
          nome_fantasia: j.nome_fantasia || '',
          email: j.email || '',
          telefone: [j.ddd_telefone_1, j.ddd_telefone_2].filter(Boolean)[0] || '',
          cep: soDigitos(j.cep),
          logradouro: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' ').trim(),
          numero: j.numero || '',
          complemento: j.complemento || '',
          bairro: j.bairro || '',
          cidade: j.municipio || '',
          uf: j.uf || '',
          situacao: j.descricao_situacao_cadastral || '',
          abertura: j.data_inicio_atividade || '',
          atividade: j.cnae_fiscal_descricao || '',
        };
      } else if (r.status === 404) aviso = 'CNPJ não encontrado na base da Receita.';
    } catch { /* tenta o próximo serviço */ }

    // ReceitaWS (reserva)
    if (!dados && !aviso) {
      try {
        const r = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpj}`, { signal: AbortSignal.timeout(12000) });
        const j = r.ok ? await r.json() : null;
        if (j && j.status !== 'ERROR') {
          dados = {
            cnpj, razao_social: j.nome || '', nome_fantasia: j.fantasia || '', email: j.email || '',
            telefone: j.telefone || '', cep: soDigitos(j.cep), logradouro: j.logradouro || '',
            numero: j.numero || '', complemento: j.complemento || '', bairro: j.bairro || '',
            cidade: j.municipio || '', uf: j.uf || '', situacao: j.situacao || '', abertura: j.abertura || '',
            atividade: j.atividade_principal?.[0]?.text || '',
          };
        }
      } catch { /* segue */ }
    }
    if (!dados && !aviso) aviso = 'Não foi possível consultar o CNPJ agora (sem internet ou serviço fora do ar). Preencha manualmente.';
    return { dados, aviso, ja_cadastrado: jaExiste || null };
  });

  rota.get('/api/consulta/cep/:cep', async ({ params }) => {
    const cep = soDigitos(params.cep);
    if (cep.length !== 8) throw new ErroApi('CEP deve ter 8 dígitos.');
    try {
      const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${cep}`, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) throw new Error();
      const j = await r.json();
      return { dados: { cep, logradouro: j.street || '', bairro: j.neighborhood || '', cidade: j.city || '', uf: j.state || '' } };
    } catch { /* tenta o ViaCEP */ }
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(10000) });
      const j = r.ok ? await r.json() : null;
      if (j && !j.erro) return { dados: { cep, logradouro: j.logradouro || '', bairro: j.bairro || '', cidade: j.localidade || '', uf: j.uf || '' } };
    } catch { /* segue */ }
    return { dados: null, aviso: 'Não foi possível consultar o CEP. Preencha manualmente.' };
  });

  // =============================================================== LOGO DA EMPRESA
  const caminhoLogo = () => {
    const nome = config('logo_arquivo');
    if (!nome) return null;
    const p = path.join(DATA_DIR, nome);
    return fs.existsSync(p) ? p : null;
  };

  rota.get('/api/logo', ({ res }) => {
    const p = caminhoLogo();
    if (!p) { res.writeHead(204); return res.end(); }
    res.writeHead(200, { 'Content-Type': p.endsWith('.png') ? 'image/png' : 'image/jpeg', 'Cache-Control': 'no-cache' });
    res.end(fs.readFileSync(p));
  }, { publica: true });

  rota.post('/api/logo', ({ corpo }) => {
    const m = String(corpo.dados || '').match(/^data:image\/(png|jpe?g);base64,(.+)$/);
    if (!m) throw new ErroApi('Envie um arquivo PNG ou JPG.');
    const buf = Buffer.from(m[2], 'base64');
    if (buf.length > 3 * 1024 * 1024) throw new ErroApi('Arquivo muito grande (máximo 3 MB).');
    const ext = m[1] === 'png' ? 'png' : 'jpg';
    for (const e of ['png', 'jpg']) { const v = path.join(DATA_DIR, 'logo.' + e); if (fs.existsSync(v)) fs.unlinkSync(v); }
    fs.writeFileSync(path.join(DATA_DIR, 'logo.' + ext), buf);
    setConfig('logo_arquivo', 'logo.' + ext);
    return { ok: true, arquivo: 'logo.' + ext };
  }, { admin: true });

  rota.del('/api/logo', () => {
    const p = caminhoLogo();
    if (p) fs.unlinkSync(p);
    setConfig('logo_arquivo', '');
    return { ok: true };
  }, { admin: true });

  // =============================================================== BACKUP
  rota.get('/api/backup', ({ res }) => {
    const nome = `backup-repsys-${new Date().toISOString().slice(0, 10)}.db`;
    const temporario = path.join(DATA_DIR, `.backup-${Date.now()}.db`);
    let conteudo;
    try {
      // VACUUM INTO gera uma cópia consistente mesmo com o sistema em uso
      db.exec(`VACUUM INTO '${temporario.replace(/'/g, "''")}'`);
      conteudo = fs.readFileSync(temporario);
    } catch {
      conteudo = fs.readFileSync(DB_FILE);
    } finally {
      if (fs.existsSync(temporario)) fs.unlinkSync(temporario);
    }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${nome}"` });
    res.end(conteudo);
  }, { admin: true });
};

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { db, config, DATA_DIR } = require('./db');
const { gerarPedidoPDF, gerarCatalogoPDF, gerarAcertoPDF, brl, dataBR, formatarCNPJ } = require('./pdf');

function lerLogo() {
  const nome = config('logo_arquivo');
  if (!nome) return null;
  const p = path.join(DATA_DIR, nome);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

/** Logo da representada (arquivo guardado em dados/representadas) */
function lerLogoRepresentada(representada) {
  if (!representada || !representada.logo) return null;
  const p = path.join(DATA_DIR, 'representadas', representada.logo);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

const hoje = () => new Date().toLocaleDateString('sv-SE'); // AAAA-MM-DD local

function proximoNumero(tipo) {
  const ano = new Date().getFullYear();
  const prefixo = tipo === 'cotacao' ? 'COT' : 'PED';
  const r = db.prepare(`SELECT numero FROM pedidos WHERE numero LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefixo}-${ano}-%`);
  const seq = r ? Number(String(r.numero).split('-')[2]) + 1 : 1;
  return `${prefixo}-${ano}-${String(seq).padStart(4, '0')}`;
}

function calcular(pedido, itens, representada) {
  let bruto = 0, ipi = 0;
  for (const it of itens) {
    it.quantidade = Number(it.quantidade || 0);
    it.preco_unit = Number(it.preco_unit || 0);
    it.desconto_pct = Number(it.desconto_pct || 0);
    it.ipi_pct = Number(it.ipi_pct || 0);
    it.total = +(it.quantidade * it.preco_unit * (1 - it.desconto_pct / 100)).toFixed(2);
    bruto += it.total;
  }
  const descPed = Number(pedido.desconto_pct || 0);
  const base = bruto * (1 - descPed / 100);
  for (const it of itens) ipi += it.total * (1 - descPed / 100) * (it.ipi_pct / 100);
  const frete = Number(pedido.frete || 0);
  // a % de comissao do proprio pedido tem prioridade; sem ela vale a da representada
  const pctComissao = (pedido.comissao_pct === null || pedido.comissao_pct === undefined || pedido.comissao_pct === '')
    ? Number(representada?.comissao_pct || 0)
    : Number(pedido.comissao_pct);
  return {
    total_bruto: +bruto.toFixed(2),
    total_ipi: +ipi.toFixed(2),
    total: +(base + ipi + frete).toFixed(2),
    comissao_pct: pctComissao,
    comissao_valor: +(base * pctComissao / 100).toFixed(2),
  };
}

function carregar(id) {
  const p = db.prepare(`SELECT p.*, c.razao_social AS cliente_nome, c.nome_fantasia AS cliente_fantasia,
      c.cnpj AS cliente_cnpj, c.cidade AS cliente_cidade, c.uf AS cliente_uf, c.telefone AS cliente_telefone,
      c.email AS cliente_email, r.nome AS representada_nome, u.nome AS usuario_nome,
      cp.descricao AS condicao_desc, t.nome AS tabela_nome
    FROM pedidos p
    JOIN clientes c ON c.id = p.cliente_id
    JOIN representadas r ON r.id = p.representada_id
    LEFT JOIN usuarios u ON u.id = p.usuario_id
    LEFT JOIN condicoes_pagamento cp ON cp.id = p.condicao_id
    LEFT JOIN tabelas_preco t ON t.id = p.tabela_id
    WHERE p.id = ?`).get(Number(id));
  if (!p) return null;
  p.itens = db.prepare('SELECT * FROM pedido_itens WHERE pedido_id = ? ORDER BY id').all(p.id);
  return p;
}

module.exports = function (rota, ErroApi) {

  // =============================================================== LISTAGEM
  rota.get('/api/pedidos', ({ query }) => {
    const cond = [], args = [];
    if (query.tipo) { cond.push('p.tipo = ?'); args.push(query.tipo); }
    if (query.status) { cond.push('p.status = ?'); args.push(query.status); }
    if (query.cliente_id) { cond.push('p.cliente_id = ?'); args.push(Number(query.cliente_id)); }
    if (query.representada_id) { cond.push('p.representada_id = ?'); args.push(Number(query.representada_id)); }
    if (query.usuario_id) { cond.push('p.usuario_id = ?'); args.push(Number(query.usuario_id)); }
    if (query.de) { cond.push('p.data_emissao >= ?'); args.push(query.de); }
    if (query.ate) { cond.push('p.data_emissao <= ?'); args.push(query.ate); }
    if (query.busca) { cond.push('(p.numero LIKE ? OR c.razao_social LIKE ? OR c.nome_fantasia LIKE ?)'); const b = '%' + query.busca + '%'; args.push(b, b, b); }
    return db.prepare(`SELECT p.id, p.numero, p.tipo, p.status, p.data_emissao, p.data_entrega, p.validade, p.total,
        c.razao_social AS cliente_nome, c.nome_fantasia AS cliente_fantasia, c.cidade AS cliente_cidade, c.uf AS cliente_uf,
        r.nome AS representada_nome, u.nome AS usuario_nome, cp.descricao AS condicao_desc,
        (SELECT COUNT(*) FROM pedido_itens i WHERE i.pedido_id = p.id) AS qtd_itens
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      JOIN representadas r ON r.id = p.representada_id
      LEFT JOIN usuarios u ON u.id = p.usuario_id
      LEFT JOIN condicoes_pagamento cp ON cp.id = p.condicao_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
      ORDER BY p.data_emissao DESC, p.id DESC LIMIT ${Number(query.limite || 300)}`).all(...args);
  });

  rota.get('/api/pedidos/:id', ({ params }) => {
    const p = carregar(params.id);
    if (!p) throw new ErroApi('Pedido não encontrado.', 404);
    return p;
  });

  // =============================================================== GRAVAÇÃO
  const CAMPOS = ['tipo', 'status', 'cliente_id', 'representada_id', 'tabela_id', 'condicao_id', 'data_emissao',
    'data_entrega', 'validade', 'tipo_frete', 'transportadora', 'frete', 'desconto_pct', 'observacoes', 'origem_id'];

  function gravar(id, corpo, usuario) {
    const itens = (corpo.itens || []).filter(i => Number(i.quantidade) > 0);
    if (!corpo.cliente_id) throw new ErroApi('Selecione o cliente.');
    if (!corpo.representada_id) throw new ErroApi('Selecione a representada.');
    if (!itens.length) throw new ErroApi('Inclua ao menos um item.');

    const representada = db.prepare('SELECT * FROM representadas WHERE id = ?').get(Number(corpo.representada_id));
    if (!representada) throw new ErroApi('Representada inválida.');

    const dados = {};
    for (const c of CAMPOS) if (corpo[c] !== undefined && corpo[c] !== '') dados[c] = corpo[c];
    dados.tipo = dados.tipo === 'cotacao' ? 'cotacao' : 'pedido';
    dados.data_emissao = dados.data_emissao || hoje();
    dados.frete = Number(dados.frete || 0);
    dados.desconto_pct = Number(dados.desconto_pct || 0);

    // prazo negociado: texto livre, pode ser apagado (por isso fora do laço acima)
    if (corpo.condicao_texto !== undefined) dados.condicao_texto = String(corpo.condicao_texto || '').trim();
    // % de comissão do pedido: vazio devolve para a % da representada
    if (corpo.comissao_pct !== undefined)
      dados.comissao_pct = (corpo.comissao_pct === '' || corpo.comissao_pct === null) ? null : Number(corpo.comissao_pct);

    Object.assign(dados, calcular(dados, itens, representada));

    if (representada.pedido_minimo > 0 && dados.total < representada.pedido_minimo && dados.tipo === 'pedido')
      throw new ErroApi(`Pedido mínimo de ${representada.nome} é R$ ${brl(representada.pedido_minimo)}. Total atual: R$ ${brl(dados.total)}.`);

    const transacao = db.prepare('BEGIN');
    try {
      transacao.run();
      if (id) {
        const atual = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(id);
        if (!atual) throw new ErroApi('Pedido não encontrado.', 404);
        if (atual.status === 'faturado' || atual.status === 'cancelado')
          throw new ErroApi('Pedido faturado ou cancelado não pode ser editado.');
        const cols = Object.keys(dados);
        db.prepare(`UPDATE pedidos SET ${cols.map(c => c + ' = ?').join(', ')}, atualizado_em = datetime('now','localtime') WHERE id = ?`)
          .run(...cols.map(c => dados[c]), id);
        db.prepare('DELETE FROM pedido_itens WHERE pedido_id = ?').run(id);
      } else {
        dados.numero = corpo.numero || proximoNumero(dados.tipo);
        dados.usuario_id = usuario.id;
        dados.status = dados.status || (dados.tipo === 'cotacao' ? 'rascunho' : 'aberto');
        const cols = Object.keys(dados);
        const info = db.prepare(`INSERT INTO pedidos (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`)
          .run(...cols.map(c => dados[c]));
        id = Number(info.lastInsertRowid);
      }
      const st = db.prepare(`INSERT INTO pedido_itens
        (pedido_id, produto_id, codigo, descricao, unidade, quantidade, preco_unit, desconto_pct, ipi_pct, total)
        VALUES (?,?,?,?,?,?,?,?,?,?)`);
      for (const it of itens) {
        st.run(id, it.produto_id ? Number(it.produto_id) : null, it.codigo || '', it.descricao || 'Item',
          it.unidade || 'UN', it.quantidade, it.preco_unit, it.desconto_pct, it.ipi_pct, it.total);
      }
      db.prepare('COMMIT').run();
    } catch (e) {
      try { db.prepare('ROLLBACK').run(); } catch {}
      throw e;
    }
    return carregar(id);
  }

  rota.post('/api/pedidos', ({ corpo, usuario }) => gravar(null, corpo, usuario));
  rota.put('/api/pedidos/:id', ({ params, corpo, usuario }) => gravar(Number(params.id), corpo, usuario));

  rota.del('/api/pedidos/:id', ({ params, usuario }) => {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(Number(params.id));
    if (!p) throw new ErroApi('Pedido não encontrado.', 404);
    if (p.status === 'faturado' && usuario.papel !== 'admin') throw new ErroApi('Só o administrador pode excluir um pedido faturado.', 403);
    db.prepare('DELETE FROM pedidos WHERE id = ?').run(p.id);
    return { ok: true };
  });

  const STATUS_VALIDOS = {
    pedido: ['rascunho', 'aberto', 'enviado', 'faturado', 'cancelado'],
    cotacao: ['rascunho', 'enviada', 'ganha', 'perdida', 'cancelado'],
  };
  rota.post('/api/pedidos/:id/status', ({ params, corpo }) => {
    const p = db.prepare('SELECT * FROM pedidos WHERE id = ?').get(Number(params.id));
    if (!p) throw new ErroApi('Pedido não encontrado.', 404);
    if (!STATUS_VALIDOS[p.tipo].includes(corpo.status)) throw new ErroApi('Situação inválida.');
    db.prepare(`UPDATE pedidos SET status = ?, atualizado_em = datetime('now','localtime') WHERE id = ?`).run(corpo.status, p.id);
    return carregar(p.id);
  });

  // =============================================================== COMISSÕES
  const hojeData = () => new Date().toLocaleDateString('sv-SE');

  /** Marca uma ou várias comissões como recebidas / pendentes */
  rota.post('/api/comissoes/marcar', ({ corpo }) => {
    const ids = (Array.isArray(corpo.ids) ? corpo.ids : [corpo.id]).map(Number).filter(Boolean);
    if (!ids.length) throw new ErroApi('Selecione ao menos um pedido.');
    const recebida = corpo.status === 'recebida';
    const quando = recebida ? (corpo.data || hojeData()) : '';
    const st = db.prepare('UPDATE pedidos SET comissao_status = ?, comissao_recebida_em = ? WHERE id = ?');
    const tx = db.prepare('BEGIN');
    try {
      tx.run();
      for (const id of ids) st.run(recebida ? 'recebida' : 'pendente', quando, id);
      db.prepare('COMMIT').run();
    } catch (e) { try { db.prepare('ROLLBACK').run(); } catch {} throw e; }
    return { ok: true, atualizados: ids.length, status: recebida ? 'recebida' : 'pendente', data: quando };
  });

  /** Lista de comissões com totais do período */
  rota.get('/api/comissoes', ({ query }) => {
    const cond = [`p.tipo = 'pedido'`, `p.status <> 'cancelado'`];
    const args = [];
    if (query.de) { cond.push('p.data_emissao >= ?'); args.push(query.de); }
    if (query.ate) { cond.push('p.data_emissao <= ?'); args.push(query.ate); }
    if (query.representada_id) { cond.push('p.representada_id = ?'); args.push(Number(query.representada_id)); }
    // o resumo ignora o filtro de situação, para sempre mostrar pendente E recebida
    const ondeBase = cond.join(' AND ');
    const argsBase = [...args];
    if (query.status === 'recebida' || query.status === 'pendente') {
      cond.push(`IFNULL(p.comissao_status,'pendente') = ?`); args.push(query.status);
    }
    const onde = cond.join(' AND ');
    const lista = db.prepare(`SELECT p.id, p.numero, p.data_emissao, p.status, p.total, p.representada_id,
        p.comissao_pct, p.comissao_valor, IFNULL(p.comissao_status,'pendente') AS comissao_status,
        p.comissao_recebida_em, c.razao_social AS cliente_nome, r.nome AS representada_nome,
        r.comissao_pct AS comissao_pct_representada
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      JOIN representadas r ON r.id = p.representada_id
      WHERE ${onde} ORDER BY p.data_emissao DESC, p.id DESC LIMIT ${Number(query.limite || 500)}`).all(...args);

    const soma = (st) => db.prepare(`SELECT IFNULL(SUM(p.comissao_valor),0) v, COUNT(*) q FROM pedidos p
      WHERE ${ondeBase} AND IFNULL(p.comissao_status,'pendente') = ?`).get(...argsBase, st);
    const pend = soma('pendente'), receb = soma('recebida');
    return {
      lista,
      resumo: {
        pendente: pend.v, qtd_pendente: pend.q,
        recebida: receb.v, qtd_recebida: receb.q,
        total: pend.v + receb.v, qtd_total: pend.q + receb.q,
      },
    };
  });

  // ----------------------------------------------------- acerto de comissão
  // O acerto é o documento que o representante manda para a representada:
  // "estes pedidos eu vendi, esta comissão vocês ainda me devem". Por isso entra
  // SÓ o que está pendente — o que já foi pago não é mais cobrança.
  const MES_LONGO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /** "Outubro/2026" quando o período é um mês fechado; senão "01/10/2026 a 20/10/2026" */
  function rotuloPeriodo(de, ate) {
    if (!de || !ate) return de ? `a partir de ${dataBR(de)}` : (ate ? `até ${dataBR(ate)}` : 'todo o período');
    const [a1, m1, d1] = de.split('-').map(Number);
    const [a2, m2, d2] = ate.split('-').map(Number);
    const ultimo = new Date(a2, m2, 0).getDate();
    if (a1 === a2 && m1 === m2 && d1 === 1 && d2 === ultimo) {
      const nome = MES_LONGO[m1 - 1];
      return nome.charAt(0).toUpperCase() + nome.slice(1) + '/' + a1;
    }
    return `${dataBR(de)} a ${dataBR(ate)}`;
  }

  /** Condição comum: pedido válido, comissão pendente e com valor */
  function ondePendente(query) {
    const cond = [`p.tipo = 'pedido'`, `p.status <> 'cancelado'`,
      `IFNULL(p.comissao_status,'pendente') = 'pendente'`, `IFNULL(p.comissao_valor,0) > 0`];
    const args = [];
    if (query.de) { cond.push('p.data_emissao >= ?'); args.push(query.de); }
    if (query.ate) { cond.push('p.data_emissao <= ?'); args.push(query.ate); }
    return { onde: cond.join(' AND '), args };
  }

  /** Representadas que têm comissão a receber no período — alimenta a lista de acertos */
  rota.get('/api/comissoes/acerto', ({ query }) => {
    const { onde, args } = ondePendente(query);
    const linhas = db.prepare(`SELECT r.id AS representada_id, r.nome,
        COUNT(*) AS qtd, IFNULL(SUM(p.total),0) AS base, IFNULL(SUM(p.comissao_valor),0) AS comissao,
        MIN(p.data_emissao) AS primeiro, MAX(p.data_emissao) AS ultimo
      FROM pedidos p JOIN representadas r ON r.id = p.representada_id
      WHERE ${onde} GROUP BY r.id, r.nome ORDER BY r.nome`).all(...args);
    return {
      periodo: { de: query.de || '', ate: query.ate || '', rotulo: rotuloPeriodo(query.de, query.ate) },
      representadas: linhas,
      total: linhas.reduce((s, l) => s + l.comissao, 0),
    };
  });

  /** PDF do acerto de uma representada. Só emite o documento: não marca nada como recebido. */
  rota.get('/api/comissoes/acerto/:id/pdf', ({ params, query, res }) => {
    const representada = db.prepare('SELECT * FROM representadas WHERE id = ?').get(Number(params.id));
    if (!representada) throw new ErroApi('Representada não encontrada.', 404);

    const { onde, args } = ondePendente(query);
    const pedidos = db.prepare(`SELECT p.numero, p.data_emissao, p.total, p.comissao_valor,
        IFNULL(p.comissao_pct, r.comissao_pct) AS pct, c.razao_social AS cliente_nome
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      JOIN representadas r ON r.id = p.representada_id
      WHERE ${onde} AND p.representada_id = ?
      ORDER BY p.data_emissao, p.id`).all(...args, representada.id);

    if (!pedidos.length) {
      throw new ErroApi(`Não há comissão a receber de ${representada.nome} neste período. ` +
        'Confira as datas, ou veja se essas comissões já foram marcadas como recebidas.', 400);
    }

    const totais = {
      qtd: pedidos.length,
      base: pedidos.reduce((s, p) => s + Number(p.total || 0), 0),
      comissao: pedidos.reduce((s, p) => s + Number(p.comissao_valor || 0), 0),
    };
    const pdf = gerarAcertoPDF({
      empresa: Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor])),
      logo: lerLogo(),
      representada,
      periodo: { de: query.de || '', ate: query.ate || '', rotulo: rotuloPeriodo(query.de, query.ate) },
      pedidos, totais,
    });
    const nome = `acerto-${String(representada.nome).replace(/[^\w]/g, '-').toLowerCase()}-${query.de || ''}.pdf`;
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${query.download ? 'attachment' : 'inline'}; filename="${nome.replace(/[^\x20-\x7e]/g, '_')}"`,
    });
    res.end(pdf);
  });

  // ---- cotação vira pedido
  rota.post('/api/pedidos/:id/converter', ({ params, usuario }) => {
    const c = carregar(params.id);
    if (!c) throw new ErroApi('Cotação não encontrada.', 404);
    if (c.tipo !== 'cotacao') throw new ErroApi('Este registro já é um pedido.');
    const novo = gravar(null, {
      ...c, tipo: 'pedido', status: 'aberto', numero: proximoNumero('pedido'),
      data_emissao: hoje(), validade: '', origem_id: c.id, itens: c.itens,
    }, usuario);
    db.prepare(`UPDATE pedidos SET status = 'ganha' WHERE id = ?`).run(c.id);
    return novo;
  });

  // ---- duplicar
  rota.post('/api/pedidos/:id/duplicar', ({ params, usuario }) => {
    const c = carregar(params.id);
    if (!c) throw new ErroApi('Registro não encontrado.', 404);
    return gravar(null, { ...c, numero: null, status: c.tipo === 'cotacao' ? 'rascunho' : 'aberto', data_emissao: hoje(), origem_id: null, itens: c.itens }, usuario);
  });

  // =============================================================== CÓPIA DO PEDIDO
  function dadosCompletos(id) {
    const p = carregar(id);
    if (!p) throw new ErroApi('Pedido não encontrado.', 404);
    const representada = db.prepare('SELECT * FROM representadas WHERE id = ?').get(p.representada_id);
    return {
      pedido: p,
      itens: p.itens,
      cliente: db.prepare('SELECT * FROM clientes WHERE id = ?').get(p.cliente_id),
      representada,
      condicao: p.condicao_id ? db.prepare('SELECT * FROM condicoes_pagamento WHERE id = ?').get(p.condicao_id) : null,
      usuario: p.usuario_id ? db.prepare('SELECT * FROM usuarios WHERE id = ?').get(p.usuario_id) : null,
      empresa: Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor])),
      logo: lerLogo(),
      logoRepresentada: lerLogoRepresentada(representada),
    };
  }

  rota.get('/api/pedidos/:id/pdf', ({ params, res, query }) => {
    const d = dadosCompletos(params.id);
    const pdf = gerarPedidoPDF(d);
    const nome = `${d.pedido.numero}-${String(d.cliente.razao_social).replace(/[^\wÀ-ÿ ]/g, '').trim().slice(0, 40)}.pdf`;
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${query.download ? 'attachment' : 'inline'}; filename="${nome.replace(/[^\x20-\x7e]/g, '_')}"`,
    });
    res.end(pdf);
  });

  // ---- catálogo de produtos com foto
  rota.get('/api/catalogo', ({ query, res }) => {
    const repId = Number(query.representada_id || 0);
    const representada = db.prepare('SELECT * FROM representadas WHERE id = ?').get(repId);
    if (!representada) throw new ErroApi('Escolha a representada.', 400);
    const tabId = Number(query.tabela_id || 0);
    const tabela = tabId ? db.prepare('SELECT * FROM tabelas_preco WHERE id = ?').get(tabId) : null;

    const lista = db.prepare(`SELECT p.*,
        ${tabId ? `(SELECT preco FROM precos pr WHERE pr.produto_id = p.id AND pr.tabela_id = ${tabId})` : 'NULL'} AS preco_tabela
      FROM produtos p WHERE p.representada_id = ? AND p.ativo = 1 ORDER BY p.descricao`).all(repId);

    const pasta = path.join(DATA_DIR, 'produtos');
    const produtos = lista
      .filter(p => query.com_foto !== '1' || p.imagem)
      .map(p => {
        let img = null;
        if (p.imagem) { const a = path.join(pasta, p.imagem); if (fs.existsSync(a)) img = fs.readFileSync(a); }
        return { ...p, preco: p.preco_tabela ?? p.preco_base, imagem: img };
      });

    const pdf = gerarCatalogoPDF({
      representada, tabela, produtos,
      empresa: Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor])),
      logo: lerLogo(),
      logoRepresentada: lerLogoRepresentada(representada),
    });
    const nome = `catalogo-${String(representada.nome).replace(/[^\w]/g, '-').toLowerCase()}.pdf`;
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `${query.download ? 'attachment' : 'inline'}; filename="${nome}"` });
    res.end(pdf);
  });

  rota.get('/api/pedidos/:id/texto', ({ params, url }) => {
    const { pedido, itens, cliente, representada, condicao, empresa } = dadosCompletos(params.id);
    const eCot = pedido.tipo === 'cotacao';
    const linhas = [
      `*${eCot ? 'COTAÇÃO' : 'PEDIDO'} ${pedido.numero}*`,
      `${empresa.empresa_nome || ''}`.trim(),
      '',
      `*Cliente:* ${cliente.razao_social}`,
      cliente.cnpj ? `*CNPJ:* ${formatarCNPJ(cliente.cnpj)}` : '',
      [cliente.cidade, cliente.uf].filter(Boolean).length ? `*Cidade:* ${[cliente.cidade, cliente.uf].filter(Boolean).join('/')}` : '',
      `*Representada:* ${representada.nome}`,
      (pedido.condicao_texto || condicao) ? `*Pagamento:* ${pedido.condicao_texto || condicao.descricao}` : '',
      eCot ? (pedido.validade ? `*Validade:* ${dataBR(pedido.validade)}` : '') : (pedido.data_entrega ? `*Entrega:* ${dataBR(pedido.data_entrega)}` : ''),
      '',
      '*Itens*',
      ...itens.map(i => `• ${i.codigo ? i.codigo + ' - ' : ''}${i.descricao}\n   ${Number(i.quantidade).toLocaleString('pt-BR')} ${i.unidade} x R$ ${brl(i.preco_unit)}${Number(i.desconto_pct) ? ` (-${Number(i.desconto_pct).toFixed(1)}%)` : ''} = R$ ${brl(i.total)}`),
      '',
      Number(pedido.desconto_pct) ? `Desconto: ${Number(pedido.desconto_pct).toFixed(2)}%` : '',
      Number(pedido.total_ipi) ? `IPI: R$ ${brl(pedido.total_ipi)}` : '',
      Number(pedido.frete) ? `Frete: R$ ${brl(pedido.frete)}` : '',
      `*TOTAL: R$ ${brl(pedido.total)}*`,
      pedido.observacoes ? `\n_${pedido.observacoes}_` : '',
      '',
      `PDF: ${url.origin}/api/pedidos/${pedido.id}/pdf`,
    ].filter(l => l !== '');
    const texto = linhas.join('\n');
    const telefone = String(cliente.telefone || '').replace(/\D/g, '');
    return {
      texto,
      whatsapp: `https://wa.me/${telefone.length >= 10 ? '55' + telefone.replace(/^55/, '') : ''}?text=${encodeURIComponent(texto)}`,
      email: cliente.email || '',
      assunto: `${eCot ? 'Cotação' : 'Pedido'} ${pedido.numero} - ${representada.nome}`,
    };
  });
};

'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { db, config, DATA_DIR } = require('./db');
const { gerarRelatorioPDF } = require('./pdf');

function lerLogo() {
  const nome = config('logo_arquivo');
  if (!nome) return null;
  const p = path.join(DATA_DIR, nome);
  return fs.existsSync(p) ? fs.readFileSync(p) : null;
}

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const hoje = () => new Date().toLocaleDateString('sv-SE');

function statusContados() {
  return (config('contar_status') || 'aberto,enviado,faturado').split(',').map(s => s.trim()).filter(Boolean);
}
function filtroStatus(alias = 'p') {
  const st = statusContados();
  return { sql: `${alias}.tipo = 'pedido' AND ${alias}.status IN (${st.map(() => '?').join(',')})`, args: st };
}

/** Vendas do sistema agrupadas por ano/mês (opcionalmente por representada) */
function vendasPorMes(ano, filtros = {}) {
  const f = filtroStatus();
  const cond = [f.sql, `strftime('%Y', p.data_emissao) = ?`];
  const args = [...f.args, String(ano)];
  if (filtros.representada_id) { cond.push('p.representada_id = ?'); args.push(Number(filtros.representada_id)); }
  if (filtros.usuario_id) { cond.push('p.usuario_id = ?'); args.push(Number(filtros.usuario_id)); }
  return db.prepare(`SELECT CAST(strftime('%m', p.data_emissao) AS INTEGER) AS mes,
      p.representada_id, SUM(p.total) AS total, COUNT(*) AS qtd
    FROM pedidos p WHERE ${cond.join(' AND ')} GROUP BY mes, p.representada_id`).all(...args);
}

function somaPeriodo(de, ate, filtros = {}) {
  const f = filtroStatus();
  const cond = [f.sql, 'p.data_emissao BETWEEN ? AND ?'];
  const args = [...f.args, de, ate];
  if (filtros.representada_id) { cond.push('p.representada_id = ?'); args.push(Number(filtros.representada_id)); }
  if (filtros.usuario_id) { cond.push('p.usuario_id = ?'); args.push(Number(filtros.usuario_id)); }
  const r = db.prepare(`SELECT IFNULL(SUM(p.total),0) AS total, COUNT(*) AS qtd,
      IFNULL(SUM(p.comissao_valor),0) AS comissao,
      COUNT(DISTINCT p.cliente_id) AS clientes FROM pedidos p WHERE ${cond.join(' AND ')}`).all(...args)[0];
  return { total: r.total || 0, qtd: r.qtd || 0, comissao: r.comissao || 0, clientes: r.clientes || 0 };
}

/** Busca a meta mais específica disponível */
function buscarMeta(ano, mes, representada_id, usuario_id) {
  const q = (m, r, u) => db.prepare(`SELECT * FROM metas WHERE ano = ?
      AND IFNULL(mes,0) = ? AND IFNULL(representada_id,0) = ? AND IFNULL(usuario_id,0) = ?`)
    .get(ano, m || 0, r || 0, u || 0);
  return q(mes, representada_id, usuario_id) || (usuario_id ? q(mes, representada_id, 0) : null) || null;
}

function metaMes(ano, mes, representada_id = null, usuario_id = null) {
  const direta = buscarMeta(ano, mes, representada_id, usuario_id);
  if (direta) return direta;
  if (!representada_id) {
    // soma das metas por representada naquele mês
    const s = db.prepare(`SELECT IFNULL(SUM(valor),0) v, IFNULL(MAX(dias_uteis),22) d FROM metas
      WHERE ano = ? AND IFNULL(mes,0) = ? AND representada_id IS NOT NULL AND usuario_id IS NULL`).get(ano, mes || 0);
    if (s.v > 0) return { valor: s.v, dias_uteis: s.d, meta_diaria: 0 };
  }
  return null;
}

/**
 * Meta de um intervalo qualquer de datas.
 * Soma as metas dos meses tocados. Mês incompleto entra proporcional aos dias:
 * meia metade de março vale metade da meta de março. É a regra mais simples de
 * explicar para quem olha o painel, e é a mesma usada no cálculo da meta diária.
 */
function metaPeriodo(de, ate, representada_id = null, usuario_id = null) {
  const [a1, m1, d1] = de.split('-').map(Number);
  const [a2, m2, d2] = ate.split('-').map(Number);
  let soma = 0;
  for (let ano = a1, mes = m1; ano < a2 || (ano === a2 && mes <= m2); mes === 12 ? (mes = 1, ano++) : mes++) {
    const valor = metaMes(ano, mes, representada_id, usuario_id)?.valor || 0;
    if (!valor) continue;
    const diasNoMes = new Date(ano, mes, 0).getDate();
    const primeiro = (ano === a1 && mes === m1) ? d1 : 1;
    const ultimo = (ano === a2 && mes === m2) ? d2 : diasNoMes;
    soma += valor * ((ultimo - primeiro + 1) / diasNoMes);
  }
  return soma;
}

/** Quantos dias tem o intervalo, contando as duas pontas */
function diasDoPeriodo(de, ate) {
  const ms = Date.parse(ate + 'T12:00:00') - Date.parse(de + 'T12:00:00');
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

function metaAno(ano, representada_id = null, usuario_id = null) {
  const anual = buscarMeta(ano, null, representada_id, usuario_id);
  if (anual && anual.valor > 0) return anual.valor;
  let soma = 0;
  for (let m = 1; m <= 12; m++) soma += metaMes(ano, m, representada_id, usuario_id)?.valor || 0;
  return soma;
}

module.exports = function (rota, ErroApi) {

  // =============================================================== METAS
  rota.get('/api/metas', ({ query }) => {
    const cond = [], args = [];
    if (query.ano) { cond.push('m.ano = ?'); args.push(Number(query.ano)); }
    if (query.representada_id) { cond.push('IFNULL(m.representada_id,0) = ?'); args.push(Number(query.representada_id)); }
    return db.prepare(`SELECT m.*, r.nome AS representada_nome, u.nome AS usuario_nome
      FROM metas m LEFT JOIN representadas r ON r.id = m.representada_id
      LEFT JOIN usuarios u ON u.id = m.usuario_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''}
      ORDER BY m.ano DESC, IFNULL(m.mes,0), r.nome`).all(...args);
  });

  rota.post('/api/metas', ({ corpo }) => {
    const itens = Array.isArray(corpo.itens) ? corpo.itens : [corpo];
    const st = db.prepare(`INSERT INTO metas (ano, mes, representada_id, usuario_id, valor, dias_uteis, meta_diaria, observacoes)
      VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(ano, IFNULL(mes,0), IFNULL(representada_id,0), IFNULL(usuario_id,0))
      DO UPDATE SET valor = excluded.valor, dias_uteis = excluded.dias_uteis,
                    meta_diaria = excluded.meta_diaria, observacoes = excluded.observacoes`);
    for (const i of itens) {
      if (!i.ano) throw new ErroApi('Informe o ano da meta.');
      st.run(Number(i.ano), i.mes ? Number(i.mes) : null,
        i.representada_id ? Number(i.representada_id) : null,
        i.usuario_id ? Number(i.usuario_id) : null,
        Number(i.valor || 0), Number(i.dias_uteis || 22), Number(i.meta_diaria || 0), i.observacoes || '');
    }
    return { ok: true, gravadas: itens.length };
  }, { admin: true });

  rota.del('/api/metas/:id', ({ params }) => { db.prepare('DELETE FROM metas WHERE id = ?').run(Number(params.id)); return { ok: true }; }, { admin: true });

  /** Grade meta x realizado, por representada e por mês */
  rota.get('/api/metas/grade', ({ query }) => {
    const ano = Number(query.ano || new Date().getFullYear());
    const representadas = db.prepare('SELECT id, nome FROM representadas WHERE ativo = 1 ORDER BY nome').all();
    const vendas = vendasPorMes(ano);
    const hist = db.prepare('SELECT * FROM historico_vendas WHERE ano = ?').all(ano);
    // Regra: o histórico é o fechamento daquele mês. Onde ele existe, manda —
    // mesmo que haja pedido lançado, porque o fechamento já inclui esse pedido.
    // Sem histórico, vale o que está lançado em pedidos.
    const realizado = (mes, repId) => {
      const h = hist.filter(x => x.mes === mes && (!repId || x.representada_id === repId)).reduce((s, x) => s + x.realizado, 0);
      if (h > 0) return h;
      return vendas.filter(x => x.mes === mes && (!repId || x.representada_id === repId)).reduce((s, x) => s + x.total, 0);
    };
    const linhas = representadas.map(r => ({
      representada_id: r.id, nome: r.nome,
      meses: MESES.map((_, i) => {
        const m = i + 1, mt = metaMes(ano, m, r.id);
        return { mes: m, meta: mt?.valor || 0, dias_uteis: mt?.dias_uteis || 22, realizado: realizado(m, r.id) };
      }),
      meta_ano: metaAno(ano, r.id),
    }));
    const totalGeral = MESES.map((_, i) => ({
      mes: i + 1,
      meta: metaMes(ano, i + 1)?.valor || linhas.reduce((s, l) => s + l.meses[i].meta, 0),
      realizado: linhas.reduce((s, l) => s + l.meses[i].realizado, 0),
    }));
    return { ano, meses: MESES, linhas, total: totalGeral, meta_ano: metaAno(ano) || linhas.reduce((s, l) => s + l.meta_ano, 0) };
  });

  // =============================================================== HISTÓRICO (anos anteriores)
  rota.get('/api/historico', ({ query }) => {
    const cond = [], args = [];
    if (query.ano) { cond.push('h.ano = ?'); args.push(Number(query.ano)); }
    return db.prepare(`SELECT h.*, r.nome AS representada_nome FROM historico_vendas h
      LEFT JOIN representadas r ON r.id = h.representada_id
      ${cond.length ? 'WHERE ' + cond.join(' AND ') : ''} ORDER BY h.ano DESC, h.mes, r.nome`).all(...args);
  });

  rota.post('/api/historico', ({ corpo }) => {
    const itens = Array.isArray(corpo.itens) ? corpo.itens : [corpo];
    const st = db.prepare(`INSERT INTO historico_vendas (ano, mes, representada_id, realizado, meta, observacoes)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(ano, mes, IFNULL(representada_id,0))
      DO UPDATE SET realizado = excluded.realizado, meta = excluded.meta, observacoes = excluded.observacoes`);
    for (const i of itens) {
      if (!i.ano || !i.mes) throw new ErroApi('Informe ano e mês do histórico.');
      st.run(Number(i.ano), Number(i.mes), i.representada_id ? Number(i.representada_id) : null,
        Number(i.realizado || 0), Number(i.meta || 0), i.observacoes || '');
    }
    return { ok: true, gravados: itens.length };
  }, { admin: true });

  rota.del('/api/historico/:id', ({ params }) => { db.prepare('DELETE FROM historico_vendas WHERE id = ?').run(Number(params.id)); return { ok: true }; }, { admin: true });

  // =============================================================== RELATÓRIO DE VENDAS
  const ETIQ = { rascunho: 'Rascunho', aberto: 'Aberto', enviado: 'Enviado', faturado: 'Faturado', cancelado: 'Cancelado' };

  function dadosRelatorio(query) {
    const agora = new Date();
    const f2 = (n) => String(n).padStart(2, '0');
    let de = query.de, ate = query.ate;
    if (!de || !ate) {
      const ano = Number(query.ano || agora.getFullYear());
      const mes = Number(query.mes || agora.getMonth() + 1);
      de = `${ano}-${f2(mes)}-01`;
      ate = `${ano}-${f2(mes)}-${new Date(ano, mes, 0).getDate()}`;
    }
    const repId = query.representada_id ? Number(query.representada_id) : null;
    const cliId = query.cliente_id ? Number(query.cliente_id) : null;

    const fs2 = filtroStatus();
    const cond = [fs2.sql, 'p.data_emissao BETWEEN ? AND ?'];
    const args = [...fs2.args, de, ate];
    if (repId) { cond.push('p.representada_id = ?'); args.push(repId); }
    if (cliId) { cond.push('p.cliente_id = ?'); args.push(cliId); }
    const onde = cond.join(' AND ');

    const r = db.prepare(`SELECT IFNULL(SUM(p.total),0) total, COUNT(*) pedidos,
        IFNULL(SUM(p.comissao_valor),0) comissao, COUNT(DISTINCT p.cliente_id) clientes
      FROM pedidos p WHERE ${onde}`).get(...args);
    const resumo = { total: r.total, pedidos: r.pedidos, comissao: r.comissao, clientes: r.clientes,
      ticket: r.pedidos ? r.total / r.pedidos : 0 };

    const meses = db.prepare(`SELECT strftime('%Y-%m', p.data_emissao) ym, COUNT(*) pedidos, SUM(p.total) total
      FROM pedidos p WHERE ${onde} GROUP BY ym ORDER BY ym`).all(...args).map(m => {
        const [a, mm] = m.ym.split('-').map(Number);
        return { ym: m.ym, rotulo: `${MESES[mm - 1]}/${a}`, pedidos: m.pedidos, total: m.total, meta: metaMes(a, mm, repId)?.valor || 0 };
      });

    const representadas = db.prepare(`SELECT rp.nome, COUNT(*) pedidos, SUM(p.total) total
      FROM pedidos p JOIN representadas rp ON rp.id = p.representada_id
      WHERE ${onde} GROUP BY rp.id ORDER BY total DESC`).all(...args);

    const clientes = db.prepare(`SELECT c.razao_social nome, c.cidade, c.uf, COUNT(*) pedidos, SUM(p.total) total
      FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
      WHERE ${onde} GROUP BY c.id ORDER BY total DESC LIMIT 15`).all(...args)
      .map(c => ({ ...c, cidade: [c.cidade, c.uf].filter(Boolean).join('/') }));

    const produtos = db.prepare(`SELECT i.descricao, i.codigo, SUM(i.quantidade) quantidade, SUM(i.total) total
      FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
      WHERE ${onde} GROUP BY i.descricao ORDER BY total DESC LIMIT 15`).all(...args);

    const pedidos = db.prepare(`SELECT p.numero, p.data_emissao, p.status, p.total,
        c.razao_social cliente, rp.nome representada
      FROM pedidos p JOIN clientes c ON c.id = p.cliente_id JOIN representadas rp ON rp.id = p.representada_id
      WHERE ${onde} ORDER BY p.data_emissao, p.id LIMIT 300`).all(...args)
      .map(p => ({ ...p, status: ETIQ[p.status] || p.status }));

    const rotulo = meses.length === 1 ? meses[0].rotulo
      : `${de.split('-').reverse().join('/')} a ${ate.split('-').reverse().join('/')}`;
    const filtros = [
      repId ? 'Representada: ' + db.prepare('SELECT nome FROM representadas WHERE id = ?').get(repId)?.nome : '',
      cliId ? 'Cliente: ' + db.prepare('SELECT razao_social FROM clientes WHERE id = ?').get(cliId)?.razao_social : '',
    ].filter(Boolean).join('   •   ');

    return { periodo: { de, ate, rotulo }, filtros, resumo, meses, representadas, clientes, produtos, pedidos };
  }

  rota.get('/api/relatorio/vendas', ({ query }) => dadosRelatorio(query));

  rota.get('/api/relatorio/vendas/pdf', ({ query, res }) => {
    const d = dadosRelatorio(query);
    const pdf = gerarRelatorioPDF({
      ...d,
      pedidos: query.detalhado === '0' ? [] : d.pedidos,
      empresa: Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor])),
      logo: lerLogo(),
    });
    const nome = `relatorio-vendas-${d.periodo.de}-a-${d.periodo.ate}.pdf`;
    res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `${query.download ? 'attachment' : 'inline'}; filename="${nome}"` });
    res.end(pdf);
  });

  rota.get('/api/relatorio/vendas/texto', ({ query, url }) => {
    const d = dadosRelatorio(query);
    const cfg = Object.fromEntries(db.prepare('SELECT chave, valor FROM config').all().map(r => [r.chave, r.valor]));
    const din = (v) => 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const linhas = [
      `*RELATÓRIO DE VENDAS*`,
      `${cfg.empresa_nome || ''}`.trim(),
      `Período: ${d.periodo.rotulo}`,
      d.filtros || '',
      '',
      `*Faturamento:* ${din(d.resumo.total)}`,
      `*Pedidos:* ${d.resumo.pedidos}   |   *Clientes:* ${d.resumo.clientes}`,
      `*Ticket médio:* ${din(d.resumo.ticket)}`,
      `*Comissão:* ${din(d.resumo.comissao)}`,
      '',
      d.representadas.length ? '*Por representada*' : '',
      ...d.representadas.map(r => `• ${r.nome}: ${din(r.total)} (${r.pedidos} ped.)`),
      '',
      d.clientes.length ? '*Maiores clientes*' : '',
      ...d.clientes.slice(0, 5).map((c, i) => `${i + 1}. ${c.nome} — ${din(c.total)}`),
      '',
      d.produtos.length ? '*Produtos mais vendidos*' : '',
      ...d.produtos.slice(0, 5).map((p, i) => `${i + 1}. ${p.descricao} — ${din(p.total)}`),
    ].filter(l => l !== '');
    const texto = linhas.join('\n');
    const p = new URLSearchParams(query).toString();
    return { texto, pdf: `${url.origin}/api/relatorio/vendas/pdf?${p}`, whatsapp: `https://wa.me/?text=${encodeURIComponent(texto)}` };
  });

  // =============================================================== FATURAMENTO
  rota.get('/api/faturamento', ({ query }) => {
    const agora = new Date();
    const ano = Number(query.ano || agora.getFullYear());
    const repId = query.representada_id ? Number(query.representada_id) : null;
    const filtros = { representada_id: repId };
    const f2 = (n) => String(n).padStart(2, '0');
    const anoCorrente = ano === agora.getFullYear();
    const mesAtual = anoCorrente ? agora.getMonth() + 1 : 12;

    const somaStatus = (de, ate, status) => {
      const cond = [`p.tipo = 'pedido'`, 'p.data_emissao BETWEEN ? AND ?'];
      const args = [de, ate];
      if (status) { cond.push(`p.status = ?`); args.push(status); }
      else cond.push(`p.status <> 'cancelado'`);
      if (repId) { cond.push('p.representada_id = ?'); args.push(repId); }
      const r = db.prepare(`SELECT IFNULL(SUM(p.total),0) t, COUNT(*) q, IFNULL(SUM(p.comissao_valor),0) c
        FROM pedidos p WHERE ${cond.join(' AND ')}`).get(...args);
      return { total: r.t || 0, qtd: r.q || 0, comissao: r.c || 0 };
    };

    const historico = (a, m) => db.prepare(
      `SELECT IFNULL(SUM(realizado),0) v FROM historico_vendas WHERE ano = ? AND mes = ? ${repId ? 'AND representada_id = ' + repId : ''}`
    ).get(a, m).v;

    const meses = [];
    for (let m = 1; m <= 12; m++) {
      const ultimo = new Date(ano, m, 0).getDate();
      const de = `${ano}-${f2(m)}-01`, ate = `${ano}-${f2(m)}-${ultimo}`;
      const carteira = somaPeriodo(de, ate, filtros);                 // conta como venda (config)
      const faturado = somaStatus(de, ate, 'faturado');
      const emitido = somaStatus(de, ate, null);
      const antDe = `${ano - 1}-${f2(m)}-01`, antAte = `${ano - 1}-${f2(m)}-${new Date(ano - 1, m, 0).getDate()}`;
      const anterior = historico(ano - 1, m) || somaPeriodo(antDe, antAte, filtros).total;
      meses.push({
        mes: m, nome: MESES[m - 1],
        faturado: faturado.total, emitido: emitido.total, carteira: carteira.total,
        pedidos: emitido.qtd, comissao: carteira.comissao,
        meta: metaMes(ano, m, repId)?.valor || 0,
        anterior,
        realizado: historico(ano, m) || carteira.total,
      });
    }

    const soma = (c) => meses.reduce((s, m) => s + m[c], 0);
    const decorridos = meses.slice(0, mesAtual);
    const realizadoAno = soma('realizado');

    // ---- projeção do mês corrente (pelo ritmo de dias úteis já decorridos)
    const mt = metaMes(ano, mesAtual, repId);
    const diasUteis = mt?.dias_uteis || 22;
    const diaHoje = anoCorrente ? agora.getDate() : new Date(ano, mesAtual, 0).getDate();
    const diasDoMes = new Date(ano, mesAtual, 0).getDate();
    const proporcao = diaHoje / diasDoMes;
    const realMes = meses[mesAtual - 1].realizado;
    const projecaoMes = proporcao > 0 ? realMes / proporcao : 0;

    // ---- projeção do ano: o que já entrou + fechamento do mês + média nos meses que faltam
    const mediaMensal = mesAtual > 1 ? decorridos.slice(0, mesAtual - 1).reduce((s, m) => s + m.realizado, 0) / (mesAtual - 1) : projecaoMes;
    const mesesRestantes = 12 - mesAtual;
    const projecaoAno = realizadoAno - realMes + projecaoMes + mesesRestantes * (mediaMensal || projecaoMes);

    const porRepresentada = db.prepare('SELECT id, nome, comissao_pct FROM representadas WHERE ativo = 1 ORDER BY nome').all()
      .filter(r => !repId || r.id === repId)
      .map(r => {
        const ate = `${ano}-${f2(mesAtual)}-${new Date(ano, mesAtual, 0).getDate()}`;
        const a = somaPeriodo(`${ano}-01-01`, `${ano}-12-31`, { representada_id: r.id });
        const m = somaPeriodo(`${ano}-${f2(mesAtual)}-01`, ate, { representada_id: r.id });
        const ant = somaPeriodo(`${ano - 1}-01-01`, `${ano - 1}-12-31`, { representada_id: r.id }).total
          || db.prepare('SELECT IFNULL(SUM(realizado),0) v FROM historico_vendas WHERE ano = ? AND representada_id = ?').get(ano - 1, r.id).v;
        return {
          id: r.id, nome: r.nome, comissao_pct: r.comissao_pct,
          mes: m.total, ano: a.total, pedidos: a.qtd,
          projecao_mes: proporcao > 0 ? m.total / proporcao : 0,
          meta_ano: metaAno(ano, r.id), anterior: ant,
          comissao_ano: a.total * (r.comissao_pct || 0) / 100,
        };
      });

    const anteriorAno = meses.reduce((s, m) => s + m.anterior, 0);
    return {
      ano, mes_atual: mesAtual, dias_uteis: diasUteis,
      meses,
      totais: {
        realizado: realizadoAno, faturado: soma('faturado'), emitido: soma('emitido'),
        pedidos: soma('pedidos'), comissao: soma('comissao'),
        meta: metaAno(ano, repId), anterior: anteriorAno,
        variacao: anteriorAno ? ((realizadoAno - anteriorAno) / anteriorAno) * 100 : null,
        ticket: soma('pedidos') ? realizadoAno / soma('pedidos') : 0,
      },
      mes: {
        numero: mesAtual, nome: MESES[mesAtual - 1], realizado: realMes,
        projecao: projecaoMes, meta: mt?.valor || 0,
        media_dia: diaHoje ? realMes / diaHoje : 0,
        dias_corridos: diaHoje, dias_do_mes: diasDoMes,
        anterior: meses[mesAtual - 1].anterior,
      },
      projecao_ano: projecaoAno,
      media_mensal: mediaMensal,
      por_representada: porRepresentada,
    };
  });

  // =============================================================== PAINEL
  rota.get('/api/painel', ({ query, usuario }) => {
    const agora = new Date();
    const ano = Number(query.ano || agora.getFullYear());
    const mes = Number(query.mes || agora.getMonth() + 1);
    const repId = query.representada_id ? Number(query.representada_id) : null;
    const usrId = query.usuario_id ? Number(query.usuario_id) : null;
    const filtros = { representada_id: repId, usuario_id: usrId };
    const f2 = (n) => String(n).padStart(2, '0');
    const ultimoDia = new Date(ano, mes, 0).getDate();
    const dia = hoje();

    /* ---- período analisado: mês, ano inteiro ou intervalo de datas livre ----
       Vale o que o usuário escolheu em "Ver por". No modo intervalo, as datas
       mandam; nos outros dois o próprio ano/mês define o começo e o fim.      */
    const dataOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    let modo = ['mes', 'ano', 'intervalo'].includes(query.modo) ? query.modo : 'mes';
    if (modo === 'intervalo' && !(dataOk(query.de) && dataOk(query.ate))) modo = 'mes';

    let inicio, fim, rotuloPeriodo;
    if (modo === 'intervalo') {
      inicio = query.de <= query.ate ? query.de : query.ate;
      fim = query.de <= query.ate ? query.ate : query.de;
      const br = (s) => s.split('-').reverse().join('/');
      rotuloPeriodo = `${br(inicio)} a ${br(fim)}`;
    } else if (modo === 'ano') {
      inicio = `${ano}-01-01`; fim = `${ano}-12-31`;
      rotuloPeriodo = `Ano ${ano}`;
    } else {
      inicio = `${ano}-${f2(mes)}-01`; fim = `${ano}-${f2(mes)}-${ultimoDia}`;
      rotuloPeriodo = `${MESES_LONGOS[mes - 1]} / ${ano}`;
    }
    // o bloco do mês continua existindo porque projeção e meta diária são mensais
    const inicioMes = `${ano}-${f2(mes)}-01`, fimMes = `${ano}-${f2(mes)}-${ultimoDia}`;

    const mt = metaMes(ano, mes, repId, usrId);
    const metaMensal = mt?.valor || 0;
    const diasUteis = mt?.dias_uteis || 22;
    const metaDiaria = mt?.meta_diaria > 0 ? mt.meta_diaria : (metaMensal / (diasUteis || 1));
    const metaAnual = metaAno(ano, repId, usrId);

    const doDia = somaPeriodo(dia, dia, filtros);
    const doMes = somaPeriodo(inicioMes, fimMes, filtros);
    const doAno = somaPeriodo(`${ano}-01-01`, `${ano}-12-31`, filtros);
    const doPeriodo = somaPeriodo(inicio, fim, filtros);
    const metaDoPeriodo = modo === 'ano' ? metaAnual
      : modo === 'mes' ? metaMensal
      : metaPeriodo(inicio, fim, repId, usrId);
    const diasPeriodo = diasDoPeriodo(inicio, fim);
    // quantos dias do período já passaram (para a média e a projeção fazerem sentido)
    const diasCorridos = Math.min(diasPeriodo, Math.max(1, diasDoPeriodo(inicio, dia < inicio ? inicio : (dia > fim ? fim : dia))));
    const periodo = {
      modo, de: inicio, ate: fim, rotulo: rotuloPeriodo, dias: diasPeriodo, dias_corridos: diasCorridos,
      realizado: doPeriodo.total, qtd: doPeriodo.qtd, clientes: doPeriodo.clientes, comissao: doPeriodo.comissao,
      meta: metaDoPeriodo, falta: Math.max(0, metaDoPeriodo - doPeriodo.total),
      ticket: doPeriodo.qtd ? doPeriodo.total / doPeriodo.qtd : 0,
      media_dia: doPeriodo.total / diasCorridos,
      projecao: (doPeriodo.total / diasCorridos) * diasPeriodo,
    };

    // ---- projeção do mês
    const diaDoMes = (agora.getFullYear() === ano && agora.getMonth() + 1 === mes) ? agora.getDate() : ultimoDia;
    const projecao = diaDoMes > 0 ? (doMes.total / diaDoMes) * ultimoDia : 0;

    // ---- por representada
    const porRepresentada = db.prepare('SELECT id, nome FROM representadas WHERE ativo = 1 ORDER BY nome').all().map(r => {
      const m = somaPeriodo(inicioMes, fimMes, { ...filtros, representada_id: r.id });
      const a = somaPeriodo(`${ano}-01-01`, `${ano}-12-31`, { ...filtros, representada_id: r.id });
      const p = somaPeriodo(inicio, fim, { ...filtros, representada_id: r.id });
      const mm = metaMes(ano, mes, r.id, usrId);
      return {
        id: r.id, nome: r.nome,
        realizado_mes: m.total, qtd_mes: m.qtd, meta_mes: mm?.valor || 0,
        realizado_ano: a.total, meta_ano: metaAno(ano, r.id, usrId),
        realizado_periodo: p.total, qtd_periodo: p.qtd,
        meta_periodo: modo === 'ano' ? metaAno(ano, r.id, usrId)
          : modo === 'mes' ? (mm?.valor || 0)
          : metaPeriodo(inicio, fim, r.id, usrId),
      };
    }).filter(r => !repId || r.id === repId);

    // ---- 12 meses do ano corrente
    const vendas = vendasPorMes(ano, filtros);
    const histAno = db.prepare('SELECT mes, IFNULL(SUM(realizado),0) v FROM historico_vendas WHERE ano = ? GROUP BY mes').all(ano);
    const serie = MESES.map((nome, i) => {
      const m = i + 1;
      const sistema = vendas.filter(v => v.mes === m).reduce((s, v) => s + v.total, 0);
      const h = histAno.find(x => x.mes === m)?.v || 0;
      return { mes: m, nome, realizado: h > 0 ? h : sistema, meta: metaMes(ano, m, repId, usrId)?.valor || 0 };
    });

    // ---- histórico de anos
    const anosSistema = db.prepare(`SELECT DISTINCT CAST(strftime('%Y', data_emissao) AS INTEGER) a FROM pedidos WHERE tipo='pedido'`).all().map(r => r.a);
    const anosHist = db.prepare('SELECT DISTINCT ano a FROM historico_vendas').all().map(r => r.a);
    const anosMeta = db.prepare('SELECT DISTINCT ano a FROM metas').all().map(r => r.a);
    const anos = [...new Set([...anosSistema, ...anosHist, ...anosMeta, ano])].sort((a, b) => a - b);
    const historicoAnos = anos.map(a => {
      const sis = somaPeriodo(`${a}-01-01`, `${a}-12-31`, filtros).total;
      const h = db.prepare(`SELECT IFNULL(SUM(realizado),0) v FROM historico_vendas WHERE ano = ? ${repId ? 'AND representada_id = ' + repId : ''}`).get(a).v;
      const hm = db.prepare(`SELECT IFNULL(SUM(meta),0) v FROM historico_vendas WHERE ano = ? ${repId ? 'AND representada_id = ' + repId : ''}`).get(a).v;
      return { ano: a, realizado: h > 0 ? h : sis, meta: metaAno(a, repId, usrId) || hm };
    });

    // ---- cotações
    const cot = db.prepare(`SELECT status, COUNT(*) qtd, IFNULL(SUM(total),0) valor FROM pedidos
      WHERE tipo = 'cotacao' AND data_emissao BETWEEN ? AND ? ${repId ? 'AND representada_id = ' + repId : ''} GROUP BY status`)
      .all(inicio, fim);
    const pega = (s) => cot.find(c => c.status === s) || { qtd: 0, valor: 0 };
    const ganhas = pega('ganha'), perdidas = pega('perdida');
    const cotacoes = {
      abertas: pega('rascunho').qtd + pega('enviada').qtd,
      valor_abertas: pega('rascunho').valor + pega('enviada').valor,
      ganhas: ganhas.qtd, valor_ganhas: ganhas.valor, perdidas: perdidas.qtd,
      conversao: (ganhas.qtd + perdidas.qtd) ? (ganhas.qtd / (ganhas.qtd + perdidas.qtd)) * 100 : 0,
    };

    // ---- rankings
    const fs2 = filtroStatus();
    const topClientes = db.prepare(`SELECT c.id, c.razao_social, c.cidade, c.uf, SUM(p.total) total, COUNT(*) qtd
      FROM pedidos p JOIN clientes c ON c.id = p.cliente_id
      WHERE ${fs2.sql} AND p.data_emissao BETWEEN ? AND ? ${repId ? 'AND p.representada_id = ' + repId : ''}
      GROUP BY c.id ORDER BY total DESC LIMIT 10`).all(...fs2.args, inicio, fim);

    const topProdutos = db.prepare(`SELECT i.descricao, i.codigo, SUM(i.quantidade) qtd, SUM(i.total) total
      FROM pedido_itens i JOIN pedidos p ON p.id = i.pedido_id
      WHERE ${fs2.sql} AND p.data_emissao BETWEEN ? AND ? ${repId ? 'AND p.representada_id = ' + repId : ''}
      GROUP BY i.descricao ORDER BY total DESC LIMIT 10`).all(...fs2.args, inicio, fim);

    const ultimos = db.prepare(`SELECT p.id, p.numero, p.tipo, p.status, p.data_emissao, p.total,
        c.razao_social AS cliente_nome, r.nome AS representada_nome
      FROM pedidos p JOIN clientes c ON c.id = p.cliente_id JOIN representadas r ON r.id = p.representada_id
      ORDER BY p.id DESC LIMIT 8`).all();

    const comissao = db.prepare(`SELECT IFNULL(SUM(p.comissao_valor),0) v FROM pedidos p
      WHERE ${fs2.sql} AND p.data_emissao BETWEEN ? AND ? ${repId ? 'AND p.representada_id = ' + repId : ''}`)
      .get(...fs2.args, inicio, fim).v;

    // ---- comissões do ano: pendente x recebida
    const comAno = db.prepare(`SELECT IFNULL(p.comissao_status,'pendente') s,
        IFNULL(SUM(p.comissao_valor),0) v, COUNT(*) q FROM pedidos p
      WHERE p.tipo = 'pedido' AND p.status <> 'cancelado'
        AND p.data_emissao BETWEEN ? AND ? ${repId ? 'AND p.representada_id = ' + repId : ''}
      GROUP BY s`).all(inicio, fim);
    const achaCom = (s) => comAno.find(x => x.s === s) || { v: 0, q: 0 };
    const comissoes = {
      pendente: achaCom('pendente').v, qtd_pendente: achaCom('pendente').q,
      recebida: achaCom('recebida').v, qtd_recebida: achaCom('recebida').q,
    };
    comissoes.total = comissoes.pendente + comissoes.recebida;

    return {
      ano, mes, usuario: usuario.nome,
      comissoes,
      dia: { data: dia, realizado: doDia.total, qtd: doDia.qtd, meta: metaDiaria },
      mes_atual: {
        realizado: doMes.total, qtd: doMes.qtd, clientes: doMes.clientes, meta: metaMensal,
        dias_uteis: diasUteis, projecao, falta: Math.max(0, metaMensal - doMes.total),
        media_dia: diaDoMes ? doMes.total / diaDoMes : 0,
        ticket: doMes.qtd ? doMes.total / doMes.qtd : 0, comissao,
      },
      ano_atual: { realizado: doAno.total, qtd: doAno.qtd, meta: metaAnual, falta: Math.max(0, metaAnual - doAno.total) },
      periodo,
      por_representada: porRepresentada, serie, historico_anos: historicoAnos,
      cotacoes, top_clientes: topClientes, top_produtos: topProdutos, ultimos_pedidos: ultimos,
    };
  });
};

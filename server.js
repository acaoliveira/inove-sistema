'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { verificar } = require('./src/auth');
const { db } = require('./src/db');

const PORTA = Number(process.env.PORT || 3000);
const PUBLICO = path.join(__dirname, 'public');

// ------------------------------------------------------------------ roteador
const rotas = [];
function rota(metodo, padrao, handler, opcoes = {}) {
  const nomes = [];
  const regex = new RegExp('^' + padrao.replace(/:([A-Za-z_]+)/g, (_, n) => { nomes.push(n); return '([^/]+)'; }) + '$');
  rotas.push({ metodo, regex, nomes, handler, publica: !!opcoes.publica, admin: !!opcoes.admin });
}
rota.get = (p, h, o) => rota('GET', p, h, o);
rota.post = (p, h, o) => rota('POST', p, h, o);
rota.put = (p, h, o) => rota('PUT', p, h, o);
rota.del = (p, h, o) => rota('DELETE', p, h, o);

class ErroApi extends Error {
  constructor(mensagem, codigo = 400) { super(mensagem); this.codigo = codigo; }
}

// ------------------------------------------------------------------ registro
require('./src/rotas-cadastros')(rota, ErroApi);
require('./src/rotas-pedidos')(rota, ErroApi);
require('./src/rotas-painel')(rota, ErroApi);

// ------------------------------------------------------------------ estáticos
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };

function servirEstatico(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const arquivo = path.join(PUBLICO, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!arquivo.startsWith(PUBLICO) || !fs.existsSync(arquivo) || fs.statSync(arquivo).isDirectory()) {
    // SPA: qualquer rota desconhecida devolve o index
    const idx = path.join(PUBLICO, 'index.html');
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    return res.end(fs.readFileSync(idx));
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(arquivo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(fs.readFileSync(arquivo));
}

// ------------------------------------------------------------------ servidor
const servidor = http.createServer(async (req, res) => {
  const protocolo = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
  const anfitriao = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const url = new URL(req.url, `${protocolo}://${anfitriao}`);
  req.seguro = protocolo === 'https';

  if (!url.pathname.startsWith('/api/')) return servirEstatico(req, res, url);

  const enviar = (dados, status = 200, cabecalhos = {}) => {
    if (Buffer.isBuffer(dados)) { res.writeHead(status, cabecalhos); return res.end(dados); }
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...cabecalhos });
    res.end(JSON.stringify(dados));
  };

  try {
    const achou = rotas.find(r => r.metodo === req.method && r.regex.test(url.pathname));
    if (!achou) throw new ErroApi('Rota não encontrada', 404);

    // corpo
    let corpo = {};
    if (req.method !== 'GET' && req.method !== 'DELETE') {
      const pedacos = [];
      for await (const p of req) pedacos.push(p);
      const bruto = Buffer.concat(pedacos).toString('utf8');
      if (bruto) { try { corpo = JSON.parse(bruto); } catch { throw new ErroApi('JSON inválido'); } }
    }

    // sessão
    const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => {
      const i = c.indexOf('='); return i < 0 ? [c.trim(), ''] : [c.slice(0, i).trim(), decodeURIComponent(c.slice(i + 1))];
    }).filter(p => p[0]));
    const sessao = verificar(cookies.repsys || (req.headers.authorization || '').replace(/^Bearer /, ''));
    let usuario = null;
    if (sessao) usuario = db.prepare('SELECT id, nome, email, papel, ativo FROM usuarios WHERE id = ?').get(sessao.uid) || null;
    if (usuario && !usuario.ativo) usuario = null;

    if (!achou.publica && !usuario) throw new ErroApi('Sessão expirada. Faça login novamente.', 401);
    if (achou.admin && usuario.papel !== 'admin') throw new ErroApi('Apenas administradores podem fazer isso.', 403);

    const m = url.pathname.match(achou.regex);
    const params = Object.fromEntries(achou.nomes.map((n, i) => [n, decodeURIComponent(m[i + 1])]));
    const ctx = { req, res, url, corpo, params, usuario, query: Object.fromEntries(url.searchParams), enviar };

    const resultado = await achou.handler(ctx);
    if (resultado !== undefined && !res.writableEnded) enviar(resultado);
    else if (!res.writableEnded) enviar({ ok: true });
  } catch (e) {
    const codigo = e.codigo || 500;
    if (codigo === 500) console.error(e);
    if (!res.writableEnded) {
      res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ erro: e.message || 'Erro interno' }));
    }
  }
});

// ---- sobe o servidor; se a porta estiver ocupada, tenta a seguinte
const os = require('node:os');
const { DATA_DIR } = require('./src/db');

function enderecoDaRede() {
  for (const lista of Object.values(os.networkInterfaces())) {
    for (const i of lista || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return null;
}

const NA_NUVEM = !!(process.env.RAILWAY_ENVIRONMENT || process.env.RENDER || process.env.REPSYS_NUVEM);

servidor.on('listening', () => {
  const porta = servidor.address().port;
  try { fs.writeFileSync(path.join(DATA_DIR, 'porta.txt'), String(porta)); } catch {}

  // Datas do sistema (hoje, meta diária, emissão do pedido) saem do relógio
  // desta máquina. Se o fuso estiver errado, o dia vira na hora errada.
  const fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || process.env.TZ || '(desconhecido)';
  const agora = new Date().toLocaleString('pt-BR');

  if (NA_NUVEM) {
    console.log(`\n  INOVE Representações - sistema no ar na porta ${porta}`);
    console.log(`  Dados em: ${DATA_DIR}`);
    console.log(`  Fuso horário: ${fuso} — agora são ${agora}\n`);
    return;
  }

  const ip = enderecoDaRede();
  console.log('\n  ==========================================================');
  console.log('    INOVE Representações - Sistema de Pedidos');
  console.log('  ==========================================================');
  console.log('');
  console.log(`    Neste computador:   http://localhost:${porta}`);
  if (ip) console.log(`    No celular/tablet:  http://${ip}:${porta}   (mesmo Wi-Fi)`);
  console.log('');
  console.log('    Login: admin@local     Senha: admin123');
  console.log('');
  console.log('    NAO FECHE ESTA JANELA enquanto estiver usando o sistema.');
  console.log('  ==========================================================\n');
});

function subir(porta, tentativas = 0) {
  servidor.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && tentativas < 12) {
      console.log(`  A porta ${porta} está ocupada, tentando a ${porta + 1}...`);
      return subir(porta + 1, tentativas + 1);
    }
    console.error('\n  Não foi possível iniciar o sistema:', e.message, '\n');
    process.exit(1);
  });
  servidor.listen(porta);
}
subir(PORTA);

'use strict';
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

// ---- chave secreta persistida (gerada na primeira execução)
const DATA_DIR = process.env.REPSYS_DATA || path.join(__dirname, '..', 'dados');
fs.mkdirSync(DATA_DIR, { recursive: true });
const KEY_FILE = path.join(DATA_DIR, '.chave');
let SEGREDO;
if (fs.existsSync(KEY_FILE)) {
  SEGREDO = fs.readFileSync(KEY_FILE, 'utf8').trim();
} else {
  SEGREDO = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(KEY_FILE, SEGREDO, { mode: 0o600 });
}

// ---- senhas: scrypt (nativo do Node, não precisa de bcrypt)
function hashSenha(senha) {
  const salt = crypto.randomBytes(16).toString('hex');
  const dk = crypto.scryptSync(String(senha), salt, 32).toString('hex');
  return `scrypt$${salt}$${dk}`;
}
function conferirSenha(senha, hash) {
  try {
    const [alg, salt, dk] = String(hash).split('$');
    if (alg !== 'scrypt') return false;
    const calc = crypto.scryptSync(String(senha), salt, 32).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(calc, 'hex'), Buffer.from(dk, 'hex'));
  } catch { return false; }
}

// ---- token assinado (formato JWT HS256, sem biblioteca)
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function assinar(payload, diasValidade = 30) {
  const head = b64({ alg: 'HS256', typ: 'JWT' });
  const corpo = b64({ ...payload, exp: Math.floor(Date.now() / 1000) + diasValidade * 86400 });
  const sig = crypto.createHmac('sha256', SEGREDO).update(`${head}.${corpo}`).digest('base64url');
  return `${head}.${corpo}.${sig}`;
}
function verificar(token) {
  if (!token) return null;
  const p = String(token).split('.');
  if (p.length !== 3) return null;
  const esperado = crypto.createHmac('sha256', SEGREDO).update(`${p[0]}.${p[1]}`).digest('base64url');
  if (esperado.length !== p[2].length ||
      !crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(p[2]))) return null;
  try {
    const dados = JSON.parse(Buffer.from(p[1], 'base64url').toString('utf8'));
    if (dados.exp && dados.exp < Math.floor(Date.now() / 1000)) return null;
    return dados;
  } catch { return null; }
}

module.exports = { hashSenha, conferirSenha, assinar, verificar };

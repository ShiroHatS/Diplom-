import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const params = { N: 131072, r: 8, p: 1, maxmem: 192 * 1024 * 1024 };
let hashing = 0;
export const digest = value => createHash('sha256').update(value).digest('hex');
export const secret = () => randomBytes(32).toString('base64url');
export const usernameOf = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
export const validUsername = value => /^[a-z0-9_]{3,32}$/.test(value);
export const validPassword = value => typeof value === 'string' && [...value].length >= 15 && [...value].length <= 128 && Buffer.byteLength(value) <= 512;

async function passwordKey(password, salt) {
  // Ограничиваем одновременно занятые память и CPU при дорогом хешировании.
  if (hashing >= 2) throw Object.assign(new Error('SERVER_BUSY'), { status: 503, code: 'SERVER_BUSY' });
  hashing++;
  try { return await derive(password, salt, 64, params); }
  finally { hashing--; }
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await passwordKey(password, salt);
  return `scrypt$131072$8$1$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  const valid = parts.length === 6 && parts.slice(0, 4).join('$') === 'scrypt$131072$8$1'
    && /^[a-f0-9]{32}$/.test(parts[4]) && /^[a-f0-9]{128}$/.test(parts[5]);
  // Неизвестный логин проходит ту же дорогую операцию, что и известный.
  const salt = valid ? parts[4] : '0'.repeat(32);
  const expected = Buffer.from(valid ? parts[5] : '0'.repeat(128), 'hex');
  const actual = await passwordKey(password, salt);
  return timingSafeEqual(actual, expected) && valid;
}

export const matchesSecret = (value, hash) => timingSafeEqual(Buffer.from(digest(value), 'hex'), Buffer.from(hash, 'hex'));

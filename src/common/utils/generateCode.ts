import { randomBytes, randomInt } from 'crypto';

const JOIN_CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';
const JOIN_CODE_LENGTH = 8;

export function generateCode(): string {
  return randomInt(100000, 1000000).toString();
}

export function generateJoinCode(): string {
  const bytes = randomBytes(JOIN_CODE_LENGTH);
  return Array.from(
    bytes,
    (byte) => JOIN_CODE_ALPHABET[byte % JOIN_CODE_ALPHABET.length],
  ).join('');
}
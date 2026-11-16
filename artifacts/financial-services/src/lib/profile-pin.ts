const PIN_STORAGE_PREFIX = 'financial-services:profile-pin:v1:';
const PBKDF2_ITERATIONS = 120_000;

type StoredPin = {
  version: 1;
  salt: string;
  verifier: string;
};

function storageKey(profileId: string) {
  return `${PIN_STORAGE_PREFIX}${profileId}`;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(value)) throw new Error('Invalid PIN record');
  const bytes = new Uint8Array(value.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function readStoredPin(profileId: string): StoredPin | null {
  const raw = window.localStorage.getItem(storageKey(profileId));
  if (!raw) return null;

  const record = JSON.parse(raw) as Partial<StoredPin>;
  if (
    record.version !== 1
    || typeof record.salt !== 'string'
    || typeof record.verifier !== 'string'
  ) {
    throw new Error('Invalid PIN record');
  }

  fromHex(record.salt);
  fromHex(record.verifier);
  return record as StoredPin;
}

function getSubtleCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error('Secure PIN storage is unavailable');
  return globalThis.crypto.subtle;
}

async function deriveVerifier(pin: string, salt: Uint8Array<ArrayBuffer>) {
  const subtle = getSubtleCrypto();
  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const result = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    material,
    256,
  );
  return new Uint8Array(result);
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

export function normalizePinInput(value: string) {
  const asciiDigits = value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0));
  return asciiDigits.replace(/\D/g, '').slice(0, 4);
}

export function hasProfilePin(profileId: string) {
  return readStoredPin(profileId) !== null;
}

export async function createProfilePin(profileId: string, pin: string) {
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must contain four digits');
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const verifier = await deriveVerifier(pin, salt);
  const record: StoredPin = {
    version: 1,
    salt: toHex(salt),
    verifier: toHex(verifier),
  };
  window.localStorage.setItem(storageKey(profileId), JSON.stringify(record));
}

export async function verifyProfilePin(profileId: string, pin: string) {
  if (!/^\d{4}$/.test(pin)) return false;
  const record = readStoredPin(profileId);
  if (!record) return false;
  const actual = await deriveVerifier(pin, fromHex(record.salt));
  return equalBytes(actual, fromHex(record.verifier));
}

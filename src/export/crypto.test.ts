import { describe, expect, it } from 'vitest';
import { decryptVault, encryptVault, isEncrypted } from './crypto';
import { emptyVault } from '../core/types';

function vaultWithMeal() {
  const vault = emptyVault();
  vault.meals.push({
    id: 'm1',
    date: '2026-10-12',
    time: '14:00',
    items: [{ id: 'f1', name: 'pan', grams: 60, carbsPer100g: 50 }],
    confidence: null,
    origin: 'manual',
  });
  return vault;
}

describe('export cifrado (Argon2id + AES-GCM)', () => {
  it('hace ida y vuelta con la contrasena correcta', async () => {
    const encrypted = await encryptVault(vaultWithMeal(), 'correcta');
    expect(isEncrypted(encrypted)).toBe(true);
    const decrypted = await decryptVault(encrypted, 'correcta');
    expect(decrypted.meals).toHaveLength(1);
    expect(decrypted.meals[0]?.items[0]?.name).toBe('pan');
  });

  it('falla con la contrasena incorrecta', async () => {
    const encrypted = await encryptVault(vaultWithMeal(), 'correcta');
    await expect(decryptVault(encrypted, 'incorrecta')).rejects.toThrow();
  });

  it('no reconoce un JSON legible como cifrado', () => {
    expect(isEncrypted('{"version":2,"meals":[],"insulin":[]}')).toBe(false);
    expect(isEncrypted('no es json')).toBe(false);
  });

  it('el sobre declara el KDF versionado', async () => {
    const encrypted = await encryptVault(emptyVault(), 'x');
    const envelope = JSON.parse(encrypted);
    expect(envelope.format).toBe('carbos-enc');
    expect(envelope.kdf.name).toBe('argon2id');
    expect(envelope.cipher).toBe('AES-GCM');
  });
});

import { describe, expect, it } from 'vitest';
import { OPTIONAL_IDS } from '../../src/config/consentCategories';
import {
  CONSENT_KEY,
  CONSENT_VERSION,
  clearConsent,
  defaultConsent,
  loadConsent,
  sanitizeConsent,
  saveConsent,
} from '../../src/services/consentStore';
import { MemoryStorage } from '../helpers/memoryStorage';

describe('consent defaults', () => {
  it('has every optional category OFF and the user not yet acknowledged', () => {
    const c = defaultConsent();
    expect(c.acknowledged).toBe(false);
    expect(Object.keys(c.choices).sort()).toEqual([...OPTIONAL_IDS].sort());
    expect(Object.values(c.choices).every((v) => v === false)).toBe(true);
  });

  it('separates IP lookup from geolocation and keeps behavioural timing optional', () => {
    expect(OPTIONAL_IDS).toEqual(expect.arrayContaining(['publicIp', 'geolocation', 'behavioral', 'extended']));
    expect(defaultConsent().choices.behavioral).toBe(false);
  });

  it('a fresh visit loads the safe defaults (status "default")', () => {
    const { consent, status } = loadConsent(new MemoryStorage());
    expect(status).toBe('default');
    expect(consent).toEqual(defaultConsent());
  });
});

describe('persistence', () => {
  it('round-trips saved choices', () => {
    const storage = new MemoryStorage();
    const consent = { ...defaultConsent(), acknowledged: true, updatedAt: '2025-01-01T00:00:00.000Z', choices: { ...defaultConsent().choices, publicIp: true } };
    expect(saveConsent(consent, storage).ok).toBe(true);
    const loaded = loadConsent(storage);
    expect(loaded.status).toBe('loaded');
    expect(loaded.consent.choices.publicIp).toBe(true);
    expect(loaded.consent.choices.geolocation).toBe(false);
    expect(loaded.consent.acknowledged).toBe(true);
  });

  it('revocation persists: a category saved as false loads as false', () => {
    const storage = new MemoryStorage();
    const on = { ...defaultConsent(), acknowledged: true, choices: { ...defaultConsent().choices, geolocation: true } };
    saveConsent(on, storage);
    saveConsent({ ...on, choices: { ...on.choices, geolocation: false } }, storage);
    expect(loadConsent(storage).consent.choices.geolocation).toBe(false);
  });

  it('clearConsent removes the stored key', () => {
    const storage = new MemoryStorage();
    saveConsent(defaultConsent(), storage);
    clearConsent(storage);
    expect(storage.getItem(CONSENT_KEY)).toBeNull();
  });
});

describe('untrusted / damaged storage can only ever reduce collection', () => {
  it('corrupted JSON -> safe defaults, status "corrupted"', () => {
    const storage = new MemoryStorage({ [CONSENT_KEY]: '{not json' });
    const { consent, status } = loadConsent(storage);
    expect(status).toBe('corrupted');
    expect(consent).toEqual(defaultConsent());
  });

  it('wrong version -> defaults', () => {
    const storage = new MemoryStorage({ [CONSENT_KEY]: JSON.stringify({ version: 999, acknowledged: true, choices: { publicIp: true } }) });
    expect(loadConsent(storage).consent.choices.publicIp).toBe(false);
  });

  it.each(['true', 1, 'yes', {}, [], null])('treats non-boolean-true value %j as NOT granted', (value) => {
    const stored = { version: CONSENT_VERSION, acknowledged: true, choices: { publicIp: value, geolocation: value, behavioral: value, extended: value } };
    const { consent } = loadConsent(new MemoryStorage({ [CONSENT_KEY]: JSON.stringify(stored) }));
    expect(Object.values(consent.choices).every((v) => v === false)).toBe(true);
  });

  it('ignores unknown categories', () => {
    const clean = sanitizeConsent({ version: CONSENT_VERSION, choices: { telemetry: true, publicIp: true } });
    expect(clean.choices).not.toHaveProperty('telemetry');
    expect(clean.choices.publicIp).toBe(true);
  });

  it('handles non-object payloads', () => {
    for (const bad of [null, 5, 'x', []]) expect(sanitizeConsent(bad)).toEqual(defaultConsent());
  });

  it('missing storage (privacy mode) -> defaults, status "unavailable", and saving reports failure instead of throwing', () => {
    expect(loadConsent(null)).toMatchObject({ status: 'unavailable', consent: defaultConsent() });
    expect(saveConsent(defaultConsent(), null)).toMatchObject({ ok: false, reason: 'unavailable' });
  });

  it('a throwing storage (SecurityError) is treated as unavailable', () => {
    const storage = new MemoryStorage();
    storage.failReads = true;
    expect(loadConsent(storage).status).toBe('unavailable');
  });

  it('a full storage reports "quota" without throwing', () => {
    const storage = new MemoryStorage();
    storage.failWrites = 'quota';
    expect(saveConsent(defaultConsent(), storage)).toMatchObject({ ok: false, reason: 'quota' });
  });
});

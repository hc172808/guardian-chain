import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getConfiguredReservedWallets,
  getReservedWalletConfiguration,
  isReservedAddress,
  RESERVED_WALLET_ENV,
  TOTAL_GENESIS_SUPPLY,
} from '../../server/reservedWallets';

const envVars = Object.values(RESERVED_WALLET_ENV);

function configureUniqueRecipients() {
  envVars.forEach((envVar, index) => {
    vi.stubEnv(envVar, `0x${(index + 1).toString(16).padStart(40, '0')}`);
  });
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('reserved treasury recipient configuration', () => {
  it('reports every recipient as missing when deployment addresses are unset', () => {
    envVars.forEach((envVar) => vi.stubEnv(envVar, ''));
    const configuration = getReservedWalletConfiguration();

    expect(configuration.configured).toBe(false);
    expect(configuration.issues).toHaveLength(6);
    expect(configuration.issues.every((issue) => issue.reason === 'missing')).toBe(true);
    expect(() => getConfiguredReservedWallets()).toThrow('Treasury recipient addresses are incomplete');
  });

  it('rejects malformed wallet addresses', () => {
    configureUniqueRecipients();
    vi.stubEnv(RESERVED_WALLET_ENV.founder, 'not-an-address');

    const configuration = getReservedWalletConfiguration();

    expect(configuration.configured).toBe(false);
    expect(configuration.issues).toEqual([
      expect.objectContaining({
        key: 'founder',
        envVar: RESERVED_WALLET_ENV.founder,
        reason: 'invalid',
      }),
    ]);
  });

  it('rejects duplicate addresses regardless of letter case', () => {
    configureUniqueRecipients();
    vi.stubEnv(RESERVED_WALLET_ENV.miningPool, `0x${'0'.repeat(39)}1`.toUpperCase().replace('0X', '0x'));

    const configuration = getReservedWalletConfiguration();

    expect(configuration.configured).toBe(false);
    expect(configuration.issues).toEqual([
      expect.objectContaining({
        key: 'miningPool',
        reason: 'duplicate',
      }),
    ]);
  });

  it('returns the configured recipients and preserves the three billion GYDS allocation', () => {
    configureUniqueRecipients();

    const configuration = getReservedWalletConfiguration();

    expect(configuration.configured).toBe(true);
    expect(configuration.issues).toEqual([]);
    expect(configuration.wallets).toHaveLength(6);
    expect(TOTAL_GENESIS_SUPPLY).toBe(3_000_000_000);
    expect(configuration.wallets.reduce((sum, wallet) => sum + wallet.allocation, 0)).toBe(TOTAL_GENESIS_SUPPLY);
    expect(isReservedAddress(configuration.wallets[0].address.toUpperCase())).toBe(true);
    expect(getConfiguredReservedWallets()).toHaveLength(6);
  });
});

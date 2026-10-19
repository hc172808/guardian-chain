import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockApiGet } = vi.hoisted(() => ({ mockApiGet: vi.fn() }));

vi.mock('@/lib/api', () => ({
  api: { get: mockApiGet },
}));

import { loadDeFiTokenCatalog } from '@/lib/defiTokenCatalog';

const configuredGyd = '0x1111111111111111111111111111111111111111';
const tokenAddress = '0x2222222222222222222222222222222222222222';
const stablecoinAddress = '0x3333333333333333333333333333333333333333';

describe('DeFi token catalog', () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it('includes native GYDS, configured core contracts, active mainnet tokens, and approved deployed stablecoins', async () => {
    mockApiGet.mockImplementation((path: string) => Promise.resolve(
      path === '/api/tokens?network=mainnet'
        ? [
            { id: 'token-1', name: 'Alpha', symbol: 'ALPHA', address: tokenAddress, network_type: 'mainnet', is_active: true },
            { id: 'token-2', name: 'Test', symbol: 'TEST', address: tokenAddress, network_type: 'testnet', is_active: true },
            { id: 'token-3', name: 'Paused', symbol: 'PAUSED', address: tokenAddress, network_type: 'mainnet', is_active: false },
          ]
        : [
            { id: 'stable-1', name: 'Dollar Q', symbol: 'USDQ', address: stablecoinAddress, status: 'active', is_approved: true, deployment_chain_id: 198282, peg_value: '1' },
            { id: 'stable-2', name: 'Pending', symbol: 'PEND', address: stablecoinAddress, status: 'pending_review', is_approved: false, deployment_chain_id: 198282 },
            { id: 'stable-3', name: 'Other Chain', symbol: 'OTHER', address: stablecoinAddress, status: 'active', is_approved: true, deployment_chain_id: 198281 },
          ],
    ));

    const catalog = await loadDeFiTokenCatalog({
      chainId: 198282,
      addresses: { GYD: configuredGyd, USDT: '' },
    });

    expect(catalog.map(token => token.symbol)).toEqual(['GYDS', 'GYD', 'ALPHA', 'USDQ']);
    expect(catalog.find(token => token.symbol === 'USDQ')).toMatchObject({
      address: stablecoinAddress,
      source: 'stablecoin',
      creatorId: undefined,
    });
  });

  it('does not show unconfigured core coins or core contracts on a non-mainnet chain', async () => {
    mockApiGet.mockImplementation((path: string) => Promise.resolve(
      path === '/api/tokens?network=mainnet' ? [] : [],
    ));

    const catalog = await loadDeFiTokenCatalog({
      chainId: 198281,
      addresses: { GYD: configuredGyd, USDT: '0x4444444444444444444444444444444444444444' },
    });

    expect(catalog.map(token => token.symbol)).toEqual(['GYDS']);
  });
});

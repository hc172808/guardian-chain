import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addNetworkToWallet,
  getNetworkParams,
  NETWORK_BY_KIND,
  type NetworkKind,
} from '@/config/network';

afterEach(() => {
  delete (window as any).ethereum;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('wallet_addEthereumChain network configuration', () => {
  it.each<NetworkKind>(['mainnet', 'testnet', 'devnet'])(
    'advertises one app RPC whose ID matches %s',
    (kind) => {
      const config = NETWORK_BY_KIND[kind];
      const params = getNetworkParams(kind);

      expect(params.chainId).toBe(config.chainIdHex);
      expect(BigInt(params.chainId)).toBe(BigInt(config.chainId));
      expect(params.rpcUrls).toEqual([config.rpcUrls.primary]);
      expect(params.rpcUrls).toHaveLength(1);
      expect(params.rpcUrls[0]).toContain(`/api/rpc?network=${kind}`);
    },
  );

  it('adds the network only after its RPC reports the configured chain ID', async () => {
    const request = vi.fn().mockResolvedValue(null);
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      value: { request },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', result: '0x3068a', id: 1 }),
    }));

    await expect(addNetworkToWallet('mainnet')).resolves.toBe(true);

    expect(request).toHaveBeenCalledWith({
      method: 'wallet_addEthereumChain',
      params: [expect.objectContaining({
        chainId: '0x3068a',
        rpcUrls: [NETWORK_BY_KIND.mainnet.rpcUrls.primary],
      })],
    });
  });

  it('shows an actionable error and does not add a mismatched chain', async () => {
    const request = vi.fn().mockResolvedValue(null);
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      value: { request },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', result: '0x1', id: 1 }),
    }));

    await expect(addNetworkToWallet('mainnet'))
      .rejects.toThrow('reports chain ID 1, but this network is configured as 198282');

    expect(request).not.toHaveBeenCalled();
  });

  it('rejects a decimal chain ID response before a wallet can reject it as unknown', async () => {
    const request = vi.fn().mockResolvedValue(null);
    Object.defineProperty(window, 'ethereum', {
      configurable: true,
      value: { request },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jsonrpc: '2.0', result: '198282', id: 1 }),
    }));

    await expect(addNetworkToWallet('mainnet'))
      .rejects.toThrow('It must be a 0x-prefixed hexadecimal value');

    expect(request).not.toHaveBeenCalled();
  });
});

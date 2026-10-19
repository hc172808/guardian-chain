import { isConfiguredContractAddress } from '@/config/contracts';
import { api } from '@/lib/api';

export const NATIVE_GYDS_ADDRESS = '0x0000000000000000000000000000000000000000';

export interface DeFiTokenAsset {
  id?: string;
  symbol: string;
  name: string;
  address: string;
  logo?: string;
  price: number;
  source: 'native' | 'core' | 'token' | 'stablecoin';
  creatorId?: string;
}

interface DexConfig {
  chainId?: number | string;
  addresses?: Record<string, unknown>;
}

function addressFrom(value: unknown): string | null {
  return isConfiguredContractAddress(value) ? value : null;
}

export async function loadDeFiTokenCatalog(dexConfig: DexConfig): Promise<DeFiTokenAsset[]> {
  const [tokenRows, stablecoinRows] = await Promise.all([
    api.get('/api/tokens?network=mainnet'),
    api.get('/api/stablecoins'),
  ]);
  if (!Array.isArray(tokenRows) || !Array.isArray(stablecoinRows)) {
    throw new Error('The server returned an invalid token catalog.');
  }

  const catalog: DeFiTokenAsset[] = [
    {
      symbol: 'GYDS',
      name: 'GYDS Native Coin',
      address: NATIVE_GYDS_ADDRESS,
      logo: '/gyds-coin.jpg',
      price: 0.0000001,
      source: 'native',
    },
  ];

  if (Number(dexConfig.chainId) === 198282) {
    const configuredCoreTokens = [
      {
        symbol: 'GYD',
        name: 'GYD Stablecoin',
        address: addressFrom(dexConfig.addresses?.GYD),
        logo: '/gyd-coin.png',
      },
      {
        symbol: 'USDT',
        name: 'Tether USD',
        address: addressFrom(dexConfig.addresses?.USDT),
      },
    ];
    for (const token of configuredCoreTokens) {
      if (token.address) {
        catalog.push({
          ...token,
          price: 1,
          source: 'core',
        });
      }
    }
  }

  for (const row of tokenRows) {
    const network = row.networkType ?? row.network_type;
    const address = addressFrom(row.address);
    if ((network && network !== 'mainnet') || row.isActive === false || row.is_active === false || !address) {
      continue;
    }
    catalog.push({
      id: String(row.id ?? ''),
      symbol: String(row.symbol ?? '').trim(),
      name: String(row.name ?? row.symbol ?? 'Token'),
      address,
      logo: row.logoUrl ?? row.logo_url ?? undefined,
      price: Number(row.price) > 0 ? Number(row.price) : 0.01,
      source: 'token',
      creatorId: row.creatorId ?? row.creator_id ?? undefined,
    });
  }

  for (const row of stablecoinRows) {
    const address = addressFrom(row.address);
    const chainId = row.deploymentChainId ?? row.deployment_chain_id;
    const status = row.status;
    const approved = row.isApproved ?? row.is_approved;
    if (
      status !== 'active' ||
      approved !== true ||
      !address ||
      (chainId != null && Number(chainId) !== 198282)
    ) {
      continue;
    }
    const pegValue = Number(row.pegValue ?? row.peg_value);
    catalog.push({
      id: String(row.id ?? ''),
      symbol: String(row.symbol ?? '').trim(),
      name: String(row.name ?? row.symbol ?? 'Stablecoin'),
      address,
      logo: row.logoUrl ?? row.logo_url ?? undefined,
      price: Number.isFinite(pegValue) && pegValue > 0 ? pegValue : 1,
      source: 'stablecoin',
      creatorId: row.creatorId ?? row.creator_id ?? undefined,
    });
  }

  const uniqueBySymbol = new Map<string, DeFiTokenAsset>();
  for (const token of catalog) {
    const key = token.symbol.trim().toUpperCase();
    if (key && !uniqueBySymbol.has(key)) uniqueBySymbol.set(key, token);
  }
  return [...uniqueBySymbol.values()];
}

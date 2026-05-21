import { ReactNode } from 'react';
import { WagmiProvider } from 'wagmi';
import { mainnet, polygon } from 'wagmi/chains';
import { http, defineChain } from 'viem';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RainbowKitProvider,
  getDefaultConfig,
  darkTheme,
  getDefaultWallets,
} from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';

const gydsChain = defineChain({
  id: 13370,
  name: 'GYDS Network',
  nativeCurrency: { name: 'GYDS', symbol: 'GYDS', decimals: 18 },
  rpcUrls: {
    default: { http: [`${window.location.origin}/api/rpc`] },
  },
  blockExplorers: {
    default: { name: 'ChainCore Explorer', url: window.location.origin },
  },
});

const PROJECT_ID = (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? '';

const { wallets } = getDefaultWallets();

const config = getDefaultConfig({
  appName: 'ChainCore — GYDSchain Explorer',
  projectId: PROJECT_ID || 'placeholder',
  chains: [gydsChain, mainnet, polygon],
  transports: {
    [gydsChain.id]: http(`${window.location.origin}/api/rpc`),
    [mainnet.id]: http(),
    [polygon.id]: http(),
  },
  wallets,
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: '#00ff88',
            accentColorForeground: '#000',
            borderRadius: 'large',
            fontStack: 'system',
          })}
          initialChain={gydsChain}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowRight, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  symbol: string;
  required: number;
  available: number;
  /** Optional: caller-specific guidance overrides */
  customSteps?: string[];
}

/**
 * Educational shortfall panel shown when a user attempts a swap (or any
 * action) without enough of the input token. Tells them exactly how short
 * they are and the concrete ways to acquire more on this network.
 */
export const InsufficientBalanceEducation = ({ symbol, required, available, customSteps }: Props) => {
  const navigate = useNavigate();
  const shortfall = Math.max(0, required - available);

  const stepsBySymbol: Record<string, { label: string; to?: string }[]> = {
    GYDS: [
      { label: 'Receive GYDS from another wallet (Send page)', to: '/transactions' },
      { label: 'Bridge ETH/BNB/MATIC → GYDS via Cross-Chain' },
      { label: 'Claim from the Faucet (devnet/testnet only)', to: '/faucet' },
    ],
    GYD: [
      { label: 'Mint GYD by burning USDT in Admin → Burn/Mint', to: '/admin?tab=burn-mint' },
      { label: 'Receive GYD from another wallet', to: '/transactions' },
    ],
  };

  const steps: { label: string; to?: string }[] =
    customSteps?.map((s) => ({ label: s })) ??
    stepsBySymbol[symbol] ?? [
      { label: `Acquire ${symbol} from a holder or via the Cross-Chain bridge` },
      { label: 'Or wait until you receive an inbound transfer to your wallet' },
    ];

  return (
    <GlassCard className="p-4 border-destructive/40 space-y-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold">Not enough {symbol} to complete this swap</p>
          <p className="text-sm text-muted-foreground">
            You have <span className="font-mono">{available.toLocaleString()}</span> {symbol} but need{' '}
            <span className="font-mono">{required.toLocaleString()}</span>. You're short{' '}
            <span className="font-mono text-destructive">{shortfall.toLocaleString()} {symbol}</span>.
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-secondary/40 p-3 space-y-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          <Wallet className="h-3.5 w-3.5" />
          How to get more {symbol}
        </p>
        <ul className="space-y-1.5">
          {steps.map((s, i) => (
            <li key={i} className="text-sm flex items-start gap-2">
              <span className="text-primary shrink-0">{i + 1}.</span>
              {s.to ? (
                <Button
                  variant="link"
                  className="h-auto p-0 text-left justify-start font-normal"
                  onClick={() => navigate(s.to!)}
                >
                  {s.label} <ArrowRight className="h-3 w-3 ml-1" />
                </Button>
              ) : (
                <span>{s.label}</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </GlassCard>
  );
};

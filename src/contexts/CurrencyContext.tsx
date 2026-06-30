import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'CAD' | 'AUD' | 'GYD' | 'JMD';

export const CURRENCIES: { code: CurrencyCode; label: string; symbol: string }[] = [
  { code: 'USD', label: 'US Dollar',          symbol: '$'   },
  { code: 'EUR', label: 'Euro',               symbol: '€'   },
  { code: 'GBP', label: 'British Pound',      symbol: '£'   },
  { code: 'CAD', label: 'Canadian Dollar',    symbol: 'CA$' },
  { code: 'AUD', label: 'Australian Dollar',  symbol: 'A$'  },
  { code: 'GYD', label: 'Guyanese Dollar',    symbol: 'G$'  },
  { code: 'JMD', label: 'Jamaican Dollar',    symbol: 'J$'  },
];

interface ExchangeRates {
  base: 'USD';
  rates: Record<CurrencyCode, number>;
  fetchedAt: number;
  fallback: boolean;
}

interface CurrencyContextType {
  currency: CurrencyCode;
  setCurrency: (c: CurrencyCode) => void;
  rates: ExchangeRates | null;
  ratesUnavailable: boolean;
  convert: (usdAmount: number) => number;
  fmt: (usdAmount: number, opts?: { decimals?: number }) => string;
  fmtToken: (amount: number, decimals?: number) => string;
  symbol: string;
  label: string;
  loading: boolean;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const FALLBACK_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.53,
  GYD: 209.0,
  JMD: 156.5,
};

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [currency, _setCurrency] = useState<CurrencyCode>(
    () => (localStorage.getItem('preferred_currency') as CurrencyCode) ?? 'USD'
  );
  const [rates, setRates] = useState<ExchangeRates | null>(null);
  const [ratesUnavailable, setRatesUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load exchange rates from backend
  const loadRates = useCallback(async () => {
    try {
      const res = await fetch('/api/exchange-rates', { credentials: 'include' });
      if (!res.ok) throw new Error('rate fetch failed');
      const data = await res.json();
      setRates({ base: 'USD', rates: data.rates, fetchedAt: Date.now(), fallback: data.fallback ?? false });
      setRatesUnavailable(data.fallback ?? false);
    } catch {
      setRates({ base: 'USD', rates: FALLBACK_RATES, fetchedAt: Date.now(), fallback: true });
      setRatesUnavailable(true);
    }
  }, []);

  // Load user preferred currency from profile
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetch('/api/profile', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(p => {
        const saved = p?.preferred_currency ?? p?.preferredCurrency;
        if (saved && CURRENCIES.some(c => c.code === saved)) {
          _setCurrency(saved as CurrencyCode);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user]);

  // Fetch exchange rates on mount; refresh every 15 minutes
  useEffect(() => {
    loadRates();
    const iv = setInterval(loadRates, 15 * 60 * 1000);
    return () => clearInterval(iv);
  }, [loadRates]);

  const setCurrency = useCallback(async (c: CurrencyCode) => {
    _setCurrency(c);
    localStorage.setItem('preferred_currency', c);
    if (user) {
      fetch('/api/profile/currency', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preferred_currency: c }),
      }).catch(() => {});
    }
  }, [user]);

  const activeRates = rates?.rates ?? FALLBACK_RATES;

  const convert = useCallback((usdAmount: number): number => {
    const rate = activeRates[currency] ?? 1;
    return usdAmount * rate;
  }, [activeRates, currency]);

  const currencyInfo = CURRENCIES.find(c => c.code === currency) ?? CURRENCIES[0];

  const fmt = useCallback((usdAmount: number, opts?: { decimals?: number; compact?: boolean }): string => {
    const converted = convert(usdAmount);
    const isTiny = Math.abs(converted) < 0.01 && converted !== 0;
    const decimals = opts?.decimals ?? (isTiny ? 7 : 2);
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        notation: opts?.compact ? 'compact' : 'standard',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(converted);
    } catch {
      return `${currencyInfo.symbol}${converted.toFixed(decimals)}`;
    }
  }, [convert, currency, currencyInfo.symbol]);

  const fmtToken = useCallback((amount: number, decimals = 4): string => {
    return new Intl.NumberFormat('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(amount);
  }, []);

  return (
    <CurrencyContext.Provider value={{
      currency,
      setCurrency,
      rates,
      ratesUnavailable,
      convert,
      fmt,
      fmtToken,
      symbol: currencyInfo.symbol,
      label: currencyInfo.label,
      loading,
    }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within CurrencyProvider');
  return ctx;
};

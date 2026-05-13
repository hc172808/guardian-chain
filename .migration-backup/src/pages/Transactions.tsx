import { useState, useEffect } from 'react';
import { Layout } from '@/components/layout/Layout';
import { RequireAuth } from '@/components/auth/RequireAuth';
import { GlassCard } from '@/components/ui/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { motion } from 'framer-motion';
import { 
  Send, 
  ArrowRight, 
  History, 
  CheckCircle, 
  XCircle, 
  Clock,
  Loader2,
  Wallet,
  Radio
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { TOKENOMICS } from '@/config/wallets';

interface WalletData {
  id: string;
  address: string;
}

interface Transaction {
  id: string;
  from_address: string;
  to_address: string;
  amount: number;
  fee: number;
  tx_hash: string | null;
  status: string;
  created_at: string;
}

const generateTxHash = () => {
  const chars = '0123456789abcdef';
  return '0x' + Array.from({ length: 64 }, () => chars[Math.floor(Math.random() * 16)]).join('');
};

const TransactionsContent = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  
  const [fromWallet, setFromWallet] = useState('');
  const [toAddress, setToAddress] = useState('');
  const [amount, setAmount] = useState('');
  const fee = 0.001;

  useEffect(() => {
    if (user) {
      fetchData();
      
      // Real-time subscription for transactions
      const channel = supabase
        .channel('user-transactions')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'transactions',
            filter: `user_id=eq.${user.id}`,
          },
          (payload) => {
            if (payload.eventType === 'INSERT') {
              setTransactions((prev) => [payload.new as Transaction, ...prev]);
            } else if (payload.eventType === 'UPDATE') {
              setTransactions((prev) =>
                prev.map((tx) =>
                  tx.id === (payload.new as Transaction).id ? (payload.new as Transaction) : tx
                )
              );
            } else if (payload.eventType === 'DELETE') {
              setTransactions((prev) =>
                prev.filter((tx) => tx.id !== (payload.old as Transaction).id)
              );
            }
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user]);

  const fetchData = async () => {
    const [walletsRes, txRes] = await Promise.all([
      supabase.from('wallets').select('id, address').eq('user_id', user!.id),
      supabase.from('transactions').select('*').eq('user_id', user!.id).order('created_at', { ascending: false })
    ]);

    if (walletsRes.data) setWallets(walletsRes.data);
    if (txRes.data) setTransactions(txRes.data as Transaction[]);
    setLoading(false);
  };

  const handleSend = async () => {
    if (!fromWallet || !toAddress || !amount) {
      toast({ title: 'Please fill all fields', variant: 'destructive' });
      return;
    }

    const wallet = wallets.find(w => w.id === fromWallet);
    if (!wallet) return;

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      toast({ title: 'Invalid amount', variant: 'destructive' });
      return;
    }

    if (!toAddress.startsWith('0x') || toAddress.length !== 42) {
      toast({ title: 'Invalid recipient address', variant: 'destructive' });
      return;
    }

    setSending(true);
    
    const txHash = generateTxHash();
    
    const { error } = await supabase.from('transactions').insert({
      user_id: user!.id,
      wallet_id: fromWallet,
      from_address: wallet.address,
      to_address: toAddress,
      amount: amountNum,
      fee,
      tx_hash: txHash,
      status: 'pending'
    });

    if (error) {
      toast({ title: 'Transaction failed', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Transaction submitted!', description: 'Waiting for confirmation...' });
      setToAddress('');
      setAmount('');
      fetchData();

      // Simulate confirmation after delay
      setTimeout(async () => {
        await supabase
          .from('transactions')
          .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
          .eq('tx_hash', txHash);
        fetchData();
        toast({ title: 'Transaction confirmed!' });
      }, 10000);
    }
    
    setSending(false);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'confirmed': return <CheckCircle className="h-4 w-4 text-neon-emerald" />;
      case 'failed': return <XCircle className="h-4 w-4 text-destructive" />;
      default: return <Clock className="h-4 w-4 text-yellow-500 animate-pulse" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'confirmed': return <Badge variant="outline" className="text-neon-emerald border-neon-emerald">Confirmed</Badge>;
      case 'failed': return <Badge variant="destructive">Failed</Badge>;
      default: return <Badge variant="outline" className="text-yellow-500 border-yellow-500">Pending</Badge>;
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Send className="w-8 h-8 text-primary" />
            Send {TOKENOMICS.symbol}
          </h1>
          <p className="text-muted-foreground mt-2">Transfer tokens to another address</p>
        </div>
        <Badge variant="outline" className="text-neon-emerald border-neon-emerald flex items-center gap-1">
          <Radio className="h-3 w-3 animate-pulse" />
          Real-time
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Send Form */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-4">New Transaction</h3>
          
          {wallets.length === 0 ? (
            <div className="text-center py-8">
              <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No wallets found. Create a wallet first.</p>
              <Button className="mt-4" onClick={() => window.location.href = '/wallet'}>
                Create Wallet
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label>From Wallet</Label>
                <Select value={fromWallet} onValueChange={setFromWallet}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select wallet" />
                  </SelectTrigger>
                  <SelectContent>
                    {wallets.map((wallet) => (
                      <SelectItem key={wallet.id} value={wallet.id}>
                        {wallet.address.slice(0, 10)}...{wallet.address.slice(-8)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>To Address</Label>
                <Input
                  value={toAddress}
                  onChange={(e) => setToAddress(e.target.value)}
                  placeholder="0x..."
                />
              </div>

              <div>
                <Label>Amount ({TOKENOMICS.symbol})</Label>
                <Input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.001"
                />
              </div>

              <div className="p-3 rounded-lg bg-secondary/30 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Network Fee</span>
                  <span>{fee} {TOKENOMICS.symbol}</span>
                </div>
                <div className="flex justify-between mt-1 font-medium">
                  <span className="text-muted-foreground">Total</span>
                  <span>{amount ? (parseFloat(amount) + fee).toFixed(4) : fee} {TOKENOMICS.symbol}</span>
                </div>
              </div>

              <Button onClick={handleSend} disabled={sending} className="w-full gap-2">
                {sending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send Transaction
                  </>
                )}
              </Button>
            </div>
          )}
        </GlassCard>

        {/* Transaction History */}
        <GlassCard className="p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <History className="h-5 w-5" />
            Transaction History
          </h3>
          
          {loading ? (
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No transactions yet
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {transactions.map((tx) => (
                <div key={tx.id} className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(tx.status)}
                      <div>
                        <p className="font-mono text-sm">
                          {tx.from_address.slice(0, 8)}...
                          <ArrowRight className="h-3 w-3 inline mx-1" />
                          {tx.to_address.slice(0, 8)}...
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(tx.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-medium">{tx.amount} {TOKENOMICS.symbol}</p>
                      {getStatusBadge(tx.status)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </div>
    </motion.div>
  );
};

const TransactionsPage = () => (
  <Layout>
    <RequireAuth>
      <TransactionsContent />
    </RequireAuth>
  </Layout>
);

export default TransactionsPage;

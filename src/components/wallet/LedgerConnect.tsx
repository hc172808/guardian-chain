import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GlassCard } from '@/components/ui/GlassCard';
import { HardDrive, Loader2, CheckCircle2, AlertTriangle, Usb, ChevronRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LedgerAccount {
  address: string;
  path: string;
  index: number;
}

const LEDGER_VENDOR_ID = 0x2c97;
const ETH_APP_CLA = 0xe0;

async function requestLedgerDevice(): Promise<HIDDevice | null> {
  if (!('hid' in navigator)) return null;
  try {
    const devices = await (navigator as any).hid.requestDevice({
      filters: [{ vendorId: LEDGER_VENDOR_ID }],
    });
    return devices[0] ?? null;
  } catch {
    return null;
  }
}

async function sendAPDU(device: HIDDevice, data: Uint8Array): Promise<Uint8Array> {
  const packet = new Uint8Array(65);
  packet[0] = 0x00; // HID report id
  packet[1] = 0x01; packet[2] = 0x01; // channel
  packet[3] = 0x05; // command tag
  packet[4] = 0x00; packet[5] = 0x00; // sequence
  const len = data.length;
  packet[6] = (len >> 8) & 0xff;
  packet[7] = len & 0xff;
  packet.set(data.slice(0, 57), 8);
  await device.sendReport(0x00, packet.slice(1));

  return new Promise((resolve) => {
    device.oninputreport = (e: any) => {
      const resp = new Uint8Array(e.data.buffer);
      const dataLen = (resp[5] << 8) | resp[6];
      resolve(resp.slice(7, 7 + dataLen));
    };
  });
}

function bip32ToBytes(path: string): Uint8Array {
  const parts = path.replace("m/", "").split("/");
  const buf = new Uint8Array(1 + parts.length * 4);
  buf[0] = parts.length;
  parts.forEach((p, i) => {
    const hardened = p.endsWith("'");
    const idx = parseInt(p) + (hardened ? 0x80000000 : 0);
    const view = new DataView(buf.buffer, 1 + i * 4);
    view.setUint32(0, idx, false);
  });
  return buf;
}

async function getAddressFromLedger(device: HIDDevice, index: number): Promise<string | null> {
  try {
    const path = `m/44'/60'/0'/0/${index}`;
    const pathBytes = bip32ToBytes(path);
    const apdu = new Uint8Array([ETH_APP_CLA, 0x02, 0x00, 0x00, pathBytes.length, ...pathBytes]);
    const resp = await sendAPDU(device, apdu);
    if (resp.length < 20) return null;
    // Address is at offset 1 + pubkey_len + 1
    const pubkeyLen = resp[0];
    const addrLen = resp[1 + pubkeyLen];
    const addrBytes = resp.slice(2 + pubkeyLen, 2 + pubkeyLen + addrLen);
    return '0x' + new TextDecoder().decode(addrBytes).toLowerCase();
  } catch {
    return null;
  }
}

interface Props {
  onConnect?: (address: string) => void;
  compact?: boolean;
}

export const LedgerConnect = ({ onConnect, compact = false }: Props) => {
  const { toast } = useToast();
  const [status, setStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle');
  const [accounts, setAccounts] = useState<LedgerAccount[]>([]);
  const [device, setDevice] = useState<HIDDevice | null>(null);
  const [error, setError] = useState('');

  const isSupported = 'hid' in navigator;

  const connect = async () => {
    if (!isSupported) {
      toast({ title: 'Not supported', description: 'WebHID is only supported in Chrome/Edge.', variant: 'destructive' });
      return;
    }
    setStatus('connecting');
    setError('');
    try {
      const dev = await requestLedgerDevice();
      if (!dev) { setStatus('idle'); return; }
      await dev.open();
      setDevice(dev);

      const found: LedgerAccount[] = [];
      for (let i = 0; i < 5; i++) {
        const addr = await getAddressFromLedger(dev, i);
        if (addr) found.push({ address: addr, path: `m/44'/60'/0'/0/${i}`, index: i });
      }

      if (found.length === 0) {
        setError('No accounts found. Make sure the Ethereum app is open on your Ledger.');
        setStatus('error');
        await dev.close();
        return;
      }
      setAccounts(found);
      setStatus('connected');
      toast({ title: 'Ledger connected', description: `Found ${found.length} account(s)` });
    } catch (e: any) {
      setError(e.message ?? 'Connection failed');
      setStatus('error');
    }
  };

  const select = async (acc: LedgerAccount) => {
    onConnect?.(acc.address);
    toast({ title: 'Ledger account selected', description: acc.address });
  };

  const disconnect = async () => {
    if (device) { try { await device.close(); } catch {} }
    setDevice(null);
    setAccounts([]);
    setStatus('idle');
  };

  if (compact) {
    return (
      <Button variant="outline" size="sm" onClick={connect} disabled={status === 'connecting'} className="gap-2">
        {status === 'connecting' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <HardDrive className="h-3.5 w-3.5" />}
        {status === 'connecting' ? 'Connecting…' : 'Ledger'}
        {!isSupported && <Badge variant="outline" className="ml-1 text-[9px] py-0">Chrome only</Badge>}
      </Button>
    );
  }

  return (
    <GlassCard className="p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-blue-500/10">
          <HardDrive className="h-5 w-5 text-blue-400" />
        </div>
        <div>
          <h3 className="font-semibold text-sm">Ledger Hardware Wallet</h3>
          <p className="text-xs text-muted-foreground">Connect via USB (WebHID)</p>
        </div>
        {status === 'connected' && <Badge className="ml-auto bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Connected</Badge>}
      </div>

      {!isSupported && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">WebHID requires Chrome or Edge. Not supported in this browser.</p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {status === 'connected' && accounts.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">Select account</p>
          {accounts.map((acc) => (
            <button key={acc.index} onClick={() => select(acc)}
              className="w-full flex items-center gap-3 p-3 rounded-lg bg-secondary/40 hover:bg-secondary/70 border border-border/40 hover:border-primary/40 transition-all text-left">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Usb className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono truncate">{acc.address}</p>
                <p className="text-[10px] text-muted-foreground">{acc.path}</p>
              </div>
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {status !== 'connected' ? (
          <Button onClick={connect} disabled={status === 'connecting' || !isSupported} className="w-full gap-2">
            {status === 'connecting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
            {status === 'connecting' ? 'Connecting…' : 'Connect Ledger'}
          </Button>
        ) : (
          <Button variant="outline" onClick={disconnect} className="w-full">Disconnect</Button>
        )}
      </div>

      <div className="flex items-start gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
        <p>Plug in your Ledger via USB, unlock it, and open the Ethereum app before connecting.</p>
      </div>
    </GlassCard>
  );
};

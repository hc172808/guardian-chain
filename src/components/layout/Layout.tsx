import { ReactNode, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, AlertTriangle, CheckCircle, X } from 'lucide-react';
import { Sidebar, MobileMenuButton } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { UpgradeBanner } from './UpgradeBanner';
import { NotificationBell } from './NotificationBell';
import { InstallPrompt } from './InstallPrompt';
import { WalletDownloadButton } from './WalletDownloadButton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMaintenance } from '@/hooks/useMaintenance';
import { useCurrency, CURRENCIES } from '@/contexts/CurrencyContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';

type BannerType = 'info' | 'warning' | 'success' | 'error';

const BANNER_STYLES: Record<BannerType, string> = {
  info:    'bg-blue-500/10 border-blue-500/30 text-blue-200',
  warning: 'bg-amber-500/10 border-amber-500/30 text-amber-200',
  success: 'bg-green-500/10 border-green-500/30 text-green-200',
  error:   'bg-red-500/10 border-red-500/30 text-red-200',
};
const BANNER_ICONS: Record<BannerType, typeof Info> = {
  info: Info, warning: AlertTriangle, success: CheckCircle, error: AlertTriangle,
};

function AnnouncementBanner() {
  const [banner, setBanner] = useState<any>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const r = await fetch('/api/config/announcement_banner', { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        if (!cancelled) setBanner(data?.config_value ?? null);
      } catch {}
    };
    poll();
    const id = setInterval(poll, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  useEffect(() => { setDismissed(false); }, [banner?.at]);

  if (!banner || dismissed) return null;

  const type: BannerType = ['info','warning','success','error'].includes(banner.type) ? banner.type : 'info';
  const Icon = BANNER_ICONS[type];

  return (
    <div className={`flex items-center gap-3 px-4 py-2.5 border-b text-sm ${BANNER_STYLES[type]}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="flex-1">{banner.message}</span>
      {banner.link && (
        <a href={banner.link} target="_blank" rel="noreferrer"
          className="underline font-medium text-xs whitespace-nowrap hover:opacity-80">
          {banner.linkLabel || 'Learn more'}
        </a>
      )}
      <button onClick={() => setDismissed(true)}
        className="ml-1 opacity-60 hover:opacity-100 transition-opacity shrink-0">
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

interface LayoutProps {
  children: ReactNode;
}

function NavCurrencySelector() {
  const { currency, setCurrency } = useCurrency();
  const { user } = useAuth();

  // Only show when logged in
  if (!user) return null;

  return (
    <Select value={currency} onValueChange={setCurrency}>
      <SelectTrigger className="h-8 w-20 text-xs border-border/50 bg-background/80 backdrop-blur-sm px-2">
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {CURRENCIES.map((c) => (
          <SelectItem key={c.code} value={c.code} className="text-xs">
            <span className="mr-1">{c.symbol}</span>
            {c.code}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const Layout = ({ children }: LayoutProps) => {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [fromMobile, setFromMobile] = useState(false);
  const { enabled, message } = useMaintenance();

  useEffect(() => {
    if (!isMobile) setSidebarOpen(false);
  }, [isMobile]);

  useEffect(() => {
    setFromMobile(sessionStorage.getItem('fromMobileHub') === 'true');
  }, []);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  const handleBackToMobile = () => {
    sessionStorage.removeItem('fromMobileHub');
    navigate('/mobile');
  };

  return (
    <div className="min-h-screen bg-background grid-pattern">
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} isMobile={isMobile} />

      {/* Mobile menu button */}
      {isMobile && !sidebarOpen && (
        <MobileMenuButton onClick={toggleSidebar} />
      )}

      <main className={isMobile ? "min-h-screen pb-20" : "ml-64 min-h-screen"}>
        {enabled && <UpgradeBanner message={message} />}
        <AnnouncementBanner />

        {/* Top-right header bar with currency selector + wallet download + notification bell (desktop only) */}
        {!isMobile && (
          <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
            <NavCurrencySelector />
            <WalletDownloadButton />
            <NotificationBell />
          </div>
        )}

        <div className={isMobile ? "p-4 pt-16" : "p-8"}>
          {/* Back to Mobile hub button — shown only when navigated from /mobile */}
          {isMobile && fromMobile && (
            <button
              onClick={handleBackToMobile}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-card border border-border text-sm font-medium hover:border-primary/40 transition-all mb-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </button>
          )}
          {children}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      {isMobile && <MobileBottomNav />}

      {/* PWA install prompt */}
      <InstallPrompt />

      {/* Scanning line effect */}
      <div className="fixed inset-0 pointer-events-none scanning-line opacity-30" />
    </div>
  );
};
import { ReactNode, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Sidebar, MobileMenuButton } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { UpgradeBanner } from './UpgradeBanner';
import { NotificationBell } from './NotificationBell';
import { InstallPrompt } from './InstallPrompt';
import { WalletDownloadButton } from './WalletDownloadButton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMaintenance } from '@/hooks/useMaintenance';

interface LayoutProps {
  children: ReactNode;
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

        {/* Top-right header bar with wallet download + notification bell (desktop only) */}
        {!isMobile && (
          <div className="fixed top-4 right-4 z-30 flex items-center gap-2">
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
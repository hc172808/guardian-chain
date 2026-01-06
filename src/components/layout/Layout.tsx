import { ReactNode, useState, useEffect } from 'react';
import { Sidebar, MobileMenuButton } from './Sidebar';
import { MobileBottomNav } from './MobileBottomNav';
import { useIsMobile } from '@/hooks/use-mobile';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Close sidebar when switching to desktop
  useEffect(() => {
    if (!isMobile) {
      setSidebarOpen(false);
    }
  }, [isMobile]);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <div className="min-h-screen bg-background grid-pattern">
      <Sidebar isOpen={sidebarOpen} onToggle={toggleSidebar} isMobile={isMobile} />
      
      {/* Mobile menu button */}
      {isMobile && !sidebarOpen && (
        <MobileMenuButton onClick={toggleSidebar} />
      )}
      
      <main className={isMobile ? "min-h-screen pb-20" : "ml-64 min-h-screen"}>
        <div className={isMobile ? "p-4 pt-16" : "p-8"}>
          {children}
        </div>
      </main>
      
      {/* Mobile bottom navigation */}
      {isMobile && <MobileBottomNav />}
      
      {/* Scanning line effect */}
      <div className="fixed inset-0 pointer-events-none scanning-line opacity-30" />
    </div>
  );
};
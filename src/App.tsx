import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { AuthProvider } from "@/contexts/AuthContext";
import { useAuth } from "@/contexts/AuthContext";
import { useMaintenance } from "@/hooks/useMaintenance";
import Index from "./pages/Index";
import Explorer from "./pages/Explorer";
import Validators from "./pages/Validators";
import Mining from "./pages/Mining";
import Protocol from "./pages/Protocol";
import Security from "./pages/Security";
import DownloadPage from "./pages/Download";
import Auth from "./pages/Auth";
import WalletPage from "./pages/Wallet";
import AdminPage from "./pages/Admin";
import DocsPage from "./pages/Docs";
import TransactionsPage from "./pages/Transactions";
import NetworkPage from "./pages/Network";
import TokensPage from "./pages/Tokens";
import DeFiPage from "./pages/DeFi";
import TokenDetail from "./pages/TokenDetail";
import NotFound from "./pages/NotFound";
import CliReferencePage from "./pages/CliReference";
import ResetPassword from "./pages/ResetPassword";
import WatchlistPage from "./pages/Watchlist";
import PriceAlertsPage from "./pages/PriceAlerts";
import WebhooksPage from "./pages/Webhooks";
import NodeTerminalPage from "./pages/NodeTerminal";
import FaucetPage from "./pages/Faucet";
import ProfilePage from "./pages/Profile";
import MaintenancePage from "./pages/Maintenance";
import GovernancePage from "./pages/Governance";
import NFTPage from "./pages/NFT";
import AnalyticsPage from "./pages/Analytics";
import CommunityPage from "./pages/Community";
import DeveloperPage from "./pages/Developer";
import LeaderboardPage from "./pages/Leaderboard";
import MultisigPage from "./pages/Multisig";
import IdentityPage from "./pages/Identity";
import RWAPage from "./pages/RWA";
import InsurancePage from "./pages/Insurance";
import MobilePage from "./pages/Mobile";
import LandingPage from "./pages/Landing";
import PressKitPage from "./pages/PressKit";
import BlogPage from "./pages/Blog";
import TrustPage from "./pages/Trust";
import { useTransactionNotifications } from "./hooks/useTransactionNotifications";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const queryClient = new QueryClient();

const MobileRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    // When the user arrives back at /mobile, reset the navigation flag
    if (location.pathname === '/mobile') {
      sessionStorage.removeItem('fromMobileHub');
      return;
    }

    const EXEMPT = ['/auth', '/reset-password'];
    const preferDesktop = sessionStorage.getItem('preferDesktop') === 'true';
    if (preferDesktop) return;

    // If the user explicitly navigated here from the mobile hub, let them through
    if (sessionStorage.getItem('fromMobileHub') === 'true') return;

    const isMobileDevice = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
      || window.innerWidth < 768;
    if (isMobileDevice && !EXEMPT.includes(location.pathname)) {
      navigate('/mobile', { replace: true });
    }
  }, [location.pathname, navigate]);
  return null;
};

const AppContent = () => {
  useTransactionNotifications();
  const { user, loading, isAdmin, isFounder } = useAuth();
  const { enabled, message, loading: maintLoading } = useMaintenance();
  const location = useLocation();

  const isAuthRoute = location.pathname === '/auth' || location.pathname === '/reset-password';

  if (!maintLoading && !loading && enabled && !user && !isAuthRoute) {
    return <MaintenancePage message={message} />;
  }

  return (
    <>
      <MobileRedirect />
      <Routes>
      {/* Mobile hub — full-screen mobile app experience */}
      <Route path="/mobile" element={<MobilePage />} />
      {/* Core */}
      <Route path="/" element={<Index />} />
      <Route path="/explorer" element={<Explorer />} />
      <Route path="/explorer/token/:address" element={<TokenDetail />} />
      <Route path="/validators" element={<Validators />} />
      <Route path="/mining" element={<Mining />} />
      <Route path="/tokens" element={<TokensPage />} />
      <Route path="/defi" element={<DeFiPage />} />
      <Route path="/protocol" element={<Protocol />} />
      <Route path="/security" element={<Security />} />
      <Route path="/download" element={<DownloadPage />} />
      <Route path="/wallet" element={<WalletPage />} />
      <Route path="/transactions" element={<TransactionsPage />} />
      <Route path="/network" element={<NetworkPage />} />
      <Route path="/watchlist" element={<WatchlistPage />} />
      <Route path="/price-alerts" element={<PriceAlertsPage />} />
      <Route path="/webhooks" element={<WebhooksPage />} />
      <Route path="/node-terminal" element={<NodeTerminalPage />} />
      <Route path="/faucet" element={<FaucetPage />} />
      {/* Ecosystem */}
      <Route path="/governance" element={<GovernancePage />} />
      <Route path="/nft" element={<NFTPage />} />
      <Route path="/analytics" element={<AnalyticsPage />} />
      <Route path="/community" element={<CommunityPage />} />
      <Route path="/developer" element={<DeveloperPage />} />
      <Route path="/leaderboard" element={<LeaderboardPage />} />
      <Route path="/multisig" element={<MultisigPage />} />
      <Route path="/identity" element={<IdentityPage />} />
      <Route path="/rwa" element={<RWAPage />} />
      <Route path="/insurance" element={<InsurancePage />} />
      <Route path="/trust" element={<TrustPage />} />
      {/* Marketing */}
      <Route path="/landing" element={<LandingPage />} />
      <Route path="/press-kit" element={<PressKitPage />} />
      <Route path="/blog" element={<BlogPage />} />
      {/* Auth & Admin */}
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/cli" element={<CliReferencePage />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
    </>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <ErrorBoundary>
            <AppContent />
          </ErrorBoundary>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

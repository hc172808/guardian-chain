import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
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
import NodeTerminalPage from "./pages/NodeTerminal";
import FaucetPage from "./pages/Faucet";
import ProfilePage from "./pages/Profile";
import MaintenancePage from "./pages/Maintenance";
import { useTransactionNotifications } from "./hooks/useTransactionNotifications";

const queryClient = new QueryClient();

const AppContent = () => {
  useTransactionNotifications();
  const { user, loading, isAdmin, isFounder } = useAuth();
  const { enabled, message, loading: maintLoading } = useMaintenance();
  const location = useLocation();

  // Don't block /auth or /reset-password — admins/founders need to be able to log in
  const isAuthRoute = location.pathname === '/auth' || location.pathname === '/reset-password';

  // Show maintenance page to logged-out visitors (admins/founders bypass it)
  if (!maintLoading && !loading && enabled && !user && !isAuthRoute) {
    return <MaintenancePage message={message} />;
  }

  return (
    <Routes>
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
      <Route path="/node-terminal" element={<NodeTerminalPage />} />
      <Route path="/faucet" element={<FaucetPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/cli" element={<CliReferencePage />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/profile" element={<ProfilePage />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

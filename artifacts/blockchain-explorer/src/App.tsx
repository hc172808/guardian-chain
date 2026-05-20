import { ClerkProvider, useUser, useClerk } from "@clerk/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Web3Provider } from "@/providers/Web3Provider";
import { AuthProvider } from "@/contexts/AuthContext";
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
import SSOCallback from "./pages/SSOCallback";
import WatchlistPage from "./pages/Watchlist";
import NodeTerminalPage from "./pages/NodeTerminal";
import FaucetPage from "./pages/Faucet";
import SmartContracts from "./pages/SmartContracts";
import { RequireAuth } from "./components/auth/RequireAuth";
import { useTransactionNotifications } from "./hooks/useTransactionNotifications";

const queryClient = new QueryClient();

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL as string | undefined;

const AppContent = () => {
  useTransactionNotifications();
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
      <Route path="/node-terminal" element={<RequireAuth requiredRole="admin"><NodeTerminalPage /></RequireAuth>} />
      <Route path="/faucet" element={<FaucetPage />} />
      <Route path="/smart-contracts" element={<RequireAuth><SmartContracts /></RequireAuth>} />
      <Route path="/admin" element={<RequireAuth requiredRole="admin"><AdminPage /></RequireAuth>} />
      <Route path="/docs" element={<DocsPage />} />
      <Route path="/auth" element={<Auth />} />
      <Route path="/sso-callback" element={<SSOCallback />} />
      <Route path="/cli" element={<CliReferencePage />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};

const AppWithClerk = () => {
  const { user: clerkUser, isLoaded } = useUser();
  const { signOut: clerkSignOut } = useClerk();
  return (
    <AuthProvider clerkUser={clerkUser} clerkLoaded={isLoaded} clerkSignOut={clerkSignOut}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  );
};

const AppWithoutClerk = () => (
  <AuthProvider>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </TooltipProvider>
  </AuthProvider>
);

const App = () => {
  if (clerkPubKey) {
    const clerkProps = clerkProxyUrl
      ? { publishableKey: clerkPubKey, proxyUrl: clerkProxyUrl }
      : { publishableKey: clerkPubKey };
    return (
      <Web3Provider>
        <ClerkProvider {...clerkProps}>
          <QueryClientProvider client={queryClient}>
            <AppWithClerk />
          </QueryClientProvider>
        </ClerkProvider>
      </Web3Provider>
    );
  }
  return (
    <Web3Provider>
      <QueryClientProvider client={queryClient}>
        <AppWithoutClerk />
      </QueryClientProvider>
    </Web3Provider>
  );
};

export default App;

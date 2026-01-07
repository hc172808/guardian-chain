import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/explorer" element={<Explorer />} />
            <Route path="/validators" element={<Validators />} />
            <Route path="/mining" element={<Mining />} />
            <Route path="/protocol" element={<Protocol />} />
            <Route path="/security" element={<Security />} />
            <Route path="/download" element={<DownloadPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

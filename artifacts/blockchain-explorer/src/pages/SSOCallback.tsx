import { useEffect } from 'react';
import { useClerk } from '@clerk/react';
import { useNavigate } from 'react-router-dom';
import { Cpu } from 'lucide-react';

const SSOCallback = () => {
  const { handleRedirectCallback } = useClerk();
  const navigate = useNavigate();

  useEffect(() => {
    handleRedirectCallback({
      afterSignInUrl: '/',
      afterSignUpUrl: '/',
    }).catch(() => navigate('/auth'));
  }, [handleRedirectCallback, navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="inline-flex p-3 rounded-xl bg-gradient-primary mb-2">
          <Cpu className="w-8 h-8 text-primary-foreground animate-pulse" />
        </div>
        <p className="text-muted-foreground text-sm">Completing sign in…</p>
      </div>
    </div>
  );
};

export default SSOCallback;

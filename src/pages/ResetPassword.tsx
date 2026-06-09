import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Cpu } from 'lucide-react';

const ResetPassword = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background grid-pattern flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="glass-card p-8 rounded-2xl border border-border/50 text-center">
          <Cpu className="w-8 h-8 mx-auto text-primary mb-4" />
          <h1 className="text-xl font-bold mb-2">Password Reset</h1>
          <p className="text-muted-foreground text-sm mb-4">
            Password reset is managed through your login provider.
          </p>
          <Button onClick={() => navigate('/auth')} className="w-full">Back to Sign In</Button>
        </div>
      </motion.div>
      <div className="fixed inset-0 pointer-events-none scanning-line opacity-30" />
    </div>
  );
};

export default ResetPassword;

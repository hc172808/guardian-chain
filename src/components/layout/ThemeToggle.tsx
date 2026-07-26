import { useEffect, useState } from 'react';
import { Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';

type AppTheme = 'dark' | 'light';

function getStoredTheme(): AppTheme {
  try {
    return (localStorage.getItem('app-theme') as AppTheme) ?? 'dark';
  } catch {
    return 'dark';
  }
}

function applyTheme(theme: AppTheme) {
  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(theme === 'light' ? 'theme-light' : 'theme-dark');
  try {
    localStorage.setItem('app-theme', theme);
  } catch {}
}

export function useAppTheme() {
  const [theme, setTheme] = useState<AppTheme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // Apply on mount from storage
  useEffect(() => {
    applyTheme(getStoredTheme());
  }, []);

  const toggle = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return { theme, toggle };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useAppTheme();

  return (
    <button
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className={cn(
        'h-8 w-8 flex items-center justify-center rounded-lg border border-border/50 bg-background/80 backdrop-blur-sm transition-colors hover:bg-muted/60',
        className
      )}
    >
      {theme === 'dark'
        ? <Sun className="h-4 w-4 text-amber-400" />
        : <Moon className="h-4 w-4 text-primary" />
      }
    </button>
  );
}

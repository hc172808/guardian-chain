import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Lock, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

function formatCountdown(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

/**
 * Locked-out landing page — the default destination configured for the
 * progressive login-lockout system (admin_config.lockout_settings.redirectUrl).
 * Admin/founder can change or clear this URL from Admin → Firewall → Lockout.
 *
 * The user is free to close this tab and come back anytime — the lockout is
 * tracked server-side, so once the timer here reaches zero (or whenever they
 * return later), they can simply try signing in again.
 */
export default function LockedOut() {
  const [params] = useSearchParams();
  const untilParam = params.get("until");
  const initialUntil = untilParam ? Number(untilParam) : null;
  const [until] = useState<number | null>(
    initialUntil && !Number.isNaN(initialUntil) ? initialUntil : null
  );
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!until) return;
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [until]);

  const remaining = until ? until - now : null;
  const isExpired = remaining !== null && remaining <= 0;

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-lg w-full rounded-2xl border border-destructive/40 bg-card p-8 text-center space-y-5 shadow-xl">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <Lock className="h-8 w-8 text-destructive" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold">Account temporarily locked</h1>
        <p className="text-muted-foreground">
          Too many incorrect login attempts were made on this account. For your
          security, sign-in has been temporarily disabled. This is a test page —
          admin/founder can point the lockout redirect at any URL from the
          admin panel.
        </p>

        {until && !isExpired ? (
          <div className="mx-auto w-fit flex items-center gap-2 rounded-xl border border-border bg-secondary/30 px-5 py-3">
            <Clock className="h-5 w-5 text-primary" aria-hidden />
            <span className="font-mono text-xl font-semibold tabular-nums">
              {formatCountdown(remaining!)}
            </span>
          </div>
        ) : (
          <div className="mx-auto w-fit flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-5 py-3 text-primary">
            <Clock className="h-5 w-5" aria-hidden />
            <span className="text-sm font-medium">You can try signing in again now.</span>
          </div>
        )}

        <ul className="text-sm text-left text-muted-foreground list-disc pl-5 space-y-1">
          <li>You can close this page and come back later — the timer runs on our servers, not in this tab.</li>
          <li>Once the time is up, just return here and sign in again.</li>
          <li>If this wasn't you, consider resetting your password once you're back in.</li>
        </ul>

        <div className="flex items-center justify-center gap-3">
          <Button asChild variant={isExpired ? "default" : "outline"}>
            <Link to="/auth"><ArrowLeft className="h-4 w-4 mr-1.5" />Back to sign in</Link>
          </Button>
        </div>
      </div>
    </main>
  );
}

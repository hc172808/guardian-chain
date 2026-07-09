import { ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

/**
 * Test warning page — the default destination for the firewall honeypot
 * redirect. Configure a different URL via admin_config.honeypot_redirect_url
 * or the HONEYPOT_REDIRECT_URL env var to point at your own trap page.
 */
export default function Blocked() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-lg w-full rounded-2xl border border-destructive/40 bg-card p-8 text-center space-y-5 shadow-xl">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <ShieldAlert className="h-8 w-8 text-destructive" aria-hidden />
        </div>
        <h1 className="text-2xl font-bold">Access temporarily blocked</h1>
        <p className="text-muted-foreground">
          Your device tripped our brute-force protection after repeated failed
          login attempts. This is a test warning page — the network firewall
          redirected you here to prevent further abuse.
        </p>
        <ul className="text-sm text-left text-muted-foreground list-disc pl-5 space-y-1">
          <li>Wait a few minutes for the temporary ban to expire.</li>
          <li>If this was you, double-check your credentials before retrying.</li>
          <li>Admin/founder accounts can recover via wallet signature.</li>
        </ul>
        <Button asChild variant="outline">
          <Link to="/">Return home</Link>
        </Button>
      </div>
    </main>
  );
}

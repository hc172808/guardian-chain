import { useCallback, useEffect, useRef, useState } from "react";
import { Coins, Copy, ExternalLink, Loader2, Plus, Upload } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { api } from "@/lib/api";
import {
  GYDS_BLOCK_EXPLORER,
  GYDS_CHAIN_ID,
  prepareGrc20Deployment,
  submitGrc20Deployment,
  verifyConfirmedGrc20Deployment,
  type DeploymentStep,
  type Grc20DeploymentResult,
  type PreparedGrc20Deployment,
} from "@/lib/tokenDeployment";
import { DEFAULT_PRICING, normalizePricing } from "@/lib/tokenAuthorities";
import { makeTokenRegistrationProofMessage } from "../../../shared/tokenDeploymentProof";

interface Readiness {
  ready: boolean;
  chainId: number | null;
  reason?: string;
}

interface TokenForm {
  name: string;
  symbol: string;
  decimals: number;
  initialSupply: string;
  mintEnabled: boolean;
}

const INITIAL_FORM: TokenForm = {
  name: "",
  symbol: "",
  decimals: 18,
  initialSupply: "1000000",
  mintEnabled: false,
};

const STEP_LABELS: Record<DeploymentStep, string> = {
  awaiting_wallet_approval: "Waiting for wallet approval. Review the transaction and network fee in your wallet.",
  deployment_pending: "Transaction submitted. Waiting for the mainnet confirmation.",
  deployment_confirmed: "Transaction confirmed. Checking the contract and initial allocation.",
  verification_failed: "A transaction was submitted, but token verification did not complete.",
  deployment_failed: "Deployment did not complete. No token was saved.",
};

export const TokenFactory = () => {
  const { toast } = useToast();
  const { user } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<TokenForm>(INITIAL_FORM);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [readiness, setReadiness] = useState<Readiness>({
    ready: false,
    chainId: null,
    reason: "Checking the server's mainnet RPC…",
  });
  const [mintAuthorityAvailable, setMintAuthorityAvailable] = useState(
    DEFAULT_PRICING.authorities.mint.enabled,
  );
  const [prepared, setPrepared] = useState<PreparedGrc20Deployment | null>(null);
  const [deployment, setDeployment] = useState<Grc20DeploymentResult | null>(null);
  const [savedToken, setSavedToken] = useState<any | null>(null);
  const [deploymentStep, setDeploymentStep] = useState<DeploymentStep | null>(null);
  const [deploymentHash, setDeploymentHash] = useState<string | null>(null);
  const [creatorProof, setCreatorProof] = useState<string | null>(null);
  const [deploymentError, setDeploymentError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [checkingDeployment, setCheckingDeployment] = useState(false);
  const [saving, setSaving] = useState(false);

  const refreshReadiness = useCallback(async () => {
    try {
      const result = await api.get("/api/tokens/deployment-readiness");
      setReadiness(result);
      return result as Readiness;
    } catch {
      const failed = {
        ready: false,
        chainId: null,
        reason: "Could not check server-side GYDS mainnet verification.",
      };
      setReadiness(failed);
      return failed;
    }
  }, []);

  useEffect(() => {
    void refreshReadiness();
    api.get("/api/config/token_factory_pricing").then((row) => {
      const pricing = normalizePricing(row?.configValue ?? row?.config_value);
      setMintAuthorityAvailable(Boolean(pricing.authorities.mint.enabled));
    }).catch(() => setMintAuthorityAvailable(false));
  }, [refreshReadiness]);

  const resetWorkflow = () => {
    setForm(INITIAL_FORM);
    setLogoUrl(null);
    setPrepared(null);
    setDeployment(null);
    setSavedToken(null);
    setDeploymentStep(null);
    setDeploymentHash(null);
    setCreatorProof(null);
    setDeploymentError(null);
    setSaveError(null);
  };

  const openFactory = () => {
    if (savedToken) resetWorkflow();
    setDialogOpen(true);
    void refreshReadiness();
  };

  const updateForm = (patch: Partial<TokenForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    setPrepared(null);
    if (deploymentStep === "deployment_failed") {
      setDeploymentStep(null);
      setDeploymentHash(null);
      setDeploymentError(null);
    }
  };

  const handleLogoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      toast({
        title: "Choose an image under 2 MB",
        description: "PNG, JPG, and SVG images are supported.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogoUrl(typeof reader.result === "string" ? reader.result : null);
    reader.readAsDataURL(file);
  };

  const handlePrepare = async () => {
    if (!user) {
      setDeploymentError("Sign in before creating and saving a token.");
      return;
    }
    setPreparing(true);
    setDeploymentError(null);
    setPrepared(null);
    setDeploymentStep(null);
    try {
      const serverReadiness = await refreshReadiness();
      if (!serverReadiness.ready) {
        throw new Error(serverReadiness.reason || "Server-side mainnet verification is not ready.");
      }
      const next = await prepareGrc20Deployment({
        name: form.name,
        symbol: form.symbol,
        decimals: Number(form.decimals),
        initialSupply: form.initialSupply,
        mintEnabled: mintAuthorityAvailable && form.mintEnabled,
      });
      setPrepared(next);
      toast({
        title: "Deployment estimate ready",
        description: "Review the creator wallet, token supply, and estimated network fee before deploying.",
      });
    } catch (error: any) {
      setDeploymentError(error?.message ?? "Could not prepare this token deployment.");
    } finally {
      setPreparing(false);
    }
  };

  const persistVerifiedDeployment = async (result: Grc20DeploymentResult) => {
    setSaving(true);
    setSaveError(null);
    try {
      if (!user || !prepared) throw new Error("Reconnect your account and creator wallet before saving.");
      const proof = creatorProof ?? await prepared.signer.signMessage(
        makeTokenRegistrationProofMessage(user.id, {
          chainId: result.chainId,
          contractAddress: result.contractAddress,
          deploymentTxHash: result.deploymentTxHash,
          creatorWallet: result.creatorWallet,
          initialSupplyBaseUnits: result.initialSupplyBaseUnits,
        }),
      );
      setCreatorProof(proof);
      const token = await api.post("/api/tokens", {
        name: result.name,
        symbol: result.symbol,
        decimals: result.decimals,
        initialSupply: result.initialSupply,
        initialSupplyBaseUnits: result.initialSupplyBaseUnits,
        creatorWallet: result.creatorWallet,
        address: result.contractAddress,
        deploymentTxHash: result.deploymentTxHash,
        chainId: result.chainId,
        mintEnabled: result.mintEnabled,
        tokenStandard: "GRC-20",
        logoUrl,
        creatorProof: proof,
      });
      setSavedToken(token);
      toast({
        title: "Token created and verified",
        description: `${result.name} (${result.symbol}) is confirmed on GYDS mainnet.`,
      });
      return true;
    } catch (error: any) {
      const message = error?.message ?? "The confirmed deployment could not be saved.";
      setSaveError(message);
      toast({
        title: "Deployment confirmed; app record not saved",
        description: message,
        variant: "destructive",
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDeploy = async () => {
    if (!prepared) return;
    setCreating(true);
    setDeploymentError(null);
    setSaveError(null);
    try {
      const serverReadiness = await refreshReadiness();
      if (!serverReadiness.ready) {
        throw new Error(serverReadiness.reason || "Server-side mainnet verification is not ready.");
      }
      const result = await submitGrc20Deployment(prepared, (step, hash) => {
        setDeploymentStep(step);
        if (hash) setDeploymentHash(hash);
      });
      setDeployment(result);
      await persistVerifiedDeployment(result);
    } catch (error: any) {
      setDeploymentError(error?.message ?? "Token deployment failed.");
      toast({
        title: "Token deployment failed",
        description: error?.message ?? "The token was not saved.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  };

  const handleCheckDeployment = async () => {
    if (!prepared || !deploymentHash) return;
    setCheckingDeployment(true);
    setDeploymentError(null);
    try {
      const result = await verifyConfirmedGrc20Deployment(prepared, deploymentHash);
      setDeploymentStep("deployment_confirmed");
      setDeployment(result);
      await persistVerifiedDeployment(result);
    } catch (error: any) {
      const message = error?.message ?? "Could not verify this transaction yet.";
      if (message.includes("failed on-chain")) setDeploymentStep("deployment_failed");
      setDeploymentError(message);
    } finally {
      setCheckingDeployment(false);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: "Could not copy", description: "Clipboard access is unavailable.", variant: "destructive" });
    }
  };

  const statusText = deploymentStep ? STEP_LABELS[deploymentStep] : null;
  const transactionNeedsChecking = Boolean(deploymentHash) && deploymentStep !== "deployment_failed";
  const lockForm = Boolean(deployment) || transactionNeedsChecking || creating || saving;
  const explorerUrl = deployment
    ? `${GYDS_BLOCK_EXPLORER.replace(/\/$/, "")}/address/${deployment.contractAddress}`
    : null;

  return (
    <>
      <GlassCard className="p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/20 p-3">
              <Coins className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Token Factory</h2>
              <p className="text-sm text-muted-foreground">
                Deploy verified GRC-20 tokens on GYDS mainnet.
              </p>
            </div>
          </div>
          <Button onClick={openFactory} className="gap-2">
            <Plus className="h-4 w-4" />
            Create Token
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-secondary/30 p-4">
            <h3 className="font-medium">Exact initial allocation</h3>
            <p className="text-sm text-muted-foreground">
              The full declared supply is minted to the creator wallet in the deployment transaction.
            </p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-4">
            <h3 className="font-medium">Wallet-approved</h3>
            <p className="text-sm text-muted-foreground">
              Your wallet shows the transaction and network fee before it is submitted.
            </p>
          </div>
          <div className="rounded-lg bg-secondary/30 p-4">
            <h3 className="font-medium">Verified before listing</h3>
            <p className="text-sm text-muted-foreground">
              The app checks the mainnet receipt, contract, supply, and creator balance before saving.
            </p>
          </div>
        </div>
      </GlassCard>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!creating && !saving) setDialogOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" /> Create a GRC-20 token
            </DialogTitle>
            <DialogDescription>
              Deploys on GYDS mainnet (chain ID {GYDS_CHAIN_ID}). No seed phrase or private key is requested.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 pt-2">
            {!readiness.ready && (
              <div role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <p className="font-medium">Mainnet deployment is unavailable</p>
                <p className="mt-1 text-muted-foreground">
                  {readiness.reason ?? "The server must be able to verify GYDS mainnet transactions before deployment."}
                </p>
              </div>
            )}

            {savedToken && deployment ? (
              <div className="space-y-4">
                <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
                  <Badge className="mb-2">Confirmed and saved</Badge>
                  <h3 className="text-lg font-semibold">{deployment.name} ({deployment.symbol})</h3>
                  <p className="text-sm text-muted-foreground">
                    Initial supply and creator allocation were independently verified on GYDS mainnet.
                  </p>
                </div>
                <DeploymentDetails
                  deployment={deployment}
                  explorerUrl={explorerUrl!}
                  onCopy={copyText}
                />
                <Button className="w-full" onClick={() => setDialogOpen(false)}>Done</Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="token-name">Token name</Label>
                  <Input
                    id="token-name"
                    maxLength={64}
                    value={form.name}
                    onChange={(event) => updateForm({ name: event.target.value })}
                    placeholder="My Token"
                    disabled={lockForm}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="token-symbol">Symbol</Label>
                    <Input
                      id="token-symbol"
                      maxLength={10}
                      value={form.symbol}
                      onChange={(event) => updateForm({ symbol: event.target.value.toUpperCase() })}
                      placeholder="MTK"
                      disabled={lockForm}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="token-decimals">Decimals (0–18)</Label>
                    <Input
                      id="token-decimals"
                      type="number"
                      min={0}
                      max={18}
                      step={1}
                      value={form.decimals}
                      onChange={(event) => updateForm({ decimals: Number(event.target.value) })}
                      disabled={lockForm}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="token-supply">Initial supply</Label>
                  <Input
                    id="token-supply"
                    type="text"
                    inputMode="decimal"
                    value={form.initialSupply}
                    onChange={(event) => updateForm({ initialSupply: event.target.value })}
                    placeholder="1000000"
                    disabled={lockForm}
                  />
                  <p className="text-xs text-muted-foreground">
                    The full amount will be minted to the creator wallet. Fractional digits cannot exceed the selected decimals.
                  </p>
                </div>

                <div className="flex items-center justify-between rounded-lg bg-secondary/30 p-3">
                  <div className="pr-4">
                    <Label htmlFor="mint-authority">Allow future minting</Label>
                    <p className="text-xs text-muted-foreground">
                      Optional. If enabled, only the on-chain owner can mint more tokens.
                    </p>
                    {!mintAuthorityAvailable && (
                      <p className="mt-1 text-xs text-muted-foreground">This option is currently disabled by the administrator.</p>
                    )}
                  </div>
                  <Switch
                    id="mint-authority"
                    checked={mintAuthorityAvailable && form.mintEnabled}
                    disabled={!mintAuthorityAvailable || lockForm}
                    onCheckedChange={(checked) => updateForm({ mintEnabled: checked })}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Optional token logo</Label>
                  <div className="flex items-center gap-3">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Token logo preview" className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-secondary/50">
                        <Upload className="h-4 w-4 text-muted-foreground" />
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={lockForm}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Choose image
                    </Button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={handleLogoSelect}
                    />
                  </div>
                </div>

                {prepared && (
                  <div className="space-y-2 rounded-lg border p-3 text-sm">
                    <h3 className="font-medium">Review before wallet approval</h3>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Creator wallet</span>
                      <span className="break-all font-mono text-xs">{prepared.creatorWallet}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span className="text-muted-foreground">Initial supply (base units)</span>
                      <span className="break-all font-mono text-xs">{prepared.initialSupplyBaseUnits}</span>
                    </div>
                    {prepared.estimate ? (
                      <div className="flex justify-between gap-3">
                        <span className="text-muted-foreground">Estimated network fee</span>
                        <span className="font-mono">{prepared.estimate.estimatedFeeGyds} GYDS</span>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-600">
                        {prepared.estimateWarning ?? "Fee estimate unavailable; confirm the fee shown by your wallet."}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      This estimate is informational. Your wallet displays the final transaction fee and asks for approval.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      After deployment, your wallet will also ask for a free message signature to link the verified token to this signed-in account.
                    </p>
                  </div>
                )}

                {deploymentStep && (
                  <div
                    role="status"
                    className={`rounded-lg border p-3 text-sm ${
                      deploymentStep === "deployment_confirmed"
                        ? "border-emerald-500/40 bg-emerald-500/10"
                        : deploymentStep === "deployment_failed" || deploymentStep === "verification_failed"
                          ? "border-destructive/40 bg-destructive/5"
                          : "border-primary/30 bg-primary/5"
                    }`}
                  >
                    {statusText}
                    {deploymentHash && (
                      <div className="mt-2 break-all font-mono text-xs">
                        Transaction: {deploymentHash}
                      </div>
                    )}
                  </div>
                )}

                {deployment && !savedToken && (
                  <div className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
                    <div>
                      <p className="font-medium">Deployment verified, app record not saved</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        The confirmed contract is on-chain. Retry saving its verified details; do not deploy again.
                      </p>
                    </div>
                    {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
                    <Button
                      className="w-full"
                      disabled={saving}
                      onClick={() => void persistVerifiedDeployment(deployment)}
                    >
                      {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving verified token…</> : "Retry saving verified token"}
                    </Button>
                    <DeploymentDetails
                      deployment={deployment}
                      explorerUrl={explorerUrl!}
                      onCopy={copyText}
                    />
                  </div>
                )}

                {deploymentError && (
                  <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                    {deploymentError}
                  </p>
                )}

                {!deployment && transactionNeedsChecking && (
                  <Button
                    onClick={handleCheckDeployment}
                    disabled={checkingDeployment || saving}
                    className="w-full gap-2"
                  >
                    {checkingDeployment ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />Checking existing transaction…</>
                    ) : (
                      "Check existing transaction (do not redeploy)"
                    )}
                  </Button>
                )}

                {!deployment && !transactionNeedsChecking && (
                  <Button
                    onClick={prepared ? handleDeploy : handlePrepare}
                    disabled={
                      !user ||
                      !readiness.ready ||
                      preparing ||
                      creating ||
                      !form.name.trim() ||
                      !form.symbol.trim()
                    }
                    className="w-full gap-2"
                  >
                    {preparing || creating ? (
                      <><Loader2 className="h-4 w-4 animate-spin" />{creating ? "Deploying and verifying…" : "Preparing estimate…"}</>
                    ) : prepared ? (
                      "Deploy and confirm in wallet"
                    ) : (
                      "Estimate and review deployment"
                    )}
                  </Button>
                )}

                {!user && <p className="text-center text-sm text-muted-foreground">Sign in to save the verified token after deployment.</p>}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

function DeploymentDetails({
  deployment,
  explorerUrl,
  onCopy,
}: {
  deployment: Grc20DeploymentResult;
  explorerUrl: string;
  onCopy: (value: string, label: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border p-3 text-sm">
      <DetailRow label="Contract" value={deployment.contractAddress} onCopy={onCopy} />
      <DetailRow label="Creator" value={deployment.creatorWallet} onCopy={onCopy} />
      <DetailRow label="Initial supply" value={`${deployment.initialSupply} ${deployment.symbol}`} />
      <DetailRow label="Verified creator balance" value={deployment.verifiedInitialBalanceBaseUnits} />
      <DetailRow label="Deployment transaction" value={deployment.deploymentTxHash} onCopy={onCopy} />
      <div className="flex justify-between gap-3">
        <span className="text-muted-foreground">Chain / block</span>
        <span className="font-mono text-xs">{deployment.chainId} / {deployment.deploymentBlockNumber}</span>
      </div>
      <a
        href={explorerUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-2 text-primary hover:underline"
      >
        Open contract in GYDS explorer <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}

function DetailRow({
  label,
  value,
  onCopy,
}: {
  label: string;
  value: string;
  onCopy?: (value: string, label: string) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-start gap-1">
        <span className="break-all text-right font-mono text-xs">{value}</span>
        {onCopy && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            aria-label={`Copy ${label.toLowerCase()}`}
            onClick={() => onCopy(value, label)}
          >
            <Copy className="h-3 w-3" />
          </Button>
        )}
      </span>
    </div>
  );
}

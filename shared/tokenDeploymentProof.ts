export interface TokenRegistrationProofData {
  chainId: number;
  contractAddress: string;
  deploymentTxHash: string;
  creatorWallet: string;
  initialSupplyBaseUnits: string;
}

export function makeTokenRegistrationProofMessage(
  accountId: string,
  deployment: TokenRegistrationProofData,
): string {
  return [
    "GYDSchain token registration proof",
    `Application account: ${JSON.stringify(accountId)}`,
    `Chain ID: ${deployment.chainId}`,
    `Contract address: ${deployment.contractAddress}`,
    `Deployment transaction: ${deployment.deploymentTxHash}`,
    `Creator wallet: ${deployment.creatorWallet}`,
    `Initial supply (base units): ${deployment.initialSupplyBaseUnits}`,
  ].join("\n");
}

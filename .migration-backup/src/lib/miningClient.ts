// Production Mining Client - connects to full node RPC
import { MINING_REWARDS, MiningAlgorithm } from './blockchain';
import { TOKENOMICS } from '@/config/wallets';

export interface MiningConfig {
  rpcEndpoint: string;
  minerAddress: string;
  algorithm: MiningAlgorithm;
  threads: number;
  workerName?: string;
}

export interface MiningWork {
  jobId: string;
  target: string;
  difficulty: string;
  blockHeight: number;
  prevBlockHash: string;
  timestamp: number;
}

export interface ShareResult {
  accepted: boolean;
  reward?: number;
  message?: string;
  newDifficulty?: string;
}

export interface MiningStats {
  hashRate: number;
  validShares: number;
  rejectedShares: number;
  totalReward: number;
  currentDifficulty: string;
  humanScore: number;
  sessionId: string;
  uptime: number;
}

export interface PoolInfo {
  name: string;
  totalHashRate: number;
  activeMiners: number;
  blocksFound: number;
  poolFee: number;
  minPayout: number;
  difficulty: string;
}

// RPC Client for production mining
export class MiningRPCClient {
  private endpoint: string;
  private sessionId: string | null = null;
  private connected: boolean = false;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async connect(): Promise<boolean> {
    try {
      const response = await this.rpc('mining_connect', {});
      if (response.sessionId) {
        this.sessionId = response.sessionId;
        this.connected = true;
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to connect to mining RPC:', error);
      return false;
    }
  }

  async disconnect(): Promise<void> {
    if (this.sessionId) {
      await this.rpc('mining_disconnect', { sessionId: this.sessionId });
      this.sessionId = null;
      this.connected = false;
    }
  }

  async getWork(): Promise<MiningWork | null> {
    if (!this.connected) return null;
    
    try {
      return await this.rpc('mining_getWork', { sessionId: this.sessionId });
    } catch (error) {
      console.error('Failed to get mining work:', error);
      return null;
    }
  }

  async submitShare(
    nonce: string,
    hash: string,
    jobId: string
  ): Promise<ShareResult> {
    if (!this.connected) {
      return { accepted: false, message: 'Not connected' };
    }

    try {
      return await this.rpc('mining_submitShare', {
        sessionId: this.sessionId,
        nonce,
        hash,
        jobId,
      });
    } catch (error) {
      console.error('Failed to submit share:', error);
      return { accepted: false, message: 'RPC error' };
    }
  }

  async getStats(): Promise<MiningStats | null> {
    if (!this.connected) return null;

    try {
      return await this.rpc('mining_getStats', { sessionId: this.sessionId });
    } catch (error) {
      console.error('Failed to get mining stats:', error);
      return null;
    }
  }

  async getPoolInfo(): Promise<PoolInfo | null> {
    try {
      return await this.rpc('mining_getPoolInfo', {});
    } catch (error) {
      console.error('Failed to get pool info:', error);
      return null;
    }
  }

  async getDifficulty(): Promise<string | null> {
    try {
      const result = await this.rpc('mining_getDifficulty', {});
      return result.difficulty;
    } catch (error) {
      console.error('Failed to get difficulty:', error);
      return null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  private async rpc(method: string, params: object): Promise<any> {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method,
        params,
        id: Date.now(),
      }),
    });

    if (!response.ok) {
      throw new Error(`RPC request failed: ${response.status}`);
    }

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error.message);
    }

    return data.result;
  }
}

// WebAssembly Mining Engine (placeholder for real implementation)
export class MiningEngine {
  private config: MiningConfig;
  private client: MiningRPCClient;
  private running: boolean = false;
  private hashCount: number = 0;
  private startTime: number = 0;
  private currentWork: MiningWork | null = null;
  private workers: Worker[] = [];
  private onStatsUpdate?: (stats: MiningStats) => void;
  private onShareFound?: (result: ShareResult) => void;

  constructor(config: MiningConfig) {
    this.config = config;
    this.client = new MiningRPCClient(config.rpcEndpoint);
  }

  async start(): Promise<boolean> {
    if (this.running) return true;

    const connected = await this.client.connect();
    if (!connected) {
      console.error('Failed to connect to mining pool');
      return false;
    }

    this.running = true;
    this.startTime = Date.now();
    this.hashCount = 0;

    // Start mining loop
    this.miningLoop();

    return true;
  }

  async stop(): Promise<void> {
    this.running = false;
    
    // Terminate all workers
    this.workers.forEach(w => w.terminate());
    this.workers = [];

    await this.client.disconnect();
  }

  private async miningLoop(): Promise<void> {
    while (this.running) {
      try {
        // Get new work from pool
        const work = await this.client.getWork();
        if (!work) {
          await this.sleep(5000);
          continue;
        }

        this.currentWork = work;

        // Mine on this work
        await this.mineWork(work);

        // Rate limiting: 5 second minimum between work requests
        await this.sleep(5000);
      } catch (error) {
        console.error('Mining loop error:', error);
        await this.sleep(10000);
      }
    }
  }

  private async mineWork(work: MiningWork): Promise<void> {
    const target = BigInt('0x' + work.target);
    let nonce = BigInt(Math.floor(Math.random() * 1e12));
    const maxIterations = 10000; // Rate limited

    for (let i = 0; i < maxIterations && this.running; i++) {
      // Compute hash (simplified - real implementation uses RandomX or kHeavyHash)
      const hash = await this.computeHash(work.prevBlockHash, nonce.toString());
      this.hashCount++;

      const hashValue = BigInt('0x' + hash);
      
      // Check if we found a valid share
      if (hashValue < target) {
        const result = await this.client.submitShare(
          nonce.toString(16),
          hash,
          work.jobId
        );

        if (this.onShareFound) {
          this.onShareFound(result);
        }

        if (result.accepted) {
          console.log('Share accepted!', result.reward);
        }

        // Get new work after valid share
        break;
      }

      nonce++;
    }
  }

  private async computeHash(prevHash: string, nonce: string): Promise<string> {
    // Simplified hash - real implementation would use RandomX or kHeavyHash WASM
    const data = new TextEncoder().encode(prevHash + this.config.minerAddress + nonce);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  getHashRate(): number {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return elapsed > 0 ? this.hashCount / elapsed : 0;
  }

  async getStats(): Promise<MiningStats | null> {
    return this.client.getStats();
  }

  setOnStatsUpdate(callback: (stats: MiningStats) => void): void {
    this.onStatsUpdate = callback;
  }

  setOnShareFound(callback: (result: ShareResult) => void): void {
    this.onShareFound = callback;
  }

  isRunning(): boolean {
    return this.running;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Get the RPC endpoint from environment or config
export const getRPCEndpoint = (): string => {
  // In production, this would come from the admin config
  // For now, use a default that points to the full node
  return import.meta.env.VITE_MINING_RPC_ENDPOINT || 'http://localhost:8545';
};

// Create a mining client instance
export const createMiningClient = (minerAddress: string, algorithm: MiningAlgorithm): MiningEngine => {
  return new MiningEngine({
    rpcEndpoint: getRPCEndpoint(),
    minerAddress,
    algorithm,
    threads: navigator.hardwareConcurrency || 4,
    workerName: `web-miner-${Date.now()}`,
  });
};

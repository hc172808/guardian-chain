import { describe, expect, it } from 'vitest';
import { NETWORK_CFGS } from '../../server/testNodes';

describe('dashboard node ports', () => {
  it('keeps the simulated mainnet RPC separate from the installed RPC service', () => {
    expect(NETWORK_CFGS.mainnet.ports.rpc).toBe(8547);
    expect(NETWORK_CFGS.mainnet.ports.rpc).not.toBe(8545);
    expect(NETWORK_CFGS.mainnet.ports.rpc).not.toBe(8546);
  });

  it('assigns unique ports to the dashboard nodes on each network', () => {
    for (const config of Object.values(NETWORK_CFGS)) {
      const ports = Object.values(config.ports);
      expect(new Set(ports).size).toBe(ports.length);
    }
  });
});

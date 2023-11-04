// eslint-disable-next-line import/no-extraneous-dependencies
import NodeCache from 'node-cache';
import { ProviderName } from '../../types';

export interface IRPCHandler {
  rpcErrorTracker: NodeCache;

  chainId: number;

  updateRpcErrorTracker(providerName: ProviderName): void
  getNextRPCProvider(): ProviderName
}

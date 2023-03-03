import { BigNumber, ethers } from 'ethers';
import { UserOperationType } from '../../types';

// data response type that external simulation serivcereturns
export type ExternalSimulationResponseType = {
  isSimulationSuccessful: boolean,
  message: string,
  data: {
    refundAmount: number,
    refundAmountInUSD: number,
    gasLimitFromSimulation: number | BigNumber,
  }
};

// data type that simulation service expects
export type SimulationDataType = {
  chainId: number,
  data: string,
  to: string,
  refundInfo?: { tokenGasPrice: string, gasToken: string },
};

export type FallbackGasTankDepositSimulationDataType = {
  chainId: number,
  value: string,
  to: string,
};

export type AASimulationDataType = {
  userOp: UserOperationType,
  entryPointContract: ethers.Contract,
  chainId: number
};

// data response type that simulation service returns
export type SimulationResponseType = {
  isSimulationSuccessful: boolean,
  data: {
    refundAmount?: number,
    refundAmountInUSD?: number,
    gasLimitFromSimulation: number | BigNumber,
  },
  message: string,
};

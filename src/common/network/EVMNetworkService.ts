/* eslint-disable import/no-import-module-exports */
/* eslint-disable @typescript-eslint/return-await */
/* eslint-disable new-cap */
import axios from "axios";
import {
  PublicClient,
  Transaction,
  TransactionReceipt,
  createPublicClient,
  http,
} from "viem";
import { IEVMAccount } from "../../relayer/account";
import {
  AlchemyMethodType,
  EVMRawTransactionType,
  EthMethodType,
} from "../types";
import { INetworkService } from "./interface";
import {
  Type0TransactionGasPriceType,
  Type2TransactionGasPriceType,
} from "./types";
import { logger } from "../logger";
import { customJSONStringify, parseError } from "../utils";

const log = logger.child({
  module: module.filename.split("/").slice(-4).join("/"),
});

export class EVMNetworkService
  implements INetworkService<IEVMAccount, EVMRawTransactionType>
{
  chainId: number;

  rpcUrl: string;

  provider: PublicClient;

  constructor(options: { chainId: number; rpcUrl: string }) {
    this.chainId = options.chainId;
    this.rpcUrl = options.rpcUrl;
    this.provider = createPublicClient({
      transport: http(this.rpcUrl),
    });
  }

  async sendRpcCall(method: string, params: Array<any>): Promise<any> {
    const requestData = {
      method,
      params,
      jsonrpc: "2.0",
      id: Date.now(),
    };
    const response = await axios.post(this.rpcUrl, requestData);
    const { data } = response;
    log.info(
      `data from RPC call: ${customJSONStringify(
        data,
      )} received on JSON RPC Method: ${method} with params: ${customJSONStringify(
        params,
      )} on chainId: ${this.chainId}`,
    );
    if (!data) {
      log.error(`RPC Call failed without data on chainId: ${this.chainId}`);
      return null;
    }
    if (data.error) {
      log.error(
        `RPC called returned error on chainId: ${this.chainId} with code: ${data.error.code} and message: ${data.error.message}`,
      );
      if (
        method === EthMethodType.ETH_CALL ||
        method === EthMethodType.ESTIMATE_GAS
      ) {
        return data;
      }
      throw new Error(data.error.message);
    }
    return data.result;
  }

  async getBaseFeePerGas(): Promise<bigint> {
    const block = await this.provider.getBlock({
      blockTag: "latest",
    });
    if (typeof block.baseFeePerGas !== "bigint") {
      return BigInt(0);
    }
    return block.baseFeePerGas;
  }

  async getLegacyGasPrice(): Promise<Type0TransactionGasPriceType> {
    return BigInt(await this.sendRpcCall(EthMethodType.GAS_PRICE, []));
  }

  async getEIP1559FeesPerGas(): Promise<Type2TransactionGasPriceType> {
    const maxFeePerGasPromise = this.getLegacyGasPrice();
    const maxPriorityFeePerGasPromise = this.sendRpcCall(
      EthMethodType.MAX_PRIORITY_FEE_PER_GAS,
      [],
    );
    const [maxFeePerGas, maxPriorityFeePerGas] = await Promise.all([
      maxFeePerGasPromise,
      maxPriorityFeePerGasPromise,
    ]);

    return {
      maxFeePerGas: BigInt(maxFeePerGas),
      maxPriorityFeePerGas: BigInt(maxPriorityFeePerGas),
    };
  }

  async getBalance(address: string): Promise<bigint> {
    const balance = await this.sendRpcCall(EthMethodType.GET_BALANCE, [
      address,
      "latest",
    ]);
    return BigInt(balance);
  }

  /**
   * Estimate gas for a transaction
   * @param contract contract instance
   * @param methodName name of the method to be executed
   * @param params parameters required for the method to be encoded
   * @param from address of the user
   * @returns estimate gas for the transaction in big number
   */

  async estimateGas(
    params: any, // TODO type define params
  ): Promise<any> {
    return await this.sendRpcCall(EthMethodType.ESTIMATE_GAS, params);
  }

  async ethCall(params: any): Promise<any> {
    return await this.sendRpcCall(EthMethodType.ETH_CALL, params);
  }

  async getTransactionReceipt(
    transactionHash: string,
  ): Promise<TransactionReceipt | null> {
    try {
      return await this.provider.getTransactionReceipt({
        hash: transactionHash as `0x${string}`,
      });
    } catch (error) {
      return null;
    }
  }

  /**
   * Get the nonce of the user
   * @param address address
   * @param pendingNonce include the nonce of the pending transaction
   * @returns by default returns the next nonce of the address
   * if pendingNonce is set to false, returns the nonce of the mined transaction
   */
  async getNonce(address: string, pendingNonce = true): Promise<number> {
    const params = pendingNonce ? [address, "pending"] : [address];
    return await this.sendRpcCall(EthMethodType.GET_TRANSACTION_COUNT, params);
  }

  // eslint-disable-next-line class-methods-use-this
  async sendTransaction(
    rawTransactionData: EVMRawTransactionType,
    account: IEVMAccount,
  ): Promise<string | Error> {
    const rawTransaction: EVMRawTransactionType = rawTransactionData;
    const hash = await account.sendTransaction(rawTransaction);
    return hash as string;
  }

  /**
   * @param transactionHash transaction hash
   * @returns receipt of the transaction once mined, else waits for the transaction to be mined
   */
  async waitForTransaction(
    transactionHash: string,
    transactionId: string,
    // confirmations?: number,
    // timeout?: number,
  ): Promise<TransactionReceipt> {
    log.info(
      `Starting waitFortransaction polling on transactionHash: ${transactionHash} for transactionId: ${transactionId} on chainId: ${this.chainId}`,
    );

    let transactionReceipt: TransactionReceipt | null =
      await this.getTransactionReceipt(transactionHash);
    // Set interval to check every 10 seconds (adjust the interval as needed)
    const intervalId = setInterval(async () => {
      try {
        transactionReceipt = await this.provider.getTransactionReceipt({
          hash: transactionHash as `0x${string}`,
        });

        if (
          transactionReceipt &&
          (transactionReceipt.status === "success" ||
            transactionReceipt.status === "reverted")
        ) {
          // Transaction resolved successfully
          log.info(
            `Transaction receipt: ${customJSONStringify(
              transactionReceipt,
            )} fetched for transactionHash: ${transactionHash} on transactionId: ${transactionId} on chainId: ${
              this.chainId
            }`,
          );
          clearInterval(intervalId);
        } else {
          // Transaction is still pending
          log.info(
            `Transaction is still pending for transactionHash: ${transactionHash} on transactionId: ${transactionId} on chainId: ${this.chainId}`,
          );
        }
      } catch (error) {
        transactionReceipt = await this.getTransactionReceipt(transactionHash);
        log.info(
          `Error checking transaction receipt: ${parseError(
            error,
          )} for transactionHash: ${transactionHash} on transactionId: ${transactionId} on chainId: ${
            this.chainId
          }`,
        );
        clearInterval(intervalId);
      }
    }, 1000);

    // Uncomment the line below to stop the interval after a certain number of iterations (optional)
    setTimeout(() => clearInterval(intervalId), 5 * 60 * 1000); // Stop after 5 minutes

    log.info(
      `waitForTransactionReceipt from provider response: ${customJSONStringify(
        transactionReceipt,
      )} for transactionHash: ${transactionHash} for transactionId: ${transactionId} on chainId: ${
        this.chainId
      }`,
    );
    if (transactionReceipt === null) {
      throw new Error(
        `Error in fetching transactionReceipt for transactionHash: ${transactionHash} for transactionId: ${transactionId} on chainId: ${this.chainId}`,
      );
    }
    return transactionReceipt;
  }

  /**
   * @param transactionHash transaction hash
   * @returns transaction once mined, else waits for the transaction to be mined
   */
  async getTransaction(transactionHash: string): Promise<Transaction | null> {
    try {
      return await this.provider.getTransaction({
        hash: transactionHash as `0x${string}`,
      });
    } catch (error) {
      return null;
    }
  }

  async getLatesBlockNumber(): Promise<bigint> {
    const block = await this.provider.getBlock({
      blockTag: "latest",
    });
    return block.number;
  }

  async runAlchemySimulation(params: any): Promise<any> {
    return await this.sendRpcCall(AlchemyMethodType.SIMULATE_EXECUTION, params);
  }
}

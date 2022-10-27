import { ConsumeMessage } from 'amqplib';
import { ethers } from 'ethers';
import { logger } from '../../../../common/log-config';
import { IQueue } from '../../../../common/queue';
import {
  AATransactionMessageType, EntryPointMapType, EVMRawTransactionType, TransactionType,
} from '../../../../common/types';
import { IEVMAccount } from '../account';
import { IRelayerManager } from '../relayer-manager';
import { ITransactionService } from '../transaction-service';
import { ITransactionConsumer } from './interface/ITransactionConsumer';
import { AAConsumerParamsType } from './types';

const log = logger(module);
export class AAConsumer implements
ITransactionConsumer<IEVMAccount, EVMRawTransactionType> {
  private transactionType: TransactionType = TransactionType.AA;

  private queue: IQueue<AATransactionMessageType>;

  chainId: number;

  entryPointMap: EntryPointMapType;

  relayerManager: IRelayerManager<IEVMAccount, EVMRawTransactionType>;

  transactionService: ITransactionService<IEVMAccount, EVMRawTransactionType>;

  constructor(
    aaConsumerParams: AAConsumerParamsType,
  ) {
    const {
      options, queue, relayerManager, transactionService,
    } = aaConsumerParams;
    this.queue = queue;
    this.relayerManager = relayerManager;
    this.chainId = options.chainId;
    this.entryPointMap = options.entryPointMap;
    this.transactionService = transactionService;
  }

  onMessageReceived = async (
    msg?: ConsumeMessage,
  ): Promise<void> => {
    if (msg) {
      const transactionDataReceivedFromQueue = JSON.parse(msg.content.toString());
      log.info(`onMessage received in ${this.transactionType}: ${JSON.stringify(transactionDataReceivedFromQueue)}`);
      this.queue.ack(msg);
      // get active relayer
      const activeRelayer = await this.relayerManager.getActiveRelayer();
      log.info(`Active relayer for ${this.transactionType} is ${activeRelayer?.getPublicKey()}`);

      if (activeRelayer) {
        const { userOp, to } = transactionDataReceivedFromQueue;
        const entryPointContracts = this.entryPointMap[this.chainId];

        let entryPointContract;
        for (let entryPointContractIndex = 0;
          entryPointContractIndex < entryPointContracts.length;
          entryPointContractIndex += 1) {
          if (entryPointContracts[entryPointContractIndex].address.toLowerCase()
           === to.toLowerCase()) {
            entryPointContract = entryPointContracts[entryPointContractIndex].entryPointContract;
            break;
          }
        }

        log.info(`Setting active relayer: ${activeRelayer?.getPublicKey()} as beneficiary for userOp: ${JSON.stringify(userOp)}`);

        // eslint-disable-next-line no-unsafe-optional-chaining
        const { data } = await (entryPointContract as ethers.Contract)
          .populateTransaction.handleOps([userOp], activeRelayer.getPublicKey());
        transactionDataReceivedFromQueue.data = data;
        // call transaction service
        // TODO check on return logic
        await this.transactionService.sendTransaction(
          transactionDataReceivedFromQueue,
          activeRelayer,
        );
      } else {
        throw new Error(`No active relayer for transactionType: ${this.transactionType} on chainId: ${this.chainId}`);
      }
    } else {
      throw new Error(`No msg received from queue for transactionType: ${this.transactionType} on chainId: ${this.chainId}`);
    }
  };
}

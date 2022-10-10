import { ConsumeMessage } from 'amqplib';
import { CentClient } from 'cent.js';
import { logger } from '../../../../common/log-config';
import { IQueue } from '../../../../common/queue';
import { TransactionQueueMessageType } from '../../../../common/types';
import { config } from '../../../../config';
import { ISocketConsumer } from './interface/ISocketConsumer';
import { SocketConsumerParamsType } from './types';

const log = logger(module);
export class SocketConsumer implements ISocketConsumer {
  chainId: number;

  socketClient: CentClient;

  constructor(
    socketConsumerParams: SocketConsumerParamsType,
  ) {
    const {
      options,
    } = socketConsumerParams;
    this.socketClient = new CentClient({
      url: config.socketService.httpUrl,
      token: config.socketService.apiKey,
    });
    this.chainId = options.chainId;
  }

  async onMessageReceived(
    msg?: ConsumeMessage,
  ) {
    const self = this as unknown as IQueue<TransactionQueueMessageType>;
    if (msg) {
      const transactionDataReceivedFromQueue = JSON.parse(msg.content.toString());
      log.info(`onMessage received in socket service on chain Id ${this.chainId}: ${JSON.stringify(transactionDataReceivedFromQueue)}`);
      self.ack(msg);
      try {
        this.socketClient.publish({
          channel: `transaction:${transactionDataReceivedFromQueue.transactionId}`,
          data: {
            event: 'transactionMined',
          },
        });
      } catch (error) {
        log.error(`Failed to send to client on socket server with error: ${JSON.stringify(error)}`);
      }
    } else {
      throw new Error(`No msg received from queue in socket service on chainId: ${this.chainId}`);
    }
  }
}

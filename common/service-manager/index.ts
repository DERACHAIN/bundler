/* eslint-disable import/no-import-module-exports */
/* eslint-disable import/no-extraneous-dependencies */
/* eslint-disable no-await-in-loop */
import { ethers } from 'ethers';
// import heapdump from 'heapdump';
import { config } from '../../config';
import { EVMAccount, IEVMAccount } from '../../relayer/src/services/account';
import {
  SocketConsumer,
  BundlerConsumer,
} from '../../relayer/src/services/consumer';
import { EVMNonceManager } from '../../relayer/src/services/nonce-manager';
import { EVMRelayerManager, IRelayerManager } from '../../relayer/src/services/relayer-manager';
import { EVMRelayerQueue } from '../../relayer/src/services/relayer-queue';
import { EVMRetryTransactionService } from '../../relayer/src/services/retry-transaction-service';
import { EVMTransactionListener } from '../../relayer/src/services/transaction-listener';
import { EVMTransactionService } from '../../relayer/src/services/transaction-service';
import { FeeOption } from '../../server/src/services';
import { RedisCacheService } from '../cache';
import { Mongo, TransactionDAO } from '../db';
import { UserOperationDAO } from '../db/dao/UserOperationDAO';
import { GasPriceManager } from '../gas-price';
import { BSCTestnetGasPrice } from '../gas-price/networks/BSCTestnetGasPrice';
import { EthGasPrice } from '../gas-price/networks/EthGasPrice';
import { GoerliGasPrice } from '../gas-price/networks/GoerliGasPrice';
import { MaticGasPrice } from '../gas-price/networks/MaticGasPrice';
import { MumbaiGasPrice } from '../gas-price/networks/MumbaiGasPrice';
import { IQueue } from '../interface';
import { logger } from '../logger';
import { relayerManagerTransactionTypeNameMap } from '../maps';
import { EVMNetworkService } from '../network';
import { NotificationManager } from '../notification';
import { SlackNotificationService } from '../notification/slack/SlackNotificationService';
import {
  BundlerTransactionQueue,
  RetryTransactionHandlerQueue,
  TransactionHandlerQueue,
} from '../queue';
import {
  AARelayService,
  SCWRelayService,
  BundlerRelayService,
} from '../relay-service';
import {
  AASimulationService,
  BundlerSimulationService,
  BundlerGasEstimationService,
  SCWSimulationService,
} from '../simulation';
import { AlchemySimulationService, TenderlySimulationService } from '../simulation/external-simulation';
import { IStatusService, StatusService } from '../status';
import { CMCTokenPriceManager } from '../token-price';
import {
  BundlerTransactionMessageType,
  EntryPointMapType,
  EVMRawTransactionType,
  TransactionType,
} from '../types';

const log = logger.child({ module: module.filename.split('/').slice(-4).join('/') });

const routeTransactionToRelayerMap: {
  [chainId: number]: {
    [transactionType: string]:
    AARelayService |
    SCWRelayService |
    BundlerRelayService
  };
} = {};

const feeOptionMap: {
  [chainId: number]: FeeOption;
} = {};

const gasPriceServiceMap: {
  [chainId: number]: MaticGasPrice |
  GoerliGasPrice |
  MumbaiGasPrice |
  EthGasPrice |
  BSCTestnetGasPrice |
  undefined;
} = {};

const aaSimulatonServiceMap: {
  [chainId: number]: AASimulationService;
} = {};

const bundlerSimulatonServiceMap: {
  [chainId: number]: BundlerSimulationService
} = {};

const bundlerGasEstimationServiceMap: {
  [chainId: number]: BundlerGasEstimationService
} = {};

const scwSimulationServiceMap: {
  [chainId: number]: SCWSimulationService;
} = {};

const entryPointMap: EntryPointMapType = {};

const dbInstance = Mongo.getInstance();
const cacheService = RedisCacheService.getInstance();

const { supportedNetworks, supportedTransactionType } = config;

const EVMRelayerManagerMap: {
  [name: string]: {
    [chainId: number]: IRelayerManager<IEVMAccount, EVMRawTransactionType>;
  };
} = {};

const transactionDao = new TransactionDAO();
const userOperationDao = new UserOperationDAO();

const socketConsumerMap: Record<number, SocketConsumer> = {};
const retryTransactionSerivceMap: Record<number, EVMRetryTransactionService> = {};
const transactionSerivceMap: Record<number, EVMTransactionService> = {};
const transactionListenerMap: Record<number, EVMTransactionListener> = {};
const retryTransactionQueueMap: {
  [key: number]: RetryTransactionHandlerQueue;
} = {};
const networkServiceMap: Record<number, EVMNetworkService> = {};

// eslint-disable-next-line import/no-mutable-exports
let statusService: IStatusService;

(async () => {
  await dbInstance.connect();
  await dbInstance.createTransactionIdIndexes();

  await cacheService.connect();

  const slackNotificationService = new SlackNotificationService(
    process.env.SLACK_TOKEN || config.slack.token,
    process.env.SLACK_CHANNEL || config.slack.channel,
  );
  const notificationManager = new NotificationManager(slackNotificationService);

  const tokenService = new CMCTokenPriceManager(cacheService, {
    apiKey: config.tokenPrice.coinMarketCapApi,
    networkSymbolCategories: config.tokenPrice.networkSymbols,
    updateFrequencyInSeconds: config.tokenPrice.updateFrequencyInSeconds,
    symbolMapByChainId: config.tokenPrice.symbolMapByChainId,
  });
  // added check for relayer node path in order to run on only one server
  const nodePathIndex = process.env.NODE_PATH_INDEX || config.relayer.nodePathIndex;
  if (nodePathIndex === 0) {
    tokenService.schedule();
  }

  log.info(`Setting up instances for following chainIds: ${JSON.stringify(supportedNetworks)}`);
  for (const chainId of supportedNetworks) {
    log.info(`Setup of services started for chainId: ${chainId}`);
    routeTransactionToRelayerMap[chainId] = {};
    entryPointMap[chainId] = [];

    if (!config.chains.provider[chainId]) {
      throw new Error(`No provider for chainId ${chainId}`);
    }

    log.info(`Setting up network service for chainId: ${chainId}`);
    const rpcUrl = config.chains.provider[chainId];
    const networkService = new EVMNetworkService({
      chainId,
      rpcUrl,
      fallbackRpcUrls: config.chains.fallbackUrls[chainId] || [],
    });
    log.info(`Network service setup complete for chainId: ${chainId} with rpcURL: ${rpcUrl}`);
    networkServiceMap[chainId] = networkService;

    log.info(`Setting up gas price manager for chainId: ${chainId}`);
    const gasPriceManager = new GasPriceManager(cacheService, networkService, {
      chainId,
      EIP1559SupportedNetworks: config.EIP1559SupportedNetworks,
    });
    log.info(`Gas price manager setup complete for chainId: ${chainId}`);

    log.info(`Setting up gas price service for chainId: ${chainId}`);
    const gasPriceService = gasPriceManager.setup();
    // added check for relayer node path in order to run on only one server
    if (gasPriceService && config.relayer.nodePathIndex === 0) {
      gasPriceService.schedule();
    }
    if (!gasPriceService) {
      throw new Error(`Gasprice service is not setup for chainId ${chainId}`);
    }
    gasPriceServiceMap[chainId] = gasPriceService;
    log.info(`Gas price service setup complete for chainId: ${chainId}`);

    log.info(`Setting up transaction queue for chainId: ${chainId}`);
    const transactionQueue = new TransactionHandlerQueue({
      chainId,
    });
    await transactionQueue.connect();
    log.info(`Transaction queue setup complete for chainId: ${chainId}`);

    log.info(`Setting up retry transaction queue for chainId: ${chainId}`);
    const retryTransactionQueue = new RetryTransactionHandlerQueue({
      chainId,
    });
    retryTransactionQueueMap[chainId] = retryTransactionQueue;
    await retryTransactionQueueMap[chainId].connect();
    log.info(`Retry transaction queue setup complete for chainId: ${chainId}`);

    log.info(`Setting up nonce manager for chainId: ${chainId}`);
    const nonceManager = new EVMNonceManager({
      options: {
        chainId,
      },
      networkService,
      cacheService,
    });
    log.info(`Nonce manager setup complete for chainId: ${chainId}`);

    log.info(`Setting up transaction listener for chainId: ${chainId}`);
    const transactionListener = new EVMTransactionListener({
      networkService,
      cacheService,
      transactionQueue,
      retryTransactionQueue,
      transactionDao,
      userOperationDao,
      options: {
        chainId,
        entryPointMap,
      },
    });
    transactionListenerMap[chainId] = transactionListener;
    log.info(`Transaction listener setup complete for chainId: ${chainId}`);

    log.info(`Setting up transaction service for chainId: ${chainId}`);
    const transactionService = new EVMTransactionService({
      networkService,
      transactionListener,
      nonceManager,
      gasPriceService,
      transactionDao,
      cacheService,
      notificationManager,
      options: {
        chainId,
      },
    });
    transactionSerivceMap[chainId] = transactionService;
    log.info(`Transaction service setup complete for chainId: ${chainId}`);

    log.info(`Setting up relayer manager for chainId: ${chainId}`);
    for (const relayerManager of config.relayerManagers) {
      const relayerQueue = new EVMRelayerQueue([]);
      if (!EVMRelayerManagerMap[relayerManager.name]) {
        EVMRelayerManagerMap[relayerManager.name] = {};
      }
      const relayerMangerInstance = new EVMRelayerManager({
        networkService,
        gasPriceService,
        cacheService,
        transactionService,
        nonceManager,
        relayerQueue,
        notificationManager,
        options: {
          chainId,
          name: relayerManager.name,
          relayerSeed: relayerManager.relayerSeed,
          minRelayerCount: relayerManager.minRelayerCount[chainId],
          maxRelayerCount: relayerManager.maxRelayerCount[chainId],
          inactiveRelayerCountThreshold: relayerManager.inactiveRelayerCountThreshold[chainId],
          pendingTransactionCountThreshold:
            relayerManager.pendingTransactionCountThreshold[chainId],
          newRelayerInstanceCount: relayerManager.newRelayerInstanceCount[chainId],
          fundingBalanceThreshold: ethers.utils
            .parseEther(relayerManager.fundingBalanceThreshold[chainId].toString()),
          fundingRelayerAmount: relayerManager.fundingRelayerAmount[chainId],
          ownerAccountDetails: new EVMAccount(
            relayerManager.ownerAccountDetails[chainId].publicKey,
            relayerManager.ownerAccountDetails[chainId].privateKey,
          ),
          gasLimitMap: relayerManager.gasLimitMap,
        },
      });
      EVMRelayerManagerMap[relayerManager.name][chainId] = relayerMangerInstance;

      const addressList = await relayerMangerInstance.createRelayers();
      log.info(
        `Relayer address list length: ${addressList.length} and minRelayerCount: ${JSON.stringify(relayerManager.minRelayerCount)} for relayerManager: ${relayerManager.name}`,
      );
      await relayerMangerInstance.fundRelayers(addressList);
      log.info(`Relayer manager setup complete for chainId: ${chainId} for relayerManager: ${relayerManager.name}`);
    }

    log.info(`Relayer manager setup complete for chainId: ${chainId}`);

    log.info(`Setting up retry transaction service for chainId: ${chainId}`);
    retryTransactionSerivceMap[chainId] = new EVMRetryTransactionService({
      retryTransactionQueue,
      transactionService,
      networkService,
      notificationManager,
      options: {
        chainId,
        EVMRelayerManagerMap, // TODO // Review a better way
      },
    });

    retryTransactionQueueMap[chainId].consume(
      retryTransactionSerivceMap[chainId].onMessageReceived,
    );
    log.info(`Retry transaction service setup for chainId: ${chainId}`);

    log.info(`Setting up socket complete consumer for chainId: ${chainId}`);
    socketConsumerMap[chainId] = new SocketConsumer({
      queue: transactionQueue,
      options: {
        chainId,
        wssUrl: config.socketService.wssUrl,
        EVMRelayerManagerMap,
      },
    });
    transactionQueue.consume(socketConsumerMap[chainId].onMessageReceived);
    log.info(`Socket consumer setup complete for chainId: ${chainId} and attached to transaction queue`);

    log.info(`Setting up fee options service for chainId: ${chainId}`);
    const feeOptionService = new FeeOption(gasPriceService, cacheService, {
      chainId,
    });
    feeOptionMap[chainId] = feeOptionService;
    log.info(`Fee option service setup complete for chainId: ${chainId}`);

    // for each network get transaction type
    for (const type of supportedTransactionType[chainId]) {
      if (type === TransactionType.BUNDLER) {
        const bundlerRelayerManager = EVMRelayerManagerMap[
          relayerManagerTransactionTypeNameMap[type]][chainId];
        if (!bundlerRelayerManager) {
          throw new Error(`Relayer manager not found for ${type}`);
        }
        log.info(`Setting up Bundler transaction queue for chainId: ${chainId}`);
        const bundlerQueue: IQueue<BundlerTransactionMessageType> = new BundlerTransactionQueue({
          chainId,
        });

        await bundlerQueue.connect();
        log.info(`Bundler transaction queue setup complete for chainId: ${chainId}`);

        const { entryPointData } = config;

        for (
          let entryPointIndex = 0;
          entryPointIndex < entryPointData[chainId].length;
          entryPointIndex += 1
        ) {
          const entryPoint = entryPointData[chainId][entryPointIndex];

          entryPointMap[chainId].push({
            address: entryPoint.address,
            entryPointContract: networkService.getContract(
              JSON.stringify(entryPoint.abi),
              entryPoint.address,
            ),
          });
        }

        log.info(`Setting up Bundler consumer, relay service, simulation & validation service for chainId: ${chainId}`);
        const bundlerConsumer = new BundlerConsumer({
          queue: bundlerQueue,
          relayerManager: bundlerRelayerManager,
          transactionService,
          cacheService,
          options: {
            chainId,
            entryPointMap,
          },
        });
        // start listening for transaction
        await bundlerQueue.consume(bundlerConsumer.onMessageReceived);

        const bundlerRelayService = new BundlerRelayService(bundlerQueue);
        routeTransactionToRelayerMap[chainId][type] = bundlerRelayService;

        const tenderlySimulationService = new TenderlySimulationService(
          gasPriceService,
          cacheService,
          {
            tenderlyUser: process.env.TENDERLY_USER
              || config.simulationData.tenderlyData.tenderlyUser,
            tenderlyProject: process.env.TENDERLY_PROJECT
              || config.simulationData.tenderlyData.tenderlyProject,
            tenderlyAccessKey: process.env.TENDERLY_ACCESS_KEY
              || config.simulationData.tenderlyData.tenderlyAccessKey,
          },
        );

        const alchemySimulationService = new AlchemySimulationService(
          networkService,
        );

        // eslint-disable-next-line max-len
        bundlerSimulatonServiceMap[chainId] = new BundlerSimulationService(
          networkService,
          tenderlySimulationService,
          alchemySimulationService,
          gasPriceService,
        );

        // eslint-disable-next-line max-len
        bundlerGasEstimationServiceMap[chainId] = new BundlerGasEstimationService(
          networkService,
        );
        log.info(`Bundler consumer, relay service, simulation and validation service setup complete for chainId: ${chainId}`);
      }
    }
  }
  // eslint-disable-next-line no-new
  statusService = new StatusService({
    cacheService,
    networkServiceMap,
    evmRelayerManagerMap: EVMRelayerManagerMap,
    dbInstance,
  });
  log.info('<=== Config setup completed ===>');
})();

export {
  routeTransactionToRelayerMap,
  feeOptionMap,
  aaSimulatonServiceMap,
  bundlerSimulatonServiceMap,
  bundlerGasEstimationServiceMap,
  scwSimulationServiceMap,
  entryPointMap,
  EVMRelayerManagerMap,
  transactionSerivceMap,
  transactionDao,
  userOperationDao,
  statusService,
  networkServiceMap,
  gasPriceServiceMap,
};

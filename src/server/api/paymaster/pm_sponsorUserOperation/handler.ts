/* eslint-disable import/no-import-module-exports */
import { Request, Response } from "express";
import { BigNumber, ethers } from "ethers";
import { arrayify, hexConcat } from "ethers/lib/utils";

import { STATUSES } from "../../shared/middleware";
import { logger } from "../../../../common/logger";
import { customJSONStringify } from "../../../../common/utils";
import { InternalServerError } from "../shared/errors";
import { SponsorUserOperationResponse } from "./response";
import { RPCErrorResponse } from "../shared/response";
import { config } from "../../../../config";
import { UserOperationType } from "../../../../common/types";
import PAYMASTER_ABI from "../../../../common/abi/VerifyingPaymaster.abi.json";

const MOCK_VALID_UNTIL = "0x00000000deadbeef";
const MOCK_VALID_AFTER = "0x0000000000001234";

const filenameLogger = logger.child({
  module: module.filename.split("/").slice(-4).join("/"),
});

export const sponsorUserOperation = async (req: Request, res: Response) => {
  const { id, params } = req.body;
  const { chainId, bundlerApiKey } = req.params;
  const log = filenameLogger.child({
    chainId,
    requestId: id,
    apiKey: bundlerApiKey,
  });

  log.info(`sponsorUserOp request: ${customJSONStringify(req.body)}`);

  const userOp: UserOperationType = params[0];
  const paymasterOption: any = params[1];
  log.info(`userOp: ${customJSONStringify(userOp)}`);
  log.info(`paymasterOption: ${customJSONStringify(paymasterOption)}`);
  try {
    
    // initiate interactive smart contract object
    log.warn(`rpc url ${config.chains.providers[parseInt(chainId, 10)][0].url}`);

    const provider = new ethers.providers.JsonRpcProvider(config.chains.providers[parseInt(chainId, 10)][0].url);

    const contractAddress = config.paymasterConfig.verifyPaymasterAddress;

    const verifyingSingletonPaymaster = new ethers.Contract(contractAddress, PAYMASTER_ABI, provider);

    // adjust verification gas limit for sponsored transaction
    const verificationGasLimit = BigNumber.from(500000);
    
    const op2 = {...userOp };
    op2.verificationGasLimit = verificationGasLimit.toBigInt();

    log.warn(`op2: ${customJSONStringify(op2)}`);

    const relayerManagerConfig = config.relayerManagers[0];
    log.info(`paymasterId ${config.paymasterConfig.paymasterId}`);

    const verifyingSigner = new ethers.Wallet(relayerManagerConfig.ownerPrivateKey, provider);
    const hash = await verifyingSingletonPaymaster.getHash(
      op2,
      await verifyingSigner.getAddress(),
      MOCK_VALID_UNTIL,
      MOCK_VALID_AFTER
    );

    log.warn(`userOpHash: ${hash}`);
    const sig = await verifyingSigner.signMessage(arrayify(hash));
    log.warn(`paymasterSig: ${sig}`);

    const paymasterAndData = hexConcat([
      verifyingSingletonPaymaster.address,
      ethers.utils.defaultAbiCoder.encode(
        ["address", "uint48", "uint48", "bytes"],
        [
          await verifyingSigner.getAddress(),
          MOCK_VALID_UNTIL, 
          MOCK_VALID_AFTER,
          sig,
        ]
      )
    ]);

    log.info(`paymasterAndData: ${paymasterAndData}`);

    // returns sponsor result data
    const sponsorResult = {
      paymasterAndData,
      verificationGasLimit: verificationGasLimit.toNumber(),
    };

    return res
      .status(STATUSES.SUCCESS)
      .json(new SponsorUserOperationResponse(sponsorResult, id));
  } catch (error) {
    log.error(`Error in sponsorUserOperation: ${customJSONStringify(error)}`);
    return res
      .status(STATUSES.INTERNAL_SERVER_ERROR)
      .json(new RPCErrorResponse(new InternalServerError(error), id));
  }
};

import { Request, Response } from "express";
import config from "config";
import { EthMethodType, PaymasterMethodType } from "../../../common/types";
import { BUNDLER_ERROR_CODES, STATUSES } from "../shared/middleware";
import { getChainId, sponsorUserOperation } from ".";
import { RPCErrorResponse } from "./shared/response";
import { ChainIdNotSupportedError } from "./shared/errors";

const isChainIdSupported = (chainId: number): boolean => {
  const supportedNetworks = config.get<Array<number>>("supportedNetworks");
  return supportedNetworks.includes(chainId);
};

export const handlePaymasterRequest = async (req: Request, res: Response) => {
  const { method, id } = req.body;
  const { chainId } = req.params;

  if (!isChainIdSupported(parseInt(chainId, 10))) {
    return res
      .status(STATUSES.BAD_REQUEST)
      .json(new RPCErrorResponse(new ChainIdNotSupportedError(chainId), id));
  }

  let response;
  switch (method) {
    case EthMethodType.CHAIN_ID:
      response = await getChainId(req, res);
      break;
    case PaymasterMethodType.SPONSOR:
      response = await sponsorUserOperation(req, res);
      break;
    default:
      return res.status(STATUSES.BAD_REQUEST).send({
        code: BUNDLER_ERROR_CODES.METHOD_NOT_FOUND,
        error: `method: ${method} not supported`,
      });
  }

  return response;
};

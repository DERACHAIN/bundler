import Joi from "joi";
import { PaymasterMode } from "../../../common/types";

const { number, object, string, array, boolean, any } = Joi.types();

// eth_chainId
export const bundlerChainIdRequestSchema = object.keys({
  method: string.regex(/eth_chainId/),
  params: array,
  jsonrpc: string.required().error(new Error("jsonrpc is required")),
  id: number.required().error(new Error("id is required")),
});

const userOpForSponsor = object.keys({
  sender: string
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .required()
    .error(new Error("sender address is required")),
  nonce: string
    .required()
    .error(new Error("nonce is required and should be a string")),
  initCode: string,
  callData: string
    .required()
    .error(new Error("callData is required and should be a string")),
  callGasLimit: string,
  verificationGasLimit: string,
  preVerificationGas: string,
  maxFeePerGas: string
    .required()
    .error(new Error("maxFeePerGas is required and should be a number")),
  maxPriorityFeePerGas: string
    .required()
    .error(
      new Error("maxPriorityFeePerGas is required and should be a string"),
    ),
  paymasterAndData: string,
  signature: string.required().error(new Error("signature is required")),
});

export const paymasterOption = object.keys({
  mode: string
    .valid(...Object.values(PaymasterMode))
    .error(new Error("mode is invalid")),
  calculateGasLimits: boolean,
  expiryDuration: number,
  tokenInfo: object.pattern(string, any),
  sponsorshipInfo: object.keys({
    webhookData: object.pattern(string, any),
    smartAccountInfo: object.keys({
      name: string.required(),
      version: string.required(),
    }),
  }),
});

export const paymasterSponsorRequestSchema = object.keys({
  method: string.regex(/pm_sponsorUserOperation/),
  params: array
    .ordered(userOpForSponsor, paymasterOption)
    .length(2)
    .required()
    .error(new Error("params must have userOp and option")),
  jsonrpc: string.required().error(new Error("jsonrpc is required")),
  id: number.required().error(new Error("id is required")),
});

import { Router } from "express";
import { handlePaymasterRequest } from "./handler";
import { validatePaymasterRequest } from "./shared/middleware";

export const paymasterRouter = Router();

paymasterRouter.post(
  "/:chainId/:dappAPIKey",
  validatePaymasterRequest(),
  handlePaymasterRequest,
);
paymasterRouter.get(
  "/:chainId/:bundlerApiKey",
  validatePaymasterRequest(),
  handlePaymasterRequest,
);

import { Router } from "express";
import { adminApiRouter } from "./admin/router";
import { v2Router } from "./v2/router";
import { paymasterRouter } from "./paymaster/router";

const routes = Router();

routes.use("/api/v2", v2Router);
routes.use("/paymaster/api/v1", paymasterRouter);
routes.use("/admin", adminApiRouter);

export { routes };

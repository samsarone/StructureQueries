import { Router } from "express";

import { env } from "../config/env.js";
import { getStackSummary } from "../stack.js";

export const healthRouter = Router();

healthRouter.get("/", (_request, response) => {
  response.json({
    status: "ok",
    service: env.serviceName,
    timestamp: new Date().toISOString(),
    stack: getStackSummary()
  });
});

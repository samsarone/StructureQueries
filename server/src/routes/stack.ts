import { Router } from "express";

import { getStackManifest } from "../stack.js";

export const stackRouter = Router();

stackRouter.get("/", (_request, response) => {
  response.json(getStackManifest());
});

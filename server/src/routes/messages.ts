import { Router } from "express";

export const messagesRouter = Router();

messagesRouter.post("/", (request, response) => {
  const message =
    typeof request.body?.message === "string" ? request.body.message : "";

  response.json({
    ok: true,
    received: message,
    reply:
      message ? `Echo: ${message}` : "Structure Queries server scaffold is ready."
  });
});

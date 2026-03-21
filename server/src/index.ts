import { createServer } from "node:http";

import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { attachPluginGateway } from "./ws/plugin-gateway.js";

const app = createApp();
const server = createServer(app);

attachPluginGateway(server);

server.listen(env.port, () => {
  console.log(
    `${env.serviceName} listening on http://localhost:${env.port} in ${env.nodeEnv} mode`
  );
});

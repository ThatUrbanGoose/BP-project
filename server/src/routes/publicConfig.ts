import type {
  FastifyInstance,
} from "fastify";

import {
  environment,
} from "../config/environment.js";

export async function registerPublicConfigRoute(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/config/public",
    async () => {
      return {
        mode: "local",

        localOnly:
          environment.host ===
          "127.0.0.1",

        ttsEnabled: true,

        workerConfigured: true,

        workerStatusEndpoint:
          "/api/worker/status",

        availableEngines: [
          {
            id: "kokoro",
            name: "Kokoro-82M",
            mode: "fast",
          },
        ],

        defaultEngine: "kokoro",

        maxConcurrentJobs:
          environment
            .maxConcurrentJobs,

        dataStorageReady:
          true,
      };
    },
  );
}
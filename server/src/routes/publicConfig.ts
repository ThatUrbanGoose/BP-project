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

        qwenStatusEndpoint:
          "/api/tts/qwen/status",

        availableEngines: [
          {
            id: "kokoro",
            name: "Kokoro-82M",
            mode: "fast",
          },

          {
            id: "qwen3-tts",
            name: "Qwen3-TTS 0.6B",
            mode: "expressive",
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
import type {
  FastifyInstance,
} from "fastify";

import {
  environment,
} from "../config/environment.js";

const serviceStartedAt =
  Date.now();

export async function registerHealthRoute(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/health",
    async () => {
      const currentTime =
        Date.now();

      return {
        ok: true,

        service:
          "bp-local-service",

        version: "0.1.0",

        mode: "local",

        environment:
          environment
            .nodeEnvironment,

        uptimeSeconds:
          Math.floor(
            (
              currentTime -
              serviceStartedAt
            ) / 1000,
          ),

        timestamp:
          new Date(
            currentTime,
          ).toISOString(),
      };
    },
  );
}
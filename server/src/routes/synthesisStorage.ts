import type {
  FastifyInstance,
} from "fastify";

import {
  enforceSynthesisStorageLimits,
  getSynthesisStorageStatus,
  listSynthesisCacheEntries,
} from "../services/synthesisStorage.js";


export async function registerSynthesisStorageRoutes(
  app:
    FastifyInstance,
): Promise<void> {
  app.get(
    "/api/synthesis/storage",

    async () => {
      const status =
        await getSynthesisStorageStatus();

      return {
        ok: true,
        status,
      };
    },
  );


  app.get(
    "/api/synthesis/storage/entries",

    async () => {
      const entries =
        await listSynthesisCacheEntries();

      return {
        entries,
      };
    },
  );


  app.post(
    "/api/synthesis/storage/cleanup",

    async (
      request,
      reply,
    ) => {
      const result =
        await enforceSynthesisStorageLimits();

      return reply
        .status(200)
        .send({
          ok:
            !result
              .after
              .cleanupRequired,

          result,
        });
    },
  );
}
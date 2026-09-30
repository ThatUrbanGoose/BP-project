import type {
  FastifyInstance,
} from "fastify";

import {
  getWorkerCapabilities,
  getWorkerHealth,
  WorkerRequestError,
} from "../services/workerClient.js";

export async function registerWorkerStatusRoute(
  app: FastifyInstance,
): Promise<void> {
  app.get(
    "/api/worker/status",
    async (
      request,
      reply,
    ) => {
      try {
        const [
          health,
          capabilities,
        ] =
          await Promise.all([
            getWorkerHealth(),
            getWorkerCapabilities(),
          ]);

        return {
          ok: true,

          connected: true,

          worker: {
            service:
              health.service,

            version:
              health.version,

            mode:
              health.mode,

            uptimeSeconds:
              health
                .uptime_seconds,

            pythonVersion:
              capabilities
                .python_version,

            operatingSystem:
              capabilities
                .operating_system,

            architecture:
              capabilities
                .architecture,

            logicalCpuCount:
              capabilities
                .logical_cpu_count,

            physicalCpuCount:
              capabilities
                .physical_cpu_count,

            totalMemoryGb:
              capabilities
                .total_memory_gb,

            availableMemoryGb:
              capabilities
                .available_memory_gb,

            engines:
              capabilities.engines.map(
                (engine) => ({
                  id:
                    engine.engine_id,

                  name:
                    engine
                      .display_name,

                  installed:
                    engine.installed,

                  available:
                    engine.available,

                  status:
                    engine.status,
                }),
              ),
          },
        };
      } catch (error) {
        if (
          error instanceof
          WorkerRequestError
        ) {
          request.log.warn(
            {
              workerErrorCode:
                error.code,

              workerStatusCode:
                error
                  .statusCode,
            },
            "BP worker is unavailable.",
          );

          return reply
            .status(503)
            .send({
              error: {
                code:
                  "WORKER_UNAVAILABLE",

                message:
                  error.message,

                requestId:
                  request.id,
              },

              connected: false,
            });
        }

        throw error;
      }
    },
  );
}
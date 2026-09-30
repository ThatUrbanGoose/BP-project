import cors from "@fastify/cors";

import Fastify, {
  type FastifyError,
  type FastifyInstance,
} from "fastify";

import {
  environment,
} from "./config/environment.js";

import {
  ApiError,
} from "./errors/ApiError.js";

import {
  registerHealthRoute,
} from "./routes/health.js";

import {
  registerPublicConfigRoute,
} from "./routes/publicConfig.js";

import {
  registerWorkerStatusRoute,
} from "./routes/workerStatus.js";

import {
  registerKokoroRoutes,
} from "./routes/kokoro.js";

export async function buildApp():
Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level:
        environment.logLevel,
    },


    requestIdHeader:
      "x-request-id",
  });

  await app.register(cors, {
    origin: (
      origin,
      callback,
    ) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        origin ===
        environment.frontendOrigin
      ) {
        callback(null, true);
        return;
      }

      callback(
        new Error(
          "Origin is not allowed.",
        ),
        false,
      );
    },

    methods: [
      "GET",
      "POST",
      "DELETE",
      "OPTIONS",
    ],
  });

  app.setNotFoundHandler(
    async (request, reply) => {
      return reply
        .status(404)
        .send({
          error: {
            code: "NOT_FOUND",
            message:
              "The requested endpoint was not found.",
            requestId:
              request.id,
          },
        });
    },
  );

  app.setErrorHandler(
    async (
      error: FastifyError,
      request,
      reply,
    ) => {
      if (
        error instanceof
        ApiError
      ) {
        return reply
          .status(
            error.statusCode,
          )
          .send({
            error: {
              code:
                error.code,

              message:
                error.message,

              requestId:
                request.id,

              ...(environment
                .isDevelopment &&
              error.details !==
                undefined
                ? {
                    details:
                      error.details,
                  }
                : {}),
            },
          });
      }

      request.log.error(
        {
          error,
          requestId:
            request.id,
        },
        "Unhandled request error",
      );

      return reply
        .status(500)
        .send({
          error: {
            code:
              "INTERNAL_ERROR",

            message:
              "BP encountered an internal service error.",

            requestId:
              request.id,
          },
        });
    },
  );

  app.get(
    "/",
    async () => {
      return {
        service:
          "bp-local-service",

        status: "running",

        healthEndpoint:
          "/api/health",
      };
    },
  );

  await registerHealthRoute(
    app,
  );

  await registerPublicConfigRoute(
    app,
  );

  await registerWorkerStatusRoute(
    app,
  );
   
  await registerKokoroRoutes(
    app,
  )

  return app;
}
import {
  mkdir,
} from "node:fs/promises";

import {
  buildApp,
} from "./app.js";

import {
  environment,
} from "./config/environment.js";

import {
  initializeSynthesisCache,
} from "./services/synthesisCache.js";

import {
  initializeSynthesisQueue,
} from "./services/synthesisQueue.js";

import {
  registerRealSynthesisExecutor,
} from "./services/synthesisExecutor.js";

import {
  initializePronunciationStore,
} from "./services/pronunciationStore.js";

async function createDataDirectories():
Promise<void> {
  const directories =
    Object.values(
      environment.directories,
    );

  await Promise.all(
    directories.map(
      (directory) =>
        mkdir(directory, {
          recursive: true,
        }),
    ),
  );
}

async function startServer():
Promise<void> {
  await createDataDirectories();

  await initializeSynthesisCache();

  await initializeSynthesisQueue();

  await initializePronunciationStore();

  registerRealSynthesisExecutor();

  const app =
    await buildApp();

  let shuttingDown = false;

  async function shutdown(
    signal: string,
  ): Promise<void> {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;

    app.log.info(
      {
        signal,
      },
      "BP local service is shutting down.",
    );

    const forcedShutdown =
      setTimeout(() => {
        app.log.error(
          "Graceful shutdown timed out.",
        );

        process.exit(1);
      }, 10000);

    forcedShutdown.unref();

    try {
      await app.close();

      app.log.info(
        "BP local service stopped cleanly.",
      );

      process.exit(0);
    } catch (error) {
      app.log.error(
        {
          error,
        },
        "BP local service could not shut down cleanly.",
      );

      process.exit(1);
    }
  }

  process.once(
    "SIGINT",
    () => {
      void shutdown(
        "SIGINT",
      );
    },
  );

  process.once(
    "SIGTERM",
    () => {
      void shutdown(
        "SIGTERM",
      );
    },
  );

  process.on(
    "uncaughtException",
    (error) => {
      app.log.fatal(
        {
          error,
        },
        "Uncaught exception",
      );

      void shutdown(
        "uncaughtException",
      );
    },
  );

  process.on(
    "unhandledRejection",
    (reason) => {
      app.log.fatal(
        {
          reason,
        },
        "Unhandled promise rejection",
      );

      void shutdown(
        "unhandledRejection",
      );
    },
  );

  try {
    await app.listen({
      host:
        environment.host,

      port:
        environment.port,
    });

    app.log.info(
      {
        address:
          `http://${environment.host}:${environment.port}`,

        dataDirectory:
          environment
            .directories.data,
      },
      "BP local service started.",
    );
  } catch (error) {
    app.log.fatal(
      {
        error,
      },
      "BP local service failed to start.",
    );

    process.exit(1);
  }
}

void startServer();
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

import {
  z,
} from "zod";

import {
  createGlobalPronunciationRule,
  createStoryPronunciationRule,
  deleteGlobalPronunciationRule,
  deleteStoryPronunciationRule,
  getGlobalPronunciationDictionary,
  getStoryPronunciationDictionary,
  updateGlobalPronunciationRule,
  updateStoryPronunciationRule,
} from "../services/pronunciationStore.js";

import {
  transformPronunciationText,
} from "../services/pronunciationTransformer.js";


const storyIdSchema =
  z.string()
    .trim()
    .regex(
      /^[A-Za-z0-9._-]{1,100}$/,
      "The story ID is invalid.",
    );


const ruleIdSchema =
  z.string()
    .uuid(
      "The pronunciation rule ID is invalid.",
    );


const createRuleSchema =
  z.object({
    kind:
      z.enum([
        "term",
        "character",
      ]),

    source:
      z.string()
        .trim()
        .min(1)
        .max(500),

    replacement:
      z.string()
        .trim()
        .min(1)
        .max(500),

    caseSensitive:
      z.boolean()
        .default(false),

    wholeWord:
      z.boolean()
        .default(true),

    enabled:
      z.boolean()
        .default(true),

    description:
      z.string()
        .trim()
        .max(1000)
        .default(""),
  });


const updateRuleSchema =
  z.object({
    kind:
      z.enum([
        "term",
        "character",
      ])
        .optional(),

    source:
      z.string()
        .trim()
        .min(1)
        .max(500)
        .optional(),

    replacement:
      z.string()
        .trim()
        .min(1)
        .max(500)
        .optional(),

    caseSensitive:
      z.boolean()
        .optional(),

    wholeWord:
      z.boolean()
        .optional(),

    enabled:
      z.boolean()
        .optional(),

    description:
      z.string()
        .trim()
        .max(1000)
        .optional(),
  })
    .refine(
      (
        value,
      ) => (
        Object.keys(
          value,
        ).length > 0
      ),
      {
        message:
          "At least one rule property must be provided.",
      },
    );


const previewSchema =
  z.object({
    text:
      z.string()
        .min(1)
        .max(5000),

    storyId:
      storyIdSchema
        .nullable()
        .optional()
        .default(null),
  });


function sendValidationError(
  request:
    FastifyRequest,

  reply:
    FastifyReply,

  issues:
    unknown,
) {
  return reply
    .status(400)
    .send({
      error: {
        code:
          "INVALID_PRONUNCIATION_REQUEST",

        message:
          "The pronunciation request is invalid.",

        requestId:
          request.id,

        details:
          issues,
      },
    });
}


function sendPronunciationError(
  error:
    unknown,

  request:
    FastifyRequest,

  reply:
    FastifyReply,
) {
  const message =
    error instanceof Error
      ? error.message
      : "The pronunciation operation failed.";

  if (
    message.includes(
      "was not found",
    )
  ) {
    return reply
      .status(404)
      .send({
        error: {
          code:
            "PRONUNCIATION_RULE_NOT_FOUND",

          message,

          requestId:
            request.id,
        },
      });
  }

  if (
    message.includes(
      "story ID is invalid",
    )
  ) {
    return reply
      .status(400)
      .send({
        error: {
          code:
            "INVALID_STORY_ID",

          message,

          requestId:
            request.id,
        },
      });
  }

  if (
    message.includes(
        "rule ID is invalid",
    )
    ) {
    return reply
        .status(400)
        .send({
        error: {
            code:
            "INVALID_PRONUNCIATION_RULE_ID",

            message,

            requestId:
            request.id,
        },
        });
    }

  request.log.error(
    {
      error,
      requestId:
        request.id,
    },
    "Pronunciation operation failed.",
  );

  return reply
    .status(500)
    .send({
      error: {
        code:
          "PRONUNCIATION_OPERATION_FAILED",

        message,

        requestId:
          request.id,
      },
    });
}


function readStoryId(
  request:
    FastifyRequest,
): string {
  const parameters =
    request.params as {
      storyId?: string;
    };

  const validation =
    storyIdSchema.safeParse(
      parameters.storyId,
    );

  if (!validation.success) {
    throw new Error(
      "The story ID is invalid.",
    );
  }

  return validation.data;
}


function readRuleId(
  request:
    FastifyRequest,
): string {
  const parameters =
    request.params as {
      ruleId?: string;
    };

  const validation =
    ruleIdSchema.safeParse(
      parameters.ruleId,
    );

  if (!validation.success) {
    throw new Error(
      "The pronunciation rule ID is invalid.",
    );
  }

  return validation.data;
}


export async function registerPronunciationRoutes(
  app:
    FastifyInstance,
): Promise<void> {
  app.get(
    "/api/pronunciations/global",

    async () => {
      const dictionary =
        await getGlobalPronunciationDictionary();

      return {
        ok: true,
        dictionary,
      };
    },
  );


  app.post(
    "/api/pronunciations/global/rules",

    async (
      request,
      reply,
    ) => {
      const validation =
        createRuleSchema.safeParse(
          request.body,
        );

      if (!validation.success) {
        return sendValidationError(
          request,
          reply,
          validation.error.issues,
        );
      }

      try {
        const previousDictionary =
            await getGlobalPronunciationDictionary();

        const previousRuleIds =
            new Set(
            previousDictionary.rules.map(
                (
                rule,
                ) => rule.id,
            ),
            );

        const dictionary =
            await createGlobalPronunciationRule(
            validation.data,
            );

        const createdRule =
            dictionary.rules.find(
            (
                rule,
            ) => (
                !previousRuleIds.has(
                rule.id,
                )
            ),
            );

        return reply
          .status(201)
          .send({
            ok: true,
            rule:
              createdRule
              ?? null,
            dictionary,
          });

      } catch (error) {
        return sendPronunciationError(
          error,
          request,
          reply,
        );
      }
    },
  );


  app.patch(
    "/api/pronunciations/global/rules/:ruleId",

    async (
      request,
      reply,
    ) => {
      const validation =
        updateRuleSchema.safeParse(
          request.body,
        );

      if (!validation.success) {
        return sendValidationError(
          request,
          reply,
          validation.error.issues,
        );
      }

      try {
        const ruleId =
          readRuleId(
            request,
          );

        const dictionary =
          await updateGlobalPronunciationRule(
            ruleId,
            validation.data,
          );

        return {
          ok: true,
          dictionary,
        };

      } catch (error) {
        return sendPronunciationError(
          error,
          request,
          reply,
        );
      }
    },
  );


  app.delete(
    "/api/pronunciations/global/rules/:ruleId",

    async (
      request,
      reply,
    ) => {
      try {
        const ruleId =
          readRuleId(
            request,
          );

        const dictionary =
          await deleteGlobalPronunciationRule(
            ruleId,
          );

        return {
          ok: true,
          dictionary,
        };

      } catch (error) {
        return sendPronunciationError(
          error,
          request,
          reply,
        );
      }
    },
  );


  app.get(
    "/api/pronunciations/stories/:storyId",

    async (
      request,
      reply,
    ) => {
      try {
        const storyId =
          readStoryId(
            request,
          );

        const dictionary =
          await getStoryPronunciationDictionary(
            storyId,
          );

        return {
          ok: true,
          dictionary,
        };

      } catch (error) {
        return sendPronunciationError(
          error,
          request,
          reply,
        );
      }
    },
  );


  app.post(
    "/api/pronunciations/stories/:storyId/rules",

    async (
      request,
      reply,
    ) => {
      const validation =
        createRuleSchema.safeParse(
          request.body,
        );

      if (!validation.success) {
        return sendValidationError(
          request,
          reply,
          validation.error.issues,
        );
      }

      try {
        const storyId =
            readStoryId(
            request,
            );

        const previousDictionary =
            await getStoryPronunciationDictionary(
            storyId,
            );

        const previousRuleIds =
            new Set(
            previousDictionary.rules.map(
                (
                rule,
                ) => rule.id,
            ),
            );

        const dictionary =
            await createStoryPronunciationRule(
            storyId,
            validation.data,
            );

        const createdRule =
            dictionary.rules.find(
            (
                rule,
            ) => (
                !previousRuleIds.has(
                rule.id,
                )
            ),
            );

        return reply
          .status(201)
          .send({
            ok: true,
            rule:
              createdRule
              ?? null,
            dictionary,
          });

      } catch (error) {
        return sendPronunciationError(
          error,
          request,
          reply,
        );
      }
    },
  );


  app.patch(
    "/api/pronunciations/stories/:storyId/rules/:ruleId",

    async (
      request,
      reply,
    ) => {
      const validation =
        updateRuleSchema.safeParse(
          request.body,
        );

      if (!validation.success) {
        return sendValidationError(
          request,
          reply,
          validation.error.issues,
        );
      }

      try {
        const storyId =
          readStoryId(
            request,
          );

        const ruleId =
          readRuleId(
            request,
          );

        const dictionary =
          await updateStoryPronunciationRule(
            storyId,
            ruleId,
            validation.data,
          );

        return {
          ok: true,
          dictionary,
        };

      } catch (error) {
        return sendPronunciationError(
          error,
          request,
          reply,
        );
      }
    },
  );


  app.delete(
    "/api/pronunciations/stories/:storyId/rules/:ruleId",

    async (
      request,
      reply,
    ) => {
      try {
        const storyId =
          readStoryId(
            request,
          );

        const ruleId =
          readRuleId(
            request,
          );

        const dictionary =
          await deleteStoryPronunciationRule(
            storyId,
            ruleId,
          );

        return {
          ok: true,
          dictionary,
        };

      } catch (error) {
        return sendPronunciationError(
          error,
          request,
          reply,
        );
      }
    },
  );


  app.post(
    "/api/pronunciations/preview",

    async (
      request,
      reply,
    ) => {
      const validation =
        previewSchema.safeParse(
          request.body,
        );

      if (!validation.success) {
        return sendValidationError(
          request,
          reply,
          validation.error.issues,
        );
      }

      try {
        const transformation =
          await transformPronunciationText(
            validation.data.text,
            validation.data.storyId,
          );

        return {
          ok: true,
          transformation,
        };

      } catch (error) {
        return sendPronunciationError(
          error,
          request,
          reply,
        );
      }
    },
  );
}
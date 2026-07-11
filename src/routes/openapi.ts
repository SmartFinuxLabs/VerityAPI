import { Router } from "express";
import type { RequestHandler } from "express";
import swaggerUi from "swagger-ui-express";
import { ApiError } from "../errors/api-error.js";
import { type AuthContext } from "../services/auth-token.js";
import { createRequireAuth } from "../middleware/auth.js";
import { openApiDocument } from "../openapi.js";

function forbidden(message: string) {
  return new ApiError({
    statusCode: 403,
    code: "forbidden",
    message,
    reasonCode: "ERR_FORBIDDEN"
  });
}

const requireDocsAccess: RequestHandler = (_req, res, next) => {
  const authContext = res.locals.auth as AuthContext | undefined;

  if (authContext?.participantRole === "OPERATOR" || authContext?.organizationRole === "SUPER_USER") {
    next();
    return;
  }

  next(forbidden("Operator or super user role is required for API documentation."));
};

export function createOpenApiRouter(options: { protected: boolean } = { protected: false }) {
  const router = Router();

  if (options.protected) {
    router.use(createRequireAuth());
    router.use(requireDocsAccess);
  }

  router.get("/openapi.json", (_req, res) => {
    res.json(openApiDocument);
  });

  const swaggerUiHandler = swaggerUi.setup(openApiDocument, {
    customSiteTitle: "Verity API Docs"
  });

  router.get("/api-docs", swaggerUiHandler);
  router.use("/api-docs", swaggerUi.serveFiles(openApiDocument), swaggerUiHandler);

  return router;
}

export const openApiRouter = createOpenApiRouter();

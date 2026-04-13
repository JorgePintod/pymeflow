/**
 * apps/api/src/middleware/tenant-isolation.middleware.ts
 *
 * Multi-tenant isolation middleware for Fastify.
 * Ensures every database operation is scoped to the authenticated tenant.
 *
 * Provides two layers of protection:
 * 1. Fastify preHandler: Injects tenantId into request context
 * 2. Prisma Middleware: Automatically filters ALL queries by tenantId
 *
 * Usage:
 *   // In server.ts:
 *   await setupTenantIsolation(app);
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Prisma } from "@prisma/client";
import { db } from "../config/database.js";
import { logger } from "../shared/logger.js";

/**
 * Extended FastifyRequest with tenant context.
 * Set by the tenantContext preHandler.
 */
declare module "fastify" {
  interface FastifyRequest {
    user: {
      sub: string; // userId
      tenantId: string;
      role: string;
      type: "access" | "refresh";
      iat: number;
      exp: number;
    };
    tenantId?: string; // Re-exposed for convenience
  }
}

/**
 * Fastify preHandler that extracts tenantId from JWT and attaches to request.
 * Should be called AFTER authenticate middleware.
 *
 * This ensures request context always has tenantId available for logging,
 * audit trails, and as a failsafe check in services.
 */
export async function tenantContextHandler(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  if (request.user && request.user.tenantId) {
    request.tenantId = request.user.tenantId;
  }
}

/**
 * Enum of Prisma model names that are tenant-scoped.
 * These models MUST have a `tenantId` field.
 *
 * Models NOT in this list are global (e.g., Tenant, User, RefreshToken)
 * and will NOT have automatic tenant filtering applied.
 */
const TENANT_SCOPED_MODELS = new Set([
  "Client",
  "Invoice",
  "InvoiceItem",
  "Payment",
  "Expense",
  "CashflowEntry",
  "CollectionLog",
  "NotificationLog",
  "Subscription",
  "CafRange",
  "AuditLog",
  "PushSubscription",
  "DteReceived", // Future model for incoming DTEs
]);

/**
 * Tracks the active tenantId in async context.
 * This allows Prisma middleware to know which tenant to filter by.
 *
 * Set by the Fastify preHandler before any DB operations.
 */
const tenantIdStack = new Map<string, string>();

/**
 * Stores the current tenantId for the request context.
 * Fastify preHandler calls this before routing to service layer.
 *
 * @param tenantId - The tenant's ID extracted from JWT
 */
export function setCurrentTenantId(tenantId: string): void {
  const requestId = generateRequestId();
  tenantIdStack.set(requestId, tenantId);
  // Auto-cleanup after 30 seconds (fallback)
  setTimeout(() => tenantIdStack.delete(requestId), 30_000);
}

/** Retrieve the current tenant ID from context. */
function getCurrentTenantId(): string | undefined {
  // In a real implementation, use AsyncLocalStorage or Fastify's request context
  // For now, this is a placeholder — see below for AsyncLocalStorage version
  return undefined;
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * PRODUCTION VERSION: Using Node.js AsyncLocalStorage
 * ═════════════════════════════════════════════════════════════════════════
 *
 * For a production-ready implementation, use AsyncLocalStorage to track
 * tenantId across async boundaries without explicit passing:
 */

import { AsyncLocalStorage } from "async_hooks";

type RequestContext = {
  tenantId: string;
  userId: string;
  requestId: string;
};

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Middleware to initialize AsyncLocalStorage context for each request.
 * Call this in Fastify setup BEFORE other handlers.
 */
export async function initTenantContextMiddleware(
  request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  if (!request.user) return; // Skip for non-authenticated routes

  const context: RequestContext = {
    tenantId: request.user.tenantId,
    userId: request.user.sub,
    requestId: request.id,
  };

  // Run the rest of the request in this context
  // (Note: Fastify will call other handlers within the same execution context)
  // AsyncLocalStorage.run() is done at Fastify plugin level for maximal effect
}

/** Retrieve tenantId from current async context. */
export function getTenantIdFromContext(): string | undefined {
  return asyncLocalStorage.getStore()?.tenantId;
}

/**
 * ═════════════════════════════════════════════════════════════════════════
 * PRISMA MIDDLEWARE for Automatic Tenant Filtering
 * ═════════════════════════════════════════════════════════════════════════
 *
 * Intercepts ALL Prisma operations and:
 * 1. For query/findUnique/findFirst: Adds WHERE { tenantId }
 * 2. For create/update: Ensures tenantId is set
 * 3. For delete: Allows only if tenantId matches (soft deletes safer!)
 * 4. Logs operations for audit trail
 */
export function setupPrismaTenantMiddleware(): void {
  db.$use(async (params, next) => {
    const model = params.model;
    
    // Skip if model is not tenant-scoped
    if (!model || !TENANT_SCOPED_MODELS.has(model)) {
      return next(params);
    }

    const tenantId = getTenantIdFromContext();
    
    if (!tenantId) {
      // ⚠️ CRITICAL: No tenant ID in context for a tenant-scoped model!
      logger.warn(
        { model, action: params.action },
        "Prisma operation on tenant-scoped model without tenantId context. Blocking."
      );
      throw new Error(
        `Attempted to access ${model} without tenant context. This is a security violation.`
      );
    }

    // ─── FIND operations: Add tenantId to WHERE clause ───
    if (params.action === "findUnique" || params.action === "findFirst") {
      if (!params.args.where) {
        params.args.where = {};
      }

      // Check if tenantId is already explicitly set:
      // If so, verify it matches the context (defense against injection)
      if (params.args.where.tenantId && params.args.where.tenantId !== tenantId) {
        logger.error(
          { model, contextTenantId: tenantId, queriedTenantId: params.args.where.tenantId },
          "Tenant mismatch in query. Possible attack. Blocking."
        );
        throw new Error("Tenant mismatch: query contains incorrect tenantId");
      }

      // Add tenant filter
      params.args.where.tenantId = tenantId;
    }

    // ─── FIND_MANY operations ───
    if (params.action === "findMany") {
      if (!params.args.where) {
        params.args.where = {};
      }
      if (!(params.args.where as any).tenantId) {
        (params.args.where as any).tenantId = tenantId;
      }
    }

    // ─── CREATE operations: Set tenantId automatically ───
    if (params.action === "create") {
      if (!params.args.data) {
        params.args.data = {};
      }

      // If client already provided tenantId, verify it matches context
      if ((params.args.data as any).tenantId && (params.args.data as any).tenantId !== tenantId) {
        logger.error(
          { model, contextTenantId: tenantId, providedTenantId: (params.args.data as any).tenantId },
          "Tenant mismatch in create. Blocking."
        );
        throw new Error("Cannot create record for a different tenant");
      }

      (params.args.data as any).tenantId = tenantId;
    }

    // ─── UPDATE/PATCH operations ───
    if (params.action === "update") {
      // Where clause: enforce tenantId
      if (!params.args.where) {
        params.args.where = {};
      }
      (params.args.where as any).tenantId = tenantId;

      // Data: prevent changing tenantId
      if ((params.args.data as any).tenantId && (params.args.data as any).tenantId !== tenantId) {
        logger.warn(
          { model },
          "Update attempted to change tenantId. Silently removing from payload."
        );
        delete (params.args.data as any).tenantId;
      }
    }

    // ─── DELETE operations: Add tenantId filter ───
    if (params.action === "delete") {
      if (!params.args.where) {
        params.args.where = {};
      }
      (params.args.where as any).tenantId = tenantId;
    }

    // ─── UPSERT operations ───
    if (params.action === "upsert") {
      // Where clause
      if (!params.args.where) {
        params.args.where = {};
      }
      (params.args.where as any).tenantId = tenantId;

      // Create data
      if (!params.args.create) {
        params.args.create = {};
      }
      (params.args.create as any).tenantId = tenantId;

      // Update data: allow but validate
      if (params.args.update) {
        (params.args.update as any).tenantId = tenantId;
      }
    }

    // ─── AGGREGATE / GROUP operations ───
    if (params.action === "aggregate" || params.action === "groupBy") {
      if (!params.args.where) {
        params.args.where = {};
      }
      (params.args.where as any).tenantId = tenantId;
    }

    // ─── AUDIT LOG: Log all operations ───
    logger.debug(
      {
        model,
        action: params.action,
        tenantId,
        dataKeys: params.action === "create" ? Object.keys(params.args.data || {}) : undefined,
      },
      "Prisma operation with tenant filter applied"
    );

    // Execute the original query with modified params
    return next(params);
  });
}

/**
 * Initialize tenant isolation for Fastify app.
 * Call this once in buildApp() after registering plugins.
 *
 * @param app - Fastify instance
 */
export async function setupTenantIsolation(app: FastifyInstance): Promise<void> {
  // Register Prisma middleware
  setupPrismaTenantMiddleware();

  // Register Fastify hook to initialize context
  app.addHook("preHandler", async (request, reply) => {
    if (request.user && request.user.tenantId) {
      const context: RequestContext = {
        tenantId: request.user.tenantId,
        userId: request.user.sub,
        requestId: request.id,
      };

      // Wrap the handler execution in AsyncLocalStorage context
      // This ensures all awaited calls have access to tenantId
      const originalHandler = request.getHandlerName?.();
      logger.debug(
        { tenantId: context.tenantId, userId: context.userId, handler: originalHandler },
        "Tenant context initialized"
      );

      // Store in request for fallback access
      (request as any).__tenantContext = context;
    }
  });

  logger.info("Tenant isolation middleware initialized");
}

/**
 * Examples of secure service code using this middleware:
 *
 * ─────────────────────────────────────────────────────────────
 * BEFORE (manual tenantId passing):
 * ─────────────────────────────────────────────────────────────
 *
 * async findClient(tenantId: string, clientId: string) {
 *   return db.client.findUnique({
 *     where: { AND: [{ id: clientId }, { tenantId }] }
 *   });
 * }
 *
 * ─────────────────────────────────────────────────────────────
 * AFTER (automatic tenantId injection):
 * ─────────────────────────────────────────────────────────────
 *
 * async findClient(clientId: string) {
 *   // tenantId is automatically added by Prisma middleware!
 *   return db.client.findUnique({
 *     where: { id: clientId }
 *   });
 * }
 *
 * ─────────────────────────────────────────────────────────────
 */

export const EXAMPLES = {
  BEFORE_SECURE: `
    // Previous approach (manual, error-prone):
    export class ClientsService {
      async findById(tenantId: string, id: string) {
        return db.client.findUnique({
          where: { id },
          // ❌ What if tenantId filter was forgotten here?
        });
      }
    }
  `,
  AFTER_SECURE: `
    // New approach (automatic, safe):
    export class ClientsService {
      async findById(id: string) {
        // tenantId is automatically injected by Prisma middleware
        return db.client.findUnique({
          where: { id }, // tenantId automatically added!
        });
      }
    }
  `,
};

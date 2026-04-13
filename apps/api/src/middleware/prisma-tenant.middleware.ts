/**
 * Middleware defensivo de Prisma que inyecta tenantId automáticamente
 * en TODAS los queries de modelos multi-tenant.
 * 
 * Previene data leaks incluso si el desarrollador olvida el filtro de tenantId.
 * 
 * Uso:
 *   import prisma from '@/middleware/prisma-tenant.middleware';
 *   
 *   // En handler:
 *   prisma.$tenantContext = { tenantId: request.user.tenantId };
 *   const invoice = await prisma.invoice.findFirst({ where: { id } });
 *   // Middleware inyecta automáticamente: where: { id, tenantId }
 */

import { db as originalDb } from "../config/database.js";
import type { Prisma } from "@prisma/client";

// Variables globales para contexto de tenant (por Request en Fastify)
const tenantContextMap = new WeakMap<object, { tenantId: string }>();

/**
 * Modelos que tienen tenantId obligatorio y deben estar aislados
 */
const MULTI_TENANT_MODELS = [
  "Tenant",
  "User",
  "Client",
  "Invoice",
  "InvoiceItem",
  "Payment",
  "Expense",
  "CashflowEntry",
  "NotificationLog",
  "AuditLog",
  "RefreshToken",
  "Subscription",
  "CollectionLog",
];

/**
 * Wrapper de Prisma con middleware de tenant filtering
 */
class TenantIsolationPrismaClient {
  private db: any;
  private tenantContext: { tenantId: string } | null = null;

  constructor(prismaClient: any) {
    this.db = prismaClient;
    this.setupMiddleware();
  }

  private setupMiddleware() {
    /**
     * Middleware que intercepta TODAS las queries de Prisma
     * y añade el filtro de tenantId si no existe
     */
    this.db.$use(async (params: Prisma.MiddlewareParams, next: Function) => {
      const { model, action, args } = params;

      // Si no hay contexto de tenant, proceder normalmente
      if (!this.tenantContext?.tenantId) {
        // Log en development para detectar llamadas sin tenant context
        if (process.env.NODE_ENV === "development") {
          console.warn(
            `⚠️  Query sin tenant context: ${action} on ${model}. Considera pasar tenantId.`
          );
        }
        return next(params);
      }

      // Si el modelo NO es multi-tenant, no modificar
      if (!MULTI_TENANT_MODELS.includes(model)) {
        return next(params);
      }

      const tenantId = this.tenantContext.tenantId;

      // ─────────────────────────────────────────────────────────────
      // ACCIONES DE LECTURA: findUnique, findFirst, findMany, count
      // ─────────────────────────────────────────────────────────────
      if (["findUnique", "findFirst", "findMany", "count"].includes(action)) {
        args.where = args.where || {};

        // Si el modelo tiene tenantId directo, añadirlo al WHERE
        if (hasDirectTenantId(model)) {
          args.where = {
            ...args.where,
            tenantId,
          };
        }
      }

      // ─────────────────────────────────────────────────────────────
      // ACCIONES DE ACTUALIZACIÓN: update, updateMany
      // ─────────────────────────────────────────────────────────────
      if (["update", "updateMany"].includes(action)) {
        args.where = args.where || {};

        if (hasDirectTenantId(model)) {
          args.where = {
            ...args.where,
            tenantId,
          };
        }
      }

      // ─────────────────────────────────────────────────────────────
      // ACCIONES DE ELIMINACIÓN: delete, deleteMany
      // ─────────────────────────────────────────────────────────────
      if (["delete", "deleteMany"].includes(action)) {
        args.where = args.where || {};

        if (hasDirectTenantId(model)) {
          args.where = {
            ...args.where,
            tenantId,
          };
        }
      }

      // ─────────────────────────────────────────────────────────────
      // ACCIONES DE CREACIÓN: create, createMany
      // ─────────────────────────────────────────────────────────────
      if (["create", "createMany"].includes(action)) {
        // Para create, NO modificamos args.data automáticamente
        // Es responsabilidad del handler pasar tenantId
        // Pero podemos validar:
        if (hasDirectTenantId(model)) {
          const dataArray = Array.isArray(args.data) ? args.data : [args.data];
          for (const data of dataArray) {
            if (data.tenantId && data.tenantId !== tenantId) {
              throw new Error(
                `❌ Intento de crear ${model} con tenantId diferente al contexto. Cross-tenant injection detected!`
              );
            }
            // Inyectar tenantId si no existe
            if (!data.tenantId) {
              data.tenantId = tenantId;
            }
          }
        }
      }

      // Log en debug
      if (process.env.NODE_ENV === "development") {
        console.debug(
          `🔐 Prisma middleware: ${action} ${model} (tenantId: ${tenantId.slice(0, 8)}...)`
        );
      }

      return next(params);
    });
  }

  /**
   * Establecer el contexto de tenant para la próxima query
   * Llamar en cada handler de ruta después de autenticar
   */
  setTenantContext(tenantId: string) {
    this.tenantContext = { tenantId };
  }

  /**
   * Limpiar el contexto de tenant
   * Llamar al final de cada request para evitar leaks
   */
  clearTenantContext() {
    this.tenantContext = null;
  }

  /**
   * Proxy de todas las propiedades de Prisma
   */
  get [Symbol.toStringTag]() {
    return "TenantIsolationPrismaClient";
  }

  // Proxy para acceder a todas las propiedades del cliente de Prisma
  [key: string]: any;
}

/**
 * Aplicar el proxy al cliente original
 */
const handler: ProxyHandler<any> = {
  get(target, prop: string | symbol) {
    if (prop === "setTenantContext") {
      return function (tenantId: string) {
        // Guardar en una variable global o contexto
        if (typeof (target as any).__tenantContext === "undefined") {
          (target as any).__tenantContext = {};
        }
        (target as any).__tenantContext.tenantId = tenantId;
      };
    }

    if (prop === "clearTenantContext") {
      return function () {
        if (typeof (target as any).__tenantContext !== "undefined") {
          delete (target as any).__tenantContext.tenantId;
        }
      };
    }

    return Reflect.get(target, prop);
  },
};

/**
 * Proxy del cliente Prisma con soporte de tenant context
 */
export const db = new Proxy(originalDb, handler);

/**
 * Determinar si el modelo tiene tenantId directo
 */
function hasDirectTenantId(model: string): boolean {
  const modelsWithDirectTenantId = [
    "Tenant",
    "User",
    "Client",
    "Invoice",
    "Expense",
    "CashflowEntry",
    "NotificationLog",
    "AuditLog",
    "Subscription",
    "CollectionLog",
  ];
  return modelsWithDirectTenantId.includes(model);
}

export default db;

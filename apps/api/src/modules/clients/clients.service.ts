import { db } from "../../config/database.js";
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from "../../shared/errors.js";
import { validateRut } from "../../shared/chile.utils.js";
import { buildPagination } from "../../shared/pagination.js";
import type {
  CreateClientDto,
  UpdateClientDto,
  ListClientsQuery,
} from "./clients.schema.js";

/**
 * Servicio de gestión de clientes (receptores de facturas).
 * Toda operación está filtrada por tenantId para garantizar aislamiento multi-tenant.
 */
export class ClientsService {
  /**
   * Crea un nuevo cliente para el tenant.
   * Valida el RUT chileno y verifica unicidad dentro del tenant.
   *
   * @param tenantId - ID del tenant autenticado
   * @param dto - Datos del cliente validados por createClientSchema
   * @returns Cliente creado
   * @throws ValidationError si el RUT es inválido
   * @throws ConflictError si el RUT ya existe para este tenant
   */
  async create(tenantId: string, dto: CreateClientDto) {
    // Validar RUT chileno
    const rutResult = validateRut(dto.rut);
    if (!rutResult.isValid) {
      throw new ValidationError("El RUT del cliente no es válido");
    }

    // Verificar unicidad del RUT dentro del tenant
    const existing = await db.client.findUnique({
      where: {
        tenantId_rutNormalized: {
          tenantId,
          rutNormalized: rutResult.normalized,
        },
      },
    });

    if (existing) {
      throw new ConflictError(
        `Ya existe un cliente con RUT ${rutResult.formatted} en tu empresa`
      );
    }

    const client = await db.client.create({
      data: {
        tenantId,
        rut: rutResult.formatted,
        rutNormalized: rutResult.normalized,
        businessName: dto.businessName,
        tradeName: dto.tradeName,
        email: dto.email,
        phone: dto.phone,
        contactName: dto.contactName,
        address: dto.address,
        commune: dto.commune,
        region: dto.region,
        paymentDays: dto.paymentDays,
        creditLimit: dto.creditLimit,
      },
    });

    return client;
  }

  /**
   * Lista clientes del tenant con búsqueda, filtros y paginación.
   * La búsqueda actúa sobre razón social, nombre de fantasía y RUT.
   *
   * @param tenantId - ID del tenant autenticado
   * @param query - Filtros y paginación
   * @returns Lista paginada de clientes
   */
  async findAll(tenantId: string, query: ListClientsQuery) {
    const where = {
      tenantId,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { businessName: { contains: query.search, mode: "insensitive" as const } },
          { tradeName: { contains: query.search, mode: "insensitive" as const } },
          { rutNormalized: { contains: query.search.replace(/[.\-\s]/g, "") } },
          { contactName: { contains: query.search, mode: "insensitive" as const } },
        ],
      }),
    };

    const total = await db.client.count({ where });
    const { skip, take, pagination } = buildPagination(
      { page: query.page, limit: query.limit },
      total
    );

    const clients = await db.client.findMany({
      where,
      skip,
      take,
      orderBy: { businessName: "asc" },
      select: {
        id: true,
        rut: true,
        businessName: true,
        tradeName: true,
        email: true,
        phone: true,
        contactName: true,
        paymentDays: true,
        isActive: true,
        totalInvoiced: true,
        totalPaid: true,
        overdueAmount: true,
        createdAt: true,
      },
    });

    return { data: clients, pagination };
  }

  /**
   * Obtiene un cliente por ID, verificando pertenencia al tenant.
   *
   * @param tenantId - ID del tenant autenticado
   * @param clientId - ID del cliente
   * @returns Cliente completo con estadísticas
   * @throws NotFoundError si no existe o no pertenece al tenant
   */
  async findById(tenantId: string, clientId: string) {
    const client = await db.client.findFirst({
      where: { id: clientId, tenantId },
      include: {
        _count: {
          select: { invoices: true },
        },
      },
    });

    if (!client) {
      throw new NotFoundError("Cliente");
    }

    return client;
  }

  /**
   * Actualiza un cliente existente, verificando pertenencia al tenant.
   *
   * @param tenantId - ID del tenant autenticado
   * @param clientId - ID del cliente a actualizar
   * @param dto - Datos a actualizar (parcial)
   * @returns Cliente actualizado
   * @throws NotFoundError si no existe o no pertenece al tenant
   */
  async update(tenantId: string, clientId: string, dto: UpdateClientDto) {
    // Verificar que el cliente pertenece al tenant
    const existing = await db.client.findFirst({
      where: { id: clientId, tenantId },
    });

    if (!existing) {
      throw new NotFoundError("Cliente");
    }

    const client = await db.client.update({
      where: { id: clientId },
      data: dto,
    });

    return client;
  }

  /**
   * Desactiva (soft delete) un cliente.
   * No se elimina de la BD porque puede tener facturas históricas.
   *
   * @param tenantId - ID del tenant autenticado
   * @param clientId - ID del cliente a desactivar
   * @throws NotFoundError si no existe o no pertenece al tenant
   */
  async deactivate(tenantId: string, clientId: string) {
    const existing = await db.client.findFirst({
      where: { id: clientId, tenantId },
    });

    if (!existing) {
      throw new NotFoundError("Cliente");
    }

    await db.client.update({
      where: { id: clientId },
      data: { isActive: false },
    });
  }

  /**
   * Reactiva un cliente previamente desactivado.
   *
   * @param tenantId - ID del tenant autenticado
   * @param clientId - ID del cliente a reactivar
   * @throws NotFoundError si no existe o no pertenece al tenant
   */
  async reactivate(tenantId: string, clientId: string) {
    const existing = await db.client.findFirst({
      where: { id: clientId, tenantId },
    });

    if (!existing) {
      throw new NotFoundError("Cliente");
    }

    await db.client.update({
      where: { id: clientId },
      data: { isActive: true },
    });
  }
}

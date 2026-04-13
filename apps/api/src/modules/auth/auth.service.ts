import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "../../config/database.js";
import { env } from "../../config/env.js";
import {
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from "../../shared/errors.js";
import { validateRut } from "../../shared/chile.utils.js";
import type { RegisterDto, LoginDto } from "./auth.schema.js";
import type { JwtPayload } from "./auth.middleware.js";
import { logger } from "../../shared/logger.js";

/** Número de rondas de bcrypt para hash de contraseñas */
const BCRYPT_ROUNDS = 12;

/** Duración del refresh token en milisegundos (7 días) */
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Servicio de autenticación de PymeFlow.
 * Gestiona registro de tenants, login, refresh y logout.
 */
export class AuthService {
  /**
   * Registra un nuevo tenant (empresa) y su usuario dueño.
   * Valida el RUT chileno, verifica unicidad y crea todo en una transacción.
   *
   * @param dto - Datos de registro validados por registerSchema
   * @returns Usuario creado, tenant y par de tokens JWT
   * @throws ConflictError si el RUT o email ya existen
   * @throws ValidationError si el RUT es inválido
   */
  async register(dto: RegisterDto) {
    // Validar formato de RUT chileno
    const rutResult = validateRut(dto.rut);
    if (!rutResult.isValid) {
      throw new ConflictError("El RUT ingresado no es válido");
    }

    // Verificar que el RUT no esté ya registrado
    const existingTenant = await db.tenant.findUnique({
      where: { rutNormalized: rutResult.normalized },
    });

    if (existingTenant) {
      throw new ConflictError(
        "Este RUT ya tiene una cuenta registrada en PymeFlow"
      );
    }

    // Verificar email único
    const existingUser = await db.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictError("Este email ya está registrado");
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Crear tenant y usuario en una transacción atómica
    const result = await db.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          businessName: dto.businessName,
          rut: rutResult.formatted,
          rutNormalized: rutResult.normalized,
          email: dto.email,
          phone: dto.phone,
          economicActivity: dto.economicActivity,
        },
      });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          email: dto.email,
          passwordHash,
          firstName: dto.firstName,
          lastName: dto.lastName,
          role: "OWNER",
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          tenantId: true,
        },
      });

      return { tenant, user };
    });

    // Generar tokens JWT
    const tokens = this.generateTokens({
      id: result.user.id,
      tenantId: result.user.tenantId,
      role: result.user.role,
    });

    // Guardar refresh token en BD
    await db.refreshToken.create({
      data: {
        userId: result.user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    logger.info(
      { tenantId: result.tenant.id, userId: result.user.id },
      "Nuevo tenant registrado"
    );

    return {
      user: result.user,
      tenant: {
        id: result.tenant.id,
        businessName: result.tenant.businessName,
        rut: result.tenant.rut,
        plan: result.tenant.plan,
      },
      ...tokens,
    };
  }

  /**
   * Autentica un usuario con email y contraseña.
   * Actualiza la fecha de último login y genera tokens.
   *
   * @param dto - Credenciales validadas por loginSchema
   * @param ipAddress - IP del cliente (para registro en refresh token)
   * @param userAgent - User-Agent del cliente
   * @returns Usuario, tenant y par de tokens JWT
   * @throws UnauthorizedError si las credenciales son inválidas
   */
  async login(dto: LoginDto, ipAddress?: string, userAgent?: string) {
    const user = await db.user.findUnique({
      where: { email: dto.email },
      include: {
        tenant: {
          select: {
            id: true,
            businessName: true,
            rut: true,
            plan: true,
            planExpiresAt: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      // Mensaje genérico para no revelar si el email existe
      throw new UnauthorizedError("Credenciales inválidas");
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedError("Credenciales inválidas");
    }

    // Actualizar último login
    await db.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = this.generateTokens({
      id: user.id,
      tenantId: user.tenantId,
      role: user.role,
    });

    // Guardar refresh token en BD
    await db.refreshToken.create({
      data: {
        userId: user.id,
        token: tokens.refreshToken,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        ipAddress,
        userAgent,
      },
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
      tenant: user.tenant,
      ...tokens,
    };
  }

  /**
   * Renueva el access token usando un refresh token válido.
   * Implementa rotación de refresh tokens: revoca el anterior y emite uno nuevo.
   *
   * @param token - Refresh token actual
   * @returns Nuevo par de tokens JWT
   * @throws UnauthorizedError si el token es inválido, expirado o revocado
   */
  async refreshToken(token: string) {
    let payload: JwtPayload;

    try {
      payload = jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtPayload;
    } catch {
      throw new UnauthorizedError("Refresh token inválido o expirado");
    }

    if (payload.type !== "refresh") {
      throw new UnauthorizedError("Tipo de token inválido");
    }

    const storedToken = await db.refreshToken.findUnique({
      where: { token },
      include: {
        user: {
          select: {
            id: true,
            tenantId: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt < new Date()
    ) {
      throw new UnauthorizedError(
        "Sesión expirada. Por favor inicia sesión nuevamente."
      );
    }

    if (!storedToken.user.isActive) {
      throw new UnauthorizedError("Cuenta desactivada");
    }

    const newTokens = this.generateTokens({
      id: storedToken.user.id,
      tenantId: storedToken.user.tenantId,
      role: storedToken.user.role,
    });

    // Rotar refresh token: revocar el anterior, crear uno nuevo
    await db.$transaction([
      db.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      }),
      db.refreshToken.create({
        data: {
          userId: storedToken.userId,
          token: newTokens.refreshToken,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      }),
    ]);

    return newTokens;
  }

  /**
   * Revoca el refresh token (cierra sesión).
   *
   * @param refreshToken - Token a revocar
   */
  async logout(refreshToken: string): Promise<void> {
    await db.refreshToken.updateMany({
      where: { token: refreshToken, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Obtiene el perfil del usuario autenticado con datos del tenant.
   *
   * @param userId - ID del usuario
   * @param tenantId - ID del tenant (para verificar pertenencia)
   * @returns Datos del usuario y su tenant
   * @throws NotFoundError si el usuario no existe
   */
  async getProfile(userId: string, tenantId: string) {
    const user = await db.user.findFirst({
      where: { id: userId, tenantId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        lastLoginAt: true,
        createdAt: true,
        tenant: {
          select: {
            id: true,
            businessName: true,
            tradeName: true,
            rut: true,
            plan: true,
            planExpiresAt: true,
            economicActivity: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundError("Usuario");
    }

    return user;
  }

  /**
   * Genera par de tokens JWT (access + refresh).
   * Access token: corta duración (15 min por defecto).
   * Refresh token: larga duración (7 días por defecto).
   *
   * @param user - Datos mínimos del usuario para el payload
   * @returns Objeto con accessToken y refreshToken
   */
  private generateTokens(user: {
    id: string;
    tenantId: string;
    role: string;
  }) {
    const accessPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      type: "access" as const,
    };

    const refreshPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      role: user.role,
      type: "refresh" as const,
    };

    const accessToken = jwt.sign(accessPayload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as string,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign(refreshPayload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as string,
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }
}

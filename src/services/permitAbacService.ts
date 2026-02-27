import logger from "@/config/logger.js";
import permit from "@/config/permit.js";
import type { Prisma } from "@/generated/prisma/client.js";
import createHttpError from "http-errors";

type PermitApiMethod = (...args: unknown[]) => Promise<unknown>;
const BOOTSTRAP_ACTION_KEY = "bootstrap_access";

const isConflictError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("already exists") || message.includes("409") || message.includes("conflict")
  );
};

const getPermitApiMethod = (methodName: string): PermitApiMethod => {
  const api = permit.api as unknown as Record<string, unknown>;
  const method = api[methodName];
  if (typeof method !== "function") {
    throw createHttpError(500, `Permit API method '${methodName}' is not available`);
  }
  return method as PermitApiMethod;
};

const callPermitApi = async <TPayload extends Record<string, unknown>>(
  methodName: string,
  payload: TPayload,
  idempotent = false,
) => {
  try {
    const api = permit.api as unknown as Record<string, unknown>;
    const method = getPermitApiMethod(methodName);

    if (
      methodName === "updateRole" &&
      typeof payload.key === "string" &&
      typeof payload.name === "string" &&
      Array.isArray(payload.permissions)
    ) {
      await method.call(api, payload.key, {
        name: payload.name,
        permissions: payload.permissions,
      });
      return;
    }

    await method.call(api, payload);
  } catch (error) {
    if (idempotent && isConflictError(error)) {
      return;
    }

    logger.error({
      message: "Permit API operation failed",
      methodName,
      payload,
      error: error instanceof Error ? error.message : "Unknown permit error",
    });

    throw createHttpError(502, "Permit sync failed", {
      details: { methodName },
    });
  }
};

const sanitizePermitKey = (value: string) => value.replace(/[^A-Za-z0-9-_]/g, "_");

export const toPermitTenantKey = (societyId: string) => sanitizePermitKey(`society_${societyId}`);
export const toPermitRoleKey = (roleName: string, roleId: string) =>
  sanitizePermitKey(`${roleName.toLowerCase()}_${roleId}`);
export const toPermitUserKey = (member: Prisma.MemberModel) =>
  sanitizePermitKey(member.permitUserKey ?? `member_${member.id}`);

export const ensurePermitTenant = async (societyId: string, societyName: string) => {
  const tenantKey = toPermitTenantKey(societyId);

  await callPermitApi(
    "createTenant",
    {
      key: tenantKey,
      name: societyName,
    },
    true,
  );

  await callPermitApi(
    "createResource",
    {
      key: "society",
      name: "society",
      actions: {
        [BOOTSTRAP_ACTION_KEY]: {},
      },
    },
    true,
  );

  logger.info({
    message: "Permit tenant ensured",
    societyId,
    tenantKey,
  });

  return tenantKey;
};

export const syncSocietyResourceActions = async (permissionNames: string[]) => {
  const actions = permissionNames.reduce<Record<string, Record<string, never>>>(
    (accumulator, permissionName) => {
      accumulator[permissionName] = {};
      return accumulator;
    },
    { [BOOTSTRAP_ACTION_KEY]: {} },
  );

  await callPermitApi("updateResource", {
    key: "society",
    name: "society",
    actions,
  });
};

export const upsertPermitRole = async (
  societyId: string,
  roleKey: string,
  roleName: string,
  permissionNames: string[],
) => {
  const normalizedRoleKey = sanitizePermitKey(roleKey);
  const normalizedPermissions =
    roleName === "SUPER_ADMIN"
      ? [`society:${BOOTSTRAP_ACTION_KEY}`, ...permissionNames.map((name) => `society:${name}`)]
      : permissionNames.map((name) => `society:${name}`);

  await callPermitApi(
    "createRole",
    {
      key: normalizedRoleKey,
      name: roleName,
      permissions: Array.from(new Set(normalizedPermissions)),
    },
    true,
  );

  await callPermitApi("updateRole", {
    key: normalizedRoleKey,
    name: roleName,
    permissions: Array.from(new Set(normalizedPermissions)),
  });

  logger.info({
    message: "Permit role synced",
    societyId,
    roleKey,
    permissionNames,
  });
};

export const deletePermitRole = async (societyId: string, roleKey: string) => {
  await callPermitApi("deleteRole", {
    key: sanitizePermitKey(roleKey),
  });

  logger.info({
    message: "Permit role deleted",
    societyId,
    roleKey,
  });
};

export const assignPermitRoleToMember = async (
  societyId: string,
  roleKey: string,
  permitUserKey: string,
) => {
  const normalizedUserKey = sanitizePermitKey(permitUserKey);
  await callPermitApi(
    "createUser",
    {
      key: normalizedUserKey,
    },
    true,
  );

  await callPermitApi("assignRole", {
    user: normalizedUserKey,
    role: sanitizePermitKey(roleKey),
    tenant: toPermitTenantKey(societyId),
  });

  logger.info({
    message: "Permit role assigned",
    societyId,
    roleKey,
    permitUserKey,
  });
};

export const unassignPermitRoleFromMember = async (
  societyId: string,
  roleKey: string,
  permitUserKey: string,
) => {
  const normalizedUserKey = sanitizePermitKey(permitUserKey);
  await callPermitApi(
    "createUser",
    {
      key: normalizedUserKey,
    },
    true,
  );

  await callPermitApi("unassignRole", {
    user: normalizedUserKey,
    role: sanitizePermitKey(roleKey),
    tenant: toPermitTenantKey(societyId),
  });

  logger.info({
    message: "Permit role unassigned",
    societyId,
    roleKey,
    permitUserKey,
  });
};

export const checkPermitPermission = async (
  societyId: string,
  permitUserKey: string,
  permissionName: string,
) => {
  try {
    const normalizedUserKey = sanitizePermitKey(permitUserKey);
    await callPermitApi(
      "createUser",
      {
        key: normalizedUserKey,
      },
      true,
    );

    const allowed = await permit.check(normalizedUserKey, permissionName, {
      type: "society",
      tenant: toPermitTenantKey(societyId),
    });
    return allowed;
  } catch (error) {
    logger.error({
      message: "Permit authorization check failed",
      societyId,
      permitUserKey,
      permissionName,
      error: error instanceof Error ? error.message : "Unknown permit check error",
    });
    throw createHttpError(502, "Unable to verify authorization");
  }
};

import AuditLog from "./auditLog.model.js";

export const createAuditLog = async ({
  actorId,
  actorRole,
  action,
  targetId = null,
  tenantId = null,
  companyId = null,
  ip = null,
  userAgent = null
}) => {
  return AuditLog.create({
    actorId,
    actorRole,
    action,
    targetId,
    tenantId,
    companyId,
    ip,
    userAgent
  });
};

export const getAuditLogs = async (
  user,
  filter = {}
) => {
  if (user.role === "SUPER_ADMIN") {
    return AuditLog.find(filter)
      .populate(
        "actorId",
        "name email"
      )
      .sort({
        createdAt: -1
      });
  }

  return AuditLog.find({
    ...filter,
    companyId: user.companyId
  })
    .populate(
      "actorId",
      "name email"
    )
    .sort({
      createdAt: -1
    });
};

export const getAuditLogById = async (
  id
) => {
  return AuditLog.findById(id)
    .populate(
      "actorId",
      "name email"
    )
    .populate(
      "targetId"
    );
};
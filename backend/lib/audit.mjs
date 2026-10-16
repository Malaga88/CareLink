import AuditLog from '../models/AuditLog.mjs';

// Never put passwords or tokens in an audit entry.
export const audit = (req, action, targetType, target, targetLabel) =>
    AuditLog.create({
        actor: req.user._id, actorName: req.user.name, action, targetType,
        targetId: target?._id ?? target, targetLabel,
    });

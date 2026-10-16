import mongoose from 'mongoose';

// Append-only record of administrative actions (who did what to whom, and when).
const auditSchema = new mongoose.Schema({
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true },
    action: { type: String, required: true },          // e.g. user.create, user.disable
    targetType: { type: String, required: true },       // user | facility
    targetId: { type: mongoose.Schema.Types.ObjectId },
    targetLabel: { type: String },                      // name or email at the time of the action
    at: { type: Date, default: Date.now, index: true },
});

export default mongoose.model('AuditLog', auditSchema);

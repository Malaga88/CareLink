import mongoose from 'mongoose';
import { REFERRAL_STATUSES } from '../lib/constants.mjs';

const referralSchema = new mongoose.Schema({
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromDoctor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    fromFacility: { type: String, required: true },
    toFacility: { type: String, required: true },
    reason: { type: String, required: true, trim: true, maxlength: 120 },
    status: { type: String, enum: REFERRAL_STATUSES, default: 'Pending' },
}, { timestamps: true });

referralSchema.index({ createdAt: -1 });

export default mongoose.model('Referral', referralSchema);

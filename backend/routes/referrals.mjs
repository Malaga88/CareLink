import { Router } from 'express';
import mongoose from 'mongoose';
import Referral from '../models/Referral.mjs';
import { authenticate, requireRole } from '../middleware/auth.mjs';
import { REFERRAL_STATUSES } from '../lib/constants.mjs';
import { HttpError } from '../lib/utils.mjs';

const router = Router();
router.use(authenticate);

const view = (r) => ({
    id: r._id, patient: r.patient?.name, from: r.fromFacility, to: r.toFacility,
    reason: r.reason, status: r.status, createdAt: r.createdAt,
});

// Staff see all referrals; doctors see only the ones they sent.
router.get('/', requireRole('doctor', 'nurse', 'officer'), async (req, res) => {
    const filter = req.user.role === 'doctor' ? { fromDoctor: req.user._id } : {};
    const list = await Referral.find(filter).sort({ createdAt: -1 }).limit(50).populate('patient', 'name').lean();
    res.json({ referrals: list.map(view) });
});

router.patch('/:id/status', requireRole('nurse', 'officer'), async (req, res) => {
    const { status } = req.body ?? {};
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid referral');
    if (!REFERRAL_STATUSES.includes(status) || status === 'Pending') throw new HttpError(400, 'Status must be Accepted or In transit');
    const referral = await Referral.findByIdAndUpdate(req.params.id, { status }, { new: true }).populate('patient', 'name').lean();
    if (!referral) throw new HttpError(404, 'Referral not found');
    res.json({ referral: view(referral) });
});

export default router;

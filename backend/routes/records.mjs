import { Router } from 'express';
import Record from '../models/Record.mjs';
import { authenticate, requireRole } from '../middleware/auth.mjs';

const router = Router();
router.use(authenticate, requireRole('patient'));

export const recordView = (r) => ({
    id: r._id, type: r.type, title: r.title, where: r.facilityName, date: r.date,
    status: [r.statusLabel, r.statusTone], note: r.note,
});

router.get('/mine', async (req, res) => {
    const records = await Record.find({ patient: req.user._id }).sort({ date: -1, createdAt: -1 }).lean();
    res.json({ records: records.map(recordView) });
});

export default router;

import { Router } from 'express';
import Appointment from '../models/Appointment.mjs';
import BookingEvent from '../models/BookingEvent.mjs';
import Referral from '../models/Referral.mjs';
import { authenticate, requireRole } from '../middleware/auth.mjs';
import { avgResponseMs } from '../middleware/metrics.mjs';
import { addDays, todayISO, weekdayOf } from '../lib/utils.mjs';

const router = Router();
router.use(authenticate, requireRole('nurse', 'officer'));

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Real figures computed from the database. (For very large datasets, move the tallies into aggregation pipelines.)
router.get('/summary', async (req, res) => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [appts, events, pendingReferrals] = await Promise.all([
        Appointment.find({ createdAt: { $gte: since }, status: { $ne: 'cancelled' } }).select('date').populate('patient', 'lga').limit(50000).lean(),
        BookingEvent.find({ at: { $gte: since } }).select('outcome').lean(),
        Referral.countDocuments({ status: 'Pending' }),
    ]);

    const byDay = Object.fromEntries(WEEKDAYS.map((d) => [d, 0]));
    const byLga = {};
    for (const a of appts) {
        const dow = weekdayOf(a.date);                       // 0 = Sunday
        byDay[WEEKDAYS[(dow + 6) % 7]] += 1;
        const lga = a.patient?.lga || 'Unspecified';
        byLga[lga] = (byLga[lga] ?? 0) + 1;
    }
    const maxLga = Math.max(1, ...Object.values(byLga));
    const conflicts = events.filter((e) => e.outcome === 'conflict').length;

    res.json({
        generatedAt: new Date().toISOString(),
        appointments30d: appts.length,
        conflictRatePct: events.length ? Number(((conflicts / events.length) * 100).toFixed(1)) : 0,
        bookingAttempts30d: events.length,
        avgResponseMs: avgResponseMs(),          // since the server last started
        pendingReferrals,
        weekly: WEEKDAYS.map((d) => ({ day: d, count: byDay[d] })),
        lgaUsage: Object.entries(byLga).sort((a, b) => b[1] - a[1]).slice(0, 8)
            .map(([lga, count]) => ({ lga, count, pct: Math.round((count / maxLga) * 100) })),
    });
});

export default router;

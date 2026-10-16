import { Router } from 'express';
import mongoose from 'mongoose';
import Facility from '../models/Facility.mjs';
import Doctor from '../models/Doctor.mjs';
import Appointment from '../models/Appointment.mjs';
import { authenticate } from '../middleware/auth.mjs';
import { SLOTS } from '../lib/constants.mjs';
import { HttpError, bookableDates, isISODate } from '../lib/utils.mjs';

const router = Router();
router.get('/facilities', authenticate, async (req, res) => {
    const facilities = await Facility.find().sort('name').lean();
    res.json({ facilities: facilities.map((f) => ({ id: f._id, name: f.name, shortName: f.shortName, lga: f.lga })) });
});

router.get('/doctors', authenticate, async (req, res) => {
    const doctors = await Doctor.find().populate('user', 'name active').populate('facility', 'name shortName').lean();
    res.json({
        doctors: doctors.filter((d) => d.user?.active && d.facility).map((d) => ({
            id: d._id, name: d.user.name, department: d.department, days: d.days, dates: bookableDates(d.days),
            facilityId: d.facility._id, facility: d.facility.name,
        })),
    });
});

router.get('/doctors/:id/availability', authenticate, async (req, res) => {
    const { id } = req.params;
    const { date } = req.query;
    if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid doctor');
    if (!isISODate(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');
    if (!(await Doctor.exists({ _id: id }))) throw new HttpError(404, 'Doctor not found');

    const taken = new Set((await Appointment.find({ doctor: id, date, status: { $in: ['booked', 'completed'] } }).select('slot').lean()).map((a) => a.slot));
    res.json({ date, slots: SLOTS.map((time) => ({ time, taken: taken.has(time) })) });
});

export default router;

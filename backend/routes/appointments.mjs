import { Router } from 'express';
import mongoose from 'mongoose';
import Appointment from '../models/Appointment.mjs';
import Doctor from '../models/Doctor.mjs';
import BookingEvent from '../models/BookingEvent.mjs';
import { authenticate, requireRole } from '../middleware/auth.mjs';
import { SLOTS } from '../lib/constants.mjs';
import { HttpError, addDays, isISODate, isNonEmptyString, todayISO, weekdayOf } from '../lib/utils.mjs';

const router = Router();
router.use(authenticate, requireRole('patient'));

const view = (a) => ({
    id: a._id, date: a.date, slot: a.slot, status: a.status, reason: a.reason, department: a.department,
    doctor: { id: a.doctor?._id, name: a.doctor?.user?.name },
    facility: { id: a.facility?._id, name: a.facility?.name },
});
const populate = [{ path: 'doctor', populate: { path: 'user', select: 'name' } }, { path: 'facility', select: 'name' }];

router.post('/', async (req, res) => {
    const { doctorId, date, slot, reason } = req.body ?? {};
    if (!mongoose.isValidObjectId(doctorId)) throw new HttpError(400, 'Choose a doctor');
    if (!isISODate(date)) throw new HttpError(400, 'Choose a valid date');
    if (!SLOTS.includes(slot)) throw new HttpError(400, 'Choose a valid time slot');
    if (reason != null && (typeof reason !== 'string' || reason.length > 120)) throw new HttpError(400, 'Reason must be 120 characters or fewer');

    const today = todayISO();
    if (date <= today) throw new HttpError(400, 'Choose a date after today');
    if (date > addDays(today, 60)) throw new HttpError(400, 'Appointments can be booked up to 60 days ahead');

    const doctor = await Doctor.findById(doctorId);
    if (!doctor) throw new HttpError(404, 'Doctor not found');
    if (!doctor.days.includes(weekdayOf(date))) throw new HttpError(400, 'This doctor does not see patients on that day');

    // A patient cannot hold two appointments at the same date and time.
    const clash = await Appointment.exists({ patient: req.user._id, date, slot, status: 'booked' });
    if (clash) throw new HttpError(409, 'You already have an appointment at that time', { code: 'PATIENT_CLASH' });

    try {
        const appt = await Appointment.create({
            patient: req.user._id, doctor: doctor._id, facility: doctor.facility, department: doctor.department,
            date, slot, reason: (reason ?? '').trim(), slotKey: `${doctor._id}|${date}|${slot}`,
        });
        await BookingEvent.create({ outcome: 'success' });
        await appt.populate(populate);
        res.status(201).json({ appointment: view(appt) });
    } catch (error) {
        if (error?.code === 11000) {
            await BookingEvent.create({ outcome: 'conflict' });
            throw new HttpError(409, `${slot} was just taken. Please choose another time.`, { code: 'SLOT_TAKEN' });
        }
        throw error;
    }
});

router.get('/mine', async (req, res) => {
    const list = await Appointment.find({ patient: req.user._id, status: 'booked', date: { $gte: todayISO() } })
        .populate(populate).lean();
    list.sort((a, b) => (a.date === b.date ? SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot) : a.date < b.date ? -1 : 1));
    res.json({ appointments: list.map(view) });
});

router.patch('/:id/cancel', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid appointment');
    const appt = await Appointment.findOne({ _id: req.params.id, patient: req.user._id });
    if (!appt) throw new HttpError(404, 'Appointment not found');
    if (appt.status !== 'booked') throw new HttpError(409, 'Only booked appointments can be cancelled');

    appt.status = 'cancelled';
    appt.slotKey = undefined; // frees the slot for other patients
    await appt.save();
    res.json({ message: 'Appointment cancelled' });
});

export default router;

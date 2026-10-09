import { Router } from 'express';
import mongoose from 'mongoose';
import Doctor from '../models/Doctor.mjs';
import Appointment from '../models/Appointment.mjs';
import Consultation from '../models/Consultation.mjs';
import Record from '../models/Record.mjs';
import Referral from '../models/Referral.mjs';
import Facility from '../models/Facility.mjs';
import { authenticate, requireRole } from '../middleware/auth.mjs';
import { SLOTS } from '../lib/constants.mjs';
import { HttpError, isISODate, isNonEmptyString, todayISO } from '../lib/utils.mjs';
import { recordView } from './records.mjs';

const router = Router();
router.use(authenticate, requireRole('doctor'));

// Every doctor route works on the signed-in doctor's own profile only.
router.use(async (req, res, next) => {
    req.doctor = await Doctor.findOne({ user: req.user._id }).populate('facility', 'name shortName');
    if (!req.doctor) throw new HttpError(403, 'No doctor profile is linked to this account');
    next();
});

const ownAppointment = async (req, id) => {
    if (!mongoose.isValidObjectId(id)) throw new HttpError(400, 'Invalid appointment');
    const appt = await Appointment.findOne({ _id: id, doctor: req.doctor._id, status: { $in: ['booked', 'completed'] } }).populate('patient', 'name patientId');
    if (!appt) throw new HttpError(404, 'Appointment not found');
    return appt;
};

router.get('/queue', async (req, res) => {
    const date = req.query.date ?? todayISO();
    if (!isISODate(date)) throw new HttpError(400, 'date must be YYYY-MM-DD');

    const appts = await Appointment.find({ doctor: req.doctor._id, date, status: { $in: ['booked', 'completed'] } })
        .populate('patient', 'name patientId age sex lga').lean();
    appts.sort((a, b) => SLOTS.indexOf(a.slot) - SLOTS.indexOf(b.slot));
    const consults = await Consultation.find({ appointment: { $in: appts.map((a) => a._id) } }).lean();
    const byAppt = new Map(consults.map((c) => [String(c.appointment), c]));

    res.json({
        date,
        doctor: { name: req.user.name, department: req.doctor.department, facility: req.doctor.facility.name },
        queue: appts.map((a) => {
            const c = byAppt.get(String(a._id));
            return {
                appointmentId: a._id, slot: a.slot, reason: a.reason, status: a.status,
                patient: { id: a.patient._id, name: a.patient.name, patientId: a.patient.patientId, age: a.patient.age, sex: a.patient.sex, lga: a.patient.lga },
                consultation: c ? { diagnosis: c.diagnosis, prescription: c.prescription, savedAt: c.updatedAt } : null,
            };
        }),
    });
});

// A doctor may read a patient's history only if that patient has an active appointment with them.
router.get('/patients/:id/history', async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw new HttpError(400, 'Invalid patient');
    // Cancelled appointments do not grant access.
    const related = await Appointment.exists({ doctor: req.doctor._id, patient: req.params.id, status: { $in: ['booked', 'completed'] } });
    if (!related) throw new HttpError(403, 'This patient is not under your care');
    const records = await Record.find({ patient: req.params.id }).sort({ date: -1 }).limit(20).lean();
    res.json({ history: records.map(recordView) });
});

router.put('/consultations', async (req, res) => {
    const { appointmentId, diagnosis, prescription } = req.body ?? {};
    if (!isNonEmptyString(diagnosis)) throw new HttpError(400, 'Add a diagnosis before saving');
    if (diagnosis.length > 2000 || (prescription != null && (typeof prescription !== 'string' || prescription.length > 2000))) {
        throw new HttpError(400, 'Text is too long (2000 characters maximum)');
    }
    const appt = await ownAppointment(req, appointmentId);

    const consult = await Consultation.findOneAndUpdate(
        { appointment: appt._id },
        { $set: { diagnosis: diagnosis.trim(), prescription: (prescription ?? '').trim(), patient: appt.patient._id, doctor: req.doctor._id } },
        { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );
    if (appt.status === 'booked') { appt.status = 'completed'; await appt.save(); }

    // Mirror it into the patient's record so it appears on their Medical Records page.
    await Record.findOneAndUpdate(
        { consultation: consult._id },
        { $set: {
            patient: appt.patient._id, type: 'Visit', title: `Consultation: ${diagnosis.trim().slice(0, 100)}`,
            facilityName: req.doctor.facility.name, date: appt.date, statusLabel: 'Recorded', statusTone: 'blue',
            note: `${diagnosis.trim()}${prescription?.trim() ? `\nPrescription: ${prescription.trim()}` : ''}`,
        } },
        { upsert: true, setDefaultsOnInsert: true },
    );

    res.json({ message: 'Consultation saved', consultation: { diagnosis: consult.diagnosis, prescription: consult.prescription, savedAt: consult.updatedAt } });
});

router.post('/referrals', async (req, res) => {
    const { appointmentId, toFacilityId, reason } = req.body ?? {};
    if (!isNonEmptyString(reason) || reason.length > 120) throw new HttpError(400, 'Enter a reason (120 characters maximum)');
    if (!mongoose.isValidObjectId(toFacilityId)) throw new HttpError(400, 'Choose a receiving facility');
    const appt = await ownAppointment(req, appointmentId);
    const to = await Facility.findById(toFacilityId);
    if (!to) throw new HttpError(404, 'Facility not found');
    if (String(to._id) === String(req.doctor.facility._id)) throw new HttpError(400, 'Choose a different facility from your own');

    const referral = await Referral.create({
        patient: appt.patient._id, fromDoctor: req.user._id, fromFacility: req.doctor.facility.shortName,
        toFacility: to.shortName, reason: reason.trim(),
    });
    res.status(201).json({ message: 'Referral sent', referralId: referral._id });
});

export default router;

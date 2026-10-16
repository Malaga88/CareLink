import mongoose from 'mongoose';
import { APPOINTMENT_STATUSES } from '../lib/constants.mjs';

const appointmentSchema = new mongoose.Schema({
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true },
    department: { type: String, required: true },
    date: { type: String, required: true },   // YYYY-MM-DD (calendar date)
    slot: { type: String, required: true },
    reason: { type: String, trim: true, maxlength: 120, default: '' },
    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'booked' },
    // Conflict guard: "<doctorId>|<date>|<slot>" while the slot is held, removed when cancelled.
    // The unique sparse index makes double-booking impossible even for simultaneous requests.
    slotKey: { type: String, unique: true, sparse: true },
    videoRoom: { type: String },   // random room name for the video consultation (created on first join)
}, { timestamps: true });

appointmentSchema.index({ patient: 1, date: 1 });
appointmentSchema.index({ doctor: 1, date: 1 });

export default mongoose.model('Appointment', appointmentSchema);

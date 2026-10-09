import mongoose from 'mongoose';

// A patient-visible medical record entry (visit, lab result, prescription).
const recordSchema = new mongoose.Schema({
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: ['Visit', 'Lab', 'Prescription'], required: true },
    title: { type: String, required: true, trim: true, maxlength: 140 },
    facilityName: { type: String, trim: true },
    date: { type: String, required: true },    // YYYY-MM-DD
    statusLabel: { type: String, default: 'Recorded' },
    statusTone: { type: String, enum: ['green', 'blue', 'amber'], default: 'blue' },
    note: { type: String, trim: true, maxlength: 4000, default: '' },
    consultation: { type: mongoose.Schema.Types.ObjectId, ref: 'Consultation', unique: true, sparse: true },
}, { timestamps: true });

export default mongoose.model('Record', recordSchema);

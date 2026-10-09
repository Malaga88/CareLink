import mongoose from 'mongoose';

const consultationSchema = new mongoose.Schema({
    appointment: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true, unique: true },
    patient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    doctor: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', required: true },
    diagnosis: { type: String, required: true, trim: true, maxlength: 2000 },
    prescription: { type: String, trim: true, maxlength: 2000, default: '' },
}, { timestamps: true });

export default mongoose.model('Consultation', consultationSchema);

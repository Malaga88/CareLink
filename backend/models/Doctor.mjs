import mongoose from 'mongoose';

const doctorSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    facility: { type: mongoose.Schema.Types.ObjectId, ref: 'Facility', required: true },
    department: { type: String, required: true, trim: true },
    days: { type: [Number], default: [], validate: (v) => v.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) }, // 0 = Sunday
}, { timestamps: true });

doctorSchema.index({ facility: 1, department: 1 });

export default mongoose.model('Doctor', doctorSchema);

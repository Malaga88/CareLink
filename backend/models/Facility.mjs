import mongoose from 'mongoose';

const facilitySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true },
    shortName: { type: String, required: true, trim: true },
    lga: { type: String, trim: true },
}, { timestamps: true });

export default mongoose.model('Facility', facilitySchema);

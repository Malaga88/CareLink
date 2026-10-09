import mongoose from 'mongoose';

// One row per booking attempt; used to compute the real scheduling conflict rate.
const bookingEventSchema = new mongoose.Schema({
    outcome: { type: String, enum: ['success', 'conflict'], required: true },
    at: { type: Date, default: Date.now, index: true },
});

export default mongoose.model('BookingEvent', bookingEventSchema);

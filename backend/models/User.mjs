import mongoose from 'mongoose';
import { ROLES } from '../lib/constants.mjs';

const userSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 120 },
    password: { type: String, required: true, select: false }, // bcrypt hash
    role: { type: String, enum: ROLES, required: true },
    patientId: { type: String, unique: true, sparse: true },    // e.g. PT-04821 (patients only)
    lga: { type: String, trim: true, maxlength: 60 },
    age: { type: Number, min: 0, max: 120 },
    sex: { type: String, enum: ['F', 'M'] },
    active: { type: Boolean, default: true },
    failedLogins: { type: Number, default: 0 },
    lockUntil: { type: Date },                          // temporary lock after repeated wrong passwords
    mustChangePassword: { type: Boolean, default: false }, // set when an admin creates the account or resets the password
}, { timestamps: true });

export default mongoose.model('User', userSchema);

import 'dotenv/config';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import connectToDatabase from '../lib/db.mjs';
import User from '../models/User.mjs';

const pw = process.env.NEW_PASSWORD;
if (!pw || pw.length < 12) { console.error('Set NEW_PASSWORD (12+ characters).'); process.exit(1); }
await connectToDatabase();
const r = await User.updateMany({ email: /@carelink\.example$/ }, { $set: { password: await bcrypt.hash(pw, 10) } });
console.log(`Updated ${r.modifiedCount} demo accounts.`);
await mongoose.disconnect();

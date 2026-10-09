// Creates FICTIONAL demo data so every screen has something to show.
//   npm run seed            add demo data (safe to re-run; existing items are skipped)
//   npm run seed -- --reset wipe CareLink collections first (only the collections this app owns)
// All demo accounts share the password in SEED_PASSWORD (backend/.env). Never use it for real people.
import 'dotenv/config';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import connectToDatabase from '../lib/db.mjs';
import { SLOTS } from '../lib/constants.mjs';
import { addDays, todayISO, weekdayOf } from '../lib/utils.mjs';
import User from '../models/User.mjs';
import Facility from '../models/Facility.mjs';
import Doctor from '../models/Doctor.mjs';
import Appointment from '../models/Appointment.mjs';
import Consultation from '../models/Consultation.mjs';
import Record from '../models/Record.mjs';
import Referral from '../models/Referral.mjs';
import BookingEvent from '../models/BookingEvent.mjs';

const args = process.argv.slice(2);
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 8) { console.error('Set SEED_PASSWORD (min 8 characters) in backend/.env first.'); process.exit(1); }
if (process.env.NODE_ENV === 'production' && !args.includes('--force')) { console.error('Refusing to seed with NODE_ENV=production (add --force if you really mean it).'); process.exit(1); }

await connectToDatabase();

if (args.includes('--reset')) {
    for (const m of [Appointment, Consultation, Record, Referral, BookingEvent, Doctor, Facility, User]) await m.deleteMany({});
    console.log('Cleared CareLink collections.');
}

const hash = await bcrypt.hash(password, 10);
const mail = (n) => `${n}@carelink.example`;
async function user(data) {
    const existing = await User.findOne({ email: data.email });
    return existing ?? User.create({ ...data, password: hash });
}

// Facilities
const fac = {};
for (const f of [
    { key: 'atbuth', name: 'ATBUTH General Hospital \u2014 Bauchi', shortName: 'ATBUTH Bauchi', lga: 'Bauchi' },
    { key: 'misau', name: 'Misau General Hospital', shortName: 'Misau General', lga: 'Misau' },
    { key: 'ningi', name: 'Ningi Primary Health Centre', shortName: 'Ningi PHC', lga: 'Ningi' },
]) {
    fac[f.key] = (await Facility.findOne({ name: f.name })) ?? (await Facility.create({ name: f.name, shortName: f.shortName, lga: f.lga }));
}

// Doctors
const docs = {};
for (const d of [
    { key: 'bello', name: 'Dr. Bello Suleiman', email: mail('bello.suleiman'), dept: 'General Medicine', f: 'atbuth', days: [4] },
    { key: 'hauwa', name: 'Dr. Hauwa Garba', email: mail('hauwa.garba'), dept: 'General Medicine', f: 'atbuth', days: [2, 5] },
    { key: 'adamu', name: 'Dr. Adamu Yusuf', email: mail('adamu.yusuf'), dept: 'Antenatal Care', f: 'atbuth', days: [1, 3] },
    { key: 'rakiya', name: 'Dr. Rakiya Tanko', email: mail('rakiya.tanko'), dept: 'General Medicine', f: 'misau', days: [2, 4] },
    { key: 'saidu', name: 'Dr. Saidu Lawal', email: mail('saidu.lawal'), dept: 'Antenatal Care', f: 'ningi', days: [3] },
]) {
    const u = await user({ name: d.name, email: d.email, role: 'doctor' });
    docs[d.key] = { user: u, profile: (await Doctor.findOne({ user: u._id })) ?? (await Doctor.create({ user: u._id, facility: fac[d.f]._id, department: d.dept, days: d.days })) };
}

// Staff
await user({ name: 'Nurse Zainab Musa', email: mail('zainab.musa'), role: 'nurse' });
await user({ name: 'Health Officer', email: mail('officer'), role: 'officer' });

// Patients
const pts = {};
for (const p of [
    { key: 'amina', name: 'Amina Ibrahim', patientId: 'PT-04821', age: 27, sex: 'F', lga: 'Ningi', email: mail('amina.ibrahim') },
    { key: 'yakubu', name: 'Yakubu Danladi', patientId: 'PT-03177', age: 41, sex: 'M', lga: 'Kafin Zaki', email: mail('yakubu.danladi') },
    { key: 'halima', name: 'Halima Sani', patientId: 'PT-02954', age: 34, sex: 'F', lga: 'Ningi', email: mail('halima.sani') },
    { key: 'emeka', name: 'Emeka Obi', patientId: 'PT-05540', age: 52, sex: 'M', lga: 'Ganjuwa', email: mail('emeka.obi') },
    { key: 'fatima', name: 'Fatima Aliyu', patientId: 'PT-01308', age: 19, sex: 'F', lga: 'Bauchi', email: mail('fatima.aliyu') },
    { key: 'musa', name: 'Musa Abdullahi', patientId: 'PT-06022', age: 63, sex: 'M', lga: 'Misau', email: mail('musa.abdullahi') },
]) {
    pts[p.key] = await user({ ...p, role: 'patient' });
}

// Today's queue for Dr. Bello (6 patients)
const today = todayISO();
const queue = [['amina', 'Follow-up on antenatal checkup'], ['yakubu', 'New complaint: persistent cough'], ['halima', 'Referral review'], ['emeka', 'Lab review'], ['fatima', 'New complaint: recurring headaches'], ['musa', 'Diabetes follow-up']];
const bello = docs.bello.profile;
async function book(patient, doctorProfile, date, slot, reason) {
    const slotKey = `${doctorProfile._id}|${date}|${slot}`;
    if (await Appointment.exists({ slotKey })) return;
    await Appointment.create({ patient: patient._id, doctor: doctorProfile._id, facility: doctorProfile.facility, department: doctorProfile.department, date, slot, reason, slotKey });
    await BookingEvent.create({ outcome: 'success' });
}
const queueSlots = [SLOTS[2], SLOTS[3], SLOTS[4], SLOTS[5], SLOTS[6], SLOTS[0]];
for (let i = 0; i < queue.length; i++) await book(pts[queue[i][0]], bello, today, queueSlots[i], queue[i][1]);

// Amina's next appointment: Dr. Bello's next working day
let next = addDays(today, 1);
while (!bello.days.includes(weekdayOf(next))) next = addDays(next, 1);
await book(pts.amina, bello, next, SLOTS[2], 'Follow-up on antenatal checkup');

// Records for Amina
if (!(await Record.exists({ patient: pts.amina._id }))) {
    await Record.insertMany([
        { type: 'Visit', title: 'Malaria \u2014 Treated', facilityName: 'ATBUTH General Hospital', date: '2026-08-14', statusLabel: 'Resolved', statusTone: 'green', note: 'Treated with a full course of artemisinin-based therapy. Symptoms cleared at the follow-up call.' },
        { type: 'Lab', title: 'Full blood count', facilityName: 'Ningi PHC', date: '2026-08-12', statusLabel: 'Reviewed', statusTone: 'blue', note: 'Result uploaded by Ningi PHC and reviewed by the attending doctor.' },
        { type: 'Prescription', title: 'Folic acid and iron supplements', facilityName: 'ATBUTH General Hospital', date: '2026-08-10', statusLabel: 'Active', statusTone: 'blue', note: 'Renewed by Dr. Bello Suleiman. Continue until the next antenatal review.' },
        { type: 'Visit', title: 'Antenatal checkup', facilityName: 'Ningi PHC', date: '2026-07-02', statusLabel: 'Ongoing', statusTone: 'blue', note: 'Routine antenatal visit. Blood pressure and weight within the normal range.' },
        { type: 'Visit', title: 'Referral to ATBUTH', facilityName: 'Ningi PHC', date: '2026-06-28', statusLabel: 'Referred', statusTone: 'amber', note: 'Referred to ATBUTH General Hospital for specialist review.' },
    ].map((r) => ({ ...r, patient: pts.amina._id })));
}

// Referrals
if (!(await Referral.countDocuments())) {
    const from = docs.bello.user._id;
    await Referral.insertMany([
        { patient: pts.halima._id, fromDoctor: from, fromFacility: 'Ningi PHC', toFacility: 'ATBUTH Bauchi', reason: 'Specialist review', status: 'Pending' },
        { patient: pts.emeka._id, fromDoctor: from, fromFacility: 'Ganjuwa PHC', toFacility: 'ATBUTH Bauchi', reason: 'Lab escalation', status: 'Accepted' },
        { patient: pts.yakubu._id, fromDoctor: from, fromFacility: 'Kafin Zaki PHC', toFacility: 'Misau General', reason: 'Emergency transfer', status: 'In transit' },
    ]);
}

console.log(`Seeded database "${mongoose.connection.name}".`);
console.log('Demo logins (password = SEED_PASSWORD): amina.ibrahim@ (patient), bello.suleiman@ (doctor), zainab.musa@ (nurse), officer@ (officer), all @carelink.example');
await mongoose.disconnect();

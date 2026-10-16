// Removes the demo data created by older versions of CareLink (everything tied to @carelink.example accounts).
//   npm run purge-demo                    DRY RUN: only shows what would be deleted
//   npm run purge-demo -- --yes           deletes it
// Options: --facilities    also delete the three demo facilities if nothing real uses them
//          --reset-stats   also clear booking-attempt statistics (they include the demo bookings)
// Refuses to run unless a real (non-demo) Health Officer exists, so you cannot lock yourself out.
import 'dotenv/config';
import mongoose from 'mongoose';
import connectToDatabase from '../lib/db.mjs';
import User from '../models/User.mjs';
import Doctor from '../models/Doctor.mjs';
import Facility from '../models/Facility.mjs';
import Appointment from '../models/Appointment.mjs';
import Consultation from '../models/Consultation.mjs';
import Record from '../models/Record.mjs';
import Referral from '../models/Referral.mjs';
import BookingEvent from '../models/BookingEvent.mjs';

const args = new Set(process.argv.slice(2));
const run = args.has('--yes');
const DEMO = /@carelink\.example$/i;
const DEMO_FACILITIES = ['ATBUTH General Hospital \u2014 Bauchi', 'Misau General Hospital', 'Ningi Primary Health Centre'];

await connectToDatabase();

const demoUsers = await User.find({ email: DEMO }).select('_id email role');
const demoIds = demoUsers.map((u) => u._id);
const realOfficers = await User.countDocuments({ role: 'officer', active: true, email: { $not: DEMO } });
if (!realOfficers) {
    console.error('Stopped: there is no real, active Health Officer yet. Run "npm run create-admin" first, then try again.');
    await mongoose.disconnect(); process.exit(1);
}

const demoDoctors = await Doctor.find({ user: { $in: demoIds } }).select('_id');
const demoDoctorIds = demoDoctors.map((d) => d._id);
const appts = await Appointment.find({ $or: [{ patient: { $in: demoIds } }, { doctor: { $in: demoDoctorIds } }] }).select('_id patient');
const realPatientAppts = appts.filter((a) => !demoIds.some((id) => String(id) === String(a.patient))).length;
const consults = await Consultation.find({ $or: [{ patient: { $in: demoIds } }, { doctor: { $in: demoDoctorIds } }] }).select('_id');
const consultIds = consults.map((c) => c._id);
const recordFilter = { $or: [{ patient: { $in: demoIds } }, { consultation: { $in: consultIds } }, { rxConsultation: { $in: consultIds } }] };

const plan = {
    'demo accounts': demoUsers.length,
    'doctor profiles': demoDoctors.length,
    'appointments': appts.length,
    'consultations': consults.length,
    'records': await Record.countDocuments(recordFilter),
    'referrals': await Referral.countDocuments({ $or: [{ patient: { $in: demoIds } }, { fromDoctor: { $in: demoIds } }] }),
};
console.log(run ? 'Deleting:' : 'DRY RUN. Would delete:');
for (const [k, v] of Object.entries(plan)) console.log(`  ${String(v).padStart(4)}  ${k}`);
if (realPatientAppts) console.log(`  note: ${realPatientAppts} of those appointments belong to REAL patients who booked a demo doctor.`);
console.log(`  (the activity log is kept; real officer accounts: ${realOfficers})`);

if (run) {
    await Record.deleteMany(recordFilter);
    await Consultation.deleteMany({ _id: { $in: consultIds } });
    await Appointment.deleteMany({ _id: { $in: appts.map((a) => a._id) } });
    await Referral.deleteMany({ $or: [{ patient: { $in: demoIds } }, { fromDoctor: { $in: demoIds } }] });
    await Doctor.deleteMany({ _id: { $in: demoDoctorIds } });
    await User.deleteMany({ _id: { $in: demoIds } });
    if (args.has('--facilities')) {
        for (const f of await Facility.find({ name: { $in: DEMO_FACILITIES } })) {
            const used = (await Doctor.exists({ facility: f._id })) || (await Appointment.exists({ facility: f._id }));
            if (used) console.log(`  kept facility "${f.name}" (still used)`); else { await f.deleteOne(); console.log(`  removed facility "${f.name}"`); }
        }
    }
    if (args.has('--reset-stats')) { const r = await BookingEvent.deleteMany({}); console.log(`  cleared ${r.deletedCount} booking-attempt records`); }
    console.log('Done.');
} else {
    console.log('Nothing was changed. Re-run with --yes to delete.');
}
await mongoose.disconnect();

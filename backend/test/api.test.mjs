// Integration tests. Needs a MongoDB reachable at TEST_MONGO_URI (default mongodb://127.0.0.1:27017/carelink_test).
//   TEST_MONGO_URI=... npm test
// WARNING: wipes the target database. The runner refuses any database name that does not contain "test".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const uri = process.env.TEST_MONGO_URI ?? 'mongodb://127.0.0.1:27017/carelink_test';
if (!/test/i.test(uri)) throw new Error('Refusing to run: TEST_MONGO_URI must contain "test" in the database name.');

process.env.NODE_ENV = 'test';
process.env.MONGO_URI = uri;
process.env.JWT_SECRET = 'x'.repeat(48);
process.env.SERVE_FRONTEND = '0';
process.env.TZ_OFFSET_HOURS = '1';

const { createApp } = await import('../app.mjs');
const { default: connect } = await import('../lib/db.mjs');
const { default: mongoose } = await import('mongoose');
const { default: bcrypt } = await import('bcrypt');
const { addDays, todayISO, weekdayOf } = await import('../lib/utils.mjs');
const { joinState } = await import('../lib/video.mjs');
const M = Object.fromEntries(await Promise.all(['User', 'Facility', 'Doctor', 'Appointment', 'Consultation', 'Record', 'Referral', 'BookingEvent', 'AuditLog']
    .map(async (n) => [n, (await import(`../models/${n}.mjs`)).default])));

const PW = 'Test-passphrase-1';
let server, base, F1, F2, docA, docB, ids = {};

const api = async (method, url, { token, body } = {}) => {
    const res = await fetch(base + url, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
};
const login = async (local, role) => (await api('POST', '/api/auth/login', { body: { email: `${local}@test.example`, password: PW, role } })).data.token;
const nextDay = (days) => { let d = addDays(todayISO(), 1); while (!days.includes(weekdayOf(d))) d = addDays(d, 1); return d; };

async function fixtures() {
    for (const m of Object.values(M)) await m.deleteMany({});
    const password = await bcrypt.hash(PW, 4);
    const mk = (name, local, role, extra = {}) => M.User.create({ name, email: `${local}@test.example`, password, role, ...extra });
    [F1, F2] = await M.Facility.create([
        { name: 'Test Hospital One', shortName: 'Hospital One', lga: 'Bauchi' },
        { name: 'Test Clinic Two', shortName: 'Clinic Two', lga: 'Misau' },
    ]);
    await mk('Health Officer', 'officer', 'officer'); await mk('Nurse Admin', 'nurse', 'nurse');
    const dA = await mk('Dr. Alpha', 'doca', 'doctor'), dB = await mk('Dr. Beta', 'docb', 'doctor');
    docA = await M.Doctor.create({ user: dA._id, facility: F1._id, department: 'General Medicine', days: [0, 1, 2, 3, 4, 5, 6] });
    docB = await M.Doctor.create({ user: dB._id, facility: F2._id, department: 'Antenatal Care', days: [2, 4] });
    const pts = [];
    for (const [i, [name, lga]] of [['Pat One', 'Ningi'], ['Pat Two', 'Bauchi'], ['Pat Three', 'Ningi']].entries()) {
        pts.push(await mk(name, `p${i + 1}`, 'patient', { patientId: `PT-0000${i + 1}`, lga, age: 30 + i, sex: 'F' }));
    }
    ids = { p1: pts[0]._id, p2: pts[1]._id, p3: pts[2]._id };
    const today = todayISO();
    for (const [p, slot] of [[pts[0], '9:00 AM'], [pts[1], '10:30 AM'], [pts[2], '1:00 PM']]) {
        await M.Appointment.create({ patient: p._id, doctor: docA._id, facility: F1._id, department: 'General Medicine', date: today, slot, reason: 'Checkup', slotKey: `${docA._id}|${today}|${slot}` });
    }
}

before(async () => {
    await connect();
    await fixtures();
    server = createApp().listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); await mongoose.disconnect(); });

test('auth: wrong password, wrong role, no token, success', async () => {
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'p1@test.example', password: 'nope-nope' } })).status, 401);
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'p1@test.example', password: PW, role: 'doctor' } })).status, 403);
    assert.equal((await api('GET', '/api/doctors')).status, 401);
    const ok = await api('POST', '/api/auth/login', { body: { email: 'P1@test.example', password: PW, role: 'patient' } });
    assert.equal(ok.status, 200); assert.equal(ok.data.user.patientId, 'PT-00001'); assert.equal(ok.data.user.password, undefined);
});

test('auth: account locks after 5 wrong passwords and unlocks when the lock expires', async () => {
    const bad = () => api('POST', '/api/auth/login', { body: { email: 'p3@test.example', password: 'wrong-wrong-1' } });
    for (let i = 0; i < 5; i++) assert.equal((await bad()).status, 401);
    assert.equal((await bad()).status, 429, 'locked');
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'p3@test.example', password: PW } })).status, 429, 'even the right password is refused while locked');
    await M.User.updateOne({ email: 'p3@test.example' }, { $set: { lockUntil: new Date(Date.now() - 1000) } });
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'p3@test.example', password: PW } })).status, 200);
    assert.equal((await M.User.findOne({ email: 'p3@test.example' })).failedLogins, 0);
});

test('register: validates and creates a patient', async () => {
    const reg = (b) => api('POST', '/api/auth/register', { body: { name: 'New Patient', email: 'new@test.example', password: 'longenough1', lga: 'Ningi', ...b } });
    assert.equal((await reg({ name: ' ' })).status, 400);
    assert.equal((await reg({ email: 'bad' })).status, 400);
    assert.equal((await reg({ password: 'short' })).status, 400, 'under 10 characters');
    assert.equal((await reg({ lga: undefined })).status, 400, 'LGA required');
    assert.equal((await reg({ lga: 'Atlantis' })).status, 400, 'LGA must be one of the 20');
    assert.equal((await reg({ age: 150 })).status, 400);
    assert.equal((await reg({ sex: 'X' })).status, 400);
    const r = await reg({ age: '29', sex: 'F' });
    assert.equal(r.status, 201); assert.match(r.data.user.patientId, /^PT-\d{5}$/); assert.equal(r.data.user.role, 'patient'); assert.equal(r.data.user.lga, 'Ningi');
    assert.equal((await M.User.findOne({ email: 'new@test.example' })).age, 29);
    assert.equal((await reg({})).status, 409);
});

test('catalogue: facilities and doctors for a brand-new patient', async () => {
    const t = (await api('POST', '/api/auth/register', { body: { name: 'Fresh User', email: 'fresh@test.example', password: 'longenough1', lga: 'Bauchi' } })).data.token;
    assert.equal((await api('GET', '/api/facilities', { token: t })).data.facilities.length, 2);
    const docs = (await api('GET', '/api/doctors', { token: t })).data.doctors;
    assert.deepEqual(docs.map((d) => d.name).sort(), ['Dr. Alpha', 'Dr. Beta']);
    assert.ok(docs.every((d) => d.facilityId && d.department && d.days.length));
    const av = await api('GET', `/api/doctors/${docs[0].id}/availability?date=${addDays(todayISO(), 1)}`, { token: t });
    assert.equal(av.data.slots.length, 7);
});

test('dates: the server decides which days are bookable, in clinic time', async () => {
    const t = (await api('POST', '/api/auth/register', { body: { name: 'Date Tester', email: 'dates@test.example', password: 'longenough1', lga: 'Bauchi' } })).data.token;
    const get = async () => (await api('GET', '/api/doctors', { token: t })).data.doctors.find((d) => d.name === 'Dr. Beta');
    let beta = await get();
    assert.equal(beta.dates.length, 6);
    assert.ok(beta.dates.every((d) => d > todayISO() && beta.days.includes(weekdayOf(d))), 'all after today, on working days only');
    assert.deepEqual(beta.dates, [...beta.dates].sort());
    // clinic clock 14h ahead: "today" moves to the next date, so the list must move with it
    const prev = process.env.TZ_OFFSET_HOURS; process.env.TZ_OFFSET_HOURS = '14';
    try { const shifted = await get(); assert.ok(shifted.dates.every((d) => d > todayISO()), 'still strictly after the (shifted) clinic today'); }
    finally { process.env.TZ_OFFSET_HOURS = prev; }
    // every offered date is accepted by the booking endpoint
    const ok = await api('POST', '/api/appointments', { token: t, body: { doctorId: beta.id, date: beta.dates[0], slot: '9:00 AM' } });
    assert.equal(ok.status, 201);
});

test('booking: validation, conflict, race, cancel frees slot', async () => {
    const p1 = await login('p1', 'patient'), p2 = await login('p2', 'patient'), p3 = await login('p3', 'patient');
    const date = nextDay(docA.days);
    const book = (token, slot, d = date, doc = docA) => api('POST', '/api/appointments', { token, body: { doctorId: String(doc._id), date: d, slot, reason: 'Checkup' } });

    assert.equal((await book(p1, '3:33 AM')).status, 400, 'invalid slot');
    assert.equal((await book(p1, '9:00 AM', todayISO())).status, 400, 'today/past date');
    let wrongDay = addDays(date, 1); while (docB.days.includes(weekdayOf(wrongDay))) wrongDay = addDays(wrongDay, 1);
    assert.equal((await book(p1, '9:00 AM', wrongDay, docB)).status, 400, 'doctor off that weekday');

    const first = await book(p1, '9:00 AM'); assert.equal(first.status, 201);
    assert.equal(first.data.appointment.canJoin, false);
    const clash = await book(p2, '9:00 AM'); assert.equal(clash.status, 409); assert.equal(clash.data.code, 'SLOT_TAKEN');
    const av = await api('GET', `/api/doctors/${docA._id}/availability?date=${date}`, { token: p2 });
    assert.equal(av.data.slots.find((s) => s.time === '9:00 AM').taken, true);

    const [a, b] = await Promise.all([book(p2, '11:00 AM'), book(p3, '11:00 AM')]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409], 'exactly one winner of a simultaneous booking');

    assert.equal((await api('PATCH', `/api/appointments/${first.data.appointment.id}/cancel`, { token: p2 })).status, 404, "can't cancel someone else's");
    assert.equal((await api('PATCH', `/api/appointments/${first.data.appointment.id}/cancel`, { token: p1 })).status, 200);
    assert.equal((await book(p2, '9:00 AM')).status, 201, 'freed slot can be booked');
});

test('access control: roles are enforced server-side', async () => {
    const p1 = await login('p1', 'patient'), doca = await login('doca', 'doctor'), officer = await login('officer', 'officer');
    assert.equal((await api('GET', '/api/doctor/queue', { token: p1 })).status, 403);
    assert.equal((await api('GET', '/api/reports/summary', { token: doca })).status, 403);
    assert.equal((await api('GET', '/api/records/mine', { token: officer })).status, 403);
    assert.equal((await api('POST', '/api/appointments', { token: doca, body: {} })).status, 403);
    assert.equal((await api('GET', '/api/records/mine', { token: 'garbage' })).status, 401);
});

test('doctor: queue, consultation becomes visit + prescription records, history is scoped', async () => {
    const doca = await login('doca', 'doctor'), p1 = await login('p1', 'patient'), docb = await login('docb', 'doctor');
    const q = await api('GET', '/api/doctor/queue', { token: doca });
    assert.deepEqual(q.data.queue.map((x) => x.slot), ['9:00 AM', '10:30 AM', '1:00 PM'], 'sorted by time');
    const item = q.data.queue.find((x) => x.patient.name === 'Pat One');
    assert.equal(item.patient.age, 30);

    const put = (body) => api('PUT', '/api/doctor/consultations', { token: doca, body: { appointmentId: item.appointmentId, ...body } });
    assert.equal((await put({ diagnosis: '  ' })).status, 400);
    assert.equal((await put({ diagnosis: 'Malaria', prescription: 'Artemether-lumefantrine' })).status, 200);
    assert.equal((await put({ diagnosis: 'Malaria (uncomplicated)', prescription: 'Artemether-lumefantrine' })).status, 200, 'update, not duplicate');

    let recs = (await api('GET', '/api/records/mine', { token: p1 })).data.records;
    assert.equal(recs.filter((r) => r.type === 'Visit').length, 1);
    assert.equal(recs.filter((r) => r.type === 'Prescription').length, 1);
    assert.match(recs.find((r) => r.type === 'Visit').title, /uncomplicated/);
    await put({ diagnosis: 'Malaria (uncomplicated)', prescription: '' });
    recs = (await api('GET', '/api/records/mine', { token: p1 })).data.records;
    assert.equal(recs.filter((r) => r.type === 'Prescription').length, 0, 'prescription record removed when cleared');

    const after = (await api('GET', '/api/doctor/queue', { token: doca })).data.queue.find((x) => x.patient.name === 'Pat One');
    assert.equal(after.status, 'completed');
    assert.equal((await api('GET', `/api/doctor/patients/${item.patient.id}/history`, { token: doca })).status, 200);
    assert.equal((await api('GET', `/api/doctor/patients/${item.patient.id}/history`, { token: docb })).status, 403, 'unrelated doctor blocked');
    assert.equal((await api('PUT', '/api/doctor/consultations', { token: docb, body: { appointmentId: item.appointmentId, diagnosis: 'x' } })).status, 404);
});

test('referrals + reports', async () => {
    const doca = await login('doca', 'doctor'), officer = await login('officer', 'officer'), nurse = await login('nurse', 'nurse'), p1 = await login('p1', 'patient');
    const q = (await api('GET', '/api/doctor/queue', { token: doca })).data.queue[1];
    assert.equal((await api('POST', '/api/doctor/referrals', { token: doca, body: { appointmentId: q.appointmentId, toFacilityId: String(F1._id), reason: 'x' } })).status, 400, 'same facility');
    const ref = await api('POST', '/api/doctor/referrals', { token: doca, body: { appointmentId: q.appointmentId, toFacilityId: String(F2._id), reason: 'Specialist review' } });
    assert.equal(ref.status, 201);

    const mine = (await api('GET', '/api/referrals', { token: officer })).data.referrals.find((r) => r.id === String(ref.data.referralId));
    assert.equal(mine.status, 'Pending'); assert.equal(mine.to, 'Clinic Two');
    assert.equal((await api('PATCH', `/api/referrals/${mine.id}/status`, { token: doca, body: { status: 'Accepted' } })).status, 403);
    assert.equal((await api('PATCH', `/api/referrals/${mine.id}/status`, { token: nurse, body: { status: 'Pending' } })).status, 400);
    assert.equal((await api('PATCH', `/api/referrals/${mine.id}/status`, { token: nurse, body: { status: 'Accepted' } })).data.referral.status, 'Accepted');
    assert.equal((await api('GET', '/api/referrals', { token: p1 })).status, 403);

    const rep = (await api('GET', '/api/reports/summary', { token: officer })).data;
    assert.ok(rep.appointments30d >= 3); assert.equal(rep.weekly.length, 7); assert.equal(typeof rep.pendingReferrals, 'number');
    assert.ok(rep.lgaUsage.length > 0);
});

test('video: link only for the two people on the appointment, only inside the window', async () => {
    const p1 = await login('p1', 'patient'), p2 = await login('p2', 'patient'), doca = await login('doca', 'doctor'), docb = await login('docb', 'doctor');
    const date = nextDay(docA.days);
    const booked = await api('POST', '/api/appointments', { token: p1, body: { doctorId: String(docA._id), date, slot: '2:30 PM' } });
    const id = booked.data.appointment.id;
    const early = await api('GET', `/api/appointments/${id}/join`, { token: p1 });
    assert.equal(early.status, 403); assert.match(early.data.message, /opens 15 minutes before/);
    assert.equal((await api('GET', `/api/appointments/${id}/join`, { token: p2 })).status, 404, 'other patient');
    assert.equal((await api('GET', `/api/doctor/appointments/${id}/join`, { token: doca })).status, 403, 'doctor also waits for the window');
    assert.equal((await api('GET', `/api/doctor/appointments/${id}/join`, { token: docb })).status, 404, 'other doctor');

    // pure window maths
    const a = { date: '2026-06-10', slot: '9:00 AM', status: 'booked' }; // 09:00 at UTC+1 = 08:00Z
    const t = Date.UTC(2026, 5, 10, 8, 0);
    assert.equal(joinState(a, t - 16 * 60000).canJoin, false); assert.equal(joinState(a, t - 14 * 60000).canJoin, true);
    assert.equal(joinState(a, t + 89 * 60000).canJoin, true); assert.equal(joinState(a, t + 91 * 60000).canJoin, false);
    assert.equal(joinState({ ...a, status: 'cancelled' }, t).canJoin, false);

    // inside the window: pretend the clinic clock reads 09:05 today
    const prev = process.env.TZ_OFFSET_HOURS, now = new Date();
    process.env.TZ_OFFSET_HOURS = String(9 + 5 / 60 - (now.getUTCHours() + now.getUTCMinutes() / 60));
    try {
        const today = todayISO();
        const live = await M.Appointment.create({ patient: ids.p2, doctor: docA._id, facility: F1._id, department: 'General Medicine', date: today, slot: '9:00 AM', slotKey: `${docA._id}|${today}|9:00 AM|live` });
        const j1 = await api('GET', `/api/appointments/${live._id}/join`, { token: p2 });
        assert.equal(j1.status, 200); assert.match(j1.data.url, /^https:\/\/meet\.jit\.si\/CareLink-[0-9a-f]{24}$/);
        const j2 = await api('GET', `/api/doctor/appointments/${live._id}/join`, { token: doca });
        assert.equal(j2.data.url, j1.data.url, 'patient and doctor land in the same room');
        const q = (await api('GET', '/api/doctor/queue', { token: doca })).data.queue.find((x) => x.appointmentId === String(live._id));
        assert.equal(q.canJoin, true);
        await M.Appointment.updateOne({ _id: live._id }, { $set: { status: 'cancelled' }, $unset: { slotKey: 1 } });
        assert.equal((await api('GET', `/api/appointments/${live._id}/join`, { token: p2 })).status, 409, 'cancelled');
    } finally { process.env.TZ_OFFSET_HOURS = prev; }
});

test('admin: only officers manage users; create staff with a one-time temporary password', async () => {
    const officer = await login('officer', 'officer'), nurse = await login('nurse', 'nurse'), p1 = await login('p1', 'patient');
    assert.equal((await api('GET', '/api/admin/users', { token: nurse })).status, 403);
    assert.equal((await api('GET', '/api/admin/users', { token: p1 })).status, 403);
    assert.equal((await api('GET', '/api/admin/users')).status, 401);

    const bad = (body) => api('POST', '/api/admin/users', { token: officer, body });
    const f = String(F1._id);
    assert.equal((await bad({ name: 'X', email: 'nope', role: 'doctor' })).status, 400, 'bad email');
    assert.equal((await bad({ name: 'X Y', email: 'x@y.co', role: 'patient' })).status, 400, 'cannot create patients here');
    assert.equal((await bad({ name: 'Dr New', email: 'dr.new@test.example', role: 'doctor', facilityId: f, department: 'Paediatrics', days: [] })).status, 400, 'doctor needs days');
    assert.equal((await bad({ name: 'Dr New', email: 'doca@test.example', role: 'doctor', facilityId: f, department: 'Paediatrics', days: [1] })).status, 409, 'duplicate email');

    const created = await bad({ name: 'Dr. Ngozi Eze', email: 'Ngozi.Eze@test.example', role: 'doctor', facilityId: f, department: 'Paediatrics', days: [1, 3, 3] });
    assert.equal(created.status, 201);
    const temp = created.data.temporaryPassword;
    assert.ok(temp.length >= 14); assert.equal(created.data.user.mustChangePassword, true);
    assert.equal(JSON.stringify(created.data).includes('$2'), false, 'no hash leaked');
    assert.deepEqual(created.data.user.doctor.days, [1, 3]);

    const first = await api('POST', '/api/auth/login', { body: { email: 'ngozi.eze@test.example', password: temp, role: 'doctor' } });
    assert.equal(first.status, 200); assert.equal(first.data.user.mustChangePassword, true);
    const t = first.data.token;
    assert.equal((await api('POST', '/api/auth/change-password', { token: t, body: { currentPassword: 'wrong-wrong', newPassword: 'a-new-passphrase-1' } })).status, 401);
    assert.equal((await api('POST', '/api/auth/change-password', { token: t, body: { currentPassword: temp, newPassword: 'short' } })).status, 400);
    assert.equal((await api('POST', '/api/auth/change-password', { token: t, body: { currentPassword: temp, newPassword: 'a-new-passphrase-1' } })).data.user.mustChangePassword, false);
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'ngozi.eze@test.example', password: temp } })).status, 401, 'old temp password dead');
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'ngozi.eze@test.example', password: 'a-new-passphrase-1' } })).status, 200);
    assert.ok((await api('GET', '/api/doctors', { token: p1 })).data.doctors.some((d) => d.name === 'Dr. Ngozi Eze'));
});

test('admin: disable/enable, reset password, self-protection, filters', async () => {
    const officer = await login('officer', 'officer'), p1 = await login('p1', 'patient');
    const users = (await api('GET', '/api/admin/users', { token: officer })).data.users;
    assert.equal(users.some((u) => 'password' in u), false);
    assert.ok((await api('GET', '/api/admin/users?role=doctor', { token: officer })).data.users.every((u) => u.role === 'doctor'));
    assert.equal((await api('GET', '/api/admin/users?q=ngozi', { token: officer })).data.users.length, 1);
    assert.equal((await api('GET', '/api/admin/users?role=hacker', { token: officer })).status, 400);
    assert.equal((await api('GET', '/api/admin/users?q=.*', { token: officer })).data.users.length, 0, 'regex input is escaped');

    const me = users.find((u) => u.email === 'officer@test.example');
    assert.equal((await api('PATCH', `/api/admin/users/${me.id}`, { token: officer, body: { active: false } })).status, 400, 'cannot disable self');

    const docbTok = await login('docb', 'doctor');
    const docb = users.find((u) => u.email === 'docb@test.example');
    const fd = addDays(todayISO(), 2);
    await M.Appointment.create({ patient: ids.p1, doctor: docb.doctor.id, facility: F2._id, department: 'Antenatal Care', date: fd, slot: '9:00 AM', slotKey: `${docb.doctor.id}|${fd}|9:00 AM|warn` });
    const off = await api('PATCH', `/api/admin/users/${docb.id}`, { token: officer, body: { active: false } });
    assert.equal(off.status, 200); assert.equal(off.data.user.active, false);
    const remaining = await M.Appointment.countDocuments({ doctor: docb.doctor.id, status: 'booked', date: { $gte: todayISO() } });
    assert.ok(remaining >= 1); assert.equal(off.data.futureAppointments, remaining, 'admin is told how many upcoming appointments remain with the disabled doctor');
    assert.equal((await api('GET', '/api/doctor/queue', { token: docbTok })).status, 401, 'old token rejected immediately');
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'docb@test.example', password: PW } })).status, 401);
    assert.equal((await api('GET', '/api/doctors', { token: p1 })).data.doctors.some((d) => d.name === 'Dr. Beta'), false, 'hidden from booking');
    assert.equal((await api('POST', '/api/appointments', { token: p1, body: { doctorId: docb.doctor.id, date: nextDay(docb.doctor.days), slot: '1:00 PM' } })).status, 400, 'booking disabled doctor refused');

    assert.equal((await api('PATCH', `/api/admin/users/${docb.id}`, { token: officer, body: { active: true, days: [1, 2] } })).data.user.doctor.days.join(), '1,2');
    const reset = await api('POST', `/api/admin/users/${docb.id}/reset-password`, { token: officer });
    const re = await api('POST', '/api/auth/login', { body: { email: 'docb@test.example', password: reset.data.temporaryPassword } });
    assert.equal(re.status, 200); assert.equal(re.data.user.mustChangePassword, true);
    assert.equal((await api('PATCH', `/api/admin/users/not-an-id`, { token: officer, body: { active: false } })).status, 400, 'bad id');
    assert.equal((await api('PATCH', `/api/admin/users/${me.id}`, { token: officer, body: { days: [1] } })).status, 400, 'non-doctor has no working days');

    // reset also lifts a lock
    for (let i = 0; i < 5; i++) await api('POST', '/api/auth/login', { body: { email: 'docb@test.example', password: 'wrong-wrong-1' } });
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'docb@test.example', password: 'wrong-wrong-1' } })).status, 429);
    const reset2 = await api('POST', `/api/admin/users/${docb.id}/reset-password`, { token: officer });
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'docb@test.example', password: reset2.data.temporaryPassword } })).status, 200);
});

test('admin: facilities and audit log', async () => {
    const officer = await login('officer', 'officer'), nurse = await login('nurse', 'nurse');
    const body = { name: 'Alkaleri Primary Health Centre', shortName: 'Alkaleri PHC', lga: 'Alkaleri' };
    assert.equal((await api('POST', '/api/admin/facilities', { token: nurse, body })).status, 403);
    assert.equal((await api('POST', '/api/admin/facilities', { token: officer, body: { ...body, name: '' } })).status, 400);
    assert.equal((await api('POST', '/api/admin/facilities', { token: officer, body: { ...body, lga: 'Nowhere' } })).status, 400, 'LGA must be valid');
    assert.equal((await api('POST', '/api/admin/facilities', { token: officer, body })).status, 201);
    assert.equal((await api('POST', '/api/admin/facilities', { token: officer, body })).status, 409);
    assert.ok((await api('GET', '/api/facilities', { token: nurse })).data.facilities.some((x) => x.shortName === 'Alkaleri PHC'));

    const log = (await api('GET', '/api/admin/audit?limit=100', { token: officer })).data.entries;
    const actions = log.map((e) => e.action);
    for (const a of ['user.create', 'user.disable', 'user.enable', 'user.reset-password', 'facility.create']) assert.ok(actions.includes(a), 'audit has ' + a);
    assert.equal(JSON.stringify(log).includes(PW), false, 'no passwords in the audit log');
    assert.equal((await api('GET', '/api/admin/audit', { token: nurse })).status, 403);
});

test('misc: bad JSON, unknown API route, health', async () => {
    const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(res.status, 400);
    assert.equal((await api('GET', '/api/nope')).status, 404);
    assert.equal((await api('GET', '/api/health')).data.status, 'ok');
});

/* ---------- scripts (run last: they change data) ---------- */
const script = (name, env = {}) => spawnSync('node', [`scripts/${name}`, ...(env.ARGS ?? [])], { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });

test('script: create-admin makes a Health Officer who can sign in, and refuses duplicates', async () => {
    const env = { ADMIN_NAME: 'First Admin', ADMIN_EMAIL: 'First.Admin@test.example', ADMIN_PASSWORD: 'a-long-admin-pass-1' };
    assert.equal(script('create-admin.mjs', { ...env, ADMIN_PASSWORD: 'short' }).status, 1, 'weak password refused');
    const r = script('create-admin.mjs', env); assert.equal(r.status, 0, r.stderr);
    const l = await api('POST', '/api/auth/login', { body: { email: 'first.admin@test.example', password: env.ADMIN_PASSWORD, role: 'officer' } });
    assert.equal(l.status, 200); assert.equal(l.data.user.mustChangePassword, false);
    assert.equal(script('create-admin.mjs', env).status, 1, 'duplicate refused');
});

test('script: purge-demo removes only @carelink.example data and protects against lock-out', async () => {
    const pwd = await bcrypt.hash(PW, 4);
    const demoDoc = await M.User.create({ name: 'Dr. Demo', email: 'demo.doc@carelink.example', password: pwd, role: 'doctor' });
    const demoPat = await M.User.create({ name: 'Demo Patient', email: 'demo.pat@carelink.example', password: pwd, role: 'patient', patientId: 'PT-99999', lga: 'Ningi' });
    const demoProfile = await M.Doctor.create({ user: demoDoc._id, facility: F1._id, department: 'General Medicine', days: [1] });
    const mkAppt = (patient, doctor, slot) => M.Appointment.create({ patient, doctor, facility: F1._id, department: 'General Medicine', date: addDays(todayISO(), 3), slot, slotKey: `${doctor}|purge|${slot}` });
    const demoAppt = await mkAppt(demoPat._id, docA._id, '9:30 AM');            // demo patient with a REAL doctor
    const realWithDemoDoc = await mkAppt(ids.p1, demoProfile._id, '10:30 AM');    // REAL patient with a DEMO doctor
    const realAppt = await mkAppt(ids.p1, docA._id, '11:30 AM');                  // all real
    const c = await M.Consultation.create({ appointment: realWithDemoDoc._id, patient: ids.p1, doctor: demoProfile._id, diagnosis: 'x' });
    await M.Record.create({ patient: ids.p1, type: 'Visit', title: 'from demo doctor', date: todayISO(), consultation: c._id });
    await M.Record.create({ patient: demoPat._id, type: 'Visit', title: 'demo record', date: todayISO() });
    await M.Referral.create({ patient: demoPat._id, fromDoctor: demoDoc._id, fromFacility: 'a', toFacility: 'b', reason: 'demo' });

    // dry run changes nothing
    const dry = script('purge-demo-data.mjs'); assert.equal(dry.status, 0, dry.stderr); assert.match(dry.stdout, /DRY RUN/);
    assert.equal(await M.User.countDocuments({ email: /@carelink\.example$/ }), 2);

    // refuses when no real officer exists
    await M.User.updateMany({ role: 'officer', email: { $not: /@carelink\.example$/ } }, { $set: { active: false } });
    const blocked = script('purge-demo-data.mjs', { ARGS: ['--yes'] });
    assert.equal(blocked.status, 1); assert.match(blocked.stderr, /no real, active Health Officer/);
    assert.equal(await M.User.countDocuments({ email: /@carelink\.example$/ }), 2, 'nothing deleted');
    await M.User.updateMany({ role: 'officer' }, { $set: { active: true } });

    const run = script('purge-demo-data.mjs', { ARGS: ['--yes'] }); assert.equal(run.status, 0, run.stderr); assert.match(run.stdout, /REAL patients/);
    assert.equal(await M.User.countDocuments({ email: /@carelink\.example$/ }), 0);
    assert.equal(await M.Doctor.countDocuments({ _id: demoProfile._id }), 0);
    assert.equal(await M.Appointment.countDocuments({ _id: { $in: [demoAppt._id, realWithDemoDoc._id] } }), 0);
    assert.equal(await M.Appointment.countDocuments({ _id: realAppt._id }), 1, 'real appointment untouched');
    assert.equal(await M.Record.countDocuments({ title: { $in: ['from demo doctor', 'demo record'] } }), 0);
    assert.equal(await M.Referral.countDocuments({ reason: 'demo' }), 0);
    assert.ok(await M.User.exists({ email: 'p1@test.example' }), 'real patient kept');
    assert.ok(await M.Doctor.exists({ _id: docA._id }), 'real doctor kept');
});

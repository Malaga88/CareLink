// Integration tests. Needs a MongoDB reachable at TEST_MONGO_URI (default mongodb://127.0.0.1:27017/carelink_test).
//   TEST_MONGO_URI=... SEED_PASSWORD=... npm test
// WARNING: wipes the target database. Never point this at your real cluster/database.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
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
const PW = process.env.SEED_PASSWORD ?? 'Demo-pass-123';
process.env.SEED_PASSWORD = PW;

const { createApp } = await import('../app.mjs');
const { default: connect } = await import('../lib/db.mjs');
const { default: mongoose } = await import('mongoose');
const { addDays, todayISO, weekdayOf } = await import('../lib/utils.mjs');

let server, base;
const api = async (method, url, { token, body } = {}) => {
    const res = await fetch(base + url, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined,
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
};
const login = async (local, role) => (await api('POST', '/api/auth/login', { body: { email: `${local}@carelink.example`, password: PW, role } })).data.token;
const nextDay = (days) => { let d = addDays(todayISO(), 1); while (!days.includes(weekdayOf(d))) d = addDays(d, 1); return d; };

before(async () => {
    execFileSync('node', ['scripts/seed.mjs', '--reset'], { cwd: root, env: process.env, stdio: 'pipe' });
    await connect();
    server = createApp().listen(0);
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server?.close(); await mongoose.disconnect(); });

test('auth: wrong password, wrong role, no token, success', async () => {
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'amina.ibrahim@carelink.example', password: 'nope-nope' } })).status, 401);
    assert.equal((await api('POST', '/api/auth/login', { body: { email: 'amina.ibrahim@carelink.example', password: PW, role: 'doctor' } })).status, 403);
    assert.equal((await api('GET', '/api/doctors')).status, 401);
    const ok = await api('POST', '/api/auth/login', { body: { email: 'AMINA.ibrahim@carelink.example', password: PW, role: 'patient' } });
    assert.equal(ok.status, 200); assert.equal(ok.data.user.patientId, 'PT-04821');
    assert.equal(ok.data.user.password, undefined);
});

test('register: validates and creates a patient', async () => {
    assert.equal((await api('POST', '/api/auth/register', { body: { name: 'A', email: 'bad', password: 'longenough1' } })).status, 400);
    assert.equal((await api('POST', '/api/auth/register', { body: { name: 'A B', email: 'ab@x.co', password: 'short' } })).status, 400);
    const r = await api('POST', '/api/auth/register', { body: { name: 'New Patient', email: 'new.patient@carelink.example', password: 'longenough1', lga: 'Bauchi' } });
    assert.equal(r.status, 201); assert.match(r.data.user.patientId, /^PT-\d{5}$/); assert.equal(r.data.user.role, 'patient');
    assert.equal((await api('POST', '/api/auth/register', { body: { name: 'New Patient', email: 'new.patient@carelink.example', password: 'longenough1' } })).status, 409);
});

test('booking: validation, conflict, race, cancel frees slot', async () => {
    const amina = await login('amina.ibrahim', 'patient'), fatima = await login('fatima.aliyu', 'patient'), musa = await login('musa.abdullahi', 'patient');
    const { data: { doctors } } = await api('GET', '/api/doctors', { token: amina });
    const hauwa = doctors.find((d) => d.name === 'Dr. Hauwa Garba'), date = nextDay(hauwa.days);
    const book = (token, slot, d = date) => api('POST', '/api/appointments', { token, body: { doctorId: hauwa.id, date: d, slot, reason: 'Checkup' } });

    assert.equal((await book(amina, '3:33 AM')).status, 400, 'invalid slot');
    assert.equal((await book(amina, '9:00 AM', todayISO())).status, 400, 'today/past date');
    let wrongDay = addDays(date, 1); while (hauwa.days.includes(weekdayOf(wrongDay))) wrongDay = addDays(wrongDay, 1);
    assert.equal((await book(amina, '9:00 AM', wrongDay)).status, 400, 'doctor off that weekday');

    const first = await book(amina, '9:00 AM'); assert.equal(first.status, 201);
    const clash = await book(fatima, '9:00 AM'); assert.equal(clash.status, 409); assert.equal(clash.data.code, 'SLOT_TAKEN');

    const av = await api('GET', `/api/doctors/${hauwa.id}/availability?date=${date}`, { token: fatima });
    assert.equal(av.data.slots.find((s) => s.time === '9:00 AM').taken, true);

    // Race: two patients, same slot, same instant -> exactly one winner
    const [a, b] = await Promise.all([book(fatima, '11:00 AM'), book(musa, '11:00 AM')]);
    assert.deepEqual([a.status, b.status].sort(), [201, 409]);

    // Cancel frees the slot
    assert.equal((await api('PATCH', `/api/appointments/${first.data.appointment.id}/cancel`, { token: fatima })).status, 404, "can't cancel someone else's");
    assert.equal((await api('PATCH', `/api/appointments/${first.data.appointment.id}/cancel`, { token: amina })).status, 200);
    assert.equal((await book(fatima, '9:00 AM')).status, 201);
});

test('access control: roles are enforced server-side', async () => {
    const amina = await login('amina.ibrahim', 'patient'), bello = await login('bello.suleiman', 'doctor'), officer = await login('officer', 'officer');
    assert.equal((await api('GET', '/api/doctor/queue', { token: amina })).status, 403);
    assert.equal((await api('GET', '/api/reports/summary', { token: bello })).status, 403);
    assert.equal((await api('GET', '/api/records/mine', { token: officer })).status, 403);
    assert.equal((await api('POST', '/api/appointments', { token: bello, body: {} })).status, 403);
    assert.equal((await api('GET', '/api/records/mine', { token: 'garbage' })).status, 401);
});

test('doctor: queue, consultation saves into patient record, history is scoped', async () => {
    const bello = await login('bello.suleiman', 'doctor'), amina = await login('amina.ibrahim', 'patient'), hauwa = await login('hauwa.garba', 'doctor');
    const q = await api('GET', '/api/doctor/queue', { token: bello });
    assert.equal(q.data.queue.length, 6);
    assert.deepEqual(q.data.queue.map((x) => x.slot), ['9:00 AM', '10:30 AM', '11:00 AM', '11:30 AM', '1:00 PM', '2:30 PM'], 'sorted by time');
    const item = q.data.queue.find((x) => x.patient.name === 'Amina Ibrahim');

    assert.equal((await api('PUT', '/api/doctor/consultations', { token: bello, body: { appointmentId: item.appointmentId, diagnosis: '  ' } })).status, 400);
    const save = await api('PUT', '/api/doctor/consultations', { token: bello, body: { appointmentId: item.appointmentId, diagnosis: 'Routine antenatal follow-up', prescription: 'Folic acid' } });
    assert.equal(save.status, 200);
    // idempotent update, not a duplicate
    await api('PUT', '/api/doctor/consultations', { token: bello, body: { appointmentId: item.appointmentId, diagnosis: 'Routine antenatal follow-up (28 wks)', prescription: 'Folic acid' } });

    const recs = (await api('GET', '/api/records/mine', { token: amina })).data.records;
    assert.equal(recs.filter((r) => r.title.startsWith('Consultation')).length, 1);
    assert.equal((await api('GET', '/api/doctor/queue', { token: bello })).data.queue.find((x) => x.patient.name === 'Amina Ibrahim').status, 'completed');

    assert.equal((await api('GET', `/api/doctor/patients/${item.patient.id}/history`, { token: bello })).status, 200);
    assert.equal((await api('GET', `/api/doctor/patients/${item.patient.id}/history`, { token: hauwa })).status, 403, 'unrelated doctor blocked');
    // a doctor cannot touch another doctor's appointment
    assert.equal((await api('PUT', '/api/doctor/consultations', { token: hauwa, body: { appointmentId: item.appointmentId, diagnosis: 'x' } })).status, 404);
});

test('referrals + reports', async () => {
    const bello = await login('bello.suleiman', 'doctor'), officer = await login('officer', 'officer'), nurse = await login('zainab.musa', 'nurse'), amina = await login('amina.ibrahim', 'patient');
    const q = (await api('GET', '/api/doctor/queue', { token: bello })).data.queue[2];
    const { data: { facilities } } = await api('GET', '/api/facilities', { token: bello });
    const own = facilities.find((f) => f.shortName === 'ATBUTH Bauchi'), other = facilities.find((f) => f.shortName === 'Misau General');

    assert.equal((await api('POST', '/api/doctor/referrals', { token: bello, body: { appointmentId: q.appointmentId, toFacilityId: own.id, reason: 'x' } })).status, 400, 'same facility');
    const ref = await api('POST', '/api/doctor/referrals', { token: bello, body: { appointmentId: q.appointmentId, toFacilityId: other.id, reason: 'Specialist review' } });
    assert.equal(ref.status, 201);

    const list = (await api('GET', '/api/referrals', { token: officer })).data.referrals;
    const mine = list.find((r) => r.id === String(ref.data.referralId));
    assert.equal(mine.status, 'Pending'); assert.equal(mine.to, 'Misau General');
    assert.equal((await api('PATCH', `/api/referrals/${mine.id}/status`, { token: bello, body: { status: 'Accepted' } })).status, 403);
    assert.equal((await api('PATCH', `/api/referrals/${mine.id}/status`, { token: nurse, body: { status: 'Pending' } })).status, 400);
    assert.equal((await api('PATCH', `/api/referrals/${mine.id}/status`, { token: nurse, body: { status: 'Accepted' } })).data.referral.status, 'Accepted');
    assert.equal((await api('GET', '/api/referrals', { token: amina })).status, 403);

    const rep = (await api('GET', '/api/reports/summary', { token: officer })).data;
    assert.ok(rep.appointments30d >= 7); assert.ok(rep.conflictRatePct > 0, 'conflicts were recorded');
    assert.equal(rep.weekly.length, 7); assert.ok(rep.lgaUsage.length > 0); assert.equal(typeof rep.pendingReferrals, 'number');
});

test('misc: bad JSON, unknown API route, health', async () => {
    const res = await fetch(base + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{bad' });
    assert.equal(res.status, 400);
    assert.equal((await api('GET', '/api/nope')).status, 404);
    assert.equal((await api('GET', '/api/health')).data.status, 'ok');
});

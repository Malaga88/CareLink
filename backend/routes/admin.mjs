import { Router } from 'express';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import User from '../models/User.mjs';
import Doctor from '../models/Doctor.mjs';
import Facility from '../models/Facility.mjs';
import Appointment from '../models/Appointment.mjs';
import AuditLog from '../models/AuditLog.mjs';
import { authenticate, requireRole } from '../middleware/auth.mjs';
import { audit } from '../lib/audit.mjs';
import { LGAS, ROLES } from '../lib/constants.mjs';
import { HttpError, escapeRegex, isNonEmptyString, publicUser, tempPassword, todayISO } from '../lib/utils.mjs';

// Account and facility management is limited to Health Officers.
const router = Router();
router.use(authenticate, requireRole('officer'));

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const STAFF_ROLES = ['doctor', 'nurse', 'officer'];
const validDays = (d) => Array.isArray(d) && d.length > 0 && d.length <= 7 && d.every((x) => Number.isInteger(x) && x >= 0 && x <= 6);
const loadId = (id, what = 'user') => { if (!mongoose.isValidObjectId(id)) throw new HttpError(400, `Invalid ${what}`); return id; };

const view = (u, doc) => ({
    ...publicUser(u), active: u.active, createdAt: u.createdAt,
    doctor: doc ? { id: doc._id, department: doc.department, days: doc.days, facility: doc.facility?.shortName ?? null, facilityId: doc.facility?._id ?? null } : null,
});

/* ---------- users ---------- */
router.get('/users', async (req, res) => {
    const { role, q } = req.query;
    const filter = {};
    if (role) { if (!ROLES.includes(role)) throw new HttpError(400, 'Unknown role'); filter.role = role; }
    if (isNonEmptyString(q)) { const rx = new RegExp(escapeRegex(q.trim().slice(0, 60)), 'i'); filter.$or = [{ name: rx }, { email: rx }]; }

    const users = await User.find(filter).sort({ role: 1, name: 1 }).limit(200);
    const docs = await Doctor.find({ user: { $in: users.map((u) => u._id) } }).populate('facility', 'shortName');
    const byUser = new Map(docs.map((d) => [String(d.user), d]));
    res.json({ users: users.map((u) => view(u, byUser.get(String(u._id)))) });
});

router.post('/users', async (req, res) => {
    const { name, email, role, facilityId, department, days } = req.body ?? {};
    if (!isNonEmptyString(name) || name.trim().length > 80) throw new HttpError(400, 'Enter the full name');
    if (!isNonEmptyString(email) || !EMAIL_RE.test(email.trim())) throw new HttpError(400, 'Enter a valid email address');
    if (!STAFF_ROLES.includes(role)) throw new HttpError(400, 'Role must be doctor, nurse or officer');

    let facility;
    if (role === 'doctor') {
        if (!mongoose.isValidObjectId(facilityId)) throw new HttpError(400, 'Choose the doctor\u2019s facility');
        facility = await Facility.findById(facilityId);
        if (!facility) throw new HttpError(404, 'Facility not found');
        if (!isNonEmptyString(department) || department.trim().length > 60) throw new HttpError(400, 'Enter the department');
        if (!validDays(days)) throw new HttpError(400, 'Choose at least one working day');
    }

    const cleanEmail = email.trim().toLowerCase();
    if (await User.exists({ email: cleanEmail })) throw new HttpError(409, 'An account with this email already exists');

    const temp = tempPassword();
    const user = await User.create({
        name: name.trim(), email: cleanEmail, role, password: await bcrypt.hash(temp, 10), mustChangePassword: true,
    });
    let profile = null;
    if (role === 'doctor') {
        try {
            profile = await Doctor.create({ user: user._id, facility: facility._id, department: department.trim(), days: [...new Set(days)].sort() });
        } catch (error) {
            await User.deleteOne({ _id: user._id }); // keep user + profile consistent
            throw error;
        }
    }
    await audit(req, 'user.create', 'user', user, `${user.email} (${role})`);
    // The temporary password is shown ONCE here and is never stored in readable form.
    await profile?.populate('facility', 'shortName');
    res.status(201).json({ user: view(user, profile), temporaryPassword: temp });
});

router.patch('/users/:id', async (req, res) => {
    const user = await User.findById(loadId(req.params.id));
    if (!user) throw new HttpError(404, 'User not found');
    const { active, name, department, days } = req.body ?? {};
    const changes = [];

    if (active !== undefined) {
        if (typeof active !== 'boolean') throw new HttpError(400, 'active must be true or false');
        if (String(user._id) === String(req.user._id) && !active) throw new HttpError(400, 'You cannot disable your own account');
        if (user.active !== active) { user.active = active; changes.push(active ? 'enable' : 'disable'); }
        if (active) { user.failedLogins = 0; user.lockUntil = undefined; }
    }
    if (name !== undefined) {
        if (!isNonEmptyString(name) || name.trim().length > 80) throw new HttpError(400, 'Enter a valid name');
        user.name = name.trim(); changes.push('rename');
    }
    let doc = null;
    if (department !== undefined || days !== undefined) {
        doc = await Doctor.findOne({ user: user._id });
        if (!doc) throw new HttpError(400, 'Only doctors have a department and working days');
        if (department !== undefined) { if (!isNonEmptyString(department) || department.trim().length > 60) throw new HttpError(400, 'Enter the department'); doc.department = department.trim(); }
        if (days !== undefined) { if (!validDays(days)) throw new HttpError(400, 'Choose at least one working day'); doc.days = [...new Set(days)].sort(); }
        await doc.save(); changes.push('doctor-profile');
    }
    await user.save();

    // Disabling a doctor does not cancel appointments already booked; tell the admin how many exist.
    let futureAppointments;
    if (changes.includes('disable')) {
        const profile = doc ?? await Doctor.findOne({ user: user._id });
        if (profile) futureAppointments = await Appointment.countDocuments({ doctor: profile._id, status: 'booked', date: { $gte: todayISO() } });
    }
    for (const c of changes) await audit(req, `user.${c}`, 'user', user, user.email);

    doc = doc ?? await Doctor.findOne({ user: user._id });
    await doc?.populate('facility', 'shortName');
    res.json({ user: view(user, doc), futureAppointments });
});

router.post('/users/:id/reset-password', async (req, res) => {
    const user = await User.findById(loadId(req.params.id));
    if (!user) throw new HttpError(404, 'User not found');
    const temp = tempPassword();
    user.password = await bcrypt.hash(temp, 10);
    user.mustChangePassword = true;
    user.failedLogins = 0; user.lockUntil = undefined; // also unlocks a locked account
    await user.save();
    await audit(req, 'user.reset-password', 'user', user, user.email);
    res.json({ temporaryPassword: temp });
});

/* ---------- facilities ---------- */
router.post('/facilities', async (req, res) => {
    const { name, shortName, lga } = req.body ?? {};
    if (!isNonEmptyString(name) || name.trim().length > 120) throw new HttpError(400, 'Enter the facility name');
    if (!isNonEmptyString(shortName) || shortName.trim().length > 40) throw new HttpError(400, 'Enter a short name (40 characters maximum)');
    if (!LGAS.includes(lga)) throw new HttpError(400, 'Choose the facility\u2019s local government area');
    if (await Facility.exists({ name: name.trim() })) throw new HttpError(409, 'A facility with this name already exists');
    const f = await Facility.create({ name: name.trim(), shortName: shortName.trim(), lga });
    await audit(req, 'facility.create', 'facility', f, f.name);
    res.status(201).json({ facility: { id: f._id, name: f.name, shortName: f.shortName, lga: f.lga } });
});

/* ---------- audit log ---------- */
router.get('/audit', async (req, res) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const rows = await AuditLog.find().sort({ at: -1 }).limit(limit).lean();
    res.json({ entries: rows.map((r) => ({ id: r._id, at: r.at, actor: r.actorName, action: r.action, target: r.targetLabel })) });
});

export default router;

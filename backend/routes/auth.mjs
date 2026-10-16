import { Router } from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.mjs';
import { authenticate, signToken } from '../middleware/auth.mjs';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiters.mjs';
import { LGAS } from '../lib/constants.mjs';
import { HttpError, isNonEmptyString, publicUser } from '../lib/utils.mjs';

const router = Router();

// Compared against when the email is unknown so response time doesn't reveal valid emails.
const DUMMY_HASH = await bcrypt.hash('not-a-real-password', 10);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const MIN_PASSWORD = 10;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;

router.post('/login', loginLimiter, async (req, res) => {
    const { email, password, role } = req.body ?? {};
    if (!isNonEmptyString(email) || typeof password !== 'string' || !password) {
        throw new HttpError(400, 'Email and password are required');
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (user?.lockUntil && user.lockUntil > new Date()) {
        throw new HttpError(429, 'Too many wrong passwords. This account is locked for 15 minutes.');
    }

    const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !ok || !user.active) {
        if (user && !ok) {
            await User.updateOne({ _id: user._id }, { $inc: { failedLogins: 1 } });   // atomic increment
            const after = await User.findById(user._id).select('failedLogins').lean();
            if (after && after.failedLogins >= MAX_FAILS) {
                await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockUntil: new Date(Date.now() + LOCK_MS) } });
            }
        }
        throw new HttpError(401, 'Invalid email or password');
    }

    // The role chip on the login screen must match the account's real role.
    if (isNonEmptyString(role) && role !== user.role) {
        throw new HttpError(403, 'This account is not registered under the selected role');
    }
    if (user.failedLogins || user.lockUntil) await User.updateOne({ _id: user._id }, { $set: { failedLogins: 0 }, $unset: { lockUntil: 1 } });

    res.json({ token: signToken(user), user: publicUser(user) });
});

// Patients can self-register. Staff accounts are created by a Health Officer.
router.post('/register', registerLimiter, async (req, res) => {
    const { name, email, password, lga, age, sex } = req.body ?? {};
    if (!isNonEmptyString(name) || name.trim().length > 80) throw new HttpError(400, 'Enter your full name');
    if (!isNonEmptyString(email) || !EMAIL_RE.test(email.trim())) throw new HttpError(400, 'Enter a valid email address');
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) throw new HttpError(400, `Password must be at least ${MIN_PASSWORD} characters`);
    if (!LGAS.includes(lga)) throw new HttpError(400, 'Choose your local government area');
    if (age != null && age !== '' && !(Number.isInteger(Number(age)) && Number(age) >= 0 && Number(age) <= 120)) throw new HttpError(400, 'Age must be a whole number from 0 to 120');
    if (sex != null && sex !== '' && !['F', 'M'].includes(sex)) throw new HttpError(400, 'Choose female or male');

    const cleanEmail = email.trim().toLowerCase();
    if (await User.exists({ email: cleanEmail })) throw new HttpError(409, 'An account with this email already exists');

    const hash = await bcrypt.hash(password, 10);
    for (let attempt = 0; attempt < 5; attempt++) {
        const patientId = `PT-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
        try {
            const user = await User.create({
                name: name.trim(), email: cleanEmail, password: hash, role: 'patient', patientId, lga,
                age: age === '' || age == null ? undefined : Number(age), sex: sex || undefined,
            });
            return res.status(201).json({ token: signToken(user), user: publicUser(user) });
        } catch (error) {
            if (error?.code === 11000 && error.keyPattern?.patientId) continue; // ID collision: retry
            throw error;
        }
    }
    throw new HttpError(500, 'Could not create account. Please try again.');
});

// Any signed-in user can change their own password. Required after an admin creates or resets the account.
router.post('/change-password', loginLimiter, authenticate, async (req, res) => {
    const { currentPassword, newPassword } = req.body ?? {};
    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') throw new HttpError(400, 'Enter your current and new password');
    if (newPassword.length < MIN_PASSWORD) throw new HttpError(400, `New password must be at least ${MIN_PASSWORD} characters`);
    if (newPassword === currentPassword) throw new HttpError(400, 'Choose a password different from the current one');

    const user = await User.findById(req.user._id).select('+password');
    if (!(await bcrypt.compare(currentPassword, user.password))) throw new HttpError(401, 'Current password is incorrect');
    user.password = await bcrypt.hash(newPassword, 10);
    user.mustChangePassword = false;
    await user.save();
    res.json({ message: 'Password changed', user: publicUser(user) });
});

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

export default router;

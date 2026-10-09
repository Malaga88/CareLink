import { Router } from 'express';
import bcrypt from 'bcrypt';
import User from '../models/User.mjs';
import { authenticate, signToken } from '../middleware/auth.mjs';
import { loginLimiter, registerLimiter } from '../middleware/rateLimiters.mjs';
import { HttpError, isNonEmptyString, publicUser } from '../lib/utils.mjs';

const router = Router();

// Compared against when the email is unknown so response time doesn't reveal valid emails.
const DUMMY_HASH = await bcrypt.hash('not-a-real-password', 10);
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

router.post('/login', loginLimiter, async (req, res) => {
    const { email, password, role } = req.body ?? {};
    if (!isNonEmptyString(email) || !isNonEmptyString(password)) {
        throw new HttpError(400, 'Email and password are required');
    }

    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    const ok = await bcrypt.compare(password, user?.password ?? DUMMY_HASH);
    if (!user || !ok || !user.active) throw new HttpError(401, 'Invalid email or password');

    // The role chip on the login screen must match the account's real role.
    if (isNonEmptyString(role) && role !== user.role) {
        throw new HttpError(403, 'This account is not registered under the selected role');
    }

    res.json({ token: signToken(user), user: publicUser(user) });
});

// Patients can self-register. Staff accounts are created by an administrator (or the seed script).
router.post('/register', registerLimiter, async (req, res) => {
    const { name, email, password, lga } = req.body ?? {};
    if (!isNonEmptyString(name) || name.trim().length > 80) throw new HttpError(400, 'Enter your full name');
    if (!isNonEmptyString(email) || !EMAIL_RE.test(email.trim())) throw new HttpError(400, 'Enter a valid email address');
    if (typeof password !== 'string' || password.length < 8) throw new HttpError(400, 'Password must be at least 8 characters');

    const hash = await bcrypt.hash(password, 10);
    for (let attempt = 0; attempt < 5; attempt++) {
        const patientId = `PT-${String(Math.floor(Math.random() * 100000)).padStart(5, '0')}`;
        try {
            const user = await User.create({
                name: name.trim(), email: email.trim().toLowerCase(), password: hash,
                role: 'patient', patientId, lga: isNonEmptyString(lga) ? lga.trim() : undefined,
            });
            return res.status(201).json({ token: signToken(user), user: publicUser(user) });
        } catch (error) {
            if (error?.code === 11000 && error.keyPattern?.patientId) continue; // ID collision: retry
            throw error;
        }
    }
    throw new HttpError(500, 'Could not create account. Please try again.');
});

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

export default router;

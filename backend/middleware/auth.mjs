import jwt from 'jsonwebtoken';
import User from '../models/User.mjs';
import { HttpError } from '../lib/utils.mjs';

// Verifies the Bearer token AND re-loads the user, so deactivated accounts lose access immediately.
export const authenticate = async (req, res, next) => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'No token provided');

    let payload;
    try {
        payload = jwt.verify(header.slice(7).trim(), process.env.JWT_SECRET, { algorithms: ['HS256'] });
    } catch {
        throw new HttpError(401, 'Invalid or expired token');
    }

    const user = await User.findById(payload.id);
    if (!user || !user.active) throw new HttpError(401, 'Account not found or disabled');
    req.user = user;
    next();
};

export const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user?.role)) throw new HttpError(403, 'You do not have access to this resource');
    next();
};

export const signToken = (user) =>
    jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h', algorithm: 'HS256' });

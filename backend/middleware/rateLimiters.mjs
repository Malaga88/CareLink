import rateLimit from 'express-rate-limit';

const make = (windowMs, limit, message) => rateLimit({
    windowMs, limit, standardHeaders: true, legacyHeaders: false, message: { message },
    skip: () => process.env.NODE_ENV === 'test', // integration tests log in many times
});

export const loginLimiter = make(15 * 60 * 1000, 10, 'Too many login attempts. Try again in 15 minutes.');
export const registerLimiter = make(60 * 60 * 1000, 10, 'Too many sign-up attempts. Try again later.');
export const apiLimiter = make(60 * 1000, 300, 'Too many requests. Slow down.');

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import authRouter from './routes/auth.mjs';
import catalogRouter from './routes/catalog.mjs';
import appointmentsRouter from './routes/appointments.mjs';
import recordsRouter from './routes/records.mjs';
import doctorRouter from './routes/doctor.mjs';
import referralsRouter from './routes/referrals.mjs';
import reportsRouter from './routes/reports.mjs';
import adminRouter from './routes/admin.mjs';
import { apiLimiter } from './middleware/rateLimiters.mjs';
import { responseTimer } from './middleware/metrics.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));

export function createApp() {
    const app = express();

    if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || 1);

    // The frontend uses external scripts only; inline style attributes and Google Fonts are allowed.
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'"],
                styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                fontSrc: ["'self'", 'https://fonts.gstatic.com'],
                imgSrc: ["'self'", 'data:'],
                connectSrc: ["'self'"],
                objectSrc: ["'none'"],
                frameAncestors: ["'none'"],
                upgradeInsecureRequests: null, // TLS is terminated by the host; avoids breaking http://localhost in some browsers
            },
        },
    }));

    const allowedOrigins = (process.env.CLIENT_ORIGIN ?? '').split(',').map((o) => o.trim()).filter(Boolean);
    app.use('/api', cors({
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    app.use(responseTimer);
    app.use(express.json({ limit: '10kb' }));
    app.use('/api', apiLimiter);

    app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
    app.use('/api/auth', authRouter);
    app.use('/api', catalogRouter);
    app.use('/api/appointments', appointmentsRouter);
    app.use('/api/records', recordsRouter);
    app.use('/api/doctor', doctorRouter);
    app.use('/api/referrals', referralsRouter);
    app.use('/api/reports', reportsRouter);
    app.use('/api/admin', adminRouter);
    app.use('/api', (req, res) => res.status(404).json({ message: 'Route not found' }));

    // Same-origin hosting of the static frontend (only ../frontend is exposed, never backend files).
    if (process.env.SERVE_FRONTEND !== '0') {
        app.use(express.static(path.join(here, '..', 'frontend'), { extensions: ['html'] }));
    }

    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, next) => {
        if (err.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON body' });
        if (err.status) return res.status(err.status).json({ message: err.message, ...err.extra });
        if (err?.code === 11000) return res.status(409).json({ message: 'That record already exists' });
        if (err?.name === 'ValidationError') return res.status(400).json({ message: err.message });
        if (err?.name === 'CastError') return res.status(400).json({ message: `Invalid ${err.path}` });
        console.error('Unhandled error:', err);
        res.status(500).json({ message: 'Server error' });
    });

    return app;
}

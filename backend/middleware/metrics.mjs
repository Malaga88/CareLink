// Rolling average of API response time (last 500 requests since the server started).
const samples = [];
const MAX = 500;

export const responseTimer = (req, res, next) => {
    const start = process.hrtime.bigint();
    res.on('finish', () => {
        if (!req.originalUrl.startsWith('/api')) return;
        samples.push(Number(process.hrtime.bigint() - start) / 1e6);
        if (samples.length > MAX) samples.shift();
    });
    next();
};

export const avgResponseMs = () =>
    samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : null;

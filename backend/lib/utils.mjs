export class HttpError extends Error {
    constructor(status, message, extra = {}) {
        super(message);
        this.status = status;
        this.extra = extra;
    }
}

export const isNonEmptyString = (value) =>
    typeof value === 'string' && value.trim() !== '';

export const isISODate = (value) =>
    typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

// Calendar-date weekday (0 = Sunday). Timezone-independent because we work with plain dates.
export const weekdayOf = (isoDate) => new Date(`${isoDate}T00:00:00Z`).getUTCDay();

// Today's date (YYYY-MM-DD) in the configured offset from UTC (Nigeria = UTC+1, no DST).
export const todayISO = () => {
    const offsetHours = Number(process.env.TZ_OFFSET_HOURS ?? 1);
    return new Date(Date.now() + offsetHours * 3600 * 1000).toISOString().slice(0, 10);
};

export const addDays = (isoDate, n) => {
    const d = new Date(`${isoDate}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
};

// The next `count` bookable dates for a doctor (clinic time, starting tomorrow, within the 60-day booking window).
export const bookableDates = (days, count = 6) => {
    const out = [], today = todayISO();
    for (let i = 1; i <= 60 && out.length < count; i++) {
        const d = addDays(today, i);
        if (days.includes(weekdayOf(d))) out.push(d);
    }
    return out;
};

export const publicUser = (u) => ({
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    patientId: u.patientId ?? null,
    lga: u.lga ?? null,
    mustChangePassword: !!u.mustChangePassword,
});

// Random temporary password without look-alike characters (no 0/O, 1/l/I).
import { randomInt } from 'node:crypto';
const PW_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
export const tempPassword = (len = 14) => Array.from({ length: len }, () => PW_ALPHABET[randomInt(PW_ALPHABET.length)]).join('');

export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

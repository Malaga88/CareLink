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

export const publicUser = (u) => ({
    id: u._id,
    name: u.name,
    email: u.email,
    role: u.role,
    patientId: u.patientId ?? null,
    lga: u.lga ?? null,
});

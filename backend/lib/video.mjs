import { randomBytes } from 'node:crypto';
import { HttpError } from './utils.mjs';

// Video consultations are plain meeting links on a Jitsi server (VIDEO_BASE_URL, default the public meet.jit.si).
// The room name is random and only handed to the patient and doctor of that appointment, inside a time window.
export const OPEN_BEFORE_MS = 15 * 60 * 1000;
export const CLOSE_AFTER_MS = 90 * 60 * 1000;

const slotMinutes = (slot) => {
    const m = /^(\d{1,2}):(\d{2}) (AM|PM)$/.exec(slot);
    return ((+m[1] % 12) + (m[3] === 'PM' ? 12 : 0)) * 60 + +m[2];
};

// Appointment start as a UTC timestamp. Dates and slots are local clinic time (TZ_OFFSET_HOURS ahead of UTC).
export const slotStartMs = (date, slot) => {
    const [y, mo, d] = date.split('-').map(Number);
    const offset = Number(process.env.TZ_OFFSET_HOURS ?? 1);
    return Date.UTC(y, mo - 1, d, 0, slotMinutes(slot)) - offset * 3600 * 1000;
};

export const joinState = (appt, now = Date.now()) => {
    const start = slotStartMs(appt.date, appt.slot);
    const opensAt = start - OPEN_BEFORE_MS, closesAt = start + CLOSE_AFTER_MS;
    return {
        canJoin: appt.status !== 'cancelled' && now >= opensAt && now <= closesAt,
        opensAt: new Date(opensAt).toISOString(),
    };
};

const clock = (ms) => new Date(ms + Number(process.env.TZ_OFFSET_HOURS ?? 1) * 3600 * 1000).toISOString().slice(11, 16);

// `appt` must be a Mongoose document (it may be saved to create the room name).
export const joinUrl = async (appt) => {
    if (appt.status === 'cancelled') throw new HttpError(409, 'This appointment was cancelled');
    const now = Date.now(), start = slotStartMs(appt.date, appt.slot);
    if (now < start - OPEN_BEFORE_MS) throw new HttpError(403, `The video room opens 15 minutes before the appointment, at ${clock(start - OPEN_BEFORE_MS)} on ${appt.date}.`);
    if (now > start + CLOSE_AFTER_MS) throw new HttpError(403, 'The video window for this appointment has closed.');
    if (!appt.videoRoom) { appt.videoRoom = randomBytes(12).toString('hex'); await appt.save(); }
    const base = (process.env.VIDEO_BASE_URL || 'https://meet.jit.si').replace(/\/$/, '');
    return `${base}/CareLink-${appt.videoRoom}`;
};

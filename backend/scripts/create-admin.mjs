// Creates the first Health Officer (the account that then creates facilities, doctors and other staff in the app).
//   npm run create-admin                      asks for name, email and password (typing is hidden)
//   ADMIN_NAME=.. ADMIN_EMAIL=.. ADMIN_PASSWORD=.. npm run create-admin     non-interactive
// Run it again any time to add another Health Officer. It never overwrites an existing account.
import 'dotenv/config';
import readline from 'node:readline';
import bcrypt from 'bcrypt';
import mongoose from 'mongoose';
import connectToDatabase from '../lib/db.mjs';
import User from '../models/User.mjs';

function ask(question, { hidden = false } = {}) {
    return new Promise((resolve) => {
        const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        rl._writeToOutput = (text) => rl.output.write(rl.muted ? (text === '\r\n' || text === '\n' ? text : '*') : text);
        rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write('\n'); resolve(answer.trim()); });
        if (hidden) rl.muted = true; // the prompt is already printed; mask what is typed from here on
    });
}

const name = process.env.ADMIN_NAME || await ask('Full name: ');
const email = (process.env.ADMIN_EMAIL || await ask('Email: ')).toLowerCase();
let password = process.env.ADMIN_PASSWORD;
if (!password) {
    password = await ask('Password (10+ characters): ', { hidden: true });
    if (password !== await ask('Repeat password: ', { hidden: true })) { console.error('Passwords did not match.'); process.exit(1); }
}

if (!name || name.length > 80) { console.error('Enter a name (80 characters maximum).'); process.exit(1); }
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { console.error('Enter a valid email address.'); process.exit(1); }
if (password.length < 10) { console.error('Password must be at least 10 characters.'); process.exit(1); }

await connectToDatabase();
if (await User.exists({ email })) { console.error(`An account for ${email} already exists.`); await mongoose.disconnect(); process.exit(1); }
await User.create({ name, email, role: 'officer', password: await bcrypt.hash(password, 10), mustChangePassword: false });
console.log(`Created Health Officer ${email}. Sign in, then add facilities and staff from "Users & Facilities".`);
await mongoose.disconnect();

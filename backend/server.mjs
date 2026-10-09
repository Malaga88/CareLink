// Must be the first import: guarantees .env is loaded before any other module reads process.env.
import 'dotenv/config';

import { createApp } from './app.mjs';
import connectToDatabase from './lib/db.mjs';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('JWT_SECRET is missing or too short (min 32 chars). See .env.example.');
    process.exit(1);
}

const PORT = process.env.PORT || 4000;

try {
    await connectToDatabase();
    createApp().listen(PORT, () => console.log(`CareLink API running on http://localhost:${PORT}`));
} catch (error) {
    console.error('Failed to start server:', error.message);
    process.exit(1);
}

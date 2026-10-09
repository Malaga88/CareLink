import mongoose from 'mongoose';

let cached = global.mongooseCache;
if (!cached) cached = global.mongooseCache = { conn: null, promise: null };

export default async function connectToMongoDB() {
    if (cached.conn) return cached.conn;

    if (!cached.promise) {
        const uri = process.env.MONGO_URI;
        if (!uri) throw new Error('MONGO_URI is not set. Add it to backend/.env (see .env.example).');
        cached.promise = mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 }).then(async (m) => {
            // Build unique indexes (e.g. the slot-conflict guard) before serving traffic.
            await Promise.all(Object.values(m.models).map((model) => model.init()));
            console.log(`Connected to MongoDB (database: ${m.connection.name})`);
            return m;
        });
    }

    try {
        cached.conn = await cached.promise;
    } catch (error) {
        cached.promise = null; // allow a retry on the next call
        throw error;
    }
    return cached.conn;
}

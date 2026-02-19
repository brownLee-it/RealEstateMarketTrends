import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import apartmentsRouter from './routes/apartments.js';
import geocodeRouter from './routes/geocode.js';

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Only load .env file in development
if (process.env.NODE_ENV !== 'production') {
    const dotenv = await import('dotenv');
    dotenv.config({ path: path.resolve(__dirname, '..', '.env') });
}

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/apartments', apartmentsRouter);
app.use('/api/geocode', geocodeRouter);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default app;

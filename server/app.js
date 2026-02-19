const express = require('express');
const cors = require('cors');
const path = require('path');
// Only load .env file in development
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
}

const apartmentsRouter = require('./routes/apartments');
const geocodeRouter = require('./routes/geocode');

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

module.exports = app;

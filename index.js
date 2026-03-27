const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { initDb, getDb } = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Middleware to ensure DB is ready
app.use((req, res, next) => {
    if (!getDb() && req.path !== '/api/health') {
        return res.status(503).json({ error: 'Server is starting up, please try again in a moment.' });
    }
    next();
});

// --- Register Routes Synchronously (Critical for Vercel) ---
const authRoutes = require('./routes/auth');
const certificateRoutes = require('./routes/certificates');
const mentorRoutes = require('./routes/mentors');
const logoRoutes = require('./routes/logos').router;
const subjectRoutes = require('./routes/subjects');
const authenticate = require('./middlewares/auth');

app.use('/api/auth', authRoutes);
app.use('/api/certificates', certificateRoutes);
app.use('/api/users', mentorRoutes);
app.use('/api/logos', logoRoutes);
app.use('/api/subjects', subjectRoutes);

// Stats route
app.get('/api/stats', authenticate, async (req, res) => {
    const db = getDb();
    if (!db) return res.status(503).json({ error: 'Database not initialized' });
    try {
        const totalIssued = await db.hLen('fpc:certificates');
        const activeDomains = await db.hLen('fpc:subjects');

        const monthPrefix = new Date().toISOString().slice(0, 7);
        const allCerts = await db.hGetAll('fpc:certificates');
        const thisMonth = Object.values(allCerts)
            .map(c => JSON.parse(c))
            .filter(c => c.issueDate.startsWith(monthPrefix))
            .length;

        res.json({ totalIssued, activeDomains, thisMonth });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
});

// --- Initialize DB ---
// We trigger this but don't block the export. 
// Routes will check if db is ready or handle the first request lag.
initDb().then(() => {
    console.log('Database connected.');
    if (process.env.NODE_ENV !== 'production') {
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });
    }
}).catch(err => {
    console.error('DB initialization failed:', err);
});

module.exports = app;

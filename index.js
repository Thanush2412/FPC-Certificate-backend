const express = require('express');
const cors = require('cors');
require('dotenv').config();
const { initDb } = require('./utils/db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// --- Initialize DB then start server ---
initDb().then(() => {
    console.log('Database connected.');

    // --- Import Routes ---
    const authRoutes = require('./routes/auth');
    const certificateRoutes = require('./routes/certificates');
    const mentorRoutes = require('./routes/mentors');
    const logoRoutes = require('./routes/logos').router;
    const subjectRoutes = require('./routes/subjects');
    const authenticate = require('./middlewares/auth');
    const { getDb } = require('./utils/db');

    // --- Register Routes ---
    app.use('/api/auth', authRoutes);
    app.use('/api/certificates', certificateRoutes);
    app.use('/api/users', mentorRoutes); // Mentors/Users management
    app.use('/api/logos', logoRoutes);
    app.use('/api/subjects', subjectRoutes);

    // Stats route
    app.get('/api/stats', authenticate, async (req, res) => {
        const db = getDb();
        try {
            const totalIssued = await db.hLen('fpc:certificates');
            const activeDomains = await db.hLen('fpc:subjects');

            const monthPrefix = new Date().toISOString().slice(0, 7);
            const allCerts = await db.hGetAll('fpc:certificates');
            const thisMonth = Object.values(allCerts)
                .map(c => JSON.parse(c))
                .filter(c => c.issueDate.startsWith(monthPrefix))
                .length;

            res.json({
                totalIssued,
                activeDomains,
                thisMonth
            });
        } catch (err) {
            console.error(err);
            res.status(500).json({ error: 'Failed to fetch stats' });
        }
    });

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
}).catch(err => {
    console.error('DB initialization failed:', err);
    process.exit(1);
});

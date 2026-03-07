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

    // Stats route (kept in index for simplicity or can be a separate route)
    app.get('/api/stats', authenticate, async (req, res) => {
        const db = getDb();
        try {
            const certsCount = await db.get('SELECT COUNT(*) as count FROM certificates');
            const domainsCount = await db.get('SELECT COUNT(*) as count FROM subjects');
            const monthPrefix = new Date().toISOString().slice(0, 7);
            const monthCount = await db.get('SELECT COUNT(*) as count FROM certificates WHERE issueDate LIKE ?', [`${monthPrefix}%`]);

            res.json({
                totalIssued: certsCount.count,
                activeDomains: domainsCount.count,
                thisMonth: monthCount.count
            });
        } catch (err) {
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

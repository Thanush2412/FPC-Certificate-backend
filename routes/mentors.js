const express = require('express');
const router = express.Router();
const multer = require('multer');
const XLSX = require('xlsx');
const authenticate = require('../middlewares/auth');
const { getDb } = require('../utils/db');

// Configure Multer for memory storage
const upload = multer({ storage: multer.memoryStorage() });

// --- Mentors/Users CRUD ---
router.get('/', authenticate, async (req, res) => {
    const db = getDb();
    try {
        const mentors = await db.all(`
            SELECT m.*, MAX(c.issueDate) as lastGeneratedDate 
            FROM mentors m 
            LEFT JOIN certificates c ON m.employeeId = c.recipientId 
            GROUP BY m.id
        `);
        res.json(mentors);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch people' });
    }
});

router.post('/', authenticate, async (req, res) => {
    const db = getDb();
    const { name, employeeId, email, type } = req.body;
    if (!name || !employeeId) return res.status(400).json({ error: 'Name and Employee ID required' });
    try {
        await db.run('INSERT INTO mentors (name, employeeId, email, type) VALUES (?, ?, ?, ?)',
            [name, employeeId, email || '', type || 'Mentor']);
        res.status(201).json({ message: 'Person added' });
    } catch (err) {
        res.status(400).json({ error: 'Person or Employee ID already exists' });
    }
});

router.patch('/:id', authenticate, async (req, res) => {
    const db = getDb();
    const fields = req.body;
    const keys = Object.keys(fields);

    if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

    try {
        const setClause = keys.map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(fields), req.params.id];

        await db.run(
            `UPDATE mentors SET ${setClause} WHERE id = ?`,
            values
        );
        res.json({ message: 'Person updated' });
    } catch (err) {
        res.status(400).json({ error: 'Failed to update or Employee ID already exists: ' + err.message });
    }
});

router.delete('/:id', authenticate, async (req, res) => {
    const db = getDb();
    await db.run('DELETE FROM mentors WHERE id = ?', [req.params.id]);
    res.json({ message: 'Entry deleted' });
});

router.post('/preview', authenticate, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    try {
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet, { header: 1 });
        if (data.length === 0) return res.status(400).json({ error: 'File is empty' });
        res.json({ headers: data[0] });
    } catch (err) {
        res.status(500).json({ error: 'Failed to read file headers' });
    }
});

router.post('/bulk-import', authenticate, upload.single('file'), async (req, res) => {
    const db = getDb();
    const { mapping } = req.body;
    if (!req.file || !mapping) return res.status(400).json({ error: 'File and mapping are required' });

    try {
        const map = JSON.parse(mapping);
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        const results = { success: 0, failed: 0, errors: [] };
        for (const row of data) {
            const name = String(row[map.name] || '').trim();
            const employeeId = String(row[map.employeeId] || '').trim();
            const type = String(row[map.type] || 'Mentor').trim();
            const email = String(row[map.email] || '').trim();

            if (!name || !employeeId) {
                results.failed++;
                results.errors.push(`Row missing Name or ID: ${JSON.stringify(row)}`);
                continue;
            }

            try {
                // Check if exists
                const existing = await db.get('SELECT id FROM mentors WHERE employeeId = ?', [employeeId]);
                if (existing) {
                    await db.run(
                        'UPDATE mentors SET name = ?, email = ?, type = ? WHERE id = ?',
                        [name, email, type, existing.id]
                    );
                } else {
                    await db.run(
                        'INSERT INTO mentors (name, employeeId, email, type) VALUES (?, ?, ?, ?)',
                        [name, employeeId, email, type]
                    );
                }
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push(`${name} (${employeeId}): ${err.message}`);
            }
        }
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: 'Import failed: ' + err.message });
    }
});

module.exports = router;

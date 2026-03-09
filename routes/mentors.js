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
        const mentorsMap = await db.hGetAll('fpc:entities');
        const mentors = Object.values(mentorsMap).map(m => JSON.parse(m));

        const certsMap = await db.hGetAll('fpc:certificates');
        const certs = Object.values(certsMap).map(c => JSON.parse(c));

        // In-memory join/grouping
        const result = mentors.map(m => {
            const myCerts = certs.filter(c => c.recipientId === m.employeeId);
            const lastCert = myCerts.sort((a, b) => b.timestamp - a.timestamp)[0];
            return {
                ...m,
                lastGeneratedDate: lastCert ? lastCert.issueDate : null
            };
        });

        res.json(result);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to fetch people' });
    }
});

router.post('/', authenticate, async (req, res) => {
    const db = getDb();
    const { name, employeeId, email, type } = req.body;
    if (!name || !employeeId) return res.status(400).json({ error: 'Name and Employee ID required' });

    const id = Date.now().toString();
    const entity = { id, name, employeeId, email: email || '', type: type || 'Mentor' };

    try {
        await db.hSet('fpc:entities', employeeId, JSON.stringify(entity));
        res.status(201).json({ message: 'Person added' });
    } catch (err) {
        res.status(400).json({ error: 'Failed to add person' });
    }
});

router.patch('/:id', authenticate, async (req, res) => {
    const db = getDb();
    const fields = req.body;
    const employeeId = fields.employeeId; // We need to know which hash field to update

    try {
        // Find by ID is slow in Hash-by-EmpID, but we can iterate
        const entities = await db.hGetAll('fpc:entities');
        let targetEmpId = null;
        let existing = null;

        for (const [empId, json] of Object.entries(entities)) {
            const obj = JSON.parse(json);
            if (obj.id === req.params.id) {
                targetEmpId = empId;
                existing = obj;
                break;
            }
        }

        if (!existing) return res.status(404).json({ error: 'Person not found' });

        const updated = { ...existing, ...fields };

        // If employeeId changed, delete old field
        if (targetEmpId !== updated.employeeId) {
            await db.hDel('fpc:entities', targetEmpId);
        }

        await db.hSet('fpc:entities', updated.employeeId, JSON.stringify(updated));
        res.json({ message: 'Person updated' });
    } catch (err) {
        res.status(400).json({ error: 'Failed to update: ' + err.message });
    }
});

router.delete('/:id', authenticate, async (req, res) => {
    const db = getDb();
    try {
        const entities = await db.hGetAll('fpc:entities');
        for (const [empId, json] of Object.entries(entities)) {
            const obj = JSON.parse(json);
            if (obj.id === req.params.id) {
                await db.hDel('fpc:entities', empId);
                break;
            }
        }
        res.json({ message: 'Entry deleted' });
    } catch (err) {
        res.status(500).json({ error: 'Delete failed' });
    }
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
                const existingJson = await db.hGet('fpc:entities', employeeId);
                const id = existingJson ? JSON.parse(existingJson).id : Date.now().toString() + Math.random();
                const entity = { id, name, employeeId, email, type };

                await db.hSet('fpc:entities', employeeId, JSON.stringify(entity));
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

const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { getDb } = require('../utils/db');

router.get('/', async (req, res) => {
    const db = getDb();
    const subjects = await db.all('SELECT * FROM subjects');
    res.json(subjects);
});

router.post('/', authenticate, async (req, res) => {
    const db = getDb();
    const { name } = req.body;
    try {
        const result = await db.run('INSERT INTO subjects (name) VALUES (?)', [name]);
        res.status(201).json({ id: result.lastID, name });
    } catch (err) {
        res.status(400).json({ error: 'Subject already exists' });
    }
});

router.patch('/:id', authenticate, async (req, res) => {
    const db = getDb();
    const { name } = req.body;
    await db.run('UPDATE subjects SET name = ? WHERE id = ?', [name, req.params.id]);
    res.json({ message: 'Subject updated' });
});

router.delete('/:id', authenticate, async (req, res) => {
    const db = getDb();
    await db.run('DELETE FROM subjects WHERE id = ?', [req.params.id]);
    res.json({ message: 'Subject deleted' });
});

module.exports = router;

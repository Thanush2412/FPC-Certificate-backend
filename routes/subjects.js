const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/auth');
const { getDb } = require('../utils/db');

router.get('/', async (req, res) => {
    const db = getDb();
    const subjectsMap = await db.hGetAll('fpc:subjects');
    const subjects = Object.entries(subjectsMap).map(([id, name]) => ({ id, name }));
    res.json(subjects);
});

router.post('/', authenticate, async (req, res) => {
    const db = getDb();
    const { name } = req.body;
    const id = Date.now().toString();
    try {
        await db.hSet('fpc:subjects', id, name);
        res.status(201).json({ id, name });
    } catch (err) {
        res.status(400).json({ error: 'Failed to create subject' });
    }
});

router.patch('/:id', authenticate, async (req, res) => {
    const db = getDb();
    const { name } = req.body;
    await db.hSet('fpc:subjects', req.params.id, name);
    res.json({ message: 'Subject updated' });
});

router.delete('/:id', authenticate, async (req, res) => {
    const db = getDb();
    await db.hDel('fpc:subjects', req.params.id);
    res.json({ message: 'Subject deleted' });
});

module.exports = router;

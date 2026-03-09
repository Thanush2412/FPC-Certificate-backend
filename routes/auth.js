const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../utils/db');

router.post('/login', async (req, res) => {
    const db = getDb();
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

    const userJson = await db.hGet('fpc:users', email);
    if (!userJson) return res.status(401).json({ error: 'Invalid email or password' });

    const user = JSON.parse(userJson);
    if (!(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
    res.json({ token, message: 'Login successful' });
});

module.exports = router;

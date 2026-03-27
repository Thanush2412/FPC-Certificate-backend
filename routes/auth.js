const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../utils/db');

router.post('/login', async (req, res) => {
    try {
        const db = getDb();
        if (!db) return res.status(503).json({ error: 'Database initializing, please try again in a moment.' });

        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });

        console.log(`Login attempt for: ${email}`);
        const userJson = await db.hGet('fpc:users', email);
        
        if (!userJson) {
            console.log('User not found in DB');
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = typeof userJson === 'string' ? JSON.parse(userJson) : userJson;
        
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            console.log('Password mismatch');
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const token = jwt.sign({ email: user.email }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, message: 'Login successful' });
    } catch (err) {
        console.error('CRITICAL LOGIN ERROR:', err);
        res.status(500).json({ error: 'Internal server error during login. Check server logs.' });
    }
});

module.exports = router;

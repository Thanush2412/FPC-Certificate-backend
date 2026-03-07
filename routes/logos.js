const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

// For loading logo as base64 string
const loadLogoBase64 = (logoName) => {
    if (!logoName) return '';
    try {
        const logoPath = path.join(__dirname, '..', 'logos', logoName);
        if (fs.existsSync(logoPath)) {
            const logoData = fs.readFileSync(logoPath);
            const ext = path.extname(logoName).substring(1).toLowerCase();
            const mimeType = ext === 'svg' ? 'image/svg+xml' : (ext === 'png' ? 'image/png' : 'image/jpeg');
            return `data:${mimeType};base64,${logoData.toString('base64')}`;
        }
    } catch (e) { }
    return '';
};

router.get('/', async (req, res) => {
    try {
        const logosDir = path.join(__dirname, '..', 'logos');
        const files = fs.readdirSync(logosDir);
        const images = files.filter(f => /\.(png|jpe?g|svg)$/i.test(f));
        res.json(images);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch logos' });
    }
});

module.exports = {
    router,
    loadLogoBase64
};

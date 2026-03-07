const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const authenticate = require('../middlewares/auth');
const { getDb } = require('../utils/db');
const { convertSvgToPdf } = require('../utils/svgToPdf');
const { convertSvgToPdf: convertAppreciationToPdf } = require('../utils/appreciationPdfGenerator');
const { loadLogoBase64 } = require('./logos');

const SVG_TEMPLATE_PATH = path.join(__dirname, '..', 'templates', 'certificate.svg');

// Helper to generate 8-character alphanumeric ID
const generateCertificateId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

// Get all certificates for dashboard (only for admins)
router.get('/', authenticate, async (req, res) => {
    const db = getDb();
    try {
        const certs = await db.all('SELECT * FROM certificates ORDER BY timestamp DESC');
        res.json(certs);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch certificates' });
    }
});

// Get a single certificate for public/verification
router.get('/:id', async (req, res) => {
    const db = getDb();
    try {
        const cert = await db.get('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
        if (!cert) return res.status(404).json({ error: 'Certificate not found' });
        res.json(cert);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch certificate' });
    }
});

// Download a generated PDF certificate (Public)
router.get('/:id/download', async (req, res) => {
    const db = getDb();
    try {
        const cert = await db.get('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
        if (!cert) return res.status(404).json({ error: 'Certificate not found' });

        let pdfBuffer;

        if (cert.template === 'appreciation') {
            const templatePath = path.join(__dirname, '..', 'templates', 'appreciation_cert.svg');
            let svg = fs.readFileSync(templatePath, 'utf8');
            const logoBase64 = loadLogoBase64(cert.logo);

            svg = svg
                .replace('{{LOGO}}', logoBase64)
                .replace('{{DEPARTMENT}}', cert.department || '')
                .replace('{{UNIVERSITY}}', cert.university || '')
                .replace('{{NAME}}', cert.name || '')
                .replace('{{COURSE}}', cert.course || '')
                .replace('{{RECOGNITION}}', cert.recognition || '')
                .replace('{{SEMESTER}}', cert.semester || '')
                .replace('{{CERTIFICATE_ID}}', (cert.id || '').toUpperCase());

            pdfBuffer = await convertAppreciationToPdf(svg, null);
        } else {
            // Standard template
            let svg = fs.readFileSync(SVG_TEMPLATE_PATH, 'utf8');

            const formattedCourse = (cert.domain || '').split(/\r?\n/).map((line, i) =>
                i === 0 ? line : `<tspan x="1549" dy="1.4em">${line}</tspan>`
            ).join('');

            svg = svg
                .replace('{{NAME}}', (cert.name || '').toUpperCase())
                .replace('{{COURSE}}', formattedCourse.toUpperCase())
                .replace('{{DATE}}', cert.issueDate || '')
                .replace('{{CERT_ID}}', (cert.id || '').toUpperCase());

            pdfBuffer = await convertSvgToPdf(svg, null);
        }

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="certificate_${cert.id}.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('PDF generation error:', err);
        res.status(500).json({ error: 'Failed to generate PDF: ' + err.message });
    }
});

// Create a new certificate (admin only)
router.post('/', authenticate, async (req, res) => {
    const db = getDb();
    const {
        name, domain, issueDate, recipientType, recipientId,
        template, university, department, course, recognition, semester, logo
    } = req.body;

    if (!name || !issueDate) {
        return res.status(400).json({ error: 'Name and IssueDate are required' });
    }

    const id = generateCertificateId();
    const timestamp = Date.now();

    try {
        await db.run(
            `INSERT INTO certificates (
                id, name, recipientId, recipientType, domain, issueDate, timestamp,
                template, university, department, course, recognition, semester, logo
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id, name, recipientId || '', recipientType || 'Mentor', domain || '', issueDate, timestamp,
                template || 'standard', university || '', department || '', course || '',
                recognition || '', semester || '', logo || ''
            ]
        );
        const newCert = await db.get('SELECT * FROM certificates WHERE id = ?', [id]);
        res.status(201).json(newCert);
    } catch (err) {
        console.error('Create certificate error:', err);
        res.status(500).json({ error: 'Failed to create certificate' });
    }
});

// Update an existing certificate (admin only)
router.patch('/:id', authenticate, async (req, res) => {
    const db = getDb();
    const fields = req.body;
    const keys = Object.keys(fields);

    if (keys.length === 0) return res.status(400).json({ error: 'No fields to update' });

    try {
        const setClause = keys.map(key => `${key} = ?`).join(', ');
        const values = [...Object.values(fields), req.params.id];

        const result = await db.run(
            `UPDATE certificates SET ${setClause} WHERE id = ?`,
            values
        );

        if (result.changes === 0) return res.status(404).json({ error: 'Certificate not found' });
        const updatedCert = await db.get('SELECT * FROM certificates WHERE id = ?', [req.params.id]);
        res.json(updatedCert);
    } catch (err) {
        console.error('Update certificate error:', err);
        res.status(500).json({ error: 'Failed to update certificate: ' + err.message });
    }
});

// Delete a certificate (admin only)
router.delete('/:id', authenticate, async (req, res) => {
    const db = getDb();
    try {
        const result = await db.run('DELETE FROM certificates WHERE id = ?', [req.params.id]);
        if (result.changes === 0) return res.status(404).json({ error: 'Certificate not found' });
        res.json({ message: 'Certificate deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete certificate' });
    }
});

// API appreciation generate specific route
router.post('/appreciation/generate', async (req, res) => {
    try {
        const { logo, department, university, name, course, recognition, semester } = req.body;

        let svg = fs.readFileSync(path.join(__dirname, '..', 'templates', 'appreciation_cert.svg'), 'utf8');

        const logoBase64 = loadLogoBase64(logo);

        svg = svg
            .replace('{{LOGO}}', logoBase64)
            .replace('{{DEPARTMENT}}', department || '')
            .replace('{{UNIVERSITY}}', university || '')
            .replace('{{NAME}}', name || '')
            .replace('{{COURSE}}', course || '')
            .replace('{{RECOGNITION}}', recognition || '')
            .replace('{{SEMESTER}}', semester || '');

        const pdfBuffer = await convertAppreciationToPdf(svg, null);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="appreciation_certificate.pdf"`,
            'Content-Length': pdfBuffer.length,
        });
        res.send(pdfBuffer);
    } catch (err) {
        console.error('Appreciation generation error:', err);
        res.status(500).json({ error: 'Failed to generate PDF: ' + err.message });
    }
});

module.exports = router;

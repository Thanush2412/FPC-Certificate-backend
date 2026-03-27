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
        const certsMap = await db.hGetAll('fpc:certificates');
        const certs = Object.values(certsMap).map(c => JSON.parse(c));
        res.json(certs.sort((a, b) => b.timestamp - a.timestamp));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch certificates' });
    }
});

// Get a single certificate for public/verification
router.get('/:id', async (req, res) => {
    const db = getDb();
    try {
        const certJson = await db.hGet('fpc:certificates', req.params.id);
        if (!certJson) return res.status(404).json({ error: 'Certificate not found' });
        res.json(JSON.parse(certJson));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch certificate' });
    }
});

// Download a generated PDF certificate (Public)
router.get('/:id/download', async (req, res) => {
    const db = getDb();
    try {
        const certJson = await db.hGet('fpc:certificates', req.params.id);
        if (!certJson) return res.status(404).json({ error: 'Certificate not found' });
        const cert = JSON.parse(certJson);

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
        const newCert = {
            id, name, recipientId: recipientId || '', recipientType: recipientType || 'Mentor', domain: domain || '', issueDate, timestamp,
            template: template || 'standard', university: university || '', department: department || '', course: course || '',
            recognition: recognition || '', semester: semester || '', logo: logo || ''
        };
        await db.hSet('fpc:certificates', id, JSON.stringify(newCert));
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
        const certJson = await db.hGet('fpc:certificates', req.params.id);
        if (!certJson) return res.status(404).json({ error: 'Certificate not found' });

        const updatedCert = { ...JSON.parse(certJson), ...fields };
        await db.hSet('fpc:certificates', req.params.id, JSON.stringify(updatedCert));
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
        const deleted = await db.hDel('fpc:certificates', req.params.id);
        if (deleted === 0) return res.status(404).json({ error: 'Certificate not found' });
        res.json({ message: 'Certificate deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to delete certificate' });
    }
});

const multer = require('multer');
const XLSX = require('xlsx');
const upload = multer({ storage: multer.memoryStorage() });

// Preview headers for bulk import
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

// Bulk import certificates
router.post('/bulk-import', authenticate, upload.single('file'), async (req, res) => {
    const db = getDb();
    const { mapping } = req.body;
    if (!req.file || !mapping) return res.status(400).json({ error: 'File and mapping are required' });

    try {
        const map = JSON.parse(mapping);
        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const data = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        const results = { success: 0, failed: 0, errors: [] };
        const timestamp = Date.now();

        for (const row of data) {
            const name = String(row[map.name] || '').trim();
            const issueDate = String(row[map.issueDate] || '').trim();
            const domain = String(row[map.domain] || '').trim();
            const recipientId = String(row[map.recipientId] || '').trim();
            const recipientType = String(row[map.recipientType] || 'Mentor').trim();
            const customId = String(row[map.id] || '').trim();

            if (!name || !issueDate) {
                results.failed++;
                results.errors.push(`Row missing Name or Issue Date: ${JSON.stringify(row)}`);
                continue;
            }

            try {
                const isCustomId = !!customId;
                const id = customId || generateCertificateId();
                const newCert = {
                    id, name, recipientId, recipientType, domain, issueDate, timestamp,
                    template: 'standard', // Default to standard for bulk import
                    isImported: isCustomId
                };
                await db.hSet('fpc:certificates', id, JSON.stringify(newCert));
                results.success++;
            } catch (err) {
                results.failed++;
                results.errors.push(`${name}: ${err.message}`);
            }
        }
        res.json(results);
    } catch (err) {
        console.error('Bulk import error:', err);
        res.status(500).json({ error: 'Import failed: ' + err.message });
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

const puppeteer = require('puppeteer');
const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// ── Load fonts ONCE at module startup (not per request) ────────────────────────
const fontBoldPath = path.join(__dirname, '..', 'fonts', 'PublicSans-Bold.ttf');
const fontRegularPath = path.join(__dirname, '..', 'fonts', 'PublicSans-Regular.ttf');
const fontBoldBase64 = fs.readFileSync(fontBoldPath).toString('base64');
const fontRegularBase64 = fs.readFileSync(fontRegularPath).toString('base64');

// Pre-build the font style block once (shared across all generated PDFs)
const FONT_STYLE = `
    @font-face {
        font-family: 'Public Sans';
        src: url('data:font/ttf;base64,${fontRegularBase64}') format('truetype');
        font-weight: normal;
        font-style: normal;
    }
    @font-face {
        font-family: 'Public Sans';
        src: url('data:font/ttf;base64,${fontBoldBase64}') format('truetype');
        font-weight: bold;
        font-style: normal;
    }
`;

// ── SVG dimensions (must match the template) ───────────────────────────────────
const SVG_WIDTH = 2492;
const SVG_HEIGHT = 1762;

// ── Shared browser instance (reused across requests for speed) ─────────────────
let _browser = null;

async function getBrowser() {
    if (!_browser || !_browser.connected) {
        _browser = await puppeteer.launch({
            headless: 'new',
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
    }
    return _browser;
}

// ── Main conversion function ───────────────────────────────────────────────────
// Strategy: render SVG → PNG screenshot  →  embed PNG into a PDF via pdf-lib
// This produces a FLAT IMAGE PDF that opens instantly in any PDF viewer.
async function convertSvgToPdf(svgString, pdfPath) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setViewport({ width: SVG_WIDTH, height: SVG_HEIGHT, deviceScaleFactor: 1 });

        const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <style>
        ${FONT_STYLE}
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; width: ${SVG_WIDTH}px; height: ${SVG_HEIGHT}px; overflow: hidden; font-family: 'Public Sans', sans-serif; background: white; }
        svg  { display: block; width: 100%; height: 100%; }
    </style>
</head>
<body>${svgString}</body>
</html>`;

        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        // Wait for all fonts to finish loading before screenshotting
        await page.evaluateHandle('document.fonts.ready');

        // ── Step 1: Render to PNG (rasterize the complex SVG) ──────────────────
        const pngBuffer = await page.screenshot({
            type: 'png',
            clip: { x: 0, y: 0, width: SVG_WIDTH, height: SVG_HEIGHT },
            omitBackground: false,
        });

        // ── Step 2: Embed PNG into a PDF (A4 landscape = fast-opening flat PDF) ─
        const pdfDoc = await PDFDocument.create();

        // Use the same pixel dimensions as the SVG for the PDF page
        const pdfPage = pdfDoc.addPage([SVG_WIDTH, SVG_HEIGHT]);
        const pngImage = await pdfDoc.embedPng(pngBuffer);
        pdfPage.drawImage(pngImage, {
            x: 0,
            y: 0,
            width: SVG_WIDTH,
            height: SVG_HEIGHT,
        });

        const pdfBytes = await pdfDoc.save();
        const pdfBuffer = Buffer.from(pdfBytes);

        if (pdfPath) {
            fs.writeFileSync(pdfPath, pdfBuffer);
            return null;
        }
        return pdfBuffer;

    } finally {
        await page.close(); // close only the tab, not the whole browser
    }
}

// ── Gracefully close browser on process exit ───────────────────────────────────
process.on('exit', async () => { if (_browser) await _browser.close(); });
process.on('SIGINT', async () => { if (_browser) await _browser.close(); process.exit(); });

// ── Test: run directly with node svgToPdf.js ──────────────────────────────────
if (require.main === module) {
    const name = "THANUSH K";
    const course = "Fundamentals of Python Programming";
    const date = "01/01/2026";
    const cert_id = "FPC123456";

    const templatePath = path.join(__dirname, '..', 'templates', 'certificate.svg');
    const outputPath = path.join(__dirname, 'test_puppeteer_cert.pdf');

    try {
        let svg = fs.readFileSync(templatePath, 'utf8');

        // Handle multi-line course names (e.g. "1) Python\n2) Java")
        const formattedCourse = course.split(/\r?\n/).map((line, index) => {
            if (index === 0) return line;
            return `<tspan x="1549" dy="1.4em">${line}</tspan>`;  // x=1549 matches SVG course center anchor
        }).join('');

        svg = svg
            .replace('{{NAME}}', name.toUpperCase())
            .replace('{{COURSE}}', formattedCourse.toUpperCase())
            .replace('{{DATE}}', date)
            .replace('{{CERT_ID}}', cert_id.toUpperCase());

        console.log('Generating PDF (rasterized)...');
        convertSvgToPdf(svg, outputPath).then(() => {
            console.log('✅ PDF Generated (opens fast):', outputPath);
            process.exit(0);
        }).catch(e => {
            console.error('ERROR:', e.message);
            process.exit(1);
        });

    } catch (e) {
        console.error('Error loading SVG template:', e.message);
        process.exit(1);
    }
}

module.exports = { convertSvgToPdf };

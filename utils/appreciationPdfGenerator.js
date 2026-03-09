const isVercel = process.env.VERCEL || process.env.NODE_ENV === 'production';

let puppeteer;
let chromium;

if (isVercel) {
    puppeteer = require('puppeteer-core');
    chromium = require('@sparticuz/chromium');
} else {
    puppeteer = require('puppeteer');
}

const { PDFDocument } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

// ── SVG dimensions (must match the template) ───────────────────────────────────
const SVG_WIDTH = 4961;
const SVG_HEIGHT = 3508;

// ── Shared browser instance (reused across requests for speed) ─────────────────
let _browser = null;

async function getBrowser() {
    if (!_browser || !_browser.connected) {
        if (isVercel) {
            _browser = await puppeteer.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath: await chromium.executablePath(),
                headless: chromium.headless,
                ignoreHTTPSErrors: true,
            });
        } else {
            _browser = await puppeteer.launch({
                headless: 'new',
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
        }
    }
    return _browser;
}

// ── Main conversion function ───────────────────────────────────────────────────
async function convertSvgToPdf(svgString, pdfPath) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setViewport({ width: SVG_WIDTH, height: SVG_HEIGHT, deviceScaleFactor: 1 });

        const htmlContent = `<!DOCTYPE html>
<html>
<head>
    <link href="https://fonts.googleapis.com/css2?family=Abhaya+Libre:wght@800&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; width: ${SVG_WIDTH}px; height: ${SVG_HEIGHT}px; overflow: hidden; font-family: sans-serif; background: white; }
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

        // ── Step 2: Embed PNG into a PDF (fast-opening flat PDF) ─
        const pdfDoc = await PDFDocument.create();

        // Standard A4 landscape size in points (72 points per inch)
        const PDF_WIDTH = 1800;
        const PDF_HEIGHT = 1200;

        // Create PDF page with A4 dimensions
        const pdfPage = pdfDoc.addPage([PDF_WIDTH, PDF_HEIGHT]);
        const pngImage = await pdfDoc.embedPng(pngBuffer);

        // Draw the high-resolution PNG scaled down to fit the A4 PDF page
        pdfPage.drawImage(pngImage, {
            x: 0,
            y: 0,
            width: PDF_WIDTH,
            height: PDF_HEIGHT,
        });

        const pdfBytes = await pdfDoc.save();
        const pdfBuffer = Buffer.from(pdfBytes);

        if (pdfPath) {
            fs.writeFileSync(pdfPath, pdfBuffer);
            return null;
        }
        return pdfBuffer;

    } finally {
        await page.close();
    }
}

// ── Gracefully close browser on process exit ───────────────────────────────────
process.on('exit', async () => { if (_browser) await _browser.close(); });
process.on('SIGINT', async () => { if (_browser) await _browser.close(); process.exit(); });

// ── Test: run directly with node appreciationToPdf.js ──────────────────────────────────
if (require.main === module) {
    const department = "DEPARTMENT OF COMMERCE";
    const university = "Takshashila University";
    const name = "THANUSH K";
    const course = "B.Com First Year";
    const recognition = "Highest Attendance Percentage (100%)";
    const semester = "1st semester.";

    const templatePath = path.join(__dirname, '..', 'templates', 'appreciation_cert.svg');
    const outputPath = path.join(__dirname, 'test_appreciation_cert.pdf');

    try {
        let svg = fs.readFileSync(templatePath, 'utf8');

        // Load a local logo to test the image replacement.
        const logoPath = path.join(__dirname, '..', '..', 'src', 'assets', 'faceprepcampus-logo.svg');
        let logoBase64 = '';
        if (fs.existsSync(logoPath)) {
            const logoData = fs.readFileSync(logoPath);
            logoBase64 = `data:image/svg+xml;base64,${logoData.toString('base64')}`;
        }

        svg = svg
            .replace('{{LOGO}}', logoBase64)
            .replace('{{DEPARTMENT}}', department)
            .replace('{{UNIVERSITY}}', university)
            .replace('{{NAME}}', name)
            .replace('{{COURSE}}', course)
            .replace('{{RECOGNITION}}', recognition)
            .replace('{{SEMESTER}}', semester);

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

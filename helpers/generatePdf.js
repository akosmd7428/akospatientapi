const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const generatePdf = async (htmlContent, headerContent, footerContent, prescriptionUniqueId) => {
    // the pdf is served from the public assets folder, a random suffix keeps the url from being guessed from the 5 digit prescription number
    const safeId = String(prescriptionUniqueId).replace(/[^a-zA-Z0-9_-]/g, '');
    const fileName = `prescription_${safeId}_${crypto.randomBytes(16).toString('hex')}.pdf`;
    const filePath = path.join(__dirname, '../assets/prescriptions', fileName);

    // Ensure the directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    let browser;
    try {
        // Launch a headless browser with explicit path to Chrome and --no-sandbox flag
        browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome', // Adjust this path if necessary
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Add these flags
        });
        const page = await browser.newPage();

        // the html is static, no scripts and no loading of local files or plain http resources
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const url = request.url();
            if (url.startsWith('https://') || url.startsWith('data:') || url === 'about:blank') {
                request.continue();
            } else {
                request.abort();
            }
        });

        // Set page content
        await page.setContent(htmlContent);

        // Generate the PDF with options
        const pdfBuffer = await page.pdf({
            width: '9in',
            height: '11in',
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            footerTemplate: `<div style="margin: 0; padding: 0 20px; box-sizing: border-box; position: relative; min-height: 100%; font-size: 12px; text-align: center; width: 100%;">${footerContent}</div>`,
            headerTemplate: `<div style="width: 100%; height: 20mm;"></div>`, // Blank header
            margin: {
                top: '20mm',
                bottom: '20mm',
                left: '0mm',
                right: '0mm'
            }
        });

        // Write the PDF buffer to file
        fs.writeFileSync(filePath, pdfBuffer);

        return fileName;
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    } finally {
        if (browser) await browser.close();
    }
};

module.exports = {
    generatePdf
};

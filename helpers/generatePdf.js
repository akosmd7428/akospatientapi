// SEC-022: puppeteer >= 23 is ESM-only, so a top-level require() throws. It is
// loaded lazily with a dynamic import inside the async function below, which
// also keeps the browser package out of the startup path.
const path = require('path');
const fs = require('fs');
const { escapeHtml } = require('./escapeHtml'); // SEC-015

const generatePdf = async (htmlContent, headerContent, footerContent, prescriptionUniqueId) => {
    const fileName = `prescription_${prescriptionUniqueId}.pdf`;
    const filePath = path.join(__dirname, '../assets/prescriptions', fileName);

    // Ensure the directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }

    try {
        // Launch a headless browser with explicit path to Chrome and --no-sandbox flag
        /**
         * SEC-015: this launched with --no-sandbox --disable-setuid-sandbox while
         * rendering HTML built from unescaped, attacker-influenced values. The
         * sandbox is what contains a compromised renderer; without it a Chrome
         * renderer bug executes with the full privileges of this process.
         *
         * The flags are gone. Run the container as a non-root user rather than
         * re-adding them - see docs/security/findings/SEC-015 step 2.
         */
        const puppeteer = (await import('puppeteer')).default;

        const browser = await puppeteer.launch({
            executablePath: process.env.CHROME_PATH || undefined,
            headless: true, // puppeteer >= 22: this is the new headless mode
            args: ['--disable-dev-shm-usage'], // container-friendly, keeps the sandbox on
        });
        const page = await browser.newPage();

        /**
         * SEC-015: the template needs no scripts and no external resources, so
         * both are switched off. Together these close the SSRF path (an injected
         * <img src="http://169.254.169.254/..."> made the server fetch cloud
         * instance metadata) and the script-execution path.
         */
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
                return request.continue();
            }
            return request.abort();
        });

        await page.setContent(htmlContent, { waitUntil: 'domcontentloaded' });

        // Generate the PDF with options
        const pdfBuffer = await page.pdf({
            width: '9in',
            height: '11in',
            format: 'A4',
            printBackground: true,
            displayHeaderFooter: true,
            // SEC-015: footerContent is escaped; it was a second injection point.
            footerTemplate: `<div style="margin: 0; padding: 0 20px; box-sizing: border-box; position: relative; min-height: 100%; font-size: 12px; text-align: center; width: 100%;">${escapeHtml(footerContent)}</div>`,
            headerTemplate: `<div style="width: 100%; height: 20mm;"></div>`, // Blank header
            margin: {
                top: '20mm',
                bottom: '20mm',
                left: '0mm',
                right: '0mm'
            }
        });

        // Close the browser
        await browser.close();

        // Write the PDF buffer to file
        fs.writeFileSync(filePath, pdfBuffer);

        return fileName;
    } catch (error) {
        console.error('Error generating PDF:', error);
        throw error;
    }
};

module.exports = {
    generatePdf
};

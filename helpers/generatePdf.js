const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

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
        const browser = await puppeteer.launch({
            executablePath: '/usr/bin/google-chrome', // Adjust this path if necessary
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'] // Add these flags
        });
        const page = await browser.newPage();

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

// server.js
const express = require('express');
const puppeteer = require('puppeteer');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// 👇 REPLACE 'https://dyad-sales.com' WITH YOUR ACTUAL LIVE DOMAIN
app.use(cors({
  origin: [
    'http://localhost:3000'
  ]
}));

app.get('/api/generate-pdf', async (req, res) => {
  const { attemptId, lang = 'en' } = req.query;

  if (!attemptId) {
    return res.status(400).json({ error: 'Missing attemptId' });
  }

  const validLang = lang === 'ar' ? 'ar' : 'en';
  const PRINT_REPORT_URL = process.env.FRONTEND_URL || 'https://dyad-sales.com';
  const url = `${PRINT_REPORT_URL}/print-report?attemptId=${encodeURIComponent(attemptId)}&lang=${validLang}`;

  let browser;
  try {
    browser = await puppeteer.launch({
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1240, height: 1754 }); // A4 size
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForTimeout(1500);

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="dyad-report-${attemptId.slice(0, 8)}.pdf"`);
    res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  } finally {
    if (browser) await browser.close();
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', service: 'Dyad PDF Generator' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ PDF service running on port ${PORT}`);
});

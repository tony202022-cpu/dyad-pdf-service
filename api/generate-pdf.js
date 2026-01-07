const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

module.exports = async function handler(req, res) {
  let browser;

  try {
    const attemptId = req.query.attemptId;
    const langRaw = (req.query.lang || "en").toLowerCase();
    const lang = langRaw === "ar" ? "ar" : "en";

    if (!attemptId) {
      res.statusCode = 400;
      res.end("Missing attemptId");
      return;
    }

    const FRONTEND_URL =
      process.env.FRONTEND_URL || "https://assessment-app-nextjs.vercel.app";

    const url =
      `${FRONTEND_URL}/print-report` +
      `?attemptId=${encodeURIComponent(attemptId)}` +
      `&lang=${lang}` +
      `&puppeteer=1`;

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 60000,
    });

    // Wait until your React page explicitly signals readiness
    await page.waitForSelector('body[data-pdf-ready="1"]', {
      timeout: 60000,
    });

    // Wait for fonts (Cairo)
    try {
      await page.evaluateHandle("document.fonts.ready");
    } catch {}

    const pdfBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: {
        top: "0",
        right: "0",
        bottom: "0",
        left: "0",
      },
    });

    const pdfBuffer = Buffer.isBuffer(pdfBytes)
      ? pdfBytes
      : Buffer.from(pdfBytes);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dyad-report-${attemptId.slice(0, 8)}.pdf"`
    );
    res.setHeader("Content-Length", pdfBuffer.length);

    // 🔥 THIS IS THE CRITICAL LINE
    res.end(pdfBuffer);
  } catch (err) {
    console.error("PDF generation error:", err);
    res.statusCode = 500;
    res.end("PDF generation failed");
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
};

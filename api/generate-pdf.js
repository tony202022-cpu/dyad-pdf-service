// api/generate-pdf.js
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

module.exports = async (req, res) => {
  let browser;

  try {
    const attemptId = String(req.query.attemptId || "").trim();
    const langRaw = String(req.query.lang || "en").toLowerCase();
    const lang = langRaw === "ar" ? "ar" : "en";

    if (!attemptId) {
      return res.status(400).json({ error: "Missing attemptId" });
    }

    const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

    // ✅ IMPORTANT:
    // Your PrintReportClient reads attemptId from query params (?attemptId=...)
    // so we must call /print-report, NOT /reports/pdf/<id>
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

    // A4-ish viewport helps layout consistency
    await page.setViewport({ width: 1240, height: 1754 });

    // Load page
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

    // Wait for your "ready" marker (set by PrintReportClient)
    await page.waitForSelector('body[data-pdf-ready="1"]', { timeout: 60000 });

    // Wait for fonts (Cairo etc.)
    try {
      await page.evaluateHandle("document.fonts.ready");
    } catch {}

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dyad-report-${attemptId.slice(0, 8)}.pdf"`
    );

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("PDF error:", error);
    return res.status(500).json({
      error: "PDF generation failed",
      details: String(error?.message || error),
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
  }
};

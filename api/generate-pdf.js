const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

module.exports = async (req, res) => {
  try {
    const attemptId = req.query.attemptId;
    const langRaw = (req.query.lang || "en").toLowerCase();
    const lang = langRaw === "ar" ? "ar" : "en";

    if (!attemptId) {
      return res.status(400).json({ error: "Missing attemptId" });
    }

    const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
    const url = `${FRONTEND_URL}/reports/pdf/${encodeURIComponent(
      attemptId
    )}?lang=${lang}&puppeteer=1`;

    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });

    const page = await browser.newPage();

    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

    // wait for your marker
    await page.waitForSelector('body[data-pdf-ready="1"]', { timeout: 60000 });

    // wait for fonts (Cairo etc.)
    // if fonts API exists, wait, otherwise continue
    try {
      await page.evaluateHandle("document.fonts.ready");
    } catch {}

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dyad-report-${String(attemptId).slice(0, 8)}.pdf"`
    );
    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("PDF error:", error);
    return res.status(500).json({
      error: "PDF generation failed",
      details: String(error?.message || error),
    });
  }
};

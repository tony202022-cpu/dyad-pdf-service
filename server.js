// server.js
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3001;

// ✅ Put your real FRONTEND domain in Vercel env vars:
// FRONTEND_URL = https://assessment-app-nextjs.vercel.app
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";

// ✅ allow calls from your frontend + local dev
app.use(
  cors({
    origin: ["http://localhost:3000", FRONTEND_URL],
  })
);

app.get("/api/generate-pdf", async (req, res) => {
  const { attemptId, lang = "en" } = req.query;
  if (!attemptId) return res.status(400).json({ error: "Missing attemptId" });

  const validLang = lang === "ar" ? "ar" : "en";

  // ✅ IMPORTANT: use the PDF HTML route
  const url = `${FRONTEND_URL}/reports/pdf/${encodeURIComponent(attemptId)}?lang=${validLang}&puppeteer=1`;

  let browser;

  try {
    // ✅ Use serverless Chromium on Vercel, normal puppeteer locally
    const isVercel = !!process.env.VERCEL;

    let puppeteer;
    let launchOptions;

    if (isVercel) {
      const chromium = require("@sparticuz/chromium");
      puppeteer = require("puppeteer-core");

      launchOptions = {
        args: chromium.args,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
        defaultViewport: { width: 1240, height: 1754 },
      };
    } else {
      puppeteer = require("puppeteer");
      launchOptions = {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
        ],
        headless: "new",
        defaultViewport: { width: 1240, height: 1754 },
      };
    }

    browser = await puppeteer.launch(launchOptions);

    const page = await browser.newPage();

    // ✅ Load the report page
    await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });

    // ✅ Wait for "ready" marker
    await page.waitForSelector('body[data-pdf-ready="1"]', { timeout: 60000 });

    // ✅ Wait for fonts to finish
    await page.evaluate(async () => {
      // @ts-ignore
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
    });

    // ✅ Extra frame to let SVG + layout settle
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r())));

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dyad-report-${String(attemptId).slice(0, 8)}.pdf"`
    );
    res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF error:", error);
    res.status(500).json({
      error: "PDF generation failed",
      details: String(error?.message || error),
      reportUrl: url,
    });
  } finally {
    try {
      if (browser) await browser.close();
    } catch {}
  }
});

app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    service: "Dyad PDF Generator",
    frontend: FRONTEND_URL,
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ PDF service running on port ${PORT}`);
});

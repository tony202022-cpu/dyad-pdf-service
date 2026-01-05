// server.js
const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 3001;

/**
 * ✅ CORS
 * In production, set FRONTEND_URL to your Vercel/custom domain.
 * Example: https://dyad-sales.com
 */
const FRONTEND_URL = (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      FRONTEND_URL, // allow your deployed frontend
    ],
    methods: ["GET"],
  })
);

app.get("/api/generate-pdf", async (req, res) => {
  const attemptId = String(req.query.attemptId || "").trim();
  const langRaw = String(req.query.lang || "").toLowerCase();
  const lang = langRaw === "ar" ? "ar" : "en";

  if (!attemptId) {
    return res.status(400).json({ error: "Missing attemptId" });
  }

  /**
   * ✅ IMPORTANT CHANGE:
   * We render the server-side PDF page (no client hooks, no window.print):
   * /reports/pdf/[attemptId]
   *
   * We also add puppeteer=1 flag (future-proof).
   */
  const reportUrl = `${FRONTEND_URL}/reports/pdf/${encodeURIComponent(attemptId)}?lang=${lang}&puppeteer=1`;

  let browser;

  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--font-render-hinting=medium",
        "--disable-features=IsolateOrigins,site-per-process",
      ],
    });

    const page = await browser.newPage();

    // A4-ish viewport (doesn't force PDF size, but helps layout)
    await page.setViewport({ width: 1240, height: 1754, deviceScaleFactor: 1 });

    // Helpful for debugging if something fails on Vercel
    page.on("console", (msg) => {
      try {
        console.log("[PAGE LOG]", msg.type(), msg.text());
      } catch {}
    });

    // Load the report
    await page.goto(reportUrl, { waitUntil: "networkidle0", timeout: 60_000 });

    // ✅ Wait for fonts (critical for Arabic + layout)
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });

    // ✅ Wait for our deterministic "ready" signal (set in the HTML body)
    // We require: <body data-pdf-ready="1">
    await page.waitForSelector('body[data-pdf-ready="1"]', { timeout: 60_000 });

    // ✅ Small final micro-wait for layout paint (more stable than arbitrary 1500ms)
    await page.waitForTimeout(200);

    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    // Response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="dyad-report-${attemptId.slice(0, 8)}-${lang}.pdf"`
    );
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.status(200).send(pdfBuffer);
  } catch (error) {
    console.error("PDF error:", error);
    return res.status(500).json({
      error: "PDF generation failed",
      details: String(error?.message || error),
      reportUrl, // helpful to diagnose incorrect domain/env
    });
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {}
    }
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
  console.log(`✅ FRONTEND_URL = ${FRONTEND_URL}`);
});

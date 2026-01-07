// api/generate-pdf.js  (CommonJS-safe, Vercel Serverless friendly)
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");

function safeFilename(name) {
  return String(name).replace(/[^\w\-\.]+/g, "_");
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }

  const attemptId = (req.query.attemptId || "").toString();
  const lang = (req.query.lang || "en").toString();
  const debug = (req.query.debug || "").toString() === "1";

  if (!attemptId) return res.status(400).send("Missing attemptId");

  const FRONTEND_URL = process.env.FRONTEND_URL;
  if (!FRONTEND_URL) return res.status(500).send("Missing FRONTEND_URL env var");

  const printUrl =
    `${FRONTEND_URL.replace(/\/$/, "")}` +
    `/print-report?attemptId=${encodeURIComponent(attemptId)}` +
    `&lang=${encodeURIComponent(lang)}` +
    `&puppeteer=1`;

  let browser;

  try {
    const executablePath = await chromium.executablePath();

    browser = await puppeteer.launch({
      args: [
        ...chromium.args,
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--font-render-hinting=medium",
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36"
    );

    // Load page
    await page.goto(printUrl, { waitUntil: "domcontentloaded", timeout: 120000 });

    // Wait for your "ready" marker
    await page.waitForSelector('body[data-pdf-ready="1"]', { timeout: 120000 });

    // Wait for fonts (helps Arabic shaping / Cairo)
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
    });

    // Small extra delay WITHOUT page.waitForTimeout (not available in your runtime)
    await new Promise((r) => setTimeout(r, 150));

    // Generate PDF
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    const buf = Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);

    // Sanity check
    if (buf.length < 5 || buf.slice(0, 5).toString() !== "%PDF-") {
      throw new Error("Output missing %PDF- header (not a valid PDF)");
    }

    const filename = safeFilename(`report_${attemptId}_${lang}.pdf`);

    // Send raw bytes (NO JSON)
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buf.length));
    res.setHeader("Cache-Control", "no-store");

    return res.end(buf);
  } catch (err) {
    console.error("generate-pdf error:", err);

    // Debug mode: return stack trace in response
    if (debug) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end(
        `Failed to generate PDF:\n${err && err.stack ? err.stack : String(err)}`
      );
    }

    return res.status(500).send("Failed to generate PDF");
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
  }
};

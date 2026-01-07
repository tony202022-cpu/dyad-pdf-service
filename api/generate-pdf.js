// api/generate-pdf.js
import chromium from "@sparticuz/chromium";
import puppeteer from "puppeteer-core";

export const config = {
  api: {
    // Vercel: allow larger response sizes for PDFs
    responseLimit: false,
    // Vercel: we control the raw response ourselves
    bodyParser: false,
  },
};

function getStringParam(req, key, fallback = "") {
  const v = req.query?.[key];
  if (Array.isArray(v)) return v[0] ?? fallback;
  return (v ?? fallback).toString();
}

function safeFilename(name) {
  return name.replace(/[^\w\-\.]+/g, "_");
}

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }

  const attemptId = getStringParam(req, "attemptId");
  const lang = getStringParam(req, "lang", "en") || "en";

  if (!attemptId) {
    return res.status(400).send("Missing attemptId");
  }

  const FRONTEND_URL = process.env.FRONTEND_URL;
  if (!FRONTEND_URL) {
    return res.status(500).send("Missing FRONTEND_URL env var");
  }

  // Build the frontend URL Puppeteer should render
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
        // Helpful on serverless
        "--no-sandbox",
        "--disable-setuid-sandbox",
        // Fonts/rendering stability
        "--font-render-hinting=medium",
      ],
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();

    // Slightly “real browser” UA can reduce edge cases
    await page.setUserAgent(
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome Safari/537.36"
    );

    // Load the page and wait for your readiness flag
    await page.goto(printUrl, { waitUntil: "domcontentloaded", timeout: 120000 });

    // Wait until the app signals it is fully rendered
    await page.waitForSelector('body[data-pdf-ready="1"]', { timeout: 120000 });

    // Optional: extra tiny delay to ensure fonts finish shaping (Arabic)
    await page.waitForTimeout(150);

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      preferCSSPageSize: true, // respects @page size if you use it
      // If you rely on CSS page margins, keep margins minimal here
      margin: { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
    });

    // ✅ MUST return raw bytes, not JSON
    // Ensure Buffer (puppeteer returns Uint8Array-like in some environments)
    const buf = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);

    // Quick sanity check: PDF signature
    if (buf.length < 5 || buf.slice(0, 5).toString() !== "%PDF-") {
      // If this happens, return debug text (not binary) to help you diagnose.
      // But in normal operation, you should never hit this.
      res.status(500).send("Generated output is not a valid PDF (%PDF- missing)");
      return;
    }

    const filename = safeFilename(`report_${attemptId}_${lang}.pdf`);

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buf.length));
    // Prevent intermediary transformations/caching issues
    res.setHeader("Cache-Control", "no-store");

    // IMPORTANT: write bytes + end (no res.json, no object return)
    res.end(buf);
  } catch (err) {
    console.error("generate-pdf error:", err);
    // Return plain text; do NOT try to send partial binary
    res.status(500).send("Failed to generate PDF");
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch (_) {}
    }
  }
}

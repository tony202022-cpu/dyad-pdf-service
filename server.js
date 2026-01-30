const express = require("express");

// Import existing handlers (no changes)
const generatePdf = require("./api/generate-pdf");
const health = require("./api/health");

const app = express();

// Optional: allow JSON body if your handler expects it
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Mount endpoints
// Health endpoint
app.get("/health", (req, res) => {
  // health.js might export a function(req,res) or an object
  if (typeof health === "function") return health(req, res);
  if (health && typeof health.default === "function") return health.default(req, res);
  return res.status(200).send("ok");
});

// PDF endpoint
app.all("/generate-pdf", (req, res) => {
  // Vercel-style handler: (req, res) => ...
  if (typeof generatePdf === "function") return generatePdf(req, res);
  if (generatePdf && typeof generatePdf.default === "function") return generatePdf.default(req, res);
  return res.status(500).send("generate-pdf handler not found");
});

// Listen on Cloud Run port
const port = process.env.PORT || 3001;
app.listen(port, "0.0.0.0", () => {
  console.log(`dyad-pdf-service listening on ${port}`);
});

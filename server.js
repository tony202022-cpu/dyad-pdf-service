const http = require("http");

const server = http.createServer((req, res) => {
  if (req.url === "/health" || req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

const port = process.env.PORT || 8080;

server.listen(port, "0.0.0.0", () => {
  console.log("Cloud Run listening on", port);
});

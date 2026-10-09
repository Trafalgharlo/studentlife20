const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const root = __dirname;
const files = {
  "/": "index.html",
  "/index.html": "index.html",
  "/lib/domain.js": "lib/domain.js",
  "/app.js": "app.js",
  "/style.css": "style.css",
};
const server = http.createServer((req, res) => {
  if (req.url.split("?")[0] === "/api/notifications") {
    res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        error:
          "Локальный предпросмотр: сервер уведомлений не настроен. Данные сохранены в браузере.",
      }),
    );
    return;
  }
  const file = files[req.url.split("?")[0]];
  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  res.setHeader(
    "Content-Type",
    file.endsWith(".js")
      ? "text/javascript; charset=utf-8"
      : file.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "text/html; charset=utf-8",
  );
  res.end(fs.readFileSync(path.join(root, file)));
});
server.listen(4175, "127.0.0.1", () => console.log("http://127.0.0.1:4175"));

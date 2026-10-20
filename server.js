const http = require("http");
const fs = require("fs");
const path = require("path");

const host = "127.0.0.1";
const port = 8080;
const root = __dirname;
const publicFiles = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/storage.js": ["storage.js", "text/javascript; charset=utf-8"],
  "/game-model.js": ["game-model.js", "text/javascript; charset=utf-8"],
  "/game.js": ["game.js", "text/javascript; charset=utf-8"],
  "/assets/maps/ground-zero.png": ["assets/maps/ground-zero.png", "image/png"],
  "/assets/maps/customs.png": ["assets/maps/customs.png", "image/png"],
  "/assets/maps/interchange.png": ["assets/maps/interchange.png", "image/png"],
  "/assets/maps/reserve.png": ["assets/maps/reserve.png", "image/png"],
  "/assets/maps/the-lab.png": ["assets/maps/the-lab.png", "image/png"]
};

function handleRequest(request, response) {
  let pathname;
  try {
    pathname = decodeURIComponent(request.url.split("?")[0]);
  } catch (_) {
    response.writeHead(400);
    response.end("Bad request");
    return;
  }

  if (!Object.hasOwn(publicFiles, pathname)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  const [filename, contentType] = publicFiles[pathname];
  fs.readFile(path.join(root, filename), (error, data) => {
    if (error) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-cache"
    });
    response.end(data);
  });
}

if (require.main === module) {
  http.createServer(handleRequest).listen(port, host, () => {
    console.log(`Tarkov Jump запущен: http://${host}:${port}`);
    console.log("Не закрывайте это окно во время игры. Для остановки нажмите Ctrl+C.");
  });
}

module.exports = handleRequest;

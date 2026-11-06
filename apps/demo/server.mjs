import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(
  process.argv[2] ?? fileURLToPath(new URL(".", import.meta.url)),
);
const port = Number(process.env.DEMO_PORT ?? 4173);
const host = process.env.DEMO_HOST ?? "0.0.0.0";
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg",
  ".png": "image/png",
};
const server = http.createServer(async (req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { Allow: "GET, HEAD" }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://demo.local").pathname,
    );
    if (pathname === "/修复") {
      res.writeHead(302, { Location: "/", "Cache-Control": "no-store" }).end();
      return;
    }
    // Serve only the public build, never the launcher or neighboring workspace files.
    if (
      pathname !== "/" &&
      pathname !== "/index.html" &&
      !/^\/assets\/[a-zA-Z0-9_.-]+\.(js|css|jpg|png)$/.test(pathname)
    ) {
      res.writeHead(404).end("Not found");
      return;
    }
    const relative = pathname === "/" ? "index.html" : pathname.slice(1);
    const content = await readFile(path.join(root, relative));
    res.writeHead(200, {
      "Content-Type":
        types[path.extname(relative)] ?? "application/octet-stream",
      "Cache-Control":
        relative === "index.html" ? "no-store" : "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    res.end(req.method === "HEAD" ? undefined : content);
  } catch {
    res.writeHead(404).end("Not found");
  }
});
server.listen(port, host, () =>
  console.log(`LIVERSE demo: http://127.0.0.1:${port}/`),
);
server.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close());

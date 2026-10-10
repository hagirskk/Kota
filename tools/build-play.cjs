const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const root = path.join(__dirname, "..");
const sp = process.env.KOTA_DEPS || path.join(__dirname, "..");
const r = esbuild.buildSync({
  entryPoints: [path.join(root, "main.js")],
  bundle: true, minify: true, format: "iife", write: false,
  alias: { three: path.join(sp, "node_modules/three/build/three.module.js") },
  target: ["es2018"], legalComments: "none",
});
const js = r.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");
let body = html.split("<body>")[1].split("</body>")[0];
body = body.replace(/<script type="importmap">[\s\S]*?<\/script>/, "")
           .replace(/<script type="module" src="main.js"><\/script>/, "");
const out = `<title>Kota Craft</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" />
<style>
${css}
</style>
${body}
<script>
${js}
</script>`;
fs.writeFileSync(path.join(root, "play.html"), `<!DOCTYPE html>\n<html lang="ja">\n<head>\n<meta charset="UTF-8" />\n<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />\n</head>\n<body>\n${out}\n</body>\n</html>\n`);
console.log("built", out.length, "bytes; external scripts:", (out.match(/<script[^>]+src=/g) || []).length);

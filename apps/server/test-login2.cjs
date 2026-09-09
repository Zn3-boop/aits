const http = require("http");
const data = JSON.stringify({ username: "testuser", password: "test123" });
const req = http.request({
  hostname: "localhost",
  port: 8787,
  path: "/api/auth/login",
  method: "POST",
  headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
}, (res) => {
  let body = "";
  res.on("data", (chunk) => { body += chunk; });
  res.on("end", () => { console.log("Status:", res.statusCode); console.log("Body:", body); process.exit(0); });
});
req.on("error", (e) => { console.log("Error:", e.message); process.exit(1); });
req.write(data);
req.end();

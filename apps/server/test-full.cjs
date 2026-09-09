const http = require("http");
const data = JSON.stringify({ username: "hello", password: "hello123", nickname: "Hello" });
const req = http.request({
  hostname: "localhost",
  port: 8787,
  path: "/api/auth/register",
  method: "POST",
  headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
}, (res) => {
  let body = "";
  res.on("data", (chunk) => { body += chunk; });
  res.on("end", () => { console.log("Register Status:", res.statusCode); console.log("Body:", body.substring(0, 200)); 
    // Now test login
    const data2 = JSON.stringify({ username: "hello", password: "hello123" });
    const req2 = http.request({
      hostname: "localhost",
      port: 8787,
      path: "/api/auth/login",
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data2) }
    }, (res2) => {
      let body2 = "";
      res2.on("data", (chunk) => { body2 += chunk; });
      res2.on("end", () => { console.log("Login Status:", res2.statusCode); console.log("Body:", body2.substring(0, 200)); process.exit(0); });
    });
    req2.on("error", (e) => { console.log("Login Error:", e.message); process.exit(1); });
    req2.write(data2);
    req2.end();
  });
});
req.on("error", (e) => { console.log("Register Error:", e.message); process.exit(1); });
req.write(data);
req.end();

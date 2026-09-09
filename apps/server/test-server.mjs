import Fastify from "fastify";
import cors from "@fastify/cors";
import bcrypt from "bcrypt";
import { prisma } from "./src/db.js";

const app = Fastify({ logger: true });
await app.register(cors, { origin: true, credentials: true });

app.post("/api/auth/login", async (request, reply) => {
  try {
    const body = request.body || {};
    console.log("Login body:", JSON.stringify(body));
    const user = await prisma.user.findUnique({ where: { username: body.username } });
    console.log("User found:", user ? user.username : "null");
    if (!user) return reply.status(401).send({ error: "UNAUTHORIZED" });
    const valid = await bcrypt.compare(body.password, user.password);
    console.log("Password valid:", valid);
    if (!valid) return reply.status(401).send({ error: "UNAUTHORIZED" });
    return reply.send({ ok: true, user: { id: user.id, username: user.username } });
  } catch(e) {
    console.error("Login error:", e);
    return reply.status(500).send({ error: "INTERNAL_ERROR", message: e.message });
  }
});

try {
  await app.listen({ host: "0.0.0.0", port: 8788 });
  console.log("Test server on 8788");
} catch(e) {
  console.error("Start error:", e);
  process.exit(1);
}

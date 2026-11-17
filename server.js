import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import {
  falixRequest,
  getServerStatus,
  idempotencyKey,
  listServers,
  sendConsoleCommand,
  sendPowerSignal
} from "./falixClient.js";

dotenv.config();

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

async function sendFalixResponse(res, path, options) {
  try {
    const result = await falixRequest(path, options);
    res.status(result.status).json(result.payload);
  } catch (error) {
    const status = error.message === "Missing FALIX_API_KEY." ? 500 : 502;
    res.status(status).json({
      error: status === 500 ? "Server is missing FALIX_API_KEY." : "Falix request failed.",
      details: error instanceof Error ? error.message : String(error)
    });
  }
}

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/me", (_req, res) => {
  sendFalixResponse(res, "/me");
});

app.get("/api/servers", (req, res) => {
  if (!Object.keys(req.query).length) {
    return listServers()
      .then((result) => res.status(result.status).json(result.payload))
      .catch((error) => res.status(502).json({ error: "Falix request failed.", details: error.message }));
  }

  const params = new URLSearchParams(req.query);
  sendFalixResponse(res, `/servers?${params.toString()}`);
});

app.get("/api/servers/:serverId", (req, res) => {
  sendFalixResponse(res, `/servers/${encodeURIComponent(req.params.serverId)}`);
});

app.get("/api/servers/:serverId/status", (req, res) => {
  getServerStatus(req.params.serverId)
    .then((result) => res.status(result.status).json(result.payload))
    .catch((error) => res.status(502).json({ error: "Falix request failed.", details: error.message }));
});

app.post("/api/servers/:serverId/power", (req, res) => {
  const signal = String(req.body?.signal || "");
  const allowedSignals = new Set(["start", "stop", "restart", "kill"]);

  if (!allowedSignals.has(signal)) {
    return res.status(400).json({
      error: "Invalid power signal. Use start, stop, restart, or kill."
    });
  }

  sendPowerSignal(req.params.serverId, signal)
    .then((result) => res.status(result.status).json(result.payload))
    .catch((error) => res.status(502).json({ error: "Falix request failed.", details: error.message }));
});

app.post("/api/servers/:serverId/commands", (req, res) => {
  const command = String(req.body?.command || "").trim();

  if (!command || command.includes("\n")) {
    return res.status(400).json({
      error: "Command must be one non-empty line."
    });
  }

  sendConsoleCommand(req.params.serverId, command)
    .then((result) => res.status(result.status).json(result.payload))
    .catch((error) => res.status(502).json({ error: "Falix request failed.", details: error.message }));
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

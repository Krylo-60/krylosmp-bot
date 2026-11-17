import dotenv from "dotenv";
import { listServers } from "./falixClient.js";

dotenv.config();

const result = await listServers();

if (!result.ok) {
  console.error(JSON.stringify(result.payload, null, 2));
  process.exit(1);
}

for (const server of result.payload.data || []) {
  const name = server.name || server.display_name || server.identifier || "Unnamed server";
  const status = server.status?.state || server.state || "unknown";
  console.log(`${name}: ${server.id} (${status})`);
}

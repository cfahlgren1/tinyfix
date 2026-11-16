import { readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const models = new URL("../.models/", import.meta.url);

/** Serves the downloaded model files over HTTP, as a site that hosts them itself would. */
export async function serveModels(): Promise<{ baseUrl: string; requested: string[]; close: () => Promise<void> }> {
  const revision = readdirSync(models)[0];
  if (!revision) throw new Error("Run `npm run models` first.");
  const requested: string[] = [];
  const server: Server = createServer((request, response) => {
    const file = (request.url ?? "/").slice(1);
    requested.push(file);
    try {
      response.end(readFileSync(new URL(`${revision}/${file}`, models)));
    } catch {
      response.statusCode = 404;
      response.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/`,
    requested,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

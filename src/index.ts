import { Env } from "./types";
import Worker from "./worker"
import * as pointer from "json-pointer";

export default {

  async fillConfig(worker: Worker, obj: any, args: object) {
    if (obj === null) {
      return;
    }
    if (typeof obj !== "object") {
      return;
    }
    if (Array.isArray(obj)) {
      return;
    }
    const keys = Object.keys(obj);
    for (const key of keys) {
      const value = obj[key];
      if (value.$ref) {
        const url = new URL(value.$ref);
        if (url.protocol == "args:") {
          var newValue;
          try {
            newValue = pointer.get(args, url.pathname);
          } catch (e) {
            newValue = url.searchParams.get("default");
          }
          obj[key] = newValue;
        } else if (url.protocol == "secrets:") {
          obj[key] = await worker.getSecret(url.pathname);
        } else {
          throw new Error(`unsupported ref: ${value.$ref}`);
        }
      } else {
        await this.fillConfig(worker, value, args);
      }
    }
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const paths = url.pathname.split("/");
    if (paths.length != 3) {
      return new Response("bad request", { status: 400 });
    }

    const token = paths[1];
    const worker = new Worker(env);

    const user = await worker.getUser(token);
    if (!user) {
      return new Response("not found", { status: 404 });
    }

    const accesses = await worker.getAccesses(user);
    const proxies = await worker.getProxies(accesses);
    const proxyConfigs = await worker.getProxiesConfig([... new Set(proxies.map((val) => val.type))]);

    var outboundsConfig = []
    for (const proxy of proxies) {
      const config = structuredClone(proxyConfigs.get(proxy.type));
      const addr = await worker.getHostAddr(proxy.host);
      await this.fillConfig(worker, config, {
        "server": addr,
        "server_port": proxy.port,
        ...(user.config ? user.config.args : null)
      });
      outboundsConfig.push(config);
    }

    const result = {
      "inbounds": [
        {
          "type": "mixed",
          "listen": "127.0.0.1",
          "listen_port": 5353,
        }
      ],
      "outbounds": outboundsConfig,
    }

    return new Response(JSON.stringify(result, null, 2));
  },
};

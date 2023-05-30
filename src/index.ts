import { ClashConfigurator, Configurator, SingboxConfigurator } from "./config";
import { Env, Outbound } from "./types";
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

    var format: string | null = url.searchParams.get("format");
    if (!format) {
      const filename = paths[2];
      if (filename == "config.json") {
        format = "sing-box";
      } else if (filename == "config.yaml") {
        format = "clash";
      }
    }

    var configurator: Configurator;
    if (format == "sing-box") {
      configurator = new SingboxConfigurator();
    } else if (format == "clash") {
      configurator = new ClashConfigurator();
    } else {
      return new Response("bad request", { status: 400 });
    }

    const token = paths[1];
    const worker = new Worker(env);

    const user = await worker.getUser(token);
    if (!user) {
      return new Response("not found", { status: 404 });
    }
    user.config = user.config || {};

    const proxies = await worker.getProxies(user);
    const rules = await worker.getRules(user);
    const proxyConfigs = await worker.getProxiesConfig([... new Set(proxies.map((val) => val.type))]);

    var outboundsConfig: Outbound[] = []
    for (const proxy of proxies) {
      const config = structuredClone(proxyConfigs.get(proxy.type));
      const addr = await worker.getHostAddr(proxy.host);
      await this.fillConfig(worker, config, {
        "server": addr,
        "server_port": proxy.port,
        ...(user.config ? user.config.args : null)
      });
      outboundsConfig.push({
        host: proxy.host,
        port: proxy.port,
        type: proxy.type,
        config: config,
      });
    }

    return new Response(JSON.stringify(configurator.create(user.config, outboundsConfig, rules), null, 2));
  },
};

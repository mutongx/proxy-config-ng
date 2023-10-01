import YAML from "js-yaml";
import JsonPointer from "json-pointer";

import { ClashConfigurator, SingboxConfigurator } from "./worker/config";
import { Env, Outbound } from "./worker/types";
import Database from "./worker/db"

export default {

  async fillConfig(db: Database, obj: any, args: object) {
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
            newValue = JsonPointer.get(args, url.pathname);
          } catch (e) {
            newValue = url.searchParams.get("default");
          }
          obj[key] = newValue;
        } else if (url.protocol == "secrets:") {
          obj[key] = await db.getSecret(url.pathname);
        } else {
          throw new Error(`unsupported ref: ${value.$ref}`);
        }
      } else {
        await this.fillConfig(db, value, args);
      }
    }
  },

  async processGetAssets(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
    const url = new URL(request.url);
    const paths = url.pathname.split("/");
    const filename = paths[paths.length - 1];
    if (filename === "" || filename === "index.html" || filename === "_app.js") {
      return env.ASSETS.fetch(request);
    }
    return null;
  },

  async processGetProxyConfig(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
    const url = new URL(request.url);
    const paths = url.pathname.split("/");
    if (paths.length != 3) {
      return null;
    }

    const token = paths[1];
    const db = new Database(env);
    const user = await db.getUser(token);
    if (!user) {
      return null;
    }

    var format: string | null = url.searchParams.get("format")
    if (!format) {
      const filename = paths[2];
      if (filename == "config.yaml") {
        format = "clash";
      } else {
        format = "sing-box";
      }
    }
    if (format != "sing-box" && format != "clash") {
      format = "sing-box";
    }

    const userConfig = {
      ...user.config,
      ...Object.fromEntries(Array.from(url.searchParams).map(([key, value]) => {
        try {
          return [key, JSON.parse(value)];
        } catch (e) {
          return [key, value];
        }
      })),
    };

    const [proxies, rules, dns] = await Promise.all([db.getProxies(user), db.getRules(user), db.getDns(user)]);
    const proxiesConfig = await db.getProxiesConfig([... new Set(proxies.map((val) => val.type))]);

    var outboundsConfig: Outbound[] = []
    for (const proxy of proxies) {
      const config = structuredClone(proxiesConfig.get(proxy.type));
      const addr = await db.getHostAddr(proxy.host);
      await this.fillConfig(db, config, {
        ...userConfig,
        ...proxy.config,
        "server": addr,
        "server_port": proxy.port,
      });
      outboundsConfig.push({
        host: proxy.host,
        port: proxy.port,
        type: proxy.type,
        groups: proxy.config?.groups || [],
        config: config,
      });
    }

    const download = url.searchParams.get("download") !== "false";
    if (format == "sing-box") {
      const conf = new SingboxConfigurator();
      return new Response(
        `// url = "${request.url}"\n` + 
        `// user = "${user.name}"\n` + 
        JSON.stringify(conf.create(userConfig, outboundsConfig, rules, dns), null, 2),
        {
          headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `${download ? "attachment" : "inline"}; filename="config.json"`,
          }
        },
      );
    }
    if (format == "clash") {
      const conf = new ClashConfigurator();
      return new Response(
        `# url = "${request.url}"\n` + 
        `# user = "${user.name}"\n` + 
        YAML.dump(conf.create(userConfig, outboundsConfig, rules)),
        {
          headers: {
            "Content-Type": "application/x-yaml",
            "Content-Disposition": `${download ? "attachment" : "inline"}; filename="config.yaml"`,
          }
        },
      );
    }

    throw new Error("should never reach this")
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    let resp: Response | null = null;
    resp = await this.processGetAssets(request, env, ctx);
    if (resp) {
      return resp;
    }
    resp = await this.processGetProxyConfig(request, env, ctx);
    if (resp) {
      return resp;
    }
    return new Response("not found", { status: 404 });
  },
};
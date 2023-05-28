import { Access, Proxy, User } from "./types";

export interface Env {
  SECRETS: KVNamespace;
  DB: D1Database;
  GITHUB_REPO: string;
  GITHUB_REF: string;
  GITHUB_TOKEN: string;
}

export default {

  async getUser(env: Env, token: string): Promise<User | null> {
    const stmt = env.DB.prepare("SELECT * FROM user WHERE token = ?1").bind(token);
    const user = await stmt.first() as User | null;
    return user;
  },

  async getAccesses(env: Env, user: User): Promise<Array<Access>> {
    const stmt = env.DB.prepare("SELECT * FROM access WHERE user = ?1").bind(user.name);
    const result = await stmt.all();
    const accesses = result.results! as Array<Access>;
    return accesses;
  },

  async getProxies(env: Env, access: Array<Access>): Promise<Array<Proxy>> {
    const tags = access.filter((val) => val.class == "proxy").map((val) => val.tag);
    if (!tags) {
      return [];
    }
    const stmt = env.DB.prepare("SELECT * FROM proxy WHERE " + Array(tags.length).fill("tag = ?").join(" OR ")).bind(...tags);
    const result = await stmt.all();
    const proxies = result.results! as Array<Proxy>;
    return proxies;
  },

  async getProxiesConfig(env: Env, proxyTypes: Array<string>): Promise<Map<string, object>> {
    var result: Map<string, object> = {};
    for (const type of proxyTypes) {
      const resp = await fetch(
        `https://api.github.com/repos/${env.GITHUB_REPO}/contents/proxies/${type}.json`,
        {
          headers: {
            "User-Agent": "Mutong's Cloudflare Workers",
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`
          }
        });
    }
    return result;
  },

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const paths = url.pathname.split("/");
    if (paths.length != 3) {
      return new Response("bad request", { status: 400 });
    }

    const token = paths[1];
    const user = await this.getUser(env, token);
    if (!user) {
      return new Response("not found", { status: 404 });
    }

    const accesses = await this.getAccesses(env, user);
    const proxies = await this.getProxies(env, accesses);
    const proxyTypes = [... new Set(proxies.map((val) => val.type))]
    const proxyConfigs = await this.getProxiesConfig(env, proxyTypes);

    return new Response("fuck you");
  },
};

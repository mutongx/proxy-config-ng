import { Env } from "./types";
import { Access, Host, Proxy, Secret, User } from "./types";
import * as pointer from "json-pointer";

export default class {

  env: Env;

  constructor(env: Env) {
    this.env = env;
  }

  async getUser(env: Env, token: string): Promise<User | null> {
    const stmt = env.DB.prepare("SELECT * FROM user WHERE token = ?1").bind(token);
    const user = await stmt.first() as User | null;
    return user;
  }

  async getAccesses(env: Env, user: User): Promise<Array<Access>> {
    const stmt = env.DB.prepare("SELECT * FROM access WHERE user = ?1").bind(user.name);
    const result = await stmt.all();
    const accesses = result.results! as Array<Access>;
    return accesses;
  }

  async getProxies(env: Env, access: Array<Access>): Promise<Array<Proxy>> {
    const tags = access.filter((val) => val.class == "proxy").map((val) => val.tag);
    if (!tags) {
      return [];
    }
    const stmt = env.DB.prepare("SELECT * FROM proxy WHERE " + Array(tags.length).fill("tag = ?").join(" OR ")).bind(...tags);
    const result = await stmt.all();
    const proxies = result.results! as Array<Proxy>;
    return proxies;
  }

  async getProxiesConfig(env: Env, proxyTypes: Array<string>): Promise<Map<string, object>> {
    var result: Map<string, object> = new Map();
    for (const type of proxyTypes) {
      const resp = await fetch(
        `https://api.github.com/repos/${env.GITHUB_REPO}/contents/proxies/${type}.json?ref=${env.GITHUB_REF}`,
        {
          headers: {
            "Accept": "application/vnd.github.raw",
            "User-Agent": "Mutong's Cloudflare Workers",
            "Authorization": `Bearer ${env.GITHUB_TOKEN}`
          }
        });
      if (!resp.ok) {
        throw new Error(`failed to request proxy config: ${resp.status} ${resp.statusText}`);
      }
      result.set(type, JSON.parse(await resp.text()));
    }
    return result;
  }

  async getHostAddr(env: Env, name: string) {
    const stmt = env.DB.prepare("SELECT * FROM host WHERE name = ?1").bind(name);
    const host = await stmt.first() as Host | null;
    if (!host) {
      return null;
    }
    return host.addr4;
  }

  async getSecret(env: Env, name: string) {
    const stmt = env.DB.prepare("SELECT * FROM secret WHERE name = ?1").bind(name);
    const secret = await stmt.first() as Secret | null;
    if (!secret) {
      return null;
    }
    return secret.value;
  }

  async fillConfig(env: Env, args: object, obj: any) {
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
          obj[key] = await this.getSecret(env, url.pathname);
        } else {
          throw new Error(`unsupported ref: ${value.$ref}`);
        }
      } else {
        await this.fillConfig(env, args, value);
      }
    }
  }

}
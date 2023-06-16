import { Env } from "./types";
import { Access, Host, Proxy, Rule, Dns, Secret, User } from "./types";

export default class {

  env: Env;
  hostCache: Map<string, Host> | null = null;
  secretCache: Map<string, string> | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  async getUser(token: string): Promise<User | null> {
    const stmt = this.env.DB.prepare("SELECT * FROM user WHERE token = ?1").bind(token);
    const user = await stmt.first() as User | null;
    if (user?.config) {
      user.config = JSON.parse(user.config);
    }
    return user;
  }

  async getAccesses(user: User): Promise<Array<Access>> {
    const stmt = this.env.DB.prepare("SELECT * FROM access WHERE user = ?1").bind(user.name);
    const result = await stmt.all();
    const accesses = result.results! as Array<Access>;
    return accesses;
  }

  async getProxies(user: User): Promise<Array<Proxy>> {
    const stmt = this.env.DB.prepare("SELECT * FROM proxy JOIN access WHERE access.class = 'proxy' AND access.tag = proxy.tag AND access.user = ?1 ORDER BY priority;").bind(user.name);
    const result = await stmt.all();
    const proxies = result.results! as Array<Proxy>;
    for (var proxy of proxies) {
      if (proxy.config) {
        proxy.config = JSON.parse(proxy.config);
      }
    }
    return proxies;
  }

  async getRules(user: User): Promise<Array<Rule>> {
    const stmt = this.env.DB.prepare("SELECT * FROM rule JOIN access WHERE access.class = 'rule' AND access.tag = rule.tag AND access.user = ?1 ORDER BY priority;").bind(user.name);
    const result = await stmt.all();
    const rules = result.results! as Array<Rule>;
    for (var rule of rules) {
      if (rule.config) {
        rule.config = JSON.parse(rule.config);
      }
    }
    return rules;
  }

  async getDns(user: User): Promise<Array<Dns>> {
    const stmt = this.env.DB.prepare("SELECT * FROM dns JOIN access WHERE access.class = 'dns' AND access.tag = dns.tag AND access.user = ?1 ORDER BY priority;").bind(user.name);
    const result = await stmt.all();
    const dns = result.results as Array<Dns>;
    for (var s of dns) {
      if (s.config) {
        s.config = JSON.parse(s.config);
      }
      if (s.rule) {
        s.rule = JSON.parse(s.rule);
      }
    }
    return dns;
  }

  async getProxiesConfig(proxyTypes: Array<string>): Promise<Map<string, object>> {
    var result: Map<string, object> = new Map();
    const fetches = proxyTypes.map((type) => fetch(
      `https://api.github.com/repos/${this.env.GITHUB_REPO}/contents/proxies/${type}.json?ref=${this.env.GITHUB_REF}`,
      {
        headers: {
          "Accept": "application/vnd.github.raw",
          "User-Agent": "Mutong's Cloudflare Workers",
          "Authorization": `Bearer ${this.env.GITHUB_TOKEN}`
        }
      }).then((resp) => {
        if (!resp.ok) {
          throw new Error(`failed to request proxy config: ${resp.status} ${resp.statusText}`);
        }
        return resp.json();
      }));
    (await Promise.all(fetches)).map((content: any, idx) => {
      const type = proxyTypes[idx];
      result.set(type, content);
    })
    return result;
  }

  async getHostAddr(name: string) {
    if (!this.hostCache) {
      const stmt = this.env.DB.prepare("SELECT * FROM host");
      const result = await stmt.all();
      this.hostCache = new Map();
      for (const host of result.results! as Array<Host>) {
        this.hostCache.set(host.name, host);
      }
    }
    const host = this.hostCache.get(name);
    return host ? host.addr : null;
  }

  async getSecret(name: string) {
    if (!this.secretCache) {
      const stmt = this.env.DB.prepare("SELECT * FROM secret");
      const result = await stmt.all();
      this.secretCache = new Map();
      for (const secret of result.results! as Array<Secret>) {
        this.secretCache.set(secret.name, secret.value);
      }
    }
    return this.secretCache.get(name) || null;
  }

}

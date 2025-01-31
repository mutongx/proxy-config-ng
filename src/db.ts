export default class {
  db: D1Database;
  hostCache: Map<string, Host> | null = null;
  secretCache: Map<string, string> | null = null;

  constructor(db: D1Database) {
    this.db = db;
  }

  parseConfigString(str: string | null) {
    const result: {[key: string]: any} = {}
    if (str == null) {
      return result;
    }
    for (const kvPair of str.split(",")) {
      const equalPos = kvPair.indexOf("=");
      if (equalPos == -1) {
        throw new Error("invalid config string");
      }
      const key = kvPair.substring(0, equalPos);
      let value = kvPair.substring(equalPos + 1);
      try {
        value = JSON.parse(value);
      } catch (e) {
        // do nothing
      }
      result[key] = value;
      console.log(result);
    }
    return result;
  }

  async getUserByToken(token: string): Promise<User | null> {
    const stmt = this.db.prepare("SELECT * FROM user WHERE token = ?1").bind(token);
    const user = await stmt.first();
    if (!user) {
      return null;
    }
    user["config"] = this.parseConfigString(user["config"] as string | null);
    return user as unknown as User;
  }

  async getHostByName(name: string) {
    if (!this.hostCache) {
      const hostCache = new Map();
      const stmt = this.db.prepare("SELECT * FROM host");
      for (const result of (await stmt.all()).results) {
        const host = result as unknown as Host;
        hostCache.set(host.name, host);
      }
      this.hostCache = hostCache;
    }
    return this.hostCache.get(name) || null;
  }

  async getSecretByName(name: string) {
    if (!this.secretCache) {
      const secretCache = new Map();
      const stmt = this.db.prepare("SELECT * FROM secret");
      for (const result of (await stmt.all()).results) {
        const secret = result as unknown as Secret;
        secretCache.set(secret.name, secret.value);
      }
      this.secretCache = secretCache;
    }
    return this.secretCache.get(name) || null;
  }

  async getAsset(user: User, assetClass: "proxy"): Promise<Proxy[]>;
  async getAsset(user: User, assetClass: "dns"): Promise<Dns[]>;
  async getAsset(user: User, assetClass: "proxy" | "dns") {
    const stmt = this.db.prepare(
      `SELECT * FROM ${assetClass} JOIN access ` +
      "WHERE access.user = ?1 " +
      `AND access.class = '${assetClass}' ` +
      `AND access.label = ${assetClass}.label `
    ).bind(user.name);
    if (assetClass == "proxy") {
      return (await stmt.all()).results.map((value) => value as unknown as Proxy);  
    }
    if (assetClass == "dns") {
      return (await stmt.all()).results.map((value) => value as unknown as Dns);
    }
  }

  async getRules(name: string) {
    const stmt = this.db.prepare(
      "SELECT * FROM rule " +
      "WHERE name = ?1 " +
      "ORDER BY [index]"
    ).bind(name);
    return (await stmt.all()).results.map((value) => value as unknown as Rule);
  }

  async getActions(user: User, actionClass: "proxy" | "dns") {
    const stmt = this.db.prepare(
      "SELECT * FROM action " +
      "WHERE action.user = ?1 " +
      "AND action.class = ?2 " +
      "ORDER BY priority"
    ).bind(user.name, actionClass);
    return (await stmt.all()).results.map((value) => {
      value["options"] = this.parseConfigString(value["options"] as string);
      return value as unknown as Action;
    })
  }

}

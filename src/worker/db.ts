import { Access, Host, Proxy, Rule, Dns, Secret, User } from "../types/db";

export default class {
    db: D1Database;
    hostCache: Map<string, Host> | null = null;
    secretCache: Map<string, string> | null = null;

    constructor(db: D1Database) {
        this.db = db;
    }

    cast<T>(obj: Record<string, unknown>, ...fields: string[]): T {
        const result = structuredClone(obj);
        for (const field of fields) {
            if (result[field]) {
                result[field] = JSON.parse(result[field] as string);
            } else {
                result[field] = null;
            }
        }
        return result as T;
    }

    async getUser(token: string): Promise<User | null> {
        const stmt = this.db.prepare("SELECT * FROM user WHERE token = ?1").bind(token);
        const user = await stmt.first();
        if (!user) {
            return null;
        }
        return this.cast<User>(user, "config");
    }

    async getAccesses(user: User): Promise<Array<Access>> {
        const stmt = this.db.prepare("SELECT * FROM access WHERE user = ?1").bind(user.name);
        const result = await stmt.all();
        return result.results.map((item) => this.cast<Access>(item));
    }

    async getProxies(user: User): Promise<Array<Proxy>> {
        const stmt = this.db.prepare("SELECT * FROM proxy JOIN access WHERE access.class = 'proxy' AND access.tag = proxy.tag AND access.user = ?1 ORDER BY priority;").bind(user.name);
        const result = await stmt.all();
        return result.results.map((item) => this.cast<Proxy>(item, "config"));
    }

    async getRules(user: User): Promise<Array<Rule>> {
        const stmt = this.db.prepare("SELECT * FROM rule JOIN access WHERE access.class = 'rule' AND access.tag = rule.tag AND access.user = ?1 ORDER BY priority;").bind(user.name);
        const result = await stmt.all();
        return result.results.map((item) => this.cast<Rule>(item, "config"));
    }

    async getDns(user: User): Promise<Array<Dns>> {
        const stmt = this.db.prepare("SELECT * FROM dns JOIN access WHERE access.class = 'dns' AND access.tag = dns.tag AND access.user = ?1 ORDER BY priority;").bind(user.name);
        const result = await stmt.all();
        return result.results.map((item) => this.cast<Dns>(item, "config", "rule"));
    }

    async getHostAddr(name: string) {
        if (!this.hostCache) {
            const stmt = this.db.prepare("SELECT * FROM host");
            const result = await stmt.all();
            this.hostCache = new Map();
            for (const host of result.results as Array<Host>) {
                this.hostCache.set(host.name, host);
            }
        }
        const host = this.hostCache.get(name);
        return host ? host.addr : null;
    }

    async getSecret(name: string) {
        if (!this.secretCache) {
            const stmt = this.db.prepare("SELECT * FROM secret");
            const result = await stmt.all();
            this.secretCache = new Map();
            for (const secret of result.results as Array<Secret>) {
                this.secretCache.set(secret.name, secret.value);
            }
        }
        return this.secretCache.get(name) || null;
    }

    async newChallenge(value: string, usage: string, timestamp: number) {
        const stmt = this.db.prepare("INSERT INTO challenge VALUES (?1, ?2, ?3)").bind(value, usage, timestamp);
        const result = await stmt.run();
        return result.success;
    }

    async consumeChallenge(value: string, usage: string, timestamp_after: number) {
        const stmt = this.db.prepare("DELETE FROM challenge WHERE value = ?1 AND usage = ?2 AND timestamp > ?3 RETURNING 1").bind(value, usage, timestamp_after);
        const result = await stmt.first();
        return result !== null;
    }

    async newCredential(id: string, key: string, algorithm: string, name: string, timestamp: number) {
        const stmt = this.db.prepare("INSERT INTO credential VALUES (?1, ?2, ?3, ?4, ?5)").bind(id, key, algorithm, name, timestamp);
        const result = await stmt.run();
        return result.success;
    }

    async getCredential(id: string) {
        const stmt = this.db.prepare("SELECT * FROM credential WHERE id = ?1").bind(id);
        const result = await stmt.first();
        return result;
    }

    async newAuthentication(id: string, counter: number, timestamp: number) {
        const stmt = this.db.prepare("INSERT INTO authentication VALUES (?1, ?2, ?3)").bind(id, counter, timestamp);
        const result = await stmt.run();
        return result.success;
    }
}

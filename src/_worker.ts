import YAML from "js-yaml";
import JsonPointer from "json-pointer";
import WebAuthn from "@passwordless-id/webauthn";

import { Outbound, ClashConfigurator, SingboxConfigurator } from "./worker/config";
import { ConfigObject, ConfigValue } from "./types/config";
import Database from "./worker/db";

export interface Env {
    DB: D1Database;
    ASSETS: { fetch: typeof fetch } | undefined;
    GITHUB_REPO: string;
    GITHUB_REF: string;
    GITHUB_TOKEN: string;
    WEBAUTHN_REGISTRATION_TOKEN: string;
    WEBAUTHN_ORIGIN: string;
};

export default {

    async fillConfig(db: Database, obj: ConfigObject, args: object) {
        for (const key of Object.keys(obj)) {
            const value = obj[key];
            if (typeof value == "string" || typeof value == "number" || typeof value == "boolean") {
                continue;
            }
            if (value === null) {
                continue;
            }
            if (Array.isArray(value)) {
                continue;
            }
            if (value.$ref) {
                const ref = value.$ref as string;
                const url = new URL(ref);
                if (url.protocol == "args:") {
                    var newValue: ConfigValue;
                    try {
                        newValue = JsonPointer.get(args, url.pathname) as ConfigValue;
                    } catch (e) {
                        newValue = url.searchParams.get("default");
                    }
                    obj[key] = newValue;
                } else if (url.protocol == "secrets:") {
                    obj[key] = await db.getSecret(url.pathname);
                } else {
                    throw new Error(`unsupported ref: ${ref}`);
                }
            } else {
                await this.fillConfig(db, value as ConfigObject, args);
            }
        }
    },

    async processGetAssets(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
        const url = new URL(request.url);
        const path = url.pathname;
        if (request.method != "GET") {
            return null;
        }
        if (path === "/" || path === "/index.html" || path === "/_app.js") {
            if (!env.ASSETS) {
                return new Response("cannot load assets", { status: 501 });
            }
            return env.ASSETS.fetch(request);
        }
        return null;
    },

    async processProcessAuthn(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
        function now() {
            return Math.trunc(Date.now() / 1000);
        }
        const url = new URL(request.url);
        const path = url.pathname;
        if (request.method != "POST") {
            return null;
        }
        const db = new Database(env.DB);
        if (path === "/challenge") {
            const usage = url.searchParams.get("usage");
            if (usage != "register" && usage != "authenticate") {
                return new Response("bad request", { status: 400 });
            }
            const challenge = crypto.randomUUID();
            const ok = await db.newChallenge(challenge, usage, now());
            if (!ok) {
                return new Response("internal server error", { status: 500 });
            }
            return new Response(JSON.stringify({ value: challenge }));
        }
        if (path === "/register") {
            const token = url.searchParams.get("token");
            if (!token || token != env.WEBAUTHN_REGISTRATION_TOKEN) {
                return new Response("forbidden", { status: 403 });
            }
            const body = await request.json();
            try {
                const registration = await WebAuthn.server.verifyRegistration(
                    body,
                    {
                        challenge: (value: string) => db.consumeChallenge(value, "register", now() - 300),
                        origin: env.WEBAUTHN_ORIGIN,
                    },
                );
                await db.newCredential(
                    registration.credential.id,
                    registration.credential.publicKey,
                    registration.credential.algorithm,
                    registration.authenticator.name,
                    now(),
                );
            } catch {
                return new Response("forbidden", { status: 403 });
            }
            return new Response("ok");
        }
        if (path === "/authenticate") {
            const body = await request.json();
            if (!body.credentialId) {
                return new Response("bad request", { status: 400 });
            }
            const credential = await db.getCredential(body.credentialId as string);
            if (!credential) {
                return new Response("forbidden", { status: 403 });
            }
            try {
                const authentication = await WebAuthn.server.verifyAuthentication(
                    body,
                    {
                        id: credential.id,
                        publicKey: credential.key,
                        algorithm: credential.algorithm,
                    },
                    {
                        challenge: (value: string) => db.consumeChallenge(value, "authenticate", now() - 300),
                        origin: env.WEBAUTHN_ORIGIN,
                        userVerified: true,
                    },
                );
                await db.newAuthentication(
                    authentication.credentialId,
                    authentication.authenticator.counter,
                    now(),
                );
            } catch {
                return new Response("forbidden", { status: 403 });
            }
            return new Response("ok");
        }
        return null;
    },

    async processGenerateConfig(request: Request, env: Env, ctx: ExecutionContext): Promise<Response | null> {
        const url = new URL(request.url);
        const paths = url.pathname.split("/");
        if (paths.length != 3) {
            return null;
        }

        const token = paths[1];
        const db = new Database(env.DB);
        const user = await db.getUser(token);
        if (!user) {
            return null;
        }

        var format: string | null = url.searchParams.get("format");
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
        const proxiesConfig: Map<string, object> = new Map(await Promise.all([...new Set(proxies.map((val) => val.type))].map(
            (type) => {
                return fetch(
                    `https://api.github.com/repos/${env.GITHUB_REPO}/contents/proxies/${type}.json?ref=${env.GITHUB_REF}`,
                    {
                        headers: {
                            "Accept": "application/vnd.github.raw",
                            "User-Agent": "Mutong's Cloudflare Workers",
                            "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
                        },
                    },
                ).then((resp) => {
                    if (!resp.ok) {
                        throw resp;
                    }
                    return resp.json().then((value) => [type, value] as [string, object]);
                }).catch(async (resp) => {
                    const body = await resp.json();
                    throw new Error(`On fetching proxy config for ${type}: ${body.message}`);
                });
            },
        )));

        var outboundsConfig: Outbound[] = [];
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
                groups: proxy.config?.groups as string[] || [],
                config: config as ConfigObject,
            });
        }

        const download = url.searchParams.get("download") !== "false";
        if (format == "sing-box") {
            const conf = new SingboxConfigurator();
            return new Response(
                ""
                + `// url = "${request.url}"\n`
                + `// user = "${user.name}"\n`
                + JSON.stringify(conf.create(userConfig, outboundsConfig, rules, dns), null, 2),
                {
                    headers: {
                        "Content-Type": "application/json",
                        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="config.json"`,
                    },
                },
            );
        }
        if (format == "clash") {
            const conf = new ClashConfigurator();
            return new Response(
                ""
                + `# url = "${request.url}"\n`
                + `# user = "${user.name}"\n`
                + YAML.dump(conf.create(userConfig, outboundsConfig, rules)),
                {
                    headers: {
                        "Content-Type": "application/x-yaml",
                        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="config.yaml"`,
                    },
                },
            );
        }

        throw new Error("should never reach this");
    },

    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        let resp: Response | null = null;
        resp = await this.processGetAssets(request, env, ctx);
        if (resp) {
            return resp;
        }
        resp = await this.processProcessAuthn(request, env, ctx);
        if (resp) {
            return resp;
        }
        resp = await this.processGenerateConfig(request, env, ctx);
        if (resp) {
            return resp;
        }
        return new Response("not found", { status: 404 });
    },
};

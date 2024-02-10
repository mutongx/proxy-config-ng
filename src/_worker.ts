import YAML from "js-yaml";
import JsonPointer from "json-pointer";
import WebAuthn from "@passwordless-id/webauthn";

import { ClashConfigurator, SingboxConfigurator } from "./worker/config";
import { Env, Outbound } from "./worker/types";
import Database from "./worker/db";

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
        const db = new Database(env);
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
            const body = await request.json() as any;
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
            const body = await request.json() as any;
            if (!body.credentialId) {
                return new Response("bad request", { status: 400 });
            }
            const credential = await db.getCredential(body.credentialId) as any;
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
        const db = new Database(env);
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
        const proxiesConfig = await db.getProxiesConfig([...new Set(proxies.map((val) => val.type))]);

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
                groups: proxy.config?.groups || [],
                config: config,
            });
        }

        const download = url.searchParams.get("download") !== "false";
        if (format == "sing-box") {
            const conf = new SingboxConfigurator();
            return new Response(
        `// url = "${request.url}"\n`
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
        `# url = "${request.url}"\n`
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

import { Env } from "./types";
import Worker from "./worker"


export default {

  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const paths = url.pathname.split("/");
    if (paths.length != 3) {
      return new Response("bad request", { status: 400 });
    }

    const token = paths[1];
    const worker = new Worker(env);

    const user = await worker.getUser(env, token);
    if (!user) {
      return new Response("not found", { status: 404 });
    }

    const accesses = await worker.getAccesses(env, user);
    const proxies = await worker.getProxies(env, accesses);
    const proxyTypes = [... new Set(proxies.map((val) => val.type))]
    const proxyConfigs = await worker.getProxiesConfig(env, proxyTypes);

    var proxyResults = []
    for (const proxy of proxies) {
      const config = structuredClone(proxyConfigs.get(proxy.type));
      const addr = await worker.getHostAddr(env, proxy.host);
      await worker.fillConfig(env, {
        "server": addr,
        "server_port": proxy.port,
      }, config);
      proxyResults.push(config);
    }

    const result = {
      "inbounds": [
        {
          "type": "mixed",
          "listen": "127.0.0.1",
          "listen_port": 5353,
        }
      ],
      "outbounds": proxyResults,
    }

    return new Response(JSON.stringify(result, null, 2));
  },
};

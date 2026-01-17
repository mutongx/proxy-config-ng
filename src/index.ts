import { SingBoxConfigBuilder } from "./builder/SingBoxConfigBuilder";
import Database from "./db";

async function handlerGetConfig(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response | null> {
  const url = new URL(request.url);
  const paths = url.pathname.split("/");
  if (paths.length != 3) {
    return null;
  }
  const token = paths[1];
  const db = new Database(env.DB);
  const user = await db.getUserByToken(token);
  if (!user) {
    return null;
  }
  user.config = {
    ...user.config,
    ...Object.fromEntries(
      Array.from(url.searchParams).map(([key, value]) => {
        try {
          return [key, JSON.parse(value)];
        } catch (e) {
          return [key, value];
        }
      }),
    ),
  };
  const builder = new SingBoxConfigBuilder(user, db);
  await builder.buildInbounds();
  await builder.buildOutbounds(await db.getAsset(user, "proxy"));
  await builder.buildRules(await db.getRuleActions(user, "proxy"));
  await builder.buildDns(await db.getAsset(user, "dns"));
  await builder.buildDnsRules(await db.getRuleActions(user, "dns"));
  await builder.finalize();
  return new Response(
    "" +
      `// url = "${request.url}"\n` +
      `// user = "${user.name}"\n` +
      JSON.stringify(builder.get(), null, 2) +
      "\n",
    {
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const handlers = [handlerGetConfig];
    for (const handler of handlers) {
      const response = await handler(request, env, ctx);
      if (response !== null) {
        return response;
      }
    }
    return new Response("not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

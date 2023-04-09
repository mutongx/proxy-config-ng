export interface Env {
  SECRETS: KVNamespace;
  DB: D1Database;
  GITHUB_TOKEN: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = (new URL(request.url)).pathname.split('/');
    if (url.length != 3) {
      return new Response("bad request", { status: 400 })
    }

    return new Response(url.length.toString())
  },
};

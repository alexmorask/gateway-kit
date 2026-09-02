import type { Middleware } from '../pipeline.ts';

function presentedKey(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export const authMiddleware: Middleware = async (ctx, next) => {
  const auth = ctx.route.auth;
  if (!auth) return next();

  const headerName = auth.header.toLowerCase();
  const key = presentedKey(ctx.headers[headerName]);
  if (key === undefined || !auth.keys.includes(key)) {
    ctx.response = {
      status: 401,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from(JSON.stringify({ error: 'unauthorized' })),
    };
    return;
  }

  delete ctx.headers[headerName];
  return next();
};

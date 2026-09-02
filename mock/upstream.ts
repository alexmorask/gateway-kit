import { createServer, type Server } from 'node:http';

export interface MockControl {
  flakyFailures: number;
}

function readBody(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function sendJson(res: import('node:http').ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json', 'x-upstream': 'mock' });
  res.end(JSON.stringify(body));
}

export function createMockUpstream(): { server: Server; control: MockControl } {
  const control: MockControl = { flakyFailures: 0 };

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://mock');
    const body = await readBody(req);

    if (url.pathname === '/slow') {
      const ms = Number(url.searchParams.get('ms') ?? '300');
      setTimeout(() => sendJson(res, 200, { slow: true }), ms);
      return;
    }

    if (url.pathname === '/flaky') {
      if (control.flakyFailures > 0) {
        control.flakyFailures -= 1;
        sendJson(res, 503, { error: 'upstream_unavailable' });
        return;
      }
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === '/teapot') {
      sendJson(res, 418, { teapot: true });
      return;
    }

    sendJson(res, 200, {
      method: req.method,
      path: req.url,
      headers: req.headers,
      body,
    });
  });

  return { server, control };
}

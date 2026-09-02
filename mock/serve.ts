import { createMockUpstream } from './upstream.ts';

const requested = process.argv.slice(2).map(Number).filter((n) => Number.isInteger(n));
const ports = requested.length > 0 ? requested : [3001, 3002, 3003, 3004, 3005, 3006];

for (const port of ports) {
  const { server } = createMockUpstream();
  server.listen(port, () => process.stdout.write(`mock upstream on :${port}\n`));
}

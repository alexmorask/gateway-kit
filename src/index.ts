import { loadConfig } from './config/load.ts';
import { createGateway } from './server.ts';

function resolveConfigPath(): string {
  const path = process.argv[2] ?? process.env.GATEWAY_CONFIG;
  if (!path) {
    throw new Error('no config path given (pass it as an argument or set GATEWAY_CONFIG)');
  }
  return path;
}

function main(): void {
  const config = loadConfig(resolveConfigPath());
  const server = createGateway(config);
  server.listen(config.port, () => {
    process.stdout.write(`gatewaykit listening on :${config.port}\n`);
  });
}

try {
  main();
} catch (err) {
  process.stderr.write(`config error: ${(err as Error).message}\n`);
  process.exit(1);
}

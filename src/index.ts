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
  server.on('error', (err) => {
    process.stderr.write(`server error: ${err.message}\n`);
    process.exit(1);
  });
  server.listen(config.port, () => {
    process.stdout.write(`gatewaykit listening on :${config.port}\n`);
  });
}

process.on('unhandledRejection', (reason) => {
  process.stderr.write(`unhandled rejection: ${reason instanceof Error ? reason.stack : String(reason)}\n`);
});

try {
  main();
} catch (err) {
  process.stderr.write(`config error: ${(err as Error).message}\n`);
  process.exit(1);
}

// Local installs need only Node (including Windows without Bash on PATH).
// CI keeps using the existing environment materializer and its secret handling.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.env.CI || process.env.WORKERS_CI) {
  const script = fileURLToPath(new URL('./materialize-ci-env.sh', import.meta.url));
  const result = spawnSync('bash', [script], { stdio: 'inherit' });
  if (result.error) {
    console.error(`Could not run CI environment setup: ${result.error.message}`);
  }
  process.exitCode = result.status ?? 1;
}

// CLI: npm run migrate
import { pool } from './db';
import { migrate } from './migrations';

migrate()
  .then(() => console.log('Migrations up to date'))
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

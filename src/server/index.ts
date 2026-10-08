import { createApp } from './app';
import { migrate } from './migrations';
import { scheduleReminder } from './reminder';

const port = Number(process.env.PORT ?? 3000);

await migrate();
createApp().listen(port, () => {
  console.log(`CLET go-live countdown listening on http://localhost:${port}`);
});
scheduleReminder();

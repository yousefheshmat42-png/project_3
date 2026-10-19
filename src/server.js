import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createApp } from './app.js';
const databasePath = resolve(process.env.DATABASE_PATH || './data/app.db');
mkdirSync(dirname(databasePath), { recursive: true });
const { app, db } = createApp({ databasePath, adminKey: process.env.ADMIN_KEY });
const port = Number(process.env.PORT || 3003);
const host = process.env.HOST || '127.0.0.1';
const server = app.listen(port, host, () => console.log('Appointment Booking API: http://' + host + ':' + port));
function shutdown() { server.close(() => { db.close(); process.exit(0); }); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);


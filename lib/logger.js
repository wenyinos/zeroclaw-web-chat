import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const LOG_FILE = path.join(__dirname, '..', 'server.log');
const logStream = fs.createWriteStream(LOG_FILE, { flags: 'a' });

export function log(level, message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

  if (level === 'error') {
    console.error(logMessage.trim());
  } else {
    console.log(logMessage.trim());
  }

  logStream.write(logMessage);
}

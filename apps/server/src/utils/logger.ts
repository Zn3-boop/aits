const isDev = process.env.NODE_ENV !== 'production';

function timestamp(): string {
  return new Date().toISOString().slice(11, 19);
}

export const logger = {
  info: (msg: string, ...args: unknown[]) => {
    if (isDev) {
      process.stdout.write(`[${timestamp()}] INFO  ${msg}${args.length ? ' ' + args.map(String).join(' ') : ''}\n`);
    }
  },
  warn: (msg: string, ...args: unknown[]) => {
    process.stderr.write(`[${timestamp()}] WARN  ${msg}${args.length ? ' ' + args.map(String).join(' ') : ''}\n`);
  },
  error: (msg: string, ...args: unknown[]) => {
    process.stderr.write(`[${timestamp()}] ERROR ${msg}${args.length ? ' ' + args.map(String).join(' ') : ''}\n`);
  },
  debug: (msg: string, ...args: unknown[]) => {
    if (isDev) {
      process.stdout.write(`[${timestamp()}] DEBUG ${msg}${args.length ? ' ' + args.map(String).join(' ') : ''}\n`);
    }
  },
};
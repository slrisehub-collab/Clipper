import 'server-only';

/** True when the full server stack (database, queue, worker) is configured.
 *  Without it the site runs in browser mode: clipping happens on the visitor's device. */
export function serverMode(): boolean {
  return !!process.env.DATABASE_URL;
}

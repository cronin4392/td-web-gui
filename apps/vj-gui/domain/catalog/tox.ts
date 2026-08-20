/** The loader identifies a scene or effect by its `.tox` path. Forward slashes
 * only: TD's `Loader` splits on `/`, so a backslash path would yield
 * an empty folder and an unsplit name. */
export function toxPath(folder: string, name: string): string {
  if (!folder || !name) return '';
  const root = folder.replace(/\\/g, '/').replace(/\/+$/, '');
  return root ? `${root}/${name}.tox` : '';
}

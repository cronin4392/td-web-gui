/** The loader identifies a scene or effect by its `.tox` path. Forward slashes
 * only: TD's `Loader` splits on `/`, so a backslash path would yield
 * an empty folder and an unsplit name. */
export function toxPath(folder: string, name: string): string {
  if (!folder || !name) return '';
  const root = folder.replace(/\\/g, '/').replace(/\/+$/, '');
  return root ? `${root}/${name}.tox` : '';
}

// Both separators: TD reports whatever its par holds.
export function toxName(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const cut = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  const file = path.slice(cut + 1);
  return file ? file.replace(/\.tox$/i, '') : undefined;
}

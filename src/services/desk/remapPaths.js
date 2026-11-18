/**
 * Workspace paths after a file or folder was renamed (newPath) or deleted (null): the path
 * itself and everything inside it follow, or are dropped. Other paths stay as they are.
 */
export function remapPaths(paths, oldPath, newPath) {
  const under = (p) => p === oldPath || p.startsWith(`${oldPath}/`);
  return paths.map((p) => (under(p) ? (newPath ? newPath + p.slice(oldPath.length) : null) : p)).filter(Boolean);
}

/** True when `p` is `folder` itself or inside it (workspace paths, forward slashes). */
export const isUnderPath = (p, folder) => p === folder || String(p).startsWith(`${folder}/`);

/** Browser-safe dirname — returns parent directory of a path. */
export function dirname(path: string): string {
  const lastSlash = path.lastIndexOf('/')
  return lastSlash > 0 ? path.substring(0, lastSlash) : path
}

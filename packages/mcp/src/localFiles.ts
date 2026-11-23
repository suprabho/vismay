/**
 * `filePath` arguments read the disk of the machine the server runs on. That
 * is the point locally (the agent wrote the file next to it), and a hole on the
 * public endpoint (anyone could read the server's files), so the hosted server
 * leaves the field out of its tool schemas and refuses it here as well.
 */

import { readFile } from 'node:fs/promises'
import type { VismayMcpConfig } from './config'

/**
 * The tool's input shape, minus `filePath` on the hosted server. The schema
 * then strips a `filePath` a caller sends anyway, so the handler never sees one;
 * the type keeps the field so local and hosted share one handler.
 */
export function localFileShape<S extends { filePath: unknown }>(config: VismayMcpConfig, shape: S): S {
  if (!config.hosted) return shape
  const { filePath: _hostedHasNoFiles, ...rest } = shape
  return rest as unknown as S
}

function refuseWhenHosted(config: VismayMcpConfig): void {
  if (config.hosted) throw new Error('filePath works on the local MCP server only: pass the content itself.')
}

export async function readLocalText(config: VismayMcpConfig, path: string): Promise<string> {
  refuseWhenHosted(config)
  return readFile(path, 'utf8')
}

export async function readLocalBytes(config: VismayMcpConfig, path: string) {
  refuseWhenHosted(config)
  return readFile(path)
}

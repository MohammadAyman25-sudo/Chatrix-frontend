/**
 * Minimal surface of the Socket.IO client that this app actually uses.
 * Both the real `socket.io-client` socket and the mock socket satisfy it.
 */
export type SocketHandler = (...args: unknown[]) => void

export type AppSocket = {
  on: (event: string, handler: SocketHandler) => unknown
  off: (event: string, handler: SocketHandler) => unknown
  emit: (event: string, ...args: unknown[]) => unknown
  disconnect: () => void
}

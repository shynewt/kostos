const DEFAULT_ID_LENGTH = 21
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

/**
 * Generates a cryptographically strong, URL-safe random ID.
 */
export function generateId(length: number = DEFAULT_ID_LENGTH): string {
  if (!Number.isInteger(length) || length < 8 || length > 128) {
    throw new Error('ID length must be an integer between 8 and 128')
  }

  const cryptoApi = globalThis.crypto
  if (!cryptoApi?.getRandomValues) {
    throw new Error('Secure random number generation is unavailable')
  }

  const bytes = new Uint8Array(length)
  cryptoApi.getRandomValues(bytes)

  let result = ''
  for (const byte of bytes) {
    result += ALPHABET[byte % ALPHABET.length]
  }

  return result
}

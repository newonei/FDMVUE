let sequence = 0;

/** Operation identifiers only; these values are not authentication secrets. */
export function newIdempotencyKey(): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof cryptoApi?.getRandomValues === 'function') {
    cryptoApi.getRandomValues(bytes);
  } else {
    // Older HTTP browsers may expose neither API. Mix a per-page sequence and
    // time into the random bytes so successive form submissions remain distinct.
    for (let index = 0; index < bytes.length; index++) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
    let timestamp = Date.now();
    let counter = ++sequence;
    for (let index = 0; index < 6; index++) {
      bytes[index] = bytes[index]! ^ (timestamp % 256);
      bytes[15 - index] = bytes[15 - index]! ^ (counter % 256);
      timestamp = Math.floor(timestamp / 256);
      counter = Math.floor(counter / 256);
    }
  }
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
  return [
    hex.slice(0, 4).join(''),
    hex.slice(4, 6).join(''),
    hex.slice(6, 8).join(''),
    hex.slice(8, 10).join(''),
    hex.slice(10).join(''),
  ].join('-');
}

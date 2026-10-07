// Minimale zip-lezer: leest de centrale map en pakt bestanden uit met de ingebouwde
// DecompressionStream ('deflate-raw'). Ondersteunt 'stored' (0) en 'deflate' (8).

/** @returns {Promise<Map<string, Uint8Array>>} bestandsnaam -> inhoud */
export async function readZip(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);

  // Einde van de centrale map zoeken (staat in de laatste 64 kB + 22 bytes).
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Dit is geen geldig zip-bestand.');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  if (p === 0xffffffff) throw new Error('Zip64-bestanden worden niet ondersteund.');

  const decoder = new TextDecoder();
  const files = new Map();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('De zip is beschadigd.');
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue; // map

    // De lokale header kan een andere 'extra'-lengte hebben dan de centrale map.
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(start, start + compSize);

    if (method === 0) files.set(name, data);
    else if (method === 8) files.set(name, await inflate(data));
    else throw new Error(`Onbekende compressie in ${name}.`);
  }
  return files;
}

async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* Ultimate Weather: seals notification settings before they leave your phone.
   ECDH P-256 + HKDF-SHA256 + AES-GCM. Only the GitHub Action (which holds the private key) can open them.
   Used by both the page and the service worker. */
(function (g) {
  'use strict';
  const b64u = {
    enc(buf) { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
    dec(str) { const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4)); return Uint8Array.from(s, c => c.charCodeAt(0)); }
  };
  async function deflate(bytes) {
    const st = new Blob([bytes]).stream().pipeThrough(new g.CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }
  async function seal(obj, boxPublicKey, compress) {
    const C = g.crypto.subtle;
    const pub = await C.importKey('raw', b64u.dec(boxPublicKey), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const eph = await C.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const shared = await C.deriveBits({ name: 'ECDH', public: pub }, eph.privateKey, 256);
    const hk = await C.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
    const key = await C.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('uw-box-v1') }, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
    const iv = g.crypto.getRandomValues(new Uint8Array(12));
    let pt = new TextEncoder().encode(JSON.stringify(obj));
    if (compress) pt = await deflate(pt);
    const ct = await C.encrypt({ name: 'AES-GCM', iv }, key, pt);
    const ephRaw = await C.exportKey('raw', eph.publicKey);
    return [compress ? 'uw2' : 'uw1', b64u.enc(ephRaw), b64u.enc(iv), b64u.enc(ct)].join('.');
  }
  g.UWPush = {
    TOPIC: 'uw-sub-82bf0d55533924ae6683811a',
    VAPID_PUBLIC: 'BPqv5vw6plojE47eRiyB6dyDiaADqrcTgayNij-hsv77keaEBNN467ManHLsH0HmICjc2iMwt7s3h-R3_vzRKMw',
    BOX_PUBLIC: 'BJtbFbLdvqFGsd7nKKiuR587rSGnNlXffR-0BUOcqcyJM1Qlx6HqGCM5NXqoJT5KRmzgvmyEIBzolI7NMve3l0Y',
    seal, b64u,
    async post(obj) {
      let body = await seal(obj, g.UWPush.BOX_PUBLIC);
      // lots of custom alerts: squeeze it so it fits in one message (the inbox takes ~4 KB per message)
      if (body.length > 3600 && g.CompressionStream) body = await seal(obj, g.UWPush.BOX_PUBLIC, true);
      if (body.length > 4000) throw new Error('too many alerts to sync, delete a few');
      const r = await fetch('https://ntfy.sh/' + g.UWPush.TOPIC, { method: 'POST', body });
      if (!r.ok) throw new Error('ntfy ' + r.status);
      return r.json().catch(() => ({}));
    }
  };
})(self);

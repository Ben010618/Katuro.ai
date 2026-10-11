/**
 * phoneCapture.cjs — the teacher's phone sends photos of answered bubble sheets straight
 * into the quiz's Photos folder, over the same Wi-Fi or the phone's own hotspot. No
 * internet, no account, nothing leaves the room.
 *
 * KaTuroDesk opens a small web page on this computer for one capture session:
 *   - the address carries a long random key (shown only in the QR code on screen)
 *   - the first phone that opens it is the only phone allowed to send (others are refused)
 *   - only photos (JPEG/PNG) up to 15 MB are accepted, saved under new names, never overwriting
 *   - the session ends when the teacher stops it, closes KaTuroDesk, or after 2 hours
 */
const http = require('http');
const os = require('os');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MAX_BYTES = 15 * 1024 * 1024;
const MAX_PHOTOS = 600;
const SESSION_MS = 2 * 60 * 60 * 1000;

let session = null;

/** This computer's addresses a phone on the same network can reach, likeliest first. */
function lanAddresses() {
  const out = [];
  const nets = os.networkInterfaces();
  for (const [name, list] of Object.entries(nets)) {
    if (/vethernet|virtualbox|vmware|hyper-v|loopback|bluetooth|docker|wsl|tailscale|zerotier|vpn/i.test(name)) continue;
    for (const a of list || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      const wifi = /wi-?fi|wlan|wireless/i.test(name) ? 0 : 1;
      const local = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) ? 0 : 1;
      out.push({ address: a.address, name, rank: local * 2 + wifi });
    }
  }
  return out.sort((a, b) => a.rank - b.rank).map(({ address, name }) => ({ address, name }));
}

const sameKey = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const isPhoto = (buf) => (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) || (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47);

const pad = (n) => String(n).padStart(2, '0');
function photoName(dir, ext) {
  const d = new Date();
  const base = `Photo ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  for (let i = 1; i < 1000; i += 1) {
    const name = `${base}${i > 1 ? ` (${i})` : ''}.${ext}`;
    if (!fs.existsSync(path.join(dir, name))) return name;
  }
  return `${base} ${Date.now()}.${ext}`;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The page the phone opens: take photos one after another; each is sent at once. */
function capturePage(title) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>KaTuroDesk photos</title>
<style>
body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#eef2ef;color:#1f2a24}
main{max-width:520px;margin:0 auto;padding:18px 16px 40px}
h1{font-size:18px;margin:0 0 2px}p{margin:6px 0;font-size:14px;line-height:1.4}
.muted{color:#5b6b61;font-size:13px}
.big{display:block;width:100%;box-sizing:border-box;margin:14px 0 8px;padding:18px;border:0;border-radius:14px;background:#2d6a4f;color:#fff;font-size:18px;font-weight:700;text-align:center}
.light{display:block;width:100%;box-sizing:border-box;padding:12px;border:1px solid #9bb5a6;border-radius:12px;background:#fff;color:#2d6a4f;font-size:15px;font-weight:600;text-align:center}
input{display:none}
.count{font-size:28px;font-weight:800;margin:14px 0 0}
.status{min-height:20px;font-size:14px}
.err{color:#b42318}
img{max-width:100%;border-radius:10px;margin-top:10px;display:none}
ul{padding-left:18px;font-size:13px;color:#3f5046}
</style></head><body><main>
<h1>KaTuroDesk</h1><p class="muted">${esc(title)}</p>
<label class="big" for="cam">Take a photo</label>
<input id="cam" type="file" accept="image/*" capture="environment">
<label class="light" for="pick">Choose photos from the gallery</label>
<input id="pick" type="file" accept="image/*" multiple>
<p class="count"><span id="n">0</span> sent</p>
<p class="status" id="st">Ready.</p>
<img id="last" alt="">
<ul><li>One sheet per photo, the whole sheet in view.</li><li>Put the sheet on a plain, light surface. Avoid shadows over the black corner squares.</li><li>Hold the phone straight above the sheet.</li></ul>
</main><script>
(function(){
var base=location.pathname.replace(/\\/$/,'');
var dev=localStorage.getItem('kt-device');
if(!dev){dev=Math.random().toString(36).slice(2)+Date.now().toString(36);try{localStorage.setItem('kt-device',dev)}catch(e){}}
var st=document.getElementById('st'),n=document.getElementById('n'),last=document.getElementById('last');
var queue=[],busy=false;
function say(t,bad){st.textContent=t;st.className='status'+(bad?' err':'')}
function hello(){fetch(base+'/status',{headers:{'X-KT-Device':dev}}).then(function(r){return r.json().then(function(j){if(!r.ok){say(j.error||'This page cannot be used.',true);return}n.textContent=j.count})}).catch(function(){say('KaTuroDesk is not reachable. Check that this phone and the computer are on the same Wi-Fi or hotspot.',true)})}
function shrink(file){return new Promise(function(ok,no){var url=URL.createObjectURL(file),im=new Image();im.onload=function(){var s=Math.min(1,2400/Math.max(im.naturalWidth,im.naturalHeight)),c=document.createElement('canvas');c.width=Math.round(im.naturalWidth*s);c.height=Math.round(im.naturalHeight*s);c.getContext('2d').drawImage(im,0,0,c.width,c.height);URL.revokeObjectURL(url);c.toBlob(function(b){b?ok({blob:b,preview:c.toDataURL('image/jpeg',0.4)}):no(new Error('This photo could not be prepared.'))},'image/jpeg',0.9)};im.onerror=function(){URL.revokeObjectURL(url);no(new Error('This photo could not be opened.'))};im.src=url})}
function send(item,tries){return fetch(base+'/photo',{method:'POST',headers:{'Content-Type':'image/jpeg','X-KT-Device':dev},body:item.blob}).then(function(r){return r.json().then(function(j){if(!r.ok)throw new Error(j.error||'Not saved.');return j})}).catch(function(e){if(tries<3)return new Promise(function(w){setTimeout(w,1500)}).then(function(){return send(item,tries+1)});throw e})}
function next(){if(busy||!queue.length)return;busy=true;var f=queue.shift();say('Sending...'+(queue.length?' ('+queue.length+' waiting)':''));shrink(f).then(function(item){last.src=item.preview;last.style.display='block';return send(item,0)}).then(function(j){n.textContent=j.count;say(queue.length?'Saved. Sending the next one...':'Saved. Take the next photo.')}).catch(function(e){say(e.message+' Take this photo again.',true)}).then(function(){busy=false;next()})}
function add(ev){for(var i=0;i<ev.target.files.length;i++)queue.push(ev.target.files[i]);ev.target.value='';next()}
document.getElementById('cam').addEventListener('change',add);
document.getElementById('pick').addEventListener('change',add);
hello();
})();
</script></body></html>`;
}

function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function stop() {
  if (!session) return;
  clearTimeout(session.timer);
  try { session.server.close(); } catch (e) {}
  for (const s of session.sockets) s.destroy();
  session = null;
}

/**
 * Starts a session saving into `dir` (an existing folder inside the classroom folder).
 * onPhoto({ name, count }) after each saved photo; onEnd() when the session ends by itself.
 * → Promise<{ urls: [{ url, network }], port, path }>
 */
function start({ dir, title, onPhoto, onEnd }) {
  stop();
  fs.mkdirSync(dir, { recursive: true });
  const token = crypto.randomBytes(18).toString('base64url');
  const prefix = `/c/${token}`;
  const s = { token, dir, count: 0, device: null, sockets: new Set(), server: null, timer: null };
  s.server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname.replace(/\/$/, '');
    if (!p.startsWith('/c/') || !sameKey(p.slice(0, prefix.length), prefix)) return json(res, 404, { error: 'Not found.' });
    const route = p.slice(prefix.length);
    if (req.method === 'GET' && route === '') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer' });
      return res.end(capturePage(title));
    }
    // The first phone to connect owns the session.
    const device = String(req.headers['x-kt-device'] || '').slice(0, 80);
    if (!device) return json(res, 400, { error: 'Open this page by scanning the QR code in KaTuroDesk.' });
    if (!s.device) s.device = device;
    if (s.device !== device) return json(res, 409, { error: 'Another phone is already sending photos for this quiz. Ask the teacher to start a new session in KaTuroDesk.' });
    if (req.method === 'GET' && route === '/status') return json(res, 200, { count: s.count });
    if (req.method === 'POST' && route === '/photo') {
      if (s.count >= MAX_PHOTOS) return json(res, 429, { error: 'This session has reached its limit. Start a new one in KaTuroDesk.' });
      const chunks = [];
      let size = 0;
      let tooBig = false;
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_BYTES) { tooBig = true; req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => {
        if (tooBig || session !== s) return;
        const buf = Buffer.concat(chunks);
        if (buf.length < 100 || !isPhoto(buf)) return json(res, 415, { error: 'Only photos can be sent.' });
        const name = photoName(dir, buf[0] === 0xff ? 'jpg' : 'png');
        fs.promises.writeFile(path.join(dir, name), buf, { flag: 'wx' }).then(() => {
          s.count += 1;
          json(res, 200, { ok: true, count: s.count });
          if (onPhoto) onPhoto({ name, count: s.count });
        }).catch(() => json(res, 500, { error: 'The photo could not be saved on the computer.' }));
      });
      return undefined;
    }
    return json(res, 404, { error: 'Not found.' });
  });
  s.server.on('connection', (sock) => { s.sockets.add(sock); sock.on('close', () => s.sockets.delete(sock)); });
  s.server.requestTimeout = 120000;
  session = s;
  s.timer = setTimeout(() => { stop(); if (onEnd) onEnd(); }, SESSION_MS);
  return new Promise((resolve, reject) => {
    s.server.once('error', (err) => { stop(); reject(err); });
    s.server.listen(0, '0.0.0.0', () => {
      const { port } = s.server.address();
      const urls = lanAddresses().map((a) => ({ url: `http://${a.address}:${port}${prefix}`, network: a.name }));
      resolve({ urls, port, path: prefix });
    });
  });
}

const status = () => (session ? { active: true, count: session.count, connected: Boolean(session.device) } : { active: false, count: 0, connected: false });

module.exports = { start, stop, status, lanAddresses, capturePage };

// Lê um arquivo Word (.docx) com um aluno por página: foto, mensagem e nome.
// Cada foto inicia um novo aluno; o texto que vem depois dela é a mensagem;
// a última linha em MAIÚSCULAS é o nome (ou o nome que vem depois de "Grande Abraço").

const LOWER = new Set(['da', 'de', 'do', 'das', 'dos', 'e']);
export const titleCase = (s) => s.toLowerCase().split(/\s+/).filter(Boolean)
  .map((w, i) => (i && LOWER.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ');

// leitor de ZIP mínimo (um .docx é um ZIP), usando a descompressão nativa do navegador
async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf);
  let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  }
  if (e < 0) throw new Error('Este arquivo não parece ser um .docx válido.');
  const count = dv.getUint16(e + 10, true);
  let off = dv.getUint32(e + 16, true);
  const dec = new TextDecoder();
  const files = new Map();
  for (let k = 0; k < count && dv.getUint32(off, true) === 0x02014b50; k++) {
    const method = dv.getUint16(off + 10, true), csize = dv.getUint32(off + 20, true);
    const nlen = dv.getUint16(off + 28, true), xlen = dv.getUint16(off + 30, true), clen = dv.getUint16(off + 32, true);
    const lho = dv.getUint32(off + 42, true);
    files.set(dec.decode(u8.subarray(off + 46, off + 46 + nlen)), { method, csize, lho });
    off += 46 + nlen + xlen + clen;
  }
  const read = async (name) => {
    const f = files.get(name);
    if (!f) return null;
    const start = f.lho + 30 + dv.getUint16(f.lho + 26, true) + dv.getUint16(f.lho + 28, true);
    const data = u8.subarray(start, start + f.csize);
    if (f.method === 0) return data;
    const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  return { files, read };
}

const MIME = { jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp' };

function paraText(p) {
  let t = '';
  for (const n of p.getElementsByTagName('*')) {
    if (hasAncestor(n, 'mc:Fallback')) continue;
    if (n.tagName === 'w:t') t += n.textContent;
    else if (n.tagName === 'w:tab') t += ' ';
    else if (n.tagName === 'w:br' && n.getAttribute('w:type') !== 'page') t += '\n';
  }
  return t.replace(/[  ]+/g, ' ').trim();
}
function hasAncestor(n, tag) {
  for (let p = n.parentNode; p; p = p.parentNode) if (p.tagName === tag) return true;
  return false;
}
function paraImages(p) {
  const ids = [];
  for (const b of p.getElementsByTagName('a:blip')) if (!hasAncestor(b, 'mc:Fallback')) ids.push(b.getAttribute('r:embed'));
  for (const v of p.getElementsByTagName('v:imagedata')) if (!hasAncestor(v, 'mc:Fallback')) ids.push(v.getAttribute('r:id'));
  return ids.filter(Boolean);
}

const isUpperName = (s) => s.length >= 3 && s.split(/\s+/).length <= 8 && /\p{Lu}/u.test(s) && !/\p{Ll}/u.test(s) && !/[.!?…:;]$/.test(s);

export async function readDocxStudents(file) {
  const zip = await unzip(await file.arrayBuffer());
  const docXml = await zip.read('word/document.xml');
  if (!docXml) throw new Error('Não encontrei o conteúdo do documento dentro do .docx.');
  const dec = new TextDecoder();
  const doc = new DOMParser().parseFromString(dec.decode(docXml), 'application/xml');
  const relsXml = await zip.read('word/_rels/document.xml.rels');
  const rels = {};
  if (relsXml) {
    const r = new DOMParser().parseFromString(dec.decode(relsXml), 'application/xml');
    for (const el of r.getElementsByTagName('Relationship')) rels[el.getAttribute('Id')] = el.getAttribute('Target');
  }

  // agrupa os parágrafos: cada foto começa um novo aluno
  const records = [];
  let cur = null;
  for (const p of doc.getElementsByTagName('w:p')) {
    if (hasAncestor(p, 'mc:Fallback')) continue;
    const imgs = paraImages(p);
    const text = paraText(p);
    if (imgs.length) { cur = { img: imgs[0], lines: [] }; records.push(cur); }
    if (cur && text) cur.lines.push(...text.split('\n').map((l) => l.trim()).filter(Boolean));
  }

  const students = [];
  for (const [i, r] of records.entries()) {
    const lines = [...r.lines];
    let name = '';
    const last = lines[lines.length - 1] || '';
    const hug = last.match(/^grande abra[çc]o,?\s+(.+)$/i);
    if (isUpperName(last) && !hug) {
      name = titleCase(lines.pop());
    } else if (hug && isUpperName(hug[1]) && hug[1].split(/\s+/).length > 1) {
      // "Grande Abraço NOME COMPLETO": o nome completo vira o nome, e a assinatura fica só com o primeiro nome
      name = titleCase(hug[1]);
      lines[lines.length - 1] = last.replace(hug[1], name.split(' ')[0]);
    }
    let target = rels[r.img] || '';
    target = target.startsWith('/') ? target.slice(1) : 'word/' + target.replace(/^\.\//, '');
    const data = await zip.read(target);
    if (!data) continue;
    const ext = (target.split('.').pop() || 'jpeg').toLowerCase();
    const type = MIME[ext] || 'image/jpeg';
    const fname = `${String(i + 1).padStart(2, '0')}-${name || 'aluno'}.${ext}`;
    students.push({
      file: new File([data], fname, { type }),
      name,
      text: lines.join('\n'),
      order: i,
    });
  }
  return students;
}

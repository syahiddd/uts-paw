#!/usr/bin/env node
// Enkripsi hasil penilaian. Artifact dan log Actions di repo publik bisa dibaca siapa pun,
// jadi nilai, identitas, dan indikasi integritas hanya disimpan dalam bentuk terenkripsi
// dengan kunci publik grader/kunci-publik.pem. Kunci privatnya hanya dipegang dosen
// (berkas lokal di luar repo dan secret KUNCI_REKAP untuk job rekap).
//
//   node grader/sandi.mjs kunci-baru <folder-privat>      buat pasangan kunci baru
//   node grader/sandi.mjs buka <berkas.enc> <kunci.pem> [folder]
//        buka hasil; berkas .tgz.enc langsung diekstrak ke folder (bawaan: folder berkas)
import { spawnSync } from 'node:child_process'
import { createCipheriv, createDecipheriv, generateKeyPairSync, privateDecrypt, publicEncrypt, randomBytes, constants } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const AJAIB = Buffer.from('UTS1')
const OAEP = { padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }

export const KUNCI_PUBLIK = fileURLToPath(new URL('kunci-publik.pem', import.meta.url))

// Format: "UTS1" | panjang kunci terbungkus (2 bait) | kunci AES terbungkus RSA-OAEP | iv (12) | tag (16) | isi AES-256-GCM
export function kunci(isi, pemPublik) {
  const aes = randomBytes(32)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', aes, iv)
  const sandi = Buffer.concat([cipher.update(isi), cipher.final()])
  const bungkus = publicEncrypt({ key: pemPublik, ...OAEP }, aes)
  const panjang = Buffer.alloc(2)
  panjang.writeUInt16BE(bungkus.length)
  return Buffer.concat([AJAIB, panjang, bungkus, iv, cipher.getAuthTag(), sandi])
}

export function buka(buf, pemPrivat) {
  if (!buf.subarray(0, 4).equals(AJAIB)) throw new Error('bukan berkas terenkripsi UTS')
  const n = buf.readUInt16BE(4)
  let i = 6
  const aes = privateDecrypt({ key: pemPrivat, ...OAEP }, buf.subarray(i, (i += n)))
  const iv = buf.subarray(i, (i += 12))
  const tag = buf.subarray(i, (i += 16))
  const decipher = createDecipheriv('aes-256-gcm', aes, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(buf.subarray(i)), decipher.final()])
}

function main() {
  const [perintah, a, b, c] = process.argv.slice(2)
  if (perintah === 'kunci-baru' && a) {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
      modulusLength: 3072,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    })
    mkdirSync(a, { recursive: true })
    writeFileSync(join(a, 'kunci-rekap.pem'), privateKey, { mode: 0o600 })
    writeFileSync(KUNCI_PUBLIK, publicKey)
    console.log(`Kunci privat: ${join(a, 'kunci-rekap.pem')} (jangan di-commit)\nKunci publik: ${KUNCI_PUBLIK}`)
  } else if (perintah === 'buka' && a && b) {
    const isi = buka(readFileSync(a), readFileSync(b, 'utf8'))
    const folder = c ?? dirname(a)
    mkdirSync(folder, { recursive: true })
    if (a.endsWith('.tgz.enc')) {
      const r = spawnSync('tar', ['-xzf', '-', '-C', folder], { input: isi })
      if (r.status !== 0) throw new Error(`tar gagal: ${r.stderr}`)
      console.log(`Diekstrak ke ${folder}`)
    } else {
      const keluar = join(folder, basename(a).replace(/\.enc$/, ''))
      writeFileSync(keluar, isi)
      console.log(`Ditulis ke ${keluar}`)
    }
  } else {
    console.error('Pakai: sandi.mjs kunci-baru <folder-privat> | sandi.mjs buka <berkas.enc> <kunci.pem> [folder]')
    process.exit(1)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()

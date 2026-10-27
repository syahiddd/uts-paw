#!/usr/bin/env node
// Menggabungkan hasil per fork menjadi nilai.csv dan laporan.md, lalu menjalankan pemeriksaan
// integritas (per fork dan lintas fork) pada arsip bundle tiap fork.
//   node grader/rekap.mjs <folder-hasil> [folder-keluaran] [--integritas modul.mjs] [--kunci kunci.pem] [--sandi kunci-publik.pem]
//
// --integritas  modul pemeriksaan integritas privat (bawaan: env UTS_INTEGRITAS). Modul ini tidak
//               ada di repo publik; tanpa modul, rekap tetap jalan tanpa indikasi integritas.
// --kunci       kunci privat untuk membuka hasil *.json.enc (bawaan: env KUNCI_REKAP berisi PEM).
// --sandi       kunci publik; seluruh keluaran dikemas jadi <keluaran>.tgz.enc dan versi
//               terbukanya dihapus, karena artifact dan ringkasan run di repo publik bisa dibaca siapa pun.
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { UTS, namaCocok } from './lib.mjs'
import { formatTotal } from './periksa.mjs'
import { buka, kunci } from './sandi.mjs'

const posisi = process.argv.slice(2).filter((a, i, arr) => !a.startsWith('--') && !arr[i - 1]?.startsWith('--'))
const opsi = (nama) => {
  const i = process.argv.indexOf(`--${nama}`)
  return i > -1 ? process.argv[i + 1] : undefined
}
const [masuk = 'hasil', keluar = masuk] = posisi
const URUTAN_TINGKAT = { tinggi: 0, sedang: 1, rendah: 2 }
const akar = fileURLToPath(new URL('..', import.meta.url))

const pemKunci = opsi('kunci') ? readFileSync(opsi('kunci'), 'utf8') : process.env.KUNCI_REKAP
const bacaHasil = (f) => {
  const isi = readFileSync(join(masuk, f))
  if (!f.endsWith('.enc')) return JSON.parse(isi)
  if (!pemKunci) throw new Error(`${f} terenkripsi; berikan --kunci atau env KUNCI_REKAP`)
  return JSON.parse(buka(isi, pemKunci))
}

const semua = readdirSync(masuk, { recursive: true })
  .map(String)
  .filter((f) => f.endsWith('.json') || f.endsWith('.json.enc'))
  .map(bacaHasil)
  .filter((h) => h.repo)
  .map((h) => ({ ...h, integritas: [] }))
  .sort((a, b) => String(a.mahasiswa?.nim ?? '').localeCompare(String(b.mahasiswa?.nim ?? '')))

const berkasPrivat = opsi('integritas') ?? process.env.UTS_INTEGRITAS
const privat = berkasPrivat && existsSync(berkasPrivat) ? await import(pathToFileURL(resolve(berkasPrivat)).href) : null
if (!privat) console.warn('Modul integritas privat tidak tersedia; rekap dibuat tanpa indikasi integritas.')

// Arsip dibuat sebelum kode mahasiswa dijalankan; SHA-256-nya dicatat saat itu juga.
// Bundle yang isinya tidak cocok lagi berarti diubah setelahnya.
const daftar = semua.map((h) => {
  if (!h.sha || !h.arsip?.berkas) return { h, dir: null }
  const bundle = join(masuk, 'arsip', h.arsip.berkas)
  if (!existsSync(bundle)) return { h, dir: null }
  if (createHash('sha256').update(readFileSync(bundle)).digest('hex') !== h.arsip.sha256) {
    h.integritas.push({ id: 'I10', tingkat: 'tinggi', pesan: 'arsip bundle berubah setelah dibuat' })
    return { h, dir: null }
  }
  const dir = mkdtempSync(join(tmpdir(), 'uts-rekap-'))
  const r = spawnSync('git', ['clone', '--quiet', '--branch', 'dinilai', bundle, dir], { encoding: 'utf8' })
  return { h, dir: r.status === 0 ? dir : null }
})

let jumlahPasanganMirip = 0
if (privat) {
  const lib = { UTS, namaCocok }
  for (const { h, dir } of daftar) if (dir) h.integritas.push(...privat.periksaFork({ dir, h, akar, lib }))
  jumlahPasanganMirip = privat.lintasFork(daftar, { akar, lib }).length
}
for (const { dir } of daftar) if (dir) rmSync(dir, { recursive: true, force: true })

const label = (h) => `${h.mahasiswa?.nama || h.repo} (${h.mahasiswa?.nim || '-'})`
const ids = [...UTS.rubrik.flatMap((k) => k.butir.map((b) => b.id)), ...(UTS.bonus ? [UTS.bonus.id] : [])]
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
const ringkasIndikasi = (h) => h.integritas.map((i) => i.id).filter((v, k, arr) => arr.indexOf(v) === k).join(' ')
const header = ['nim', 'nama', 'kelas', 'terdaftar', 'tema', 'repo', 'url', 'commit', 'waktu_push', 'tenggat', 'bukti_waktu', 'total', ...ids, 'indikasi', 'catatan']
const rows = semua.map((h) => {
  const skor = Object.fromEntries((h.rincian ?? []).map((r) => [r.id, r.skor]))
  const catatan = [h.catatan, h.terlambat && 'ada push setelah tenggat (diabaikan)'].filter(Boolean).join('; ')
  const terdaftar = h.terdaftar === null || h.terdaftar === undefined ? '' : h.terdaftar ? 'ya' : 'tidak'
  return [h.mahasiswa?.nim, h.mahasiswa?.nama, h.kelas, terdaftar, h.tema, h.repo, h.url, h.sha?.slice(0, 7), h.waktu, h.tenggat, h.bukti, h.total, ...ids.map((id) => skor[id] ?? 0), ringkasIndikasi(h), catatan]
})

mkdirSync(keluar, { recursive: true })
writeFileSync(join(keluar, 'nilai.csv'), [header, ...rows].map((r) => r.map(csv).join(',')).join('\n') + '\n')

const berindikasi = semua
  .filter((h) => h.integritas.length)
  .sort((a, b) => Math.min(...a.integritas.map((i) => URUTAN_TINGKAT[i.tingkat])) - Math.min(...b.integritas.map((i) => URUTAN_TINGKAT[i.tingkat])))

// Manifest bukti: satu baris per fork, berisi commit yang dinilai, waktu push menurut server
// GitHub, sidik jari arsip, dan indikasi. Sidik jari manifest dicetak di ringkasan Actions repo
// induk, yang tidak bisa diubah mahasiswa.
const manifest = {
  dibuat: new Date().toISOString(),
  repoInduk: UTS.repoInduk,
  fork: semua.map((h) => ({
    repo: h.repo,
    nim: h.mahasiswa?.nim ?? null,
    kelas: h.kelas ?? null,
    commit: h.sha ?? null,
    waktuPush: h.waktu ?? null,
    buktiWaktu: h.bukti ?? null,
    tenggat: h.tenggat ?? null,
    arsip: h.arsip ?? null,
    integritas: h.integritas,
  })),
}
const teksManifest = JSON.stringify(manifest, null, 2) + '\n'
writeFileSync(join(keluar, 'manifest-bukti.json'), teksManifest)
const sidikManifest = createHash('sha256').update(teksManifest).digest('hex')

// Laporan per mahasiswa: butir yang belum lulus beserta catatannya, dan tautan ke baris kode
// pada commit yang dinilai (permalink GitHub, tetap valid walau fork diubah setelahnya).
const tautan = (h, { berkas, baris }) =>
  `[${berkas}${baris ? `:${baris}` : ''}](https://github.com/${h.repo}/blob/${h.sha}/${berkas}${baris ? `#L${baris}` : ''})`
const daftarLokasi = (h, lokasi = []) => (h.sha && lokasi.length ? ` Lokasi: ${lokasi.map((l) => tautan(h, l)).join(', ')}` : '')
const namaBerkas = (h) => `${h.mahasiswa?.nim || 'tanpa-nim'}-${h.repo.split('/')[0]}.md`

mkdirSync(join(keluar, 'mahasiswa'), { recursive: true })
for (const h of semua) {
  const rincian = h.rincian ?? []
  const belum = rincian.filter((r) => !r.lulus)
  const teks = [
    `# Hasil ${UTS.judul} ${UTS.mataKuliah}`,
    '',
    `**${h.mahasiswa?.nama || '-'}** (${h.mahasiswa?.nim || '-'}), kelas ${h.kelas || '-'}, tema ${h.tema || '-'}`,
    '',
    `- Repo: https://github.com/${h.repo}`,
    h.sha ? `- Commit yang dinilai: [${h.sha.slice(0, 7)}](https://github.com/${h.repo}/commit/${h.sha}), push ${h.waktu ?? '-'} (${h.bukti ?? '-'})` : `- Commit yang dinilai: ${h.catatan ?? 'tidak ada'}`,
    h.url ? `- Situs: ${h.url}` : '',
    '',
    `## Nilai: ${formatTotal(h.total ?? 0)}`,
    '',
    '| Butir | Kriteria | Skor |',
    '|---|---|---|',
    ...rincian.map((r) => `| ${r.id} | ${r.uraian} | ${r.skor}/${r.bobot} |`),
    '',
    '## Butir yang belum lulus',
    '',
    belum.length
      ? belum.map((r) => `- **${r.id}** (${r.skor}/${r.bobot}) ${r.uraian}. Catatan: ${(r.catatan || '-').replace(/\.$/, '')}.${daftarLokasi(h, r.lokasi)}`).join('\n')
      : 'Semua butir lulus.',
    '',
    '## Catatan integritas (untuk klarifikasi)',
    '',
    h.integritas.length
      ? h.integritas.map((i) => `- **${i.id}** (${i.tingkat}): ${i.pesan}${daftarLokasi(h, i.lokasi)}`).join('\n')
      : 'Tidak ada indikasi.',
    '',
  ]
  writeFileSync(join(keluar, 'mahasiswa', namaBerkas(h)), teks.filter((b) => b !== null).join('\n'))
}

const jadwal = Object.entries(UTS.kelas).map(([k, j]) => `${k} ${j.dibuka} s.d. ${j.tenggat}`).join('; ')
const md = [
  `# Rekap Nilai ${UTS.judul} ${UTS.mataKuliah}`,
  '',
  `Jadwal: ${jadwal}. Jumlah fork dinilai: ${semua.length}. Modul integritas: ${privat ? `versi ${privat.VERSI}` : 'tidak tersedia'}.${privat ? ` Pasangan kode mirip: ${jumlahPasanganMirip}.` : ''}`,
  '',
  '| NIM | Nama | Kelas | Terdaftar | Total | Indikasi | Laporan | Catatan |',
  '|---|---|---|---|---|---|---|---|',
  ...rows.map((r, i) => `| ${r[0] ?? '-'} | ${r[1] ?? '-'} | ${r[2] ?? '-'} | ${r[3] || '-'} | ${r[11]} | ${r.at(-2) || '-'} | [${namaBerkas(semua[i])}](mahasiswa/${namaBerkas(semua[i])}) | ${r.at(-1)} |`),
  '',
  '## Indikasi integritas',
  '',
  berindikasi.length
    ? berindikasi.map((h) => `### ${label(h)}, ${h.repo}\n\n${h.integritas.map((i) => `- **${i.id}** (${i.tingkat}): ${i.pesan}`).join('\n')}`).join('\n\n')
    : 'Tidak ada.',
  '',
  '## Arsip bukti',
  '',
  `Kode setiap fork pada commit yang dinilai diarsipkan sebagai git bundle (artifact \`arsip-bukti\`). Sidik jari SHA-256 manifest: \`${sidikManifest}\`.`,
  '',
  'Indikasi bukan bukti. Sesuai kontrak kuliah, nilai 0 hanya diberikan bila mencontek atau kerja sama terbukti; mintalah demo atau penjelasan lisan sebelum memutuskan.',
].join('\n')
writeFileSync(join(keluar, 'laporan.md'), md + '\n')

const sandi = opsi('sandi')
if (sandi) {
  const tar = spawnSync('tar', ['-czf', '-', '-C', keluar, '.'], { maxBuffer: 1024 * 1024 * 1024 })
  if (tar.status !== 0) throw new Error(`tar gagal: ${tar.stderr}`)
  const berkas = `${resolve(keluar)}.tgz.enc`
  writeFileSync(berkas, kunci(tar.stdout, readFileSync(sandi, 'utf8')))
  rmSync(keluar, { recursive: true, force: true })
  // Ringkasan run repo publik bisa dibaca siapa pun: hanya angka agregat tanpa nama atau nilai.
  const ringkas = [
    `# Rekap ${UTS.judul}`,
    '',
    `${semua.length} fork dinilai, ${berindikasi.length} dengan indikasi integritas. Modul integritas: ${privat ? 'terpasang' : 'TIDAK terpasang'}.`,
    '',
    `Hasil terenkripsi di artifact \`rekap-nilai\`. Sidik jari SHA-256 manifest: \`${sidikManifest}\`.`,
  ].join('\n')
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, ringkas)
  console.log(`Rekap ${semua.length} fork dienkripsi ke ${berkas}`)
} else {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
  console.log(`Rekap ${semua.length} fork (${berindikasi.length} dengan indikasi) ditulis ke ${keluar}/nilai.csv dan ${keluar}/laporan.md`)
}

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

export const UTS = JSON.parse(readFileSync(new URL('../shared/uts.json', import.meta.url), 'utf8'))

// Nilai maksimal = rubrik + bonus. Dihitung dari uts.json di satu tempat ini (portal memakai
// rumus yang sama di portal/src/uts.js), jadi grader, laporan, dan portal selalu sinkron.
export const NILAI_RUBRIK = UTS.rubrik.flatMap((k) => k.butir).reduce((s, b) => s + b.bobot, 0)
export const NILAI_MAKS = NILAI_RUBRIK + (UTS.bonus?.bobot ?? 0)

export function temaUntukNim(nim) {
  const akhir = String(nim).trim().slice(-1)
  return /\d/.test(akhir) ? UTS.tema.find((t) => t.digit === Number(akhir)) : undefined
}

export function jadwalKelas(kelas) {
  const j = UTS.kelas[kelas]
  return j ? { dibuka: new Date(j.dibuka), tenggat: new Date(j.tenggat) } : undefined
}

// Tenggat paling akhir dipakai bila kelas belum diketahui, supaya tidak ada
// pekerjaan yang terbuang hanya karena mahasiswa.json salah isi.
export const TENGGAT_TERAKHIR = new Date(Math.max(...Object.values(UTS.kelas).map((k) => new Date(k.tenggat))))

// Data kelas berisi nama dan NIM seluruh mahasiswa, jadi tidak pernah disimpan
// di repo publik. Sumbernya secret DAFTAR_KELAS atau berkas yang disebut eksplisit.
export function bacaDaftarKelas(berkas) {
  try {
    if (berkas) return JSON.parse(readFileSync(berkas, 'utf8'))
    if (process.env.DAFTAR_KELAS) return JSON.parse(process.env.DAFTAR_KELAS)
  } catch (err) {
    throw new Error(`Data kelas tidak bisa dibaca: ${err.message}`)
  }
  return null
}

const tokenNama = (s) => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((t) => t.length > 1)

// Nama di data kelas sering berbeda kapitalisasi atau disingkat ("M." vs "Muhammad"),
// jadi cukup separuh kata yang sama.
export function namaCocok(a, b) {
  const [x, y] = [new Set(tokenNama(a)), new Set(tokenNama(b))]
  if (!x.size || !y.size) return false
  const sama = [...x].filter((t) => y.has(t)).length
  return sama / Math.min(x.size, y.size) >= 0.5
}

function token() {
  if (process.env.GH_TOKEN || process.env.GITHUB_TOKEN) {
    return process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  }
  try {
    return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

const TOKEN = token()

export async function api(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      ...(TOKEN && { Authorization: `Bearer ${TOKEN}` }),
    },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status} untuk ${path}`)
  return res.json()
}

export async function daftarFork() {
  const hasil = []
  for (let page = 1; ; page++) {
    const batch = await api(`/repos/${UTS.repoInduk}/forks?per_page=100&page=${page}`)
    hasil.push(...batch)
    if (batch.length < 100) return hasil
  }
}

export async function bacaMahasiswaFork(repo, branch) {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${repo}/${branch}/app/mahasiswa.json`)
    return res.ok ? await res.json() : {}
  } catch {
    return {}
  }
}

export function urlPages(repo) {
  const [owner, name] = repo.split('/')
  return `https://${owner.toLowerCase()}.github.io/${name}/`
}

// GitHub Pages menyajikan 404.html dengan status 404, jadi yang dicek adalah
// isi halamannya (ada elemen #root), bukan kode statusnya.
export async function situsMemuatApp(url) {
  try {
    const res = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000) })
    const html = await res.text()
    return { ok: /id=["']root["']/.test(html), status: res.status }
  } catch (err) {
    return { ok: false, status: 0, error: err.message }
  }
}

#!/usr/bin/env node
// Pemeriksa otomatis Ujian Tengah Semester Pengembangan Aplikasi Web.
//
//   node grader/periksa.mjs --lokal app            cek mandiri di komputer sendiri
//   node grader/periksa.mjs --repo user/uts-paw    nilai satu fork
//   node grader/periksa.mjs --daftar               cetak daftar fork dalam JSON
//   node grader/periksa.mjs --target user/uts-paw  cetak commit yang dinilai dalam JSON
//
// Opsi: --url <url-pages> (paksa URL deployment), --out <folder> (simpan hasil JSON),
// --target-file <berkas> (pakai hasil --target, sehingga --repo berjalan tanpa token GitHub;
// dipakai workflow nilai.yml agar kode mahasiswa tidak pernah dijalankan bersama token),
// --daftar-kelas <berkas> (data kelas; di CI dibaca dari secret DAFTAR_KELAS),
// --sandi <kunci-publik.pem> (enkripsi hasil di --out; artifact repo publik bisa dibaca siapa pun).
//
// Pemeriksaan integritas tidak ada di sini. Modulnya privat dan hanya dijalankan oleh
// rekap.mjs di repo induk, jadi cek mandiri tidak bisa dipakai untuk menguji cara mengelabuinya.
import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { appendFileSync, chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { NILAI_MAKS, TENGGAT_TERAKHIR, UTS, api, bacaDaftarKelas, bacaMahasiswaFork, daftarFork, jadwalKelas, situsMemuatApp, temaUntukNim, urlPages } from './lib.mjs'
import { kunci } from './sandi.mjs'

const GRADER = dirname(fileURLToPath(import.meta.url))

// Dibaca sekali sebelum kode mahasiswa dijalankan, supaya skrip build atau test di fork
// tidak bisa mengganti berkas uji dosen di workspace sebelum berkas itu dipakai.
const UJI_RUBRIK = readFileSync(join(GRADER, 'uji/rubrik.test.jsx'), 'utf8')
const KONFIG_LINT = readFileSync(join(GRADER, 'oxlintrc.json'), 'utf8')
const BONUS = UTS.bonus

function arg(nama) {
  const i = process.argv.indexOf(`--${nama}`)
  if (i === -1) return undefined
  const nilai = process.argv[i + 1]
  return nilai && !nilai.startsWith('--') ? nilai : true
}

function jalankan(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 })
  return { ok: r.status === 0, keluaran: `${r.stdout ?? ''}${r.stderr ?? ''}` }
}

// Di nilai.yml (UTS_PENGGUNA_UJI diisi) kode mahasiswa berjalan sebagai pengguna Linux terpisah
// yang tidak punya hak tulis ke workspace grader, dan semua prosesnya dimatikan setelah setiap
// perintah, jadi tidak ada proses yang tertinggal untuk mengubah berkas uji atau hasil.
const PENGGUNA = process.env.UTS_PENGGUNA_UJI

function jalankanKode(cmd, args, cwd) {
  if (!PENGGUNA) return jalankan(cmd, args, cwd)
  const r = jalankan('sudo', ['-u', PENGGUNA, '-H', 'env', `PATH=${process.env.PATH}`, 'CI=true', cmd, ...args], cwd)
  spawnSync('sudo', ['pkill', '-9', '-u', PENGGUNA])
  return r
}

function bukaAkses(dir) {
  if (PENGGUNA) spawnSync('chmod', ['-R', 'a+rwX', dir])
}

function hapus(path) {
  if (PENGGUNA) spawnSync('sudo', ['rm', '-rf', path])
  else rmSync(path, { recursive: true, force: true })
}

function bacaJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return null
  }
}

function semuaBerkas(dir, cocok) {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && cocok(e.name))
    .map((e) => join(e.parentPath, e.name))
    .filter((p) => !p.includes('__rubrik__') && !p.includes('node_modules'))
}

const isTest = (p) => /\.(test|spec)\.[jt]sx?$/.test(p)

// ---------- pemeriksaan per kelompok rubrik ----------

// konteks.daftar: null = data kelas tidak tersedia (cek mandiri), false = NIM tidak
// terdaftar, objek = entri data kelas untuk NIM ini.
function cekIdentitas(appDir, konteks) {
  const m = bacaJson(join(appDir, 'mahasiswa.json')) ?? {}
  const tema = temaUntukNim(m.nim ?? '')
  const lengkap = m.nama?.trim() && /^\d{9}$/.test(m.nim ?? '') && UTS.kelas[m.kelas]
  const temaCocok = tema && m.tema?.trim().toLowerCase() === tema.nama.toLowerCase()
  const terdaftar = konteks.daftar === null || (konteks.daftar && konteks.daftar.kelas === m.kelas)
  const alasan = !lengkap
    ? `nama, NIM 9 digit, atau kelas (${Object.keys(UTS.kelas).join('/')}) belum valid`
    : !temaCocok
      ? `tema seharusnya "${tema?.nama}"`
      : !terdaftar
        ? konteks.daftar === false ? 'NIM tidak terdaftar di data kelas' : `kelas di data kelas adalah ${konteks.daftar.kelas}`
        : ''
  return { mahasiswa: m, tema, A1: [!alasan, alasan] }
}

function cekReadme(root, m) {
  const isi = existsSync(join(root, 'README.md')) ? readFileSync(join(root, 'README.md'), 'utf8') : ''
  const kurang = [
    [m.nim && isi.includes(m.nim), 'NIM'],
    [m.nama && isi.toLowerCase().includes(m.nama.toLowerCase()), 'nama'],
    [/https?:\/\/\S+/.test(isi) && /github\.io|mhabibalgifari/.test(isi), 'URL deployment'],
    [/!\[[^\]]*\]\([^)]+\)/.test(isi), 'tangkapan layar'],
    [/^#+.*fitur/im.test(isi), 'bagian Fitur'],
  ].filter(([ok]) => !ok).map(([, n]) => n)
  return [kurang.length === 0, kurang.length ? `kurang: ${kurang.join(', ')}` : '']
}

function cekData(appDir, tema) {
  const data = bacaJson(join(appDir, 'public/data/koleksi.json'))
  if (!Array.isArray(data)) return [false, 'public/data/koleksi.json tidak ada atau bukan array JSON']
  if (data.length < UTS.minimalItem) return [false, `baru ${data.length} item, minimal ${UTS.minimalItem}`]
  const ids = data.map((d) => String(d.id ?? ''))
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) return [false, 'id kosong atau duplikat']
  const wajib = ['judul', 'kategori', ...(tema?.field.map((f) => f.kunci) ?? [])]
  const kosong = (v) => v === undefined || v === null || String(v).trim() === ''
  const salah = data.findIndex((d) => wajib.some((k) => kosong(d[k])))
  if (!tema) return [false, 'tema tidak diketahui karena NIM belum valid']
  if (salah !== -1) return [false, `item ke-${salah + 1} belum punya semua field: ${wajib.join(', ')}`]
  return [true, '']
}

function cekStatis(appDir) {
  const src = join(appDir, 'src')
  const kodeFiles = semuaBerkas(src, (n) => /\.[jt]sx?$/.test(n)).filter((p) => !isTest(p) && !p.endsWith('setupTests.js'))
  const kode = kodeFiles.map((p) => readFileSync(p, 'utf8')).join('\n')
  const css = semuaBerkas(src, (n) => n.endsWith('.css')).map((p) => readFileSync(p, 'utf8')).join('\n')
  const ada = (re) => re.test(kode)

  const namaContext = [...kode.matchAll(/(?:const|let)\s+(\w+)\s*=\s*(?:React\.)?createContext\s*\(/g)].map((m) => m[1])
  const providerDipakai = namaContext.some((n) => new RegExp(`<${n}(\\.Provider)?[\\s>]`).test(kode))

  const hookFiles = semuaBerkas(join(src, 'hooks'), (n) => /^use[A-Z]\w*\.[jt]sx?$/.test(n)).filter((p) => !isTest(p))
  const hookDipakai = hookFiles.filter((p) => {
    const nama = basename(p).replace(/\.[jt]sx?$/, '')
    return kodeFiles.some((f) => f !== p && new RegExp(`\\b${nama}\\s*\\(`).test(readFileSync(f, 'utf8')))
  })

  const jumlahRoute = (kode.match(/<Route\b/g) ?? []).length
  const komponen = semuaBerkas(join(src, 'components'), (n) => /\.[jt]sx$/.test(n)).filter((p) => !isTest(p))

  const hasil = {
    D1: [ada(/\buseState\s*\(/) && ada(/\buseEffect\s*\(/), 'useState dan useEffect'],
    D2: [namaContext.length > 0 && providerDipakai && ada(/\buse(Context)?\s*\(\s*\w*Context\b/), 'createContext + Provider + useContext'],
    D3: [hookDipakai.length >= 2, `${hookDipakai.length} custom hook terpakai di src/hooks`],
    D4: [jumlahRoute >= 7 && ada(/\buseParams\s*\(/) && ada(/\buseNavigate\s*\(/) && ada(/<(Nav)?Link\b/), `${jumlahRoute} <Route>, useParams, useNavigate, Link/NavLink`],
    D5: [
      ada(/await\s+fetch\s*\(/) && ada(/\[\s*\w*(loading|memuat)\w*\s*,/i) && ada(/\[\s*\w*(error|galat|gagal)\w*\s*,/i),
      'await fetch(...) + state loading dan error',
    ],
    D6: [komponen.length >= 5, `${komponen.length} komponen di src/components`],
    E2: [/@media\b/.test(css) && /display\s*:\s*(inline-)?(flex|grid)\b/.test(css), '@media + flex/grid di berkas .css'],
    E3: [
      ada(/(const|let)\s*[{[]|\(\s*\{\s*\w+/) && ada(/\.\.\.\w/) && ada(/`[^`]*\$\{/) && ada(/\.map\s*\(/) && ada(/\.(filter|reduce)\s*\(/),
      'destructuring, spread, template literal, map, filter/reduce',
    ],
  }
  return Object.fromEntries(Object.entries(hasil).map(([k, [ok, ket]]) => [k, [ok, ok ? '' : `belum terpenuhi: ${ket}`]]))
}

// Bonus: selektor di berkas .css sendiri. Selektor id dan kelas hanya dihitung bila namanya
// dipakai di kode komponen, supaya CSS yang tidak pernah tampil tidak ikut dihitung.
function cekBonus(appDir) {
  const src = join(appDir, 'src')
  const css = semuaBerkas(src, (n) => n.endsWith('.css'))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')
  const kode = semuaBerkas(src, (n) => /\.[jt]sx?$/.test(n))
    .filter((p) => !isTest(p))
    .map((p) => readFileSync(p, 'utf8'))
    .join('\n')
  const selektor = [...css.matchAll(/(?:^|[{};])\s*([^{};]+?)\s*\{/g)]
    .map((m) => m[1].replace(/\[[^\]]*\]/g, ''))
    .filter((s) => !s.startsWith('@') && !/^(from|to|[\d.]+%)\b/.test(s))
    .join(' ')
  const unik = (re) => [...new Set([...selektor.matchAll(re)].map((m) => m[1]))]
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const dipakai = (nama) => new RegExp(`(^|[\\s"'\`{.])${escape(nama)}($|[\\s"'\`}])`, 'm').test(kode)
  const jumlah = {
    id: unik(/#(-?[A-Za-z_][\w-]*)/g).filter(dipakai).length,
    kelas: unik(/\.(-?[A-Za-z_][\w-]*)/g).filter(dipakai).length,
    pseudo: unik(/::?(-?[A-Za-z][\w-]*)/g).filter((n) => n !== 'root').length,
  }
  const kurang = Object.entries(BONUS.syarat).filter(([k, min]) => jumlah[k] < min)
  const ringkas = `${jumlah.id} id, ${jumlah.kelas} kelas, ${jumlah.pseudo} pseudo`
  return [kurang.length === 0, kurang.length ? `baru ${ringkas} (syarat ${Object.entries(BONUS.syarat).map(([k, v]) => `${v} ${k}`).join(', ')})` : ringkas]
}

function hasilVitest(path) {
  const json = bacaJson(path)
  return (json?.testResults ?? []).flatMap((f) => f.assertionResults ?? [])
}

function cekTestSendiri(appDir, kerja) {
  const out = join(kerja, 'vitest-mahasiswa.json')
  jalankanKode('npx', ['vitest', 'run', '--reporter=json', `--outputFile=${out}`], appDir)
  const tests = hasilVitest(out)
  const gagal = tests.filter((t) => t.status !== 'passed')
  return {
    F1: [tests.length >= 5, tests.length >= 5 ? '' : `baru ${tests.length} test`],
    F2: [tests.length >= 5 && gagal.length === 0, gagal.length ? `${gagal.length} test gagal: ${gagal[0].title}` : tests.length >= 5 ? '' : 'butuh minimal 5 test yang lulus'],
  }
}

// Uji dosen memakai konfigurasi Vitest milik grader, bukan vite.config fork: plugin, alias,
// reporter, atau globalSetup buatan mahasiswa tidak ikut berjalan. Folder ujinya bernama acak
// dan isinya dicek ulang sebelum dijalankan.
function konfigVitest(folder) {
  return `import react from '@vitejs/plugin-react'
import { existsSync } from 'node:fs'
export default {
  configFile: false,
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['src/${folder}/rubrik.test.jsx'],
    setupFiles: existsSync('src/setupTests.js') ? ['./src/setupTests.js'] : [],
  },
}
`
}

function cekUjiDosen(appDir, kerja) {
  const folder = `__rubrik__${randomBytes(6).toString('hex')}`
  const tujuan = join(appDir, 'src', folder)
  mkdirSync(tujuan, { recursive: true })
  writeFileSync(join(tujuan, 'rubrik.test.jsx'), UJI_RUBRIK)
  writeFileSync(join(tujuan, 'tema.json'), JSON.stringify(UTS.tema))
  writeFileSync(join(tujuan, 'vitest.config.mjs'), konfigVitest(folder))
  bukaAkses(tujuan)
  const utuh = readFileSync(join(tujuan, 'rubrik.test.jsx'), 'utf8') === UJI_RUBRIK
  const out = join(kerja, 'vitest-rubrik.json')
  const r = utuh
    ? jalankanKode('npx', ['vitest', 'run', '--config', `src/${folder}/vitest.config.mjs`, '--root', '.', '--reporter=json', `--outputFile=${out}`], appDir)
    : { keluaran: 'error: berkas uji dosen berubah sebelum dijalankan' }
  hapus(tujuan)
  const tests = utuh ? hasilVitest(out) : []
  const ids = ['C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12', 'C13', 'C14', 'E1']
  return Object.fromEntries(
    ids.map((id) => {
      const t = tests.find((x) => x.title.startsWith(`${id} `))
      if (!t) return [id, [false, tests.length ? 'test tidak berjalan' : `uji dosen gagal dimuat: ${r.keluaran.split('\n').find((l) => /error/i.test(l))?.trim() ?? ''}`]]
      const pesan = (t.failureMessages?.[0] ?? '').split('\n')[0].slice(0, 160)
      return [id, [t.status === 'passed', t.status === 'passed' ? '' : pesan]]
    }),
  )
}

// ---------- penilaian ----------

export async function periksa({ appDir, url, pasang = false, konteks = { daftar: null } }) {
  const root = resolve(appDir, '..')
  const kerja = mkdtempSync(join(tmpdir(), 'uts-paw-'))
  const butir = {}
  const catat = (obj) => Object.assign(butir, obj)
  bukaAkses(root)
  if (PENGGUNA) chmodSync(kerja, 0o777)

  const { mahasiswa, tema, A1 } = cekIdentitas(appDir, konteks)
  // Dihitung sebelum kode mahasiswa dijalankan, dari berkas hasil clone.
  catat({ A1, A4: cekReadme(root, mahasiswa), C1: cekData(appDir, tema), ...cekStatis(appDir), ...(BONUS && { [BONUS.id]: cekBonus(appDir) }) })

  if (url) {
    const utama = await situsMemuatApp(url)
    const dalam = await situsMemuatApp(new URL('koleksi', url).href)
    catat({
      A2: [utama.ok, utama.ok ? '' : `${url} tidak memuat aplikasi (status ${utama.status})`],
      A3: [dalam.ok, dalam.ok ? '' : 'refresh /koleksi tidak memuat aplikasi, cek salinan 404.html'],
    })
  } else {
    catat({ A2: [false, 'URL Pages tidak diketahui'], A3: [false, 'URL Pages tidak diketahui'] })
  }

  if (pasang) {
    const install = jalankanKode('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], appDir)
    if (!install.ok) jalankanKode('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], appDir)
  }
  const build = jalankanKode('npm', ['run', 'build'], appDir)
  // Berkas disebut satu per satu: bila folder yang diberikan, oxlint ikut membaca .gitignore
  // di folder induk dan bisa melewatkan seluruh src.
  const berkasLint = semuaBerkas(join(appDir, 'src'), (n) => /\.[jt]sx?$/.test(n)).map((p) => relative(appDir, p))
  const konfigLint = join(kerja, 'oxlintrc.json')
  writeFileSync(konfigLint, KONFIG_LINT)
  const lint = berkasLint.length
    ? jalankanKode('npx', ['oxlint', '-c', konfigLint, '--format', 'unix', ...berkasLint], appDir)
    : { ok: false, keluaran: 'tidak ada berkas kode di src' }
  // Format unix: "src/App.jsx:12:5: pesan [Error/aturan]". Hanya error yang membuat B2 gagal.
  const galatLint = [...lint.keluaran.matchAll(/^(.+?):(\d+):\d+: (.*) \[Error\/[^\]]+\]$/gm)].map((m) => ({
    berkas: `app/${m[1]}`,
    baris: Number(m[2]),
    pesan: m[3],
  }))
  catat({
    B1: [build.ok, build.ok ? '' : build.keluaran.trim().split('\n').slice(-3).join(' ')],
    B2: [lint.ok, lint.ok ? '' : `${galatLint.length || 'beberapa'} error lint${galatLint[0] ? `, misalnya: ${galatLint[0].pesan}` : ''}`, galatLint.slice(0, 10)],
  })

  catat(cekTestSendiri(appDir, kerja))
  catat(cekUjiDosen(appDir, kerja))
  hapus(kerja)

  const butirBonus = BONUS ? [{ kode: 'Bonus', butir: [BONUS] }] : []
  const rincian = [...UTS.rubrik, ...butirBonus].flatMap((k) =>
    k.butir.map((b) => {
      const [lulus, catatan, lokasi = []] = butir[b.id] ?? [false, 'tidak diperiksa']
      return { id: b.id, kelompok: k.kode, uraian: b.uraian, bobot: b.bobot, lulus, skor: lulus ? b.bobot : 0, catatan, lokasi }
    }),
  )
  return {
    mahasiswa,
    kelas: konteks.daftar?.kelas ?? mahasiswa.kelas ?? null,
    terdaftar: konteks.daftar === null ? null : Boolean(konteks.daftar),
    tema: tema?.nama ?? null,
    url: url ?? null,
    total: rincian.reduce((s, r) => s + r.skor, 0),
    rincian,
  }
}

export const formatTotal = (total) => `${total}/${NILAI_MAKS}`

function laporanMarkdown(hasil) {
  const baris = hasil.rincian.map(
    (r) => `| ${r.id} | ${r.uraian} | ${r.skor}/${r.bobot} | ${r.lulus ? 'lulus' : 'belum'} | ${r.catatan.replace(/\|/g, '/')} |`,
  )
  return [
    `## Hasil pemeriksaan Ujian Tengah Semester Pengembangan Aplikasi Web: ${formatTotal(hasil.total)}`,
    '',
    `Mahasiswa: ${hasil.mahasiswa.nama || '-'} (${hasil.mahasiswa.nim || '-'}), tema: ${hasil.tema ?? '-'}`,
    hasil.url ? `Deployment: ${hasil.url}` : '',
    '',
    '| Butir | Kriteria | Skor | Status | Catatan |',
    '|---|---|---|---|---|',
    ...baris,
    '',
    'Pemeriksaan integritas tidak dijalankan di sini; seluruhnya dilakukan saat penilaian dosen.',
    'Nilai akhir ditetapkan dosen dari commit terakhir sebelum tenggat kelasmu, memakai uji versi repo induk.',
  ].join('\n')
}

function cetakTerminal(hasil) {
  for (const r of hasil.rincian) {
    const tanda = r.lulus ? 'LULUS' : 'BELUM'
    console.log(`${r.id.padEnd(4)} ${tanda}  ${String(r.skor).padStart(2)}/${String(r.bobot).padEnd(2)} ${r.uraian}${r.catatan ? `\n                ${r.catatan}` : ''}`)
  }
  console.log(`\nTotal: ${formatTotal(hasil.total)}`)
}

// Commit yang dinilai = push terakhir sebelum tenggat menurut waktu server
// GitHub Actions (tidak bisa dipalsukan dari tanggal commit lokal).
const aman = (path, cadangan) => api(path).catch(() => cadangan)

async function commitSebelumTenggat(repo, branch, runs, tenggat) {
  const tepat = runs.filter((r) => new Date(r.created_at) <= tenggat).sort((a, b) => b.created_at.localeCompare(a.created_at))
  const terlambat = runs.some((r) => new Date(r.created_at) > tenggat)
  if (tepat.length) return { sha: tepat[0].head_sha, waktu: tepat[0].created_at, bukti: 'actions', terlambat }
  // Repo kosong menghasilkan 409; anggap belum ada commit.
  const commits = await aman(`/repos/${repo}/commits?sha=${branch}&until=${tenggat.toISOString()}&per_page=1`, [])
  if (!commits.length) return null
  return { sha: commits[0].sha, waktu: commits[0].commit.committer.date, bukti: 'tanggal commit', terlambat }
}

// Kelas (dan tenggatnya) diambil dari data kelas bila ada, bukan dari isian mahasiswa,
// supaya mahasiswa RA tidak bisa mengaku RB untuk mendapat waktu lebih.
// Keluaran hanya memuat entri data kelas untuk NIM ini, tidak pernah seluruh daftar.
async function targetPenilaian(repo, daftarKelas) {
  const info = await api(`/repos/${repo}`)
  const m = await bacaMahasiswaFork(repo, info.default_branch)
  const entri = daftarKelas ? (daftarKelas[m.nim] ?? false) : null
  const kelas = entri ? entri.kelas : UTS.kelas[m.kelas] ? m.kelas : null
  const jadwal = jadwalKelas(kelas)
  const tenggat = jadwal?.tenggat ?? TENGGAT_TERAKHIR
  const runs = (await aman(`/repos/${repo}/actions/runs?event=push&branch=${info.default_branch}&per_page=100`, {})).workflow_runs ?? []
  return {
    repo,
    pushTerakhir: info.pushed_at,
    forkDibuat: info.created_at,
    nim: m.nim ?? null,
    kelas,
    daftar: entri,
    dibuka: jadwal?.dibuka.toISOString() ?? null,
    tenggat: tenggat.toISOString(),
    pushSebelumDibuka: Boolean(jadwal && runs.some((r) => new Date(r.created_at) < jadwal.dibuka)),
    target: await commitSebelumTenggat(repo, info.default_branch, runs, tenggat),
  }
}

// Arsip bukti: seluruh riwayat fork sampai commit yang dinilai, dalam satu berkas git bundle,
// beserta SHA-256-nya. Dibuat sebelum kode mahasiswa dijalankan, jadi isinya tidak bisa
// diubah oleh skrip di repo mahasiswa, dan perubahan apa pun setelahnya mengubah sidik jarinya.
export function buatArsip(dir, repo, sha, tujuan) {
  // Absolut: git bundle dijalankan dari folder clone, jadi path relatif akan menulis ke sana.
  const folder = resolve(tujuan)
  mkdirSync(folder, { recursive: true })
  const berkas = `${repo.replace('/', '__')}.bundle`
  jalankan('git', ['branch', '-f', 'dinilai', sha], dir)
  const r = jalankan('git', ['bundle', 'create', join(folder, berkas), 'dinilai'], dir)
  if (!r.ok) return { galat: r.keluaran.trim().split('\n').at(-1) }
  const isi = readFileSync(join(folder, berkas))
  return { berkas, sha256: createHash('sha256').update(isi).digest('hex'), ukuran: isi.length }
}

// konteks (data kelas mahasiswa ini, waktu fork dan push) ikut disimpan untuk pemeriksaan
// integritas di job rekap.
async function periksaRepo(repo, outDir, targetFile, daftarKelas, sandi) {
  const { target, ...konteks } = targetFile ? JSON.parse(readFileSync(targetFile, 'utf8')) : await targetPenilaian(repo, daftarKelas)
  const dasar = { repo, pushTerakhir: konteks.pushTerakhir, tenggat: konteks.tenggat, konteks }
  let hasil
  if (!target) {
    hasil = { ...dasar, total: 0, rincian: [], mahasiswa: { nim: konteks.nim }, kelas: konteks.kelas, catatan: 'tidak ada commit sebelum tenggat' }
  } else {
    const dir = mkdtempSync(join(tmpdir(), 'uts-fork-'))
    jalankan('git', ['clone', '--quiet', `https://github.com/${repo}.git`, dir])
    jalankan('git', ['checkout', '--quiet', target.sha], dir)
    const arsip = outDir ? buatArsip(dir, repo, target.sha, join(outDir, 'arsip')) : undefined
    hasil = { ...dasar, ...target, arsip, ...(await periksa({ appDir: join(dir, 'app'), url: urlPages(repo), pasang: true, konteks })) }
    hapus(dir)
  }
  if (outDir) {
    mkdirSync(outDir, { recursive: true })
    const nama = join(outDir, `${repo.replace('/', '__')}.json`)
    const isi = JSON.stringify(hasil, null, 2)
    if (sandi) writeFileSync(`${nama}.enc`, kunci(Buffer.from(isi), readFileSync(sandi, 'utf8')))
    else writeFileSync(nama, isi)
  }
  return hasil
}

function urlDariGit(appDir) {
  if (process.env.GITHUB_REPOSITORY) return urlPages(process.env.GITHUB_REPOSITORY)
  const r = jalankan('git', ['remote', 'get-url', 'origin'], appDir)
  const m = r.keluaran.match(/github\.com[/:]([^/]+\/[^/.\s]+)/)
  return m ? urlPages(m[1]) : undefined
}

async function main() {
  if (arg('daftar')) {
    const forks = await daftarFork()
    console.log(JSON.stringify(forks.map((f) => f.full_name)))
    return
  }
  const opsi = (nama) => (typeof arg(nama) === 'string' ? arg(nama) : undefined)
  const daftarKelas = bacaDaftarKelas(opsi('daftar-kelas'))
  if (opsi('target')) {
    console.log(JSON.stringify(await targetPenilaian(opsi('target'), daftarKelas)))
    return
  }
  let hasil
  if (opsi('repo')) {
    hasil = await periksaRepo(opsi('repo'), opsi('out'), opsi('target-file'), daftarKelas, opsi('sandi'))
    // Log Actions repo induk bisa dibaca publik: hasil terenkripsi tidak dicetak.
    if (opsi('sandi')) return console.log(`Selesai: ${opsi('repo')}`)
  } else {
    const appDir = resolve(opsi('lokal') ?? 'app')
    const url = opsi('url') ?? urlDariGit(appDir)
    const nim = bacaJson(join(appDir, 'mahasiswa.json'))?.nim
    const konteks = { daftar: daftarKelas ? (daftarKelas[nim] ?? false) : null }
    console.log(`Memeriksa ${relative(process.cwd(), appDir) || '.'}${url ? `, deployment ${url}` : ''}\n`)
    hasil = await periksa({ appDir, url, konteks })
  }
  if (hasil.rincian?.length) cetakTerminal(hasil)
  if (process.env.GITHUB_STEP_SUMMARY && hasil.rincian?.length) appendFileSync(process.env.GITHUB_STEP_SUMMARY, laporanMarkdown(hasil))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}

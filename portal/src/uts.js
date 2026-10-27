import UTS from '../../shared/uts.json'

export default UTS

// Rumus yang sama dengan grader/lib.mjs: nilai maksimal = rubrik + bonus.
export const NILAI_RUBRIK = UTS.rubrik.flatMap((k) => k.butir).reduce((s, b) => s + b.bobot, 0)
export const NILAI_MAKS = NILAI_RUBRIK + (UTS.bonus?.bobot ?? 0)

export const URL_REPO = `https://github.com/${UTS.repoInduk}`

export const KELAS = Object.entries(UTS.kelas).map(([kode, j]) => ({
  kode,
  dibuka: new Date(j.dibuka),
  tenggat: new Date(j.tenggat),
}))

export function statusKelas(kelas, sekarang = Date.now()) {
  if (sekarang < kelas.dibuka.getTime()) return 'belum'
  if (sekarang <= kelas.tenggat.getTime()) return 'berjalan'
  return 'selesai'
}

export function temaUntukNim(nim) {
  const akhir = String(nim).trim().slice(-1)
  return /\d/.test(akhir) ? UTS.tema.find((t) => t.digit === Number(akhir)) : undefined
}

const formatWaktu = new Intl.DateTimeFormat('id-ID', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Asia/Jakarta',
})

export const tanggalWib = (d) => `${formatWaktu.format(d)} WIB`

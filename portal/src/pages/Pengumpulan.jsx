import { useEffect, useMemo, useState } from 'react'
import { Alert, Empty, Input, Segmented, Skeleton, Table, Tag } from 'antd'
import KepalaHalaman from '../components/KepalaHalaman.jsx'
import UTS, { temaUntukNim } from '../uts.js'

const formatWaktu = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })

const kolom = [
  { title: 'NIM', dataIndex: 'nim', width: 120, render: (v) => <span className="angka">{v || '-'}</span>, sorter: (a, b) => a.nim.localeCompare(b.nim), defaultSortOrder: 'ascend' },
  { title: 'Nama', dataIndex: 'nama', render: (v, r) => v || <span style={{ color: 'var(--sekunder)' }}>{r.repo.split('/')[0]}</span> },
  { title: 'Kelas', dataIndex: 'kelas', width: 80, responsive: ['sm'] },
  {
    title: 'Data kelas',
    dataIndex: 'terdaftar',
    width: 130,
    responsive: ['sm'],
    render: (v) => (v === null || v === undefined ? '-' : v ? <Tag variant="filled">Sesuai</Tag> : <Tag color="#B42318">Tidak sesuai</Tag>),
  },
  { title: 'Tema', dataIndex: 'tema', responsive: ['lg'] },
  {
    title: 'Situs',
    dataIndex: 'aktif',
    width: 110,
    render: (aktif, r) =>
      aktif ? (
        <a href={r.url} target="_blank" rel="noreferrer"><Tag color="#2F6B1C">Aktif</Tag></a>
      ) : aktif === false ? (
        <Tag>Belum</Tag>
      ) : (
        <Tag variant="filled">Belum dicek</Tag>
      ),
  },
  { title: 'Repo', dataIndex: 'repo', responsive: ['md'], render: (v) => <a href={`https://github.com/${v}`} target="_blank" rel="noreferrer">{v}</a> },
  { title: 'Push terakhir', dataIndex: 'pushTerakhir', width: 160, responsive: ['md'], render: (v) => <span className="angka">{v ? formatWaktu.format(new Date(v)) : '-'}</span> },
]

// pengumpulan.json hanya diperbarui saat workflow terjadwal berjalan. Daftar fork dibaca juga
// langsung dari API GitHub (tanpa token, dibatasi 60 permintaan per jam per IP); bila gagal,
// halaman tetap memakai pengumpulan.json.
async function forkTerkini() {
  const hasil = []
  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`https://api.github.com/repos/${UTS.repoInduk}/forks?per_page=100&page=${page}`)
    if (!res.ok) throw new Error(res.status)
    const batch = await res.json()
    hasil.push(...batch)
    if (batch.length < 100) break
  }
  return hasil
}

async function entriBaru(fork) {
  const mhs = await fetch(`https://raw.githubusercontent.com/${fork.full_name}/${fork.default_branch}/app/mahasiswa.json`, { cache: 'no-store' })
    .then((res) => (res.ok ? res.json() : {}))
    .catch(() => ({}))
  const [owner, nama] = fork.full_name.split('/')
  return {
    repo: fork.full_name,
    nama: mhs.nama || '',
    nim: mhs.nim || '',
    kelas: mhs.kelas || '',
    terdaftar: null,
    tema: temaUntukNim(mhs.nim ?? '')?.nama ?? '',
    url: `https://${owner.toLowerCase()}.github.io/${nama}/`,
    aktif: null,
    pushTerakhir: fork.pushed_at,
  }
}

async function gabungkan(simpanan, forks) {
  const lama = new Map(simpanan.data.map((d) => [d.repo, d]))
  const data = await Promise.all(
    forks.map((f) => (lama.has(f.full_name) ? { ...lama.get(f.full_name), pushTerakhir: f.pushed_at } : entriBaru(f))),
  )
  return { ...simpanan, data, langsung: new Date().toISOString() }
}

export default function Pengumpulan() {
  const [hasil, setHasil] = useState(null)
  const [error, setError] = useState(false)
  const [cari, setCari] = useState('')
  const [kelas, setKelas] = useState('Semua')

  useEffect(() => {
    let batal = false
    const simpanan = fetch(`${import.meta.env.BASE_URL}pengumpulan.json`, { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(res.status))))
      .catch(() => ({ diperbarui: null, data: [] }))
    Promise.all([simpanan, forkTerkini().catch(() => null)])
      .then(([s, forks]) => (forks ? gabungkan(s, forks) : s))
      .then((h) => {
        if (batal) return
        if (!h.diperbarui && !h.langsung) setError(true)
        else setHasil(h)
      })
    return () => {
      batal = true
    }
  }, [])

  const data = useMemo(() => {
    const q = cari.trim().toLowerCase()
    return (hasil?.data ?? []).filter(
      (d) => (kelas === 'Semua' || d.kelas === kelas) && (!q || [d.nama, d.nim, d.repo].some((v) => v.toLowerCase().includes(q))),
    )
  }, [hasil, cari, kelas])

  const daftarKelas = ['Semua', ...[...new Set((hasil?.data ?? []).map((d) => d.kelas).filter(Boolean))].sort()]
  const aktif = (hasil?.data ?? []).filter((d) => d.aktif).length

  return (
    <>
      <KepalaHalaman kicker="Pengumpulan" judul="Daftar fork dan deployment">
        Daftar fork dibaca langsung dari GitHub setiap halaman dibuka. Kolom Data kelas dan Situs diperiksa berkala oleh repo induk,
        jadi fork yang baru dibuat tampil dengan status &ldquo;Belum dicek&rdquo; sampai pemeriksaan berikutnya. Data kelas menunjukkan
        apakah NIM, nama, dan kelas di mahasiswa.json sesuai data kelas; bila tidak sesuai, perbaiki sebelum tenggat. Nilai tidak
        ditampilkan di sini.
      </KepalaHalaman>

      {error && <Alert type="error" title="Daftar pengumpulan gagal dimuat. Coba muat ulang halaman." />}
      {!hasil && !error && <Skeleton active />}

      {hasil && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 16 }}>
            <Input.Search allowClear placeholder="Cari nama, NIM, atau username" value={cari} onChange={(e) => setCari(e.target.value)} style={{ maxWidth: 320 }} />
            {daftarKelas.length > 2 && <Segmented options={daftarKelas} value={kelas} onChange={setKelas} />}
            <span style={{ color: 'var(--sekunder)', fontSize: 14 }} className="angka">
              {hasil.data.length} fork, {aktif} situs aktif
              {hasil.diperbarui && ` · status dicek ${formatWaktu.format(new Date(hasil.diperbarui))} WIB`}
            </span>
          </div>
          <Table
            rowKey="repo"
            size="middle"
            columns={kolom}
            dataSource={data}
            pagination={{ pageSize: 50, hideOnSinglePage: true }}
            locale={{ emptyText: <Empty description="Belum ada fork yang terdaftar" /> }}
          />
        </>
      )}
    </>
  )
}

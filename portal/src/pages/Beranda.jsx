import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, Button, Card, Input, Space, Statistic, Tag } from 'antd'
import { ArrowRightOutlined, GithubOutlined } from '@ant-design/icons'
import UTS, { KELAS, NILAI_MAKS, NILAI_RUBRIK, URL_REPO, statusKelas, tanggalWib, temaUntukNim } from '../uts.js'

const ALUR = [
  { judul: 'Fork', isi: 'Fork repo induk ke akun GitHub kamu, lalu aktifkan Actions dan Pages.' },
  { judul: 'Kerjakan', isi: 'Bangun aplikasi React sesuai tema di folder app/. Ikuti kontrak penilaian.' },
  { judul: 'Push', isi: 'Setiap push otomatis di-build dan di-deploy ke GitHub Pages milikmu.' },
  { judul: 'Cek nilai', isi: 'Workflow menampilkan perkiraan skor rubrik di tab Actions setiap kali push.' },
]

function CekTema() {
  const [nim, setNim] = useState('')
  const tema = temaUntukNim(nim)
  const valid = /^\d{9}$/.test(nim)

  return (
    <Card title="Cek tema kamu" variant="outlined">
      <p style={{ marginTop: 0, color: 'var(--sekunder)' }}>
        Tema ditentukan oleh digit terakhir NIM. Ketik NIM untuk melihat tema dan field data yang wajib ada.
      </p>
      <Input
        size="large"
        inputMode="numeric"
        maxLength={9}
        placeholder="Contoh: 999999995"
        value={nim}
        onChange={(e) => setNim(e.target.value.replace(/\D/g, ''))}
        aria-label="NIM"
      />
      {valid && tema && (
        <div style={{ marginTop: 20 }}>
          <Tag color="gold" variant="filled">Digit {tema.digit}</Tag>
          <h3 style={{ margin: '8px 0 0', fontSize: 20 }}>{tema.nama}</h3>
          <ul className="field-tema">
            <li><span>Judul {tema.entitas}</span><code>judul</code></li>
            <li><span>Kategori, misalnya {tema.contohKategori.join(', ')}</span><code>kategori</code></li>
            {tema.field.map((f) => (
              <li key={f.kunci}>
                <span>{f.label}{f.contoh && `, misalnya ${f.contoh}`}</span>
                <code>{f.kunci}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
      {nim.length === 9 && !valid && <Alert style={{ marginTop: 16 }} type="warning" title="NIM harus 9 digit angka." />}
    </Card>
  )
}

function WaktuKelas({ kelas }) {
  // Dipicu saat hitung mundur selesai agar status berpindah tanpa muat ulang halaman.
  const [, segarkan] = useState(0)
  const status = statusKelas(kelas)
  return (
    <div className="waktu-kelas">
      <div className="waktu-kepala">
        <strong>Kelas {kelas.kode}</strong>
        <Tag color={status === 'berjalan' ? '#B42318' : undefined} variant={status === 'berjalan' ? 'solid' : 'filled'}>
          {{ belum: 'Belum dibuka', berjalan: 'Berlangsung', selesai: 'Ditutup' }[status]}
        </Tag>
      </div>
      {status !== 'selesai' && (
        <Statistic.Timer
          type="countdown"
          title={status === 'belum' ? 'Dibuka dalam' : 'Sisa waktu'}
          value={(status === 'belum' ? kelas.dibuka : kelas.tenggat).getTime()}
          format="D [hari] HH:mm:ss"
          onFinish={() => segarkan((n) => n + 1)}
        />
      )}
      <dl>
        <dt>Dibuka</dt>
        <dd>{tanggalWib(kelas.dibuka)}</dd>
        <dt>Tenggat</dt>
        <dd className="tenggat">{tanggalWib(kelas.tenggat)}</dd>
      </dl>
    </div>
  )
}

export default function Beranda() {
  return (
    <>
      <section className="pahlawan">
        <div>
          <span className="kicker">{UTS.judul} · {UTS.semester}</span>
          <h1>Bangun dan deploy aplikasi React dalam tiga hari.</h1>
          <p className="lead">
            Ujian tengah semester {UTS.mataKuliah} dikerjakan sebagai proyek: fork repo induk, bangun aplikasi katalog sesuai tema NIM kamu
            dengan materi P1 sampai P7, lalu deploy ke GitHub Pages. Penilaian berjalan otomatis berdasarkan rubrik.
          </p>
          <Space wrap size="middle">
            <Link to="/soal">
              <Button type="primary" size="large" icon={<ArrowRightOutlined />} iconPlacement="end">
                Baca soal
              </Button>
            </Link>
            <Link to="/panduan">
              <Button size="large">Panduan fork dan deploy</Button>
            </Link>
          </Space>
          <p className="tautan-repo">
            <GithubOutlined /> Repo induk: <a href={URL_REPO}>{URL_REPO.replace('https://', '')}</a>
          </p>
        </div>

        <Card className="kartu-tenggat" variant="outlined">
          {KELAS.map((k) => (
            <WaktuKelas key={k.kode} kelas={k} />
          ))}
          <p className="catatan-kelas">
            Kelas ditentukan dari data kelas SIAKAD, bukan dari isian <code>mahasiswa.json</code>.
          </p>
        </Card>
      </section>

      <ol className="alur">
        {ALUR.map((a) => (
          <li key={a.judul}>
            <strong>{a.judul}</strong>
            <span>{a.isi}</span>
          </li>
        ))}
      </ol>

      <div className="dua-kolom">
        <CekTema />
        <Card title="Yang perlu diketahui" variant="outlined">
          <ul style={{ margin: 0, paddingLeft: 20, lineHeight: 1.75 }}>
            <li>Ujian individu, waktu tiga hari mengikuti jadwal kelasmu. Yang dinilai adalah push terakhir sebelum tenggat kelasmu, dicatat oleh server GitHub.</li>
            <li>Hanya mahasiswa yang terdaftar di kelas RA dan RB yang dinilai. NIM dan nama harus sesuai data kelas.</li>
            <li>
              <strong>Dilarang memakai AI generatif</strong> untuk menulis kode. Baca <Link to="/ketentuan">ketentuan dan pelanggaran</Link>.
            </li>
            <li>Setiap kode yang diminta punya contoh di halaman <Link to="/contoh">Contoh Kode</Link>.</li>
            <li>Rubrik bernilai {NILAI_RUBRIK} ditambah bonus {UTS.bonus?.bobot ?? 0}, nilai maksimal {NILAI_MAKS}, dan diperiksa otomatis. Lihat <Link to="/rubrik">rincian rubrik</Link>.</li>
            <li>Kamu wajib memahami setiap baris kode yang dikumpulkan. Dosen dapat meminta demo atau penjelasan lisan.</li>
            <li>Materi pendukung tersedia di halaman <Link to="/materi">Materi</Link>.</li>
          </ul>
        </Card>
      </div>
    </>
  )
}

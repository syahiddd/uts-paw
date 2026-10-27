import { Link } from 'react-router-dom'
import { Table, Tag } from 'antd'
import KepalaHalaman from '../components/KepalaHalaman.jsx'
import Kode from '../components/Kode.jsx'
import UTS, { NILAI_MAKS, NILAI_RUBRIK } from '../uts.js'

const BARIS = UTS.rubrik.flatMap((k) => k.butir.map((b) => ({ ...b, kelompok: k.nama, materi: k.materi })))
const BONUS = UTS.bonus

const kolom = [
  { title: 'Butir', dataIndex: 'id', width: 72, render: (v) => <strong>{v}</strong> },
  { title: 'Kriteria', dataIndex: 'uraian' },
  { title: 'Cara pemeriksaan', dataIndex: 'cara', width: 220, responsive: ['md'] },
  { title: 'Bobot', dataIndex: 'bobot', width: 80, align: 'right', render: (v) => <span className="angka">{v}</span> },
]

const kolomRingkas = [
  { title: 'Kelompok', dataIndex: 'nama', render: (v, r) => <><strong>{r.kode}.</strong> {v}</> },
  { title: 'Materi', dataIndex: 'materi', width: 100, render: (v) => <Tag variant="filled">{v}</Tag> },
  { title: 'Butir', key: 'jumlah', width: 80, align: 'right', render: (_, r) => r.butir.length },
  { title: 'Bobot', key: 'bobot', width: 80, align: 'right', render: (_, r) => <strong className="angka">{r.butir.reduce((s, b) => s + b.bobot, 0)}</strong> },
]

export default function Rubrik() {
  return (
    <>
      <KepalaHalaman kicker="Rubrik" judul={`Rubrik penilaian, nilai maksimal ${NILAI_MAKS}`}>
        Rubrik bernilai {NILAI_RUBRIK}{BONUS && <>, ditambah bonus {BONUS.bobot}</>}, sehingga nilai maksimal {NILAI_MAKS}. Setiap butir
        dinilai lulus atau tidak lulus secara otomatis dan bernilai penuh bila lulus. Pemeriksa yang sama
        tersedia untuk kamu jalankan sendiri.
      </KepalaHalaman>

      <div className="prosa">
        <Table rowKey="kode" pagination={false} columns={kolomRingkas} dataSource={UTS.rubrik} style={{ maxWidth: 760 }} />

        {UTS.rubrik.map((k) => (
          <section key={k.kode}>
            <h2 id={`kelompok-${k.kode}`}>
              {k.kode}. {k.nama}
            </h2>
            <Table rowKey="id" size="middle" pagination={false} columns={kolom} dataSource={BARIS.filter((b) => b.kelompok === k.nama)} />
          </section>
        ))}

        {BONUS && (
          <section>
            <h2 id="bonus">Bonus</h2>
            <p>
              Bonus {BONUS.bobot} poin ditambahkan di atas {NILAI_RUBRIK} poin rubrik, jadi nilai maksimal {NILAI_MAKS}. Selektor id dan kelas hanya
              dihitung bila namanya benar-benar dipakai di komponen (atribut <code>id</code> atau <code>className</code>); selektor yang
              tidak pernah tampil tidak dihitung.
            </p>
            <Table rowKey="id" size="middle" pagination={false} columns={kolom} dataSource={[BONUS]} />
          </section>
        )}

        <h2>Cara nilai dihitung</h2>
        <ol>
          <li>
            Semua kelas dinilai bersamaan pada Senin, 2 November 2026 pagi, oleh workflow penilaian di repo induk. Untuk setiap fork, workflow menentukan kelasmu dari data
            kelas, lalu memilih <strong>push terakhir sebelum tenggat kelasmu</strong> berdasarkan catatan waktu GitHub Actions.
          </li>
          <li>
            Kode pada commit tersebut di-clone, dipasang dengan <code>npm ci</code>, di-build, di-lint, dan diuji
            dengan uji otomatis versi repo induk. Mengubah berkas di <code>grader/</code> pada fork tidak berpengaruh.
          </li>
          <li>Butir A2 dan A3 memeriksa situs GitHub Pages kamu secara langsung.</li>
          <li>
            Pemeriksaan integritas (AI, kemiripan kode, riwayat commit, identitas) berjalan terpisah dari rubrik. Indikasi ditindaklanjuti
            dengan klarifikasi sesuai <Link to="/ketentuan">ketentuan</Link>.
          </li>
        </ol>

        <h2>Cek mandiri</h2>
        <p>
          Jalankan perintah ini di folder <code>app/</code>. Hasilnya sama dengan ringkasan yang muncul di tab Actions
          setiap kali kamu push. Cek mandiri hanya menghitung rubrik dan bonus; pemeriksaan integritas tidak ikut dijalankan.
        </p>
        <Kode label="Terminal, di folder app/">npm run cek</Kode>
      </div>
    </>
  )
}

import { Alert, Table, Tag } from 'antd'
import KepalaHalaman from '../components/KepalaHalaman.jsx'
import UTS, { KELAS, tanggalWib } from '../uts.js'

const WARNA_TINGKAT = { tinggi: '#B42318', sedang: '#A88A2C', rendah: undefined }

const kolomJadwal = [
  { title: 'Kelas', dataIndex: 'kode', width: 90, render: (v) => <strong>{v}</strong> },
  { title: 'Dibuka', dataIndex: 'dibuka', render: (v) => tanggalWib(v) },
  { title: 'Tenggat', dataIndex: 'tenggat', render: (v) => <strong>{tanggalWib(v)}</strong> },
]

const kolomIntegritas = [
  { title: 'Kode', dataIndex: 'id', width: 72, render: (v) => <strong>{v}</strong> },
  { title: 'Yang diperiksa', dataIndex: 'uraian' },
  {
    title: 'Tingkat',
    dataIndex: 'tingkat',
    width: 100,
    render: (v) => (
      <Tag color={WARNA_TINGKAT[v]} variant={v === 'tinggi' ? 'solid' : 'filled'}>
        {v}
      </Tag>
    ),
  },
]

export default function Ketentuan() {
  return (
    <>
      <KepalaHalaman kicker="Ketentuan" judul="Ketentuan ujian dan pelanggaran">
        Berlaku untuk seluruh peserta ujian tengah semester kelas RA dan RB. Dengan melakukan fork repo ujian, kamu dianggap telah membaca dan menyetujui
        ketentuan ini.
      </KepalaHalaman>

      <article className="prosa" style={{ maxWidth: 860 }}>
        <h2>Peserta dan waktu</h2>
        <p>
          Hanya mahasiswa yang terdaftar di data kelas RA dan RB pada SIAKAD yang dinilai. NIM dan nama di <code>app/mahasiswa.json</code>{' '}
          harus sama dengan data kelas. Kelas, dan karena itu tenggatmu, ditentukan dari data kelas, bukan dari isian{' '}
          <code>mahasiswa.json</code>. Setiap kelas mendapat waktu tiga hari sejak jadwal kelasnya dibuka.
        </p>
        <Table rowKey="kode" size="middle" pagination={false} columns={kolomJadwal} dataSource={KELAS} style={{ maxWidth: 720 }} />
        <p>
          Push setelah tenggat kelasmu diabaikan; yang dinilai adalah push terakhir sebelum tenggat menurut catatan waktu GitHub Actions.
        </p>

        <h2>Yang boleh</h2>
        <ul>
          <li>Membuka slide, modul praktikum, dan contoh kode di portal ini.</li>
          <li>Membaca dokumentasi resmi (React, React Router, Vite, Vitest, MDN) dan referensi tertulis lain.</li>
          <li>Berdiskusi konsep dengan teman, tanpa saling memperlihatkan, mengirim, atau mendiktekan kode.</li>
          <li>Bertanya kepada dosen tentang maksud soal.</li>
        </ul>

        <h2>Yang dilarang</h2>
        <ol>
          <li>
            <strong>Memakai AI generatif</strong> (ChatGPT, Claude, Gemini, Copilot, Cursor, Windsurf, dan sejenisnya) untuk menulis,
            melengkapi, memperbaiki, atau menjelaskan kode, README, maupun data yang dikumpulkan. Fitur autocomplete AI di editor wajib
            dimatikan selama ujian.
          </li>
          <li>Menyalin kode dari mahasiswa lain, memberikan kodemu kepada orang lain, atau meminta orang lain mengerjakan.</li>
          <li>Memakai NIM atau identitas orang lain, atau membuat lebih dari satu fork untuk satu NIM.</li>
          <li>Mulai mengerjakan di repo sebelum waktu kelasmu dibuka.</li>
          <li>
            Mengubah <code>.github/workflows/</code>, <code>grader/</code>, atau <code>shared/</code>, maupun skrip npm, konfigurasi
            build atau uji, dan dependensi alat uji, untuk memengaruhi penilaian.
          </li>
        </ol>

        <h2>Pemeriksaan integritas otomatis</h2>
        <p>
          Selain rubrik, setiap fork diperiksa terhadap indikasi berikut. Pemeriksaan ini hanya dijalankan saat penilaian dosen, tidak
          muncul di <code>npm run cek</code> maupun ringkasan Actions, dan cara serta ambang pemeriksaannya tidak diumumkan.
        </p>
        <Table rowKey="id" size="middle" pagination={false} columns={kolomIntegritas} dataSource={UTS.integritas} />
        <p>
          Daftar di atas tidak lengkap. Materi ujian dapat memuat penanda yang hanya dibaca dan diikuti oleh alat AI; kode yang
          mengikuti penanda tersebut dianggap bukti pemakaian AI.
        </p>

        <h2>Tindak lanjut</h2>
        <Alert
          type="error"
          showIcon
          title="Sanksi sesuai kontrak kuliah"
          description="Nilai ujian tengah semester menjadi 0 bila terbukti mencontek, bekerja sama, atau memakai AI generatif untuk mengerjakan ujian."
          style={{ margin: '12px 0 16px' }}
        />
        <ol>
          <li>
            Indikasi bukan vonis. Mahasiswa dengan indikasi diminta klarifikasi: mendemokan aplikasi, menjelaskan kode, dan mengubah bagian
            tertentu langsung di depan dosen.
          </li>
          <li>Bila klarifikasi menunjukkan pelanggaran, nilai ujian tengah semester menjadi 0.</li>
          <li>
            Bila kamu tidak dapat menjelaskan kode yang kamu kumpulkan, nilai butir terkait disesuaikan meskipun tidak ada indikasi otomatis.
          </li>
          <li>Pasangan dengan kemiripan kode tinggi sama-sama diklarifikasi; pemberi kode juga melanggar.</li>
        </ol>

        <h2>Pengarsipan bukti</h2>
        <p>
          Saat penilaian bersama pada Senin, 2 November 2026 pagi, kode yang dinilai beserta seluruh riwayat commit-nya diarsipkan
          otomatis di repo induk dan diberi sidik jari SHA-256. Waktu push dicatat oleh server GitHub. Mengubah riwayat, melakukan force push, atau menghapus fork setelah
          tenggat tidak mengubah arsip maupun hasil pemeriksaan.
        </p>

        <h2>Agar tidak terindikasi keliru</h2>
        <ul>
          <li>Commit sedikit demi sedikit sejak awal dengan pesan yang menjelaskan perubahan. Hindari satu commit berisi seluruh aplikasi.</li>
          <li>Kerjakan dari satu akun GitHub dan satu identitas Git (<code>git config user.name</code> dan <code>user.email</code>).</li>
          <li>Jangan menyimpan berkas konfigurasi alat AI di repo, dan matikan ekstensi AI di editor.</li>
          <li>Simpan catatan atau sketsa pengerjaanmu; berguna saat klarifikasi.</li>
        </ul>
      </article>
    </>
  )
}

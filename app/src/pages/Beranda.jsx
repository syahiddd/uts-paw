import mahasiswa from '../../mahasiswa.json'

export default function Beranda() {
  return (
    <section>
      <h1>Daftar Tugas</h1>
      <p>Tema: {mahasiswa.tema}</p>
    </section>
  )
}
import { useState } from 'react'
import useKoleksi from '../hooks/useKoleksi.js'
import KotakPencarian from '../components/KotakPencarian.jsx'
import KartuItem from '../components/KartuItem.jsx'

export default function Koleksi() {
  const { items, loading, error } = useKoleksi()
  const [cari, setCari] = useState('')

  if (loading) return <p>Memuat data...</p>
  if (error) return <p role="alert">Gagal memuat: {error}</p>

  const tampil = items.filter((item) => item.judul.toLowerCase().includes(cari.toLowerCase()))

  return (
    <section>
      <h1>Koleksi</h1>
      <div className="alat-koleksi">
        <KotakPencarian nilai={cari} onUbah={setCari} />
      </div>
      {tampil.length === 0 ? (
        <p>Tidak ada item yang cocok.</p>
      ) : (
        <div className="daftar-kartu">
          {tampil.map((item) => (
            <KartuItem key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}
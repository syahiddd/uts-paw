import useKoleksi from '../hooks/useKoleksi.js'
import KartuItem from '../components/KartuItem.jsx'

export default function Koleksi() {
  const { items, loading, error } = useKoleksi()

  if (loading) return <p>Memuat data...</p>
  if (error) return <p role="alert">Gagal memuat: {error}</p>

  return (
    <section>
      <h1>Koleksi</h1>
      <div className="daftar-kartu">
        {items.map((item) => (
          <KartuItem key={item.id} item={item} />
        ))}
      </div>
    </section>
  )
}
import useKoleksi from '../hooks/useKoleksi.js'

export default function Koleksi() {
  const { items, loading, error } = useKoleksi()

  if (loading) return <p>Memuat data...</p>
  if (error) return <p role="alert">Gagal memuat: {error}</p>

  return (
    <section>
      <h1>Koleksi</h1>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.judul}</li>
        ))}
      </ul>
    </section>
  )
}
import { render, screen, fireEvent  } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { expect, test, vi } from 'vitest'
import App from './App.jsx'
import data from '../public/data/koleksi.json'

vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => data }))

function buka(rute) {
  render(
    <MemoryRouter initialEntries={[rute]}>
      <App />
    </MemoryRouter>,
  )
}

test('halaman tentang menampilkan NIM', () => {
  buka('/tentang')
  expect(screen.getByText('124140174')).toBeInTheDocument()
})

test('detail dengan id salah menampilkan tidak ditemukan', async () => {
  buka('/koleksi/999')
  expect(await screen.findByText(/tidak ditemukan/i)).toBeInTheDocument()
})

test('form tambah menolak judul kosong', () => {
  buka('/tambah')
  fireEvent.click(screen.getByText('Simpan'))
  expect(screen.getByRole('alert')).toBeInTheDocument()
})

test('rute tidak dikenal menampilkan 404', () => {
  buka('/tidak-ada')
  expect(screen.getByText('404')).toBeInTheDocument()
})

test('halaman koleksi menampilkan buku', async () => {
  buka('/koleksi')
  expect(await screen.findByText('Forrest Gump')).toBeInTheDocument()
})

import {usestate, useEffect} from "react";
import useKoleksi from "../hooks/useKoleksi.js";

export default function Koleksi() {
    const { items, loading, error, tambah, hapus } = useKoleksi();


    if (loading) return <p>Memuat data...</p>;
    if (error) return <p>Terjadi kesalahan: {error}</p>;  
};
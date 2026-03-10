"use client";
import { useRef, useEffect, useState } from "react";
import { generarComprobanteHTML, formatearFecha, generarHoraFin } from "../utils/generarTurnos";
import { supabase } from "../lib/supabase";

export default function ComprobanteTurno({ turno, proveedor, productos, archivos, indicaciones }) {
  const [recomendaciones, setRecomendaciones] = useState("");

  useEffect(() => {
    async function cargar() {
      const { data } = await supabase
        .from("configuracion")
        .select("valor")
        .eq("clave", "recomendaciones")
        .single();
      if (data?.valor) setRecomendaciones(data.valor);
    }
    cargar();
  }, []);

  function reimprimir() {
    const html = generarComprobanteHTML(turno, proveedor, productos, indicaciones, recomendaciones);
    const printWindow = window.open("", "_blank");
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }

  return (
    <div className="comprobante-box">
      <div className="comprobante-header">
        <h3>Comprobante del Turno</h3>
        <span className="estado-badge">#{turno.id?.slice(0, 8).toUpperCase()}</span>
      </div>

      <div className="comprobante-detalles">
        <div className="detalle-row">
          <span className="detalle-label">Empresa:</span>
          <span className="detalle-value">{proveedor?.empresa || "No registrada"}</span>
        </div>
        <div className="detalle-row">
          <span className="detalle-label">Fecha:</span>
          <span className="detalle-value">{formatearFecha(turno.fecha)}</span>
        </div>
        <div className="detalle-row">
          <span className="detalle-label">Hora:</span>
          <span className="detalle-value">{turno.hora_inicio} – {turno.hora_fin || generarHoraFin(turno.hora_inicio)}</span>
        </div>
        <div className="detalle-row">
          <span className="detalle-label">Andén:</span>
          <span className="detalle-value">{turno.anden}</span>
        </div>
        <div className="detalle-row">
          <span className="detalle-label">Estado:</span>
          <span className="detalle-value" style={{ textTransform: "capitalize" }}>{turno.estado}</span>
        </div>
      </div>

      {indicaciones && (
        <div className="comprobante-indicaciones">
          <h4>Indicaciones del turno:</h4>
          <p>{indicaciones}</p>
        </div>
      )}

      {recomendaciones && (
        <div className="comprobante-indicaciones" style={{ background: "#fef3c7", borderTop: "1px solid #fde68a" }}>
          <h4 style={{ color: "#92400e" }}>Recomendaciones generales:</h4>
          <p>{recomendaciones}</p>
        </div>
      )}

      {productos && productos.length > 0 && (
        <div className="comprobante-productos">
          <h4>Productos ({productos.length})</h4>
          <ul>
            {productos.slice(0, 5).map((p, i) => (
              <li key={i}>
                <strong>{p.codigo || "Sin código"}</strong> – {p.descripcion}
                {" "}(Cant: {p.cantidad}, Pallet: {p.numero_pallet || "–"}, Cajas: {p.numero_cajas || "–"})
                {p.comentario && ` · ${p.comentario}`}
              </li>
            ))}
            {productos.length > 5 && <li>…y {productos.length - 5} más</li>}
          </ul>
        </div>
      )}

      {archivos && archivos.length > 0 && (
        <div className="comprobante-archivos">
          <h4>Archivos adjuntos: {archivos.length}</h4>
        </div>
      )}

      <div className="comprobante-acciones">
        <button onClick={reimprimir} className="btn btn-primary">
          Imprimir Comprobante
        </button>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { generarComprobanteHTML, formatearFecha, generarHoraFin } from "../utils/generarTurnos";
import { supabase } from "../lib/supabase";

function parsearIndicaciones(texto) {
  const result = { pallets: "", cajas: "" };
  if (!texto) return result;
  
  const matchPallet = texto.match(/(\d+)\s*pall?et/i);
  const matchCajas = texto.match(/(\d+)\s*cajas?/i);
  
  if (matchPallet) result.pallets = matchPallet[1];
  if (matchCajas) result.cajas = matchCajas[1];
  
  return result;
}

export default function ComprobanteTurno({ turno, proveedor, productos, archivos, indicaciones: indicacionesProp, email }) {
  const [recomendaciones, setRecomendaciones] = useState("");
  const [pallets, setPallets] = useState("");
  const [cajas, setCajas] = useState("");
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const parsed = parsearIndicaciones(indicacionesProp || "");
    setPallets(parsed.pallets);
    setCajas(parsed.cajas);
  }, [indicacionesProp]);

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

  const esTurnoPasado = () => {
    const ahora = new Date();
    const fechaTurno = new Date(`${turno.fecha}T${turno.hora_inicio}:00`);
    return fechaTurno < ahora;
  };

  async function guardarIndicaciones() {
    setGuardando(true);
    try {
      let texto = "";
      if (pallets) texto += `${pallets} Pallets`;
      if (pallets && cajas) texto += ", ";
      if (cajas) texto += `${cajas} Cajas`;
      
      await supabase.from("turnos").update({
        indicaciones: texto || null,
        updated_at: new Date().toISOString()
      }).eq("id", turno.id);
      setEditando(false);
    } catch (error) {
      alert("Error al guardar: " + error.message);
    }
    setGuardando(false);
  }

  function reimprimir() {
    if (esTurnoPasado()) {
      alert("No puedes imprimir un turno que ya pasó.");
      return;
    }
    let textoIndicaciones = "";
    if (pallets) textoIndicaciones += `${pallets} Pallets`;
    if (pallets && cajas) textoIndicaciones += ", ";
    if (cajas) textoIndicaciones += `${cajas} Cajas`;
    
    const html = generarComprobanteHTML(turno, proveedor, productos, textoIndicaciones, recomendaciones, email);
    const printWindow = window.open("", "_blank");
    printWindow.document.write(html);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  }

  const mostrarIndicaciones = () => {
    let texto = "";
    if (pallets) texto += `${pallets} Pallets`;
    if (pallets && cajas) texto += ", ";
    if (cajas) texto += `${cajas} Cajas`;
    return texto;
  };

  return (
    <div className="comprobante-box">
      <div className="comprobante-header">
        <h3>Turno</h3>
        <span className="estado-badge">#{turno.id?.slice(0, 8).toUpperCase()}</span>
      </div>

      <div className="comprobante-detalles">
        <div className="detalle-row">
          <span className="detalle-label">Empresa:</span>
          <span className="detalle-value">{proveedor?.empresa || "No registrada"}</span>
        </div>
        {email && (
          <div className="detalle-row">
            <span className="detalle-label">Correo:</span>
            <span className="detalle-value">{email}</span>
          </div>
        )}
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


      {archivos && archivos.length > 0 && (
        <div className="comprobante-archivos">
          <h4>Archivos adjuntos: {archivos.length}</h4>
        </div>
      )}

      <div className="comprobante-acciones">
        <button onClick={reimprimir} className="btn btn-primary">
          Imprimir Turno
        </button>
      </div>

      {recomendaciones && (
        <div className="comprobante-indicaciones" style={{ background: "#fef3c7", borderTop: "1px solid #fde68a", marginTop: "1rem" }}>
          <h4>Recomendaciones generales:</h4>
          <p>{recomendaciones}</p>
        </div>
      )}
    </div>
  );
}
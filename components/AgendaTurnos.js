"use client";
import { useState, useEffect } from "react";
import { generarTurnos, obtenerFechaMinima, puedeReservar, formatearFecha, generarHoraFin } from "../utils/generarTurnos";
import { supabase } from "../lib/supabase";
import FormularioProductos from "./FormularioProductos";
import ArchivosTurno from "./ArchivosTurno";
import ComprobanteTurno from "./ComprobanteTurno";

function esBloqueAlmuerzo(hora) {
  return hora >= "13:00" && hora < "13:35";
}

const TIPO_CARGA = {
  PRODUCTOS: "productos",
  PALLET: "pallet"
};

export default function AgendaTurnos({ session, proveedor }) {
  const [fecha, setFecha] = useState("");
  const [ocupados, setOcupados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: "", texto: "" });
  const [turnoCreado, setTurnoCreado] = useState(null);
  const [productos, setProductos] = useState([]);
  const [archivos, setArchivos] = useState([]);
  const [reservando, setReservando] = useState(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [horaSeleccionada, setHoraSeleccionada] = useState(null);

  const [tipoCarga, setTipoCarga] = useState(TIPO_CARGA.PRODUCTOS);
  const [productosForm, setProductosForm] = useState([
    { codigo: "", descripcion: "", cantidad: 1 }
  ]);
  const [productosDB, setProductosDB] = useState([]);
  const [numeroPallet, setNumeroPallet] = useState("");
  const [numeroCajas, setNumeroCajas] = useState("");

  async function cargarTurnos() {
    setLoading(true);
    const { data, error } = await supabase
      .from("turnos")
      .select("hora_inicio, fecha, estado")
      .eq("fecha", fecha)
      .neq("estado", "cancelado");
    if (!error) setOcupados(data || []);
    setLoading(false);
  }

  async function cargarProductosYArchivos() {
    if (!turnoCreado?.id) return;
    const [prodRes, archRes] = await Promise.all([
      supabase.from("turno_productos").select("*").eq("turno_id", turnoCreado.id),
      supabase.from("turno_archivos").select("*").eq("turno_id", turnoCreado.id)
    ]);
    setProductos(prodRes.data || []);
    setArchivos(archRes.data || []);
  }

  async function cargarProductosDB() {
    const { data } = await supabase
      .from("productos")
      .select("*")
      .eq("activo", true)
      .order("descripcion");
    setProductosDB(data || []);
  }

  useEffect(() => {
    setFecha(obtenerFechaMinima());
    cargarProductosDB();
  }, []);

  useEffect(() => {
    if (fecha) cargarTurnos();
  }, [fecha]);

  useEffect(() => {
    if (turnoCreado) cargarProductosYArchivos();
  }, [turnoCreado?.id]);

  function estaOcupado(hora) {
    return ocupados.some(t => {
      const horaOcupada = t.hora_inicio ? t.hora_inicio.slice(0, 5) : "";
      return horaOcupada === hora && t.estado !== "cancelado";
    });
  }

  function noDisponiblePorTiempo(hora) {
    return !puedeReservar(fecha, hora).puede;
  }

  function validarCarga() {
    if (tipoCarga === TIPO_CARGA.PRODUCTOS) {
      const validos = productosForm.filter(p => p.descripcion.trim() && p.cantidad > 0);
      if (validos.length === 0) {
        return { valido: false, error: "Debes agregar al menos un producto con descripción y cantidad." };
      }
    } else {
      if (!numeroPallet.trim() && !numeroCajas.trim()) {
        return { valido: false, error: "Debes ingresar el número de Pallet o el número de Cajas." };
      }
    }
    return { valido: true };
  }

  function solicitarConfirmacion(hora) {
    const validacion = puedeReservar(fecha, hora);
    if (!validacion.puede) {
      setMensaje({ tipo: "error", texto: validacion.mensaje });
      setTimeout(() => setMensaje({ tipo: "", texto: "" }), 5000);
      return;
    }
    if (estaOcupado(hora)) {
      setMensaje({ tipo: "error", texto: "Este turno ya está reservado." });
      setTimeout(() => setMensaje({ tipo: "", texto: "" }), 4000);
      return;
    }
    if (!proveedor?.id) {
      setMensaje({ tipo: "error", texto: "Registra los datos de tu empresa primero." });
      setTimeout(() => setMensaje({ tipo: "", texto: "" }), 4000);
      return;
    }
    const validCarga = validarCarga();
    if (!validCarga.valido) {
      setMensaje({ tipo: "error", texto: validCarga.error });
      setTimeout(() => setMensaje({ tipo: "", texto: "" }), 5000);
      return;
    }
    setHoraSeleccionada(hora);
    setMostrarConfirmacion(true);
  }

  async function confirmarReserva() {
    const hora = horaSeleccionada;
    setMostrarConfirmacion(false);
    setReservando(hora);

    const { data: nuevoTurno, error } = await supabase
      .from("turnos")
      .insert({
        fecha,
        hora_inicio: hora,
        hora_fin: generarHoraFin(hora),
        proveedor_id: proveedor.id,
        usuario_id: session?.user?.id,
        anden: 1,
        estado: "pendiente",
        indicaciones: tipoCarga === TIPO_CARGA.PALLET
          ? `Pallet: ${numeroPallet || "–"} | Cajas: ${numeroCajas || "–"}`
          : null
      })
      .select()
      .single();

    if (error) {
      console.error("Error al insertar turno:", error);
      setMensaje({ tipo: "error", texto: `Error al reservar: ${error.message}` });
      setReservando(null);
      setHoraSeleccionada(null);
      setTimeout(() => setMensaje({ tipo: "", texto: "" }), 8000);
      return;
    }

    if (tipoCarga === TIPO_CARGA.PRODUCTOS) {
      const productosAInsertar = productosForm
        .filter(p => p.descripcion.trim())
        .map(p => ({
          turno_id: nuevoTurno.id,
          codigo: p.codigo || null,
          descripcion: p.descripcion,
          cantidad: parseInt(p.cantidad) || 1
        }));
      if (productosAInsertar.length > 0) {
        await supabase.from("turno_productos").insert(productosAInsertar);
      }
    }

    setMensaje({ tipo: "exito", texto: "¡Turno reservado exitosamente!" });
    setTurnoCreado(nuevoTurno);
    cargarTurnos();
    enviarCorreoAutomatico(nuevoTurno, proveedor);

    setReservando(null);
    setHoraSeleccionada(null);
    setTimeout(() => setMensaje({ tipo: "", texto: "" }), 6000);
  }

  async function enviarCorreoAutomatico(turno, prov) {
    try {
      await supabase.functions.invoke("enviar-correo", {
        body: {
          to: prov.email,
          empresa: prov.empresa,
          fecha: formatearFecha(turno.fecha),
          hora_inicio: turno.hora_inicio,
          hora_fin: turno.hora_fin,
          anden: turno.anden
        }
      });
    } catch (_) {}
  }

  function agregarFilaProducto() {
    setProductosForm([...productosForm, { codigo: "", descripcion: "", cantidad: 1 }]);
  }

  function actualizarFilaProducto(idx, campo, valor) {
    const copia = [...productosForm];
    if (campo === "select") {
      const prod = productosDB.find(p => p.id === valor);
      if (prod) {
        copia[idx] = { ...copia[idx], codigo: prod.codigo, descripcion: prod.descripcion };
      }
    } else {
      copia[idx] = { ...copia[idx], [campo]: valor };
    }
    setProductosForm(copia);
  }

  function eliminarFilaProducto(idx) {
    if (productosForm.length === 1) return;
    setProductosForm(productosForm.filter((_, i) => i !== idx));
  }

  const todosLosTurnos = generarTurnos();
  const turnosVisibles = todosLosTurnos.filter(h => !esBloqueAlmuerzo(h));
  const fechaMinima = obtenerFechaMinima();

  if (turnoCreado) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">¡Turno Confirmado!</h2>
          <p className="card-description">Tu turno fue reservado exitosamente.</p>
        </div>
        <ComprobanteTurno
          turno={turnoCreado}
          proveedor={proveedor}
          productos={productos}
          archivos={archivos}
          indicaciones={turnoCreado.indicaciones || ""}
        />
        <FormularioProductos
          turnoId={turnoCreado.id}
          productos={productos}
          onActualizado={setProductos}
        />
        <ArchivosTurno
          turnoId={turnoCreado.id}
          archivos={archivos}
          onActualizado={setArchivos}
        />
        <button
          onClick={() => {
            setTurnoCreado(null);
            setProductosForm([{ codigo: "", descripcion: "", cantidad: 1 }]);
            setNumeroPallet(""); setNumeroCajas("");
          }}
          className="btn btn-secondary"
          style={{ marginTop: "1rem" }}
        >
          + Agendar Otro Turno
        </button>
      </div>
    );
  }

  return (
    <>
      {mostrarConfirmacion && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Confirmar Reserva</h3>
            <p>¿Confirmas la reserva del siguiente turno?</p>
            <div className="modal-datos">
              <strong>{formatearFecha(fecha)}</strong>
              <span>Hora: {horaSeleccionada} – {generarHoraFin(horaSeleccionada)}</span>
              <span>Empresa: {proveedor?.empresa}</span>
            </div>
            <div className="modal-acciones">
              <button onClick={() => setMostrarConfirmacion(false)} className="btn btn-secondary">Cancelar</button>
              <button onClick={confirmarReserva} className="btn btn-primary">Confirmar</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Agendar Turno</h2>
          <p className="card-description">Selecciona fecha, horario y completa la información de carga.</p>
        </div>

        <div className="date-section">
          <label className="date-label">Fecha del turno</label>
          <div className="date-input-wrapper">
            <input
              type="date"
              value={fecha}
              min={fechaMinima}
              onChange={(e) => setFecha(e.target.value)}
              className="date-input"
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          {fecha && <p className="date-display">{formatearFecha(fecha)}</p>}
        </div>

        <div style={{ border: "1.5px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: "1.25rem" }}>
          <p style={{ fontWeight: 700, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
            Información de carga <span style={{ color: "var(--danger)" }}>*</span>
            <span style={{ fontWeight: 400, color: "var(--text-muted)", marginLeft: "0.5rem", fontSize: "0.8rem" }}>
              (requerida — elige una de las dos opciones)
            </span>
          </p>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            <button
              type="button"
              onClick={() => setTipoCarga(TIPO_CARGA.PRODUCTOS)}
              className={`btn btn-sm ${tipoCarga === TIPO_CARGA.PRODUCTOS ? "btn-primary" : "btn-secondary"}`}
            >
              Por Productos / Códigos
            </button>
            <button
              type="button"
              onClick={() => setTipoCarga(TIPO_CARGA.PALLET)}
              className={`btn btn-sm ${tipoCarga === TIPO_CARGA.PALLET ? "btn-primary" : "btn-secondary"}`}
            >
              Por Pallet / Cajas
            </button>
          </div>

          {tipoCarga === TIPO_CARGA.PRODUCTOS && (
            <div>
              {productosForm.map((fila, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "1fr 2fr 80px 32px", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "end" }}>
                  <div className="form-group" style={{ gap: "0.2rem" }}>
                    {idx === 0 && <label className="form-label">Código</label>}
                    <input
                      type="text"
                      list="productos-datalist"
                      value={fila.codigo}
                      onChange={(e) => {
                        const valor = e.target.value;
                        const encontrado = productosDB.find(p => p.codigo === valor);
                        if (encontrado) {
                          actualizarFilaProducto(idx, "select", encontrado.id);
                        } else {
                          actualizarFilaProducto(idx, "codigo", valor);
                        }
                      }}
                      className="form-input"
                      style={{ fontSize: "0.8rem" }}
                      placeholder="Buscar código..."
                    />
                    <datalist id="productos-datalist">
                      {productosDB.map(p => (
                        <option key={p.id} value={p.codigo} label={p.descripcion} />
                      ))}
                    </datalist>
                  </div>
                  <div className="form-group" style={{ gap: "0.2rem" }}>
                    {idx === 0 && <label className="form-label">Descripción <span style={{ color: "var(--danger)" }}>*</span></label>}
                    <input
                      type="text"
                      value={fila.descripcion}
                      onChange={(e) => actualizarFilaProducto(idx, "descripcion", e.target.value)}
                      className="form-input"
                      placeholder="Descripción del producto"
                      style={{ fontSize: "0.8rem" }}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ gap: "0.2rem" }}>
                    {idx === 0 && <label className="form-label">Cantidad <span style={{ color: "var(--danger)" }}>*</span></label>}
                    <input
                      type="number"
                      min="1"
                      value={fila.cantidad}
                      onChange={(e) => actualizarFilaProducto(idx, "cantidad", parseInt(e.target.value) || 1)}
                      className="form-input"
                      style={{ fontSize: "0.8rem" }}
                      required
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => eliminarFilaProducto(idx)}
                    className="btn-delete"
                    title="Quitar producto"
                    style={{ marginTop: idx === 0 ? "1.3rem" : 0 }}
                    disabled={productosForm.length === 1}
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={agregarFilaProducto} className="btn btn-sm btn-secondary" style={{ marginTop: "0.25rem" }}>
                + Agregar producto
              </button>
            </div>
          )}

          {tipoCarga === TIPO_CARGA.PALLET && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
              <div className="form-group">
                <label className="form-label">N° Pallet</label>
                <input
                  type="text"
                  value={numeroPallet}
                  onChange={(e) => setNumeroPallet(e.target.value)}
                  className="form-input"
                  placeholder="Ej: PAL-001"
                />
              </div>
              <div className="form-group">
                <label className="form-label">N° Cajas</label>
                <input
                  type="number"
                  min="0"
                  value={numeroCajas}
                  onChange={(e) => setNumeroCajas(e.target.value)}
                  className="form-input"
                  placeholder="Ej: 24"
                />
              </div>
              <p style={{ gridColumn: "1/-1", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                * Debes ingresar al menos uno de los dos campos.
              </p>
            </div>
          )}
        </div>

        {mensaje.texto && (
          <div className={`alert ${mensaje.tipo === "exito" ? "alert-success" : "alert-error"}`} style={{ marginBottom: "1rem" }}>
            {mensaje.texto}
          </div>
        )}

        <div className="legend">
          <div className="legend-item"><div className="legend-dot legend-dot-free"></div><span>Disponible</span></div>
          <div className="legend-item"><div className="legend-dot legend-dot-reserved"></div><span>Reservado</span></div>
          <div className="legend-item"><div className="legend-dot legend-dot-occupied"></div><span>No disponible ( menos 12h)</span></div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div></div>
        ) : (
          <div className="turnos-grid">
            {turnosVisibles.map((hora) => {
              const ocupado = estaOcupado(hora);
              const sinTiempo = noDisponiblePorTiempo(hora);
              const isReservando = reservando === hora;
              const bloqueado = ocupado || sinTiempo;
              
              let claseBoton = "turno-free";
              
              if (ocupado) {
                claseBoton = "turno-reserved";
              } else if (sinTiempo) {
                claseBoton = "turno-occupied";
              }

              return (
                <button
                  key={hora}
                  disabled={bloqueado || isReservando || !proveedor?.id}
                  onClick={() => solicitarConfirmacion(hora)}
                  className={`turno-btn ${claseBoton}`}
                >
                  <span className="turno-time">{hora}</span>
                  <span className="turno-status">
                    {isReservando ? "Reservando..." : ocupado ? "Reservado" : sinTiempo ? "No disponible" : "Disponible"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
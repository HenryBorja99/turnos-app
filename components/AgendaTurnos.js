"use client";
import { useState, useEffect } from "react";
import { generarTurnos, obtenerFechaMinima, puedeReservar, formatearFecha, generarHoraFin } from "../utils/generarTurnos";
import { supabase } from "../lib/supabase";
import ArchivosTurno from "./ArchivosTurno";
import ComprobanteTurno from "./ComprobanteTurno";

function esBloqueAlmuerzo(hora) {
  return hora >= "13:00" && hora < "13:35";
}

export default function AgendaTurnos({ session, proveedor }) {
  const [fecha, setFecha] = useState("");
  const [ocupados, setOcupados] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: "", texto: "" });
  const [turnoCreado, setTurnoCreado] = useState(null);
  
  const [productos, setProductos] = useState([]);
  const [productosEditables, setProductosEditables] = useState([]); 
  
  const [archivos, setArchivos] = useState([]);
  const [reservando, setReservando] = useState(null);
  const [mostrarConfirmacion, setMostrarConfirmacion] = useState(false);
  const [horaSeleccionada, setHoraSeleccionada] = useState(null);
  const [usuarioTurno, setUsuarioTurno] = useState(null);
  const [productosForm, setProductosForm] = useState([
    { codigo: "", descripcion: "", cantidad: 1 }
  ]);
  const [productosDB, setProductosDB] = useState([]);
  const [sugerencias, setSugerencias] = useState({ indice: null, tipo: null, datos: [] });
  const [numeroPallet, setNumeroPallet] = useState("");
  const [numeroCajas, setNumeroCajas] = useState("");
  const [ordenCompra, setOrdenCompra] = useState("");
  const [archivosSeleccionados, setArchivosSeleccionados] = useState([]); 

  async function cargarTurnos() {
    if (!fecha) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("turnos")
      .select("hora_inicio, fecha, estado, usuario_id")
      .eq("fecha", fecha)
      .neq("estado", "cancelado");
    
    if (!error && data) {
      setOcupados(data);
    } else {
      setOcupados([]);
    }
    setLoading(false);
  }

  async function cargarProductosYArchivos() {
    if (!turnoCreado?.id) return;
    const [prodRes, archRes] = await Promise.all([
      supabase.from("turno_productos").select("*").eq("turno_id", turnoCreado.id),
      supabase.from("turno_archivos").select("*").eq("turno_id", turnoCreado.id)
    ]);
    
    const loadedProducts = prodRes.data || [];
    setProductos(loadedProducts);
    setProductosEditables(loadedProducts); 
    setArchivos(archRes.data || []);
  }

  async function cargarUsuarioTurno() {
    if (!turnoCreado?.usuario_id) return;
    const { data, error } = await supabase
      .from("proveedores")
      .select("email")
      .eq("id", turnoCreado.id)
      .single();

    if (!error) setUsuarioTurno(data);
  }

  async function cargarProductosDB() {
    let todosLosProductos = [];
    let limite = 1000;
    let inicio = 0;
    let fin = limite - 1;
    let hayMas = true;

    while (hayMas) {
      const { data, error } = await supabase
        .from("productos")
        .select("*")
        .eq("activo", true)
        .order("codigo", { ascending: true })
        .range(inicio, fin);

      if (error || !data || data.length === 0) {
        hayMas = false;
      } else {
        todosLosProductos = [...todosLosProductos, ...data];
        
        if (data.length < limite) {
          hayMas = false;
        } else {
          inicio += limite;
          fin += limite;
        }
      }
    }
    
    setProductosDB(todosLosProductos);
    console.log("Total de productos cargados en memoria:", todosLosProductos.length);
  }

  useEffect(() => {
    const fechaMin = obtenerFechaMinima();
    setFecha(fechaMin);
    cargarTurnos();
    cargarProductosDB();
  }, []);

  useEffect(() => {
    if (fecha) cargarTurnos();
  }, [fecha]);

  useEffect(() => {
    if (turnoCreado) {
      cargarProductosYArchivos();
      cargarUsuarioTurno();
      
      if (turnoCreado.indicaciones) {
        const matchPallet = turnoCreado.indicaciones.match(/Pallet:\s*(\d+)/);
        const matchCajas = turnoCreado.indicaciones.match(/Cajas:\s*(\d+)/);
        if (matchPallet) setNumeroPallet(matchPallet[1]);
        if (matchCajas) setNumeroCajas(matchCajas[1]);
      }
    }
  }, [turnoCreado?.id]);

  function obtenerInfoTurno(hora) {
    if (!hora || !ocupados || ocupados.length === 0) return null;
    const horaBuscada = hora.trim().substring(0, 5);
    const turno = ocupados.find(t => {
      if (!t.hora_inicio || t.estado === "cancelado") return false;
      let horaOcupada = String(t.hora_inicio);
      if (horaOcupada.length > 5) horaOcupada = horaOcupada.substring(0, 5);
      return horaOcupada.trim() === horaBuscada;
    });
    
    if (!turno) return null;
    return { ocupado: true, esMiTurno: session?.user?.id && turno.usuario_id === session.user.id };
  }

  function noDisponiblePorTiempo(hora) {
    const resultado = puedeReservar(fecha, hora);
    return !resultado.puede;
  }

  function validarCarga() {
    const validos = productosForm.filter(p => p.descripcion.trim() && p.cantidad > 0);
    if (validos.length === 0) {
      return { valido: false, error: "Debes agregar al menos un producto con descripción y cantidad." };
    }
    if (!ordenCompra.trim()) {
      return { valido: false, error: "La orden de compra es requerida." };
    }
    return { valido: true };
  }

  async function solicitarConfirmacion(hora) {
    await cargarTurnos();
    const validacion = puedeReservar(fecha, hora);
    if (!validacion.puede) {
      setMensaje({ tipo: "error", texto: validacion.mensaje });
      setTimeout(() => setMensaje({ tipo: "", texto: "" }), 5000);
      return;
    }
    const infoTurno = obtenerInfoTurno(hora);
    if (infoTurno && infoTurno.ocupado && !infoTurno.esMiTurno) {
      setMensaje({ tipo: "info", texto: "Turno no disponible. Actualizando horarios..." });
      setTimeout(() => setMensaje({ tipo: "", texto: "" }), 3000);
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
    setMensaje({ tipo: "info", texto: "Verificando disponibilidad..." });

    const horaNormalizada = hora.substring(0, 5);
    const { data: turnoExistente } = await supabase
      .from("turnos")
      .select("id")
      .eq("fecha", fecha)
      .eq("hora_inicio", horaNormalizada)
      .neq("estado", "cancelado")
      .maybeSingle();

    if (turnoExistente) {
      setMensaje({ tipo: "info", texto: "Turno no disponible. Actualizando horarios..." });
      setReservando(null);
      setHoraSeleccionada(null);
      cargarTurnos();
      setTimeout(() => setMensaje({ tipo: "", texto: "" }), 4000);
      return;
    }

    setMensaje({ tipo: "info", texto: "Creando turno..." });

    const indicacionesExtras = [];
    if (numeroPallet.trim()) indicacionesExtras.push(`Pallet: ${numeroPallet}`);
    if (numeroCajas) indicacionesExtras.push(`Cajas: ${numeroCajas}`);
    const indicacionesTxt = indicacionesExtras.length > 0 ? indicacionesExtras.join(" | ") : null;

    const { data: nuevoTurno, error } = await supabase
      .from("turnos")
      .insert({
        fecha,
        hora_inicio: hora,
        hora_fin: generarHoraFin(hora),
        proveedor_id: proveedor.id,
        usuario_id: session?.user?.id,
        anden: 7,
        estado: "pendiente",
        orden_compra: ordenCompra.trim() || null,
        indicaciones: indicacionesTxt
      })
      .select()
      .single();

    if (error) {
      setMensaje({ tipo: "error", texto: `Error al reservar: ${error.message}` });
      setReservando(null);
      setHoraSeleccionada(null);
      setTimeout(() => setMensaje({ tipo: "", texto: "" }), 4000);
      return;
    }

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

    if (archivosSeleccionados.length > 0) {
      setMensaje({ tipo: "info", texto: "Turno creado. Subiendo archivos..." });
      for (const file of archivosSeleccionados) {
        try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${nuevoTurno.id}/${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
          const { error: uploadError } = await supabase.storage.from('turnos-archivos').upload(fileName, file);
          if (!uploadError) {
            const { data: { publicUrl } } = supabase.storage.from('turnos-archivos').getPublicUrl(fileName);
            await supabase.from("turno_archivos").insert({
              turno_id: nuevoTurno.id, nombre_archivo: file.name, tipo_archivo: file.type, url: publicUrl, tamano: file.size
            });
          }
        } catch (err) { console.error("Error subiendo archivo:", err); }
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
        body: { to: prov.email, empresa: prov.empresa, fecha: formatearFecha(turno.fecha), hora_inicio: turno.hora_inicio, hora_fin: turno.hora_fin, anden: turno.anden }
      });
    } catch (_) {}
  }


  function manejarBusqueda(valor, idx, tipo) {
    const valorLimpio = valor.trim().toLowerCase();

    if (tipo === "agendar") {
      const copia = [...productosForm];
      copia[idx] = { ...copia[idx], codigo: valor };
      setProductosForm(copia);
    } else {
      const copia = [...productosEditables];
      copia[idx] = { ...copia[idx], codigo: valor };
      setProductosEditables(copia);
    }

    if (valorLimpio.length >= 2) {
      const resultados = [];
      for (let i = 0; i < productosDB.length; i++) {
        const p = productosDB[i];
        
        const codigoDB = p.codigo ? String(p.codigo).trim().toLowerCase() : "";
        
        if (codigoDB.includes(valorLimpio)) {
          resultados.push(p);
          if (resultados.length >= 150) break; 
        }
      }
      setSugerencias({ indice: idx, tipo: tipo, datos: resultados });
    } else {
      setSugerencias({ indice: null, tipo: null, datos: [] });
    }
  }


  function seleccionarProducto(prod, idx, tipo) {
    if (tipo === "agendar") {
      const copia = [...productosForm];
      copia[idx] = { ...copia[idx], codigo: prod.codigo, descripcion: prod.descripcion };
      setProductosForm(copia);
    } else {
      const copia = [...productosEditables];
      copia[idx] = { ...copia[idx], codigo: prod.codigo, descripcion: prod.descripcion };
      setProductosEditables(copia);
    }
    setSugerencias({ indice: null, tipo: null, datos: [] });
  }

  function agregarFilaProducto() { setProductosForm([...productosForm, { codigo: "", descripcion: "", cantidad: 1 }]); }
  function eliminarFilaProducto(idx) {
    if (productosForm.length === 1) return;
    setProductosForm(productosForm.filter((_, i) => i !== idx));
    setSugerencias({ indice: null, tipo: null, datos: [] });
  }

  function agregarProductoEditable() { setProductosEditables([...productosEditables, { codigo: "", descripcion: "", cantidad: 1 }]); }
  function eliminarProductoEditable(idx) {
    setProductosEditables(productosEditables.filter((_, i) => i !== idx));
    setSugerencias({ indice: null, tipo: null, datos: [] });
  }

  async function guardarCambiosCarga() {
    setLoading(true);
    setMensaje({ tipo: "info", texto: "Guardando cambios..." });
    try {
      const indicacionesExtras = [];
      if (numeroPallet.trim()) indicacionesExtras.push(`Pallet: ${numeroPallet}`);
      if (numeroCajas) indicacionesExtras.push(`Cajas: ${numeroCajas}`);
      const indicacionesTxt = indicacionesExtras.length > 0 ? indicacionesExtras.join(" | ") : null;

      await supabase.from("turnos").update({ indicaciones: indicacionesTxt }).eq("id", turnoCreado.id);
      setTurnoCreado({ ...turnoCreado, indicaciones: indicacionesTxt });

      await supabase.from("turno_productos").delete().eq("turno_id", turnoCreado.id);
      
      const validos = productosEditables.filter(p => p.descripcion && p.descripcion.trim());
      if (validos.length > 0) {
        const aInsertar = validos.map(p => ({
          turno_id: turnoCreado.id,
          codigo: p.codigo || null,
          descripcion: p.descripcion,
          cantidad: parseInt(p.cantidad) || 1
        }));
        await supabase.from("turno_productos").insert(aInsertar);
      }

      setProductos(validos);
      setProductosEditables(validos);
      setMensaje({ tipo: "exito", texto: "Todos los cambios guardados correctamente." });
    } catch (error) {
      setMensaje({ tipo: "error", texto: "Error al guardar los cambios." });
    }
    setLoading(false);
    setTimeout(() => setMensaje({ tipo: "", texto: "" }), 3000);
  }

  const todosLosTurnos = generarTurnos();
  const turnosVisibles = todosLosTurnos.filter(h => !esBloqueAlmuerzo(h));
  const fechaMinima = obtenerFechaMinima();

  const dropdownStyle = {
    position: "absolute",
    top: "100%",
    left: 0,
    width: "280px", 
    background: "white",
    border: "1px solid var(--border)",
    borderRadius: "var(--radius)",
    boxShadow: "0 8px 16px rgba(0,0,0,0.15)",
    zIndex: 9999, 
    maxHeight: "220px",
    overflowY: "auto",
    marginTop: "4px"
  };

  if (turnoCreado) {
    return (
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">¡Turno Confirmado!</h2>
          <p className="card-description">Tu turno fue reservado exitosamente.</p>
        </div>

        {mensaje.texto && (
          <div className={`alert ${mensaje.tipo === "exito" ? "alert-success" : mensaje.tipo === "info" ? "alert-info" : "alert-error"}`} style={{ marginBottom: "1rem" }}>
            {mensaje.texto}
          </div>
        )}

        <ComprobanteTurno
          turno={turnoCreado}
          proveedor={proveedor}
          productos={productos}
          archivos={archivos}
          indicaciones={turnoCreado.indicaciones || ""}
          email={session?.user?.email}
        />

        <div style={{ border: "1.5px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", marginTop: "1.25rem", background: "white" }}>
          <h3 style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--text)" }}>Gestionar Carga (Productos, Cajas y Pallets)</h3>
          
          <div style={{ overflow: "visible", marginBottom: "0.5rem", paddingBottom: "2rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ background: "var(--neutral-light)", textAlign: "left" }}>
                  <th style={{ padding: "0.75rem", borderBottom: "2px solid var(--border)", fontWeight: 600, width: "130px" }}>CÓDIGO</th>
                  <th style={{ padding: "0.75rem", borderBottom: "2px solid var(--border)", fontWeight: 600 }}>DESCRIPCIÓN</th>
                  <th style={{ padding: "0.75rem", borderBottom: "2px solid var(--border)", fontWeight: 600, width: "70px" }}>CANT.</th>
                  <th style={{ padding: "0.75rem", borderBottom: "2px solid var(--border)", fontWeight: 600, width: "40px", textAlign: "center" }}></th>
                </tr>
              </thead>
              <tbody>
                {productosEditables.map((p, idx) => (
                  <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.5rem", position: "relative" }}>
                      <input 
                        type="text" 
                        value={p.codigo || ""} 
                        onChange={(e) => manejarBusqueda(e.target.value, idx, "editar")} 
                        onBlur={() => setTimeout(() => setSugerencias({ indice: null, tipo: null, datos: [] }), 200)}
                        className="form-input" 
                        style={{ width: "100%", padding: "0.4rem" }} 
                        placeholder="Buscar..." 
                      />
                      
                      {sugerencias.indice === idx && sugerencias.tipo === "editar" && sugerencias.datos.length > 0 && (
                        <div style={dropdownStyle}>
                          {sugerencias.datos.map(prod => (
                            <div
                              key={prod.id}
                              style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #eee", display: "flex", flexDirection: "column", background: "white" }}
                              onMouseDown={(e) => { e.preventDefault(); seleccionarProducto(prod, idx, "editar"); }}
                              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
                              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}
                            >
                              <span style={{ fontWeight: "600", color: "var(--primary)", fontSize: "0.85rem" }}>{prod.codigo}</span>
                              <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{prod.descripcion}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input 
                        type="text" 
                        value={p.descripcion || ""} 
                        onChange={(e) => {
                          const copia = [...productosEditables];
                          copia[idx].descripcion = e.target.value;
                          setProductosEditables(copia);
                        }} 
                        className="form-input" 
                        style={{ width: "100%", padding: "0.4rem" }} 
                        placeholder="Descripción..." 
                      />
                    </td>
                    <td style={{ padding: "0.5rem" }}>
                      <input 
                        type="number" 
                        min="1" 
                        value={p.cantidad || 1} 
                        onChange={(e) => {
                          const copia = [...productosEditables];
                          copia[idx].cantidad = parseInt(e.target.value) || 1;
                          setProductosEditables(copia);
                        }} 
                        className="form-input" 
                        style={{ width: "100%", padding: "0.4rem", textAlign: "center" }} 
                      />
                    </td>
                    <td style={{ padding: "0.5rem", textAlign: "center" }}>
                      <button onClick={() => eliminarProductoEditable(idx)} className="btn-delete" style={{ padding: "0.4rem", margin: 0 }} title="Eliminar">✕</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <button onClick={agregarProductoEditable} className="btn btn-sm btn-secondary" style={{ marginTop: "-1rem" }}>
            + Agregar producto
          </button>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginTop: "1rem", padding: "1rem", background: "#f8fafc", borderRadius: "var(--radius)" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Total Pallets</label>
              <input type="text" value={numeroPallet} onChange={(e) => setNumeroPallet(e.target.value)} className="form-input" placeholder="Ej: 5" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Total Cajas</label>
              <input type="number" min="0" value={numeroCajas} onChange={(e) => setNumeroCajas(e.target.value)} className="form-input" placeholder="Ej: 24" />
            </div>
          </div>

          <button onClick={guardarCambiosCarga} disabled={loading} className="btn btn-primary" style={{ marginTop: "1rem", width: "100%" }}>
            {loading ? "Guardando..." : "Guardar Todos los Cambios"}
          </button>
        </div>

        <ArchivosTurno turnoId={turnoCreado.id} archivos={archivos} onActualizado={setArchivos} />
        
        <button
          onClick={() => {
            setTurnoCreado(null);
            setProductosForm([{ codigo: "", descripcion: "", cantidad: 1 }]);
            setNumeroPallet(""); setNumeroCajas(""); setOrdenCompra(""); setArchivosSeleccionados([]); 
          }}
          className="btn btn-secondary"
          style={{ marginTop: "1rem", width: "100%" }}
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
              <span>Empresa: {proveedor?.empresa} ({session?.user?.email})</span>
              <span>Orden de Compra: {ordenCompra}</span>
              {(numeroPallet || numeroCajas) && (
                <span>Info adicional: {numeroPallet ? `Pallet: ${numeroPallet}` : ''} {numeroCajas ? `Cajas: ${numeroCajas}` : ''}</span>
              )}
              {archivosSeleccionados.length > 0 && <span>Archivos a subir: {archivosSeleccionados.length}</span>}
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
          <p className="card-description">Selecciona fecha, horario y completa la información.</p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.25rem" }}>
          <div className="date-section" style={{ marginBottom: 0 }}>
            <label className="date-label">Fecha del turno</label>
            <div className="date-input-wrapper">
              <input type="date" value={fecha} min={fechaMinima} onChange={(e) => setFecha(e.target.value)} className="date-input" />
            </div>
            {fecha && <p className="date-display" style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>{formatearFecha(fecha)}</p>}
          </div>

          <div>
            <label className="form-label">Orden de Compra <span style={{ color: "var(--danger)" }}>*</span></label>
            <input type="text" value={ordenCompra} onChange={(e) => setOrdenCompra(e.target.value)} className="form-input" placeholder="Ej: 00001" style={{ width: "100%" }} required />
          </div>
        </div>

        <div style={{ border: "1.5px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: "1.25rem" }}>
          <p style={{ fontWeight: 700, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
            Productos / Materiales<span style={{ color: "var(--danger)" }}>*</span>
          </p>

          <div style={{ paddingBottom: "1.5rem" }}>
            {productosForm.map((fila, idx) => (
              <div key={idx} style={{ display: "grid", gridTemplateColumns: "130px 1fr 70px 32px", gap: "0.5rem", marginBottom: "0.5rem", alignItems: "end" }}>
                <div className="form-group" style={{ gap: "0.2rem", position: "relative", marginBottom: 0 }}>
                  {idx === 0 && <label className="form-label">Código</label>}
                  <input
                    type="text"
                    value={fila.codigo || ""}
                    onChange={(e) => manejarBusqueda(e.target.value, idx, "agendar")}
                    onBlur={() => setTimeout(() => setSugerencias({ indice: null, tipo: null, datos: [] }), 200)}
                    className="form-input"
                    style={{ fontSize: "0.8rem", width: "100%", padding: "0.4rem" }}
                    placeholder="Buscar..."
                  />

                  {sugerencias.indice === idx && sugerencias.tipo === "agendar" && sugerencias.datos.length > 0 && (
                    <div style={dropdownStyle}>
                      {sugerencias.datos.map(p => (
                        <div
                          key={p.id}
                          style={{ padding: "8px 12px", cursor: "pointer", borderBottom: "1px solid #eee", display: "flex", flexDirection: "column", background: "white" }}
                          onMouseDown={(e) => { e.preventDefault(); seleccionarProducto(p, idx, "agendar"); }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "#f8fafc"}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "white"}
                        >
                          <span style={{ fontWeight: "600", color: "var(--primary)", fontSize: "0.85rem" }}>{p.codigo}</span>
                          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>{p.descripcion}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="form-group" style={{ gap: "0.2rem", marginBottom: 0 }}>
                  {idx === 0 && <label className="form-label">Descripción <span style={{ color: "var(--danger)" }}>*</span></label>}
                  <input 
                    type="text" 
                    value={fila.descripcion} 
                    onChange={(e) => {
                      const copia = [...productosForm];
                      copia[idx].descripcion = e.target.value;
                      setProductosForm(copia);
                    }} 
                    className="form-input" 
                    placeholder="Descripción" 
                    style={{ fontSize: "0.8rem", padding: "0.4rem" }} required 
                  />
                </div>
                <div className="form-group" style={{ gap: "0.2rem", marginBottom: 0 }}>
                  {idx === 0 && <label className="form-label">Cant. <span style={{ color: "var(--danger)" }}>*</span></label>}
                  <input 
                    type="number" 
                    min="1" 
                    value={fila.cantidad} 
                    onChange={(e) => {
                      const copia = [...productosForm];
                      copia[idx].cantidad = parseInt(e.target.value) || 1;
                      setProductosForm(copia);
                    }} 
                    className="form-input" 
                    style={{ fontSize: "0.8rem", padding: "0.4rem", textAlign: "center" }} required 
                  />
                </div>
                <button type="button" onClick={() => eliminarFilaProducto(idx)} className="btn-delete" title="Quitar" disabled={productosForm.length === 1} style={{ padding: "0.4rem", height: "30px", margin: 0 }}>✕</button>
              </div>
            ))}
            <button type="button" onClick={agregarFilaProducto} className="btn btn-sm btn-secondary" style={{ marginTop: "0.5rem" }}>
              + Agregar producto
            </button>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", padding: "1rem", background: "#f8fafc", borderRadius: "var(--radius)" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Total Pallets (opcional)</label>
              <input type="text" value={numeroPallet} onChange={(e) => setNumeroPallet(e.target.value)} className="form-input" placeholder="Ingresa el número de pallets" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Total Cajas (opcional)</label>
              <input type="number" min="0" value={numeroCajas} onChange={(e) => setNumeroCajas(e.target.value)} className="form-input" placeholder="Ingresa el número de cajas" />
            </div>
          </div>
        </div>

        <div style={{ border: "1.5px solid var(--border)", borderRadius: "var(--radius)", padding: "1rem", marginBottom: "1.25rem" }}>
          <p style={{ fontWeight: 700, marginBottom: "0.75rem", fontSize: "0.9rem" }}>
            Archivos Adjuntos <span style={{ fontWeight: 400, color: "var(--text-muted)", fontSize: "0.8rem" }}>(Opcional)</span>
          </p>
          <input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx" onChange={(e) => setArchivosSeleccionados(Array.from(e.target.files))} className="form-input" style={{ width: "100%" }} />
          {archivosSeleccionados.length > 0 && (
            <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              <strong>Archivos listos para subir al confirmar:</strong>
              <ul style={{ paddingLeft: "1.2rem", marginTop: "0.25rem" }}>
                {archivosSeleccionados.map((f, i) => <li key={i}>{f.name}</li>)}
              </ul>
            </div>
          )}
        </div>

        {mensaje.texto && (
          <div className={`alert ${mensaje.tipo === "exito" ? "alert-success" : mensaje.tipo === "info" ? "alert-info" : "alert-error"}`} style={{ marginBottom: "1rem" }}>
            {mensaje.texto}
          </div>
        )}

        <div className="legend">
          <div className="legend-item"><div className="legend-dot legend-dot-free"></div><span>Disponible</span></div>
          <div className="legend-item"><div className="legend-dot legend-dot-occupied"></div><span>No disponible</span></div>
          <div className="legend-item"><div className="legend-dot legend-dot-reserved" style={{ background: 'var(--primary)' }}></div><span>Mi turno</span></div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div></div>
        ) : (
          <div className="turnos-grid" key={`grid-${ocupados.length}`}>
            {turnosVisibles.map((hora) => {
              const infoTurno = obtenerInfoTurno(hora);
              const ocupado = infoTurno?.ocupado || false;
              const esMiTurno = infoTurno?.esMiTurno || false;
              const sinTiempo = noDisponiblePorTiempo(hora);
              const isReservando = reservando === hora;
              const bloqueado = (ocupado && !esMiTurno) || sinTiempo || !proveedor?.id;
              
              let claseBoton = "turno-free";
              let textoEstado = "Disponible";
              
              if (esMiTurno) { claseBoton = "turno-mine"; textoEstado = "Mi turno"; } 
              else if (ocupado || sinTiempo) { claseBoton = "turno-occupied"; textoEstado = "No disponible"; }

              return (
                <button
                  key={hora}
                  disabled={bloqueado || isReservando || !proveedor?.id}
                  onClick={() => solicitarConfirmacion(hora)}
                  className={`turno-btn ${claseBoton}`}
                  title={esMiTurno ? "Tienes este turno reservado" : ""}
                >
                  <span className="turno-time">{hora}</span>
                  <span className="turno-status">{isReservando ? "Reservando..." : textoEstado}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
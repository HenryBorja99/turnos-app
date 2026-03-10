"use client";
import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";
import Link from "next/link";
import { supabaseConfig } from "../../lib/config";
import { formatearFecha, generarComprobanteHTML } from "../../utils/generarTurnos";
import Navigation from "../../components/Navigation";

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

export default function MisTurnos() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [turnos, setTurnos] = useState([]);
  const [eliminando, setEliminando] = useState(null);
  const [imprimiendo, setImprimiendo] = useState(null);

  const cargarTurnos = useCallback(async (usuarioId) => {
    const { data, error } = await supabase
      .from("turnos")
      .select("*")
      .eq("usuario_id", usuarioId)
      .neq("estado", "cancelado")
      .order("fecha", { ascending: false })
      .order("hora_inicio");

    if (error) {
      setTurnos([]);
    } else {
      setTurnos(data || []);
    }
    
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        cargarTurnos(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        cargarTurnos(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [cargarTurnos]);

  async function eliminarTurno(id) {
    if (!confirm("¿Estás seguro de cancelar este turno?")) return;
    
    setEliminando(id);
    
    await supabase.from("turno_productos").delete().eq("turno_id", id);
    await supabase.from("turno_archivos").delete().eq("turno_id", id);
    const { error } = await supabase.from("turnos").delete().eq("id", id);
    
    if (!error) {
      setTurnos(turnos.filter(t => t.id !== id));
    }
    setEliminando(null);
  }

  async function handleReimprimir(turno) {
    setImprimiendo(turno.id);
    try {
      const { data: proveedor } = await supabase
        .from("proveedores")
        .select("*")
        .eq("id", turno.proveedor_id)
        .single();

      const { data: productos } = await supabase
        .from("turno_productos")
        .select("*")
        .eq("turno_id", turno.id);

      const { data: config } = await supabase
        .from("configuracion")
        .select("valor")
        .eq("clave", "recomendaciones")
        .single();

      const html = generarComprobanteHTML(
        turno,
        proveedor || {},
        productos || [],
        turno.indicaciones || "",
        config?.valor || ""
      );

      const printWindow = window.open("", "_blank");
      printWindow.document.write(html);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    } catch (error) {
      console.error("Error al reimprimir:", error);
      alert("Hubo un error al generar el comprobante.");
    }
    setImprimiendo(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-main)' }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-main)' }}>
        <Link href="/" className="btn btn-primary">Iniciar Sesión</Link>
      </div>
    );
  }

  const fechaActual = new Date();
  const anio = fechaActual.getFullYear();
  const mes = String(fechaActual.getMonth() + 1).padStart(2, '0');
  const dia = String(fechaActual.getDate()).padStart(2, '0');
  const hoyStr = `${anio}-${mes}-${dia}`;
  
  const turnosPasados = turnos.filter(t => t.fecha < hoyStr);
  const turnosFuturos = turnos.filter(t => t.fecha >= hoyStr);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-main)' }}>
      <Navigation session={session} onLogout={handleLogout} />
      
      <main className="main-content">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Mis Turnos</h2>
            <p className="card-description">Gestiona tus turnos agendados</p>
          </div>

          {turnos.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="empty-title">No tienes turnos agendados</p>
              <p className="empty-description">Reserva tu primer turno</p>
              <Link href="/" className="btn btn-primary" style={{ maxWidth: '200px', margin: '0 auto' }}>
                Agendar Turno
              </Link>
            </div>
          ) : (
            <div>
              {turnosFuturos.length > 0 && (
                <div className="turnos-section">
                  <h3 className="section-title">Próximos turnos</h3>
                  <div className="turnos-list">
                    {turnosFuturos.map((turno) => (
                      <div key={turno.id} className="turno-item turno-item-future">
                        <div className="turno-item-content">
                          <div className="turno-item-time">
                            {turno.hora_inicio.slice(0, 2)}
                          </div>
                          <div className="turno-item-info">
                            <p className="turno-item-date">{formatearFecha(turno.fecha)}</p>
                            <p className="turno-item-detail">Hora: {turno.hora_inicio} • Andén {turno.anden}</p>
                          </div>
                        </div>
                        <div className="turno-item-actions">
                          {turno.estado === 'confirmado' ? (
                            <span className="turno-status-badge" style={{ background: 'var(--success)', color: '#fff' }}>Confirmado</span>
                          ) : turno.estado === 'atrasado' ? (
                            <span className="turno-status-badge" style={{ background: 'var(--danger)', color: '#fff' }}>Atrasado</span>
                          ) : turno.estado === 'asignado' || turno.estado === 'reservado' ? (
                            <span className="turno-status-badge" style={{ background: 'var(--primary)', color: '#fff' }}>
                              {turno.estado.charAt(0).toUpperCase() + turno.estado.slice(1)}
                            </span>
                          ) : null}

                          <button
                            onClick={() => handleReimprimir(turno)}
                            disabled={imprimiendo === turno.id}
                            className="btn btn-sm btn-secondary"
                            style={{ marginRight: '0.5rem', marginLeft: '0.5rem' }}
                          >
                            {imprimiendo === turno.id ? "Generando..." : "Comprobante"}
                          </button>

                          {turno.estado !== 'confirmado' && turno.estado !== 'atrasado' && turno.estado !== 'asignado' && turno.estado !== 'reservado' && (
                            <>
                              <button
                                onClick={() => {
                                  if (confirm('¿Deseas reagendar este turno?')) {
                                    window.location.href = '/?reagendar=' + turno.id;
                                  }
                                }}
                                className="btn btn-sm btn-secondary"
                                style={{ marginRight: '0.5rem' }}
                              >
                                Reagendar
                              </button>
                              <button
                                onClick={() => eliminarTurno(turno.id)}
                                disabled={eliminando === turno.id}
                                className="btn-cancel"
                              >
                                {eliminando === turno.id ? "Cancelando..." : "Cancelar"}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {turnosPasados.length > 0 && (
                <div className="turnos-section">
                  <h3 className="section-title">Turnos pasados</h3>
                  <div className="turnos-list">
                    {turnosPasados.map((turno) => (
                      <div key={turno.id} className="turno-item turno-item-past">
                        <div className="turno-item-content">
                          <div className="turno-item-time">
                            {turno.hora_inicio.slice(0, 2)}
                          </div>
                          <div className="turno-item-info">
                            <p className="turno-item-date">{formatearFecha(turno.fecha)}</p>
                            <p className="turno-item-detail">Hora: {turno.hora_inicio} • Andén {turno.anden}</p>
                          </div>
                        </div>
                        <div className="turno-item-actions">
                          <span className="turno-status-badge status-past" style={{ marginRight: '0.5rem' }}>
                            {turno.estado ? turno.estado.charAt(0).toUpperCase() + turno.estado.slice(1) : 'Asignado'}
                          </span>
                          <button
                            onClick={() => handleReimprimir(turno)}
                            disabled={imprimiendo === turno.id}
                            className="btn btn-sm btn-secondary"
                          >
                            {imprimiendo === turno.id ? "Generando..." : "Comprobante"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
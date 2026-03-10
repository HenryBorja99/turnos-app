"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../../lib/config";
import { formatearFechaCorta, generarComprobanteHTML } from "../../utils/generarTurnos";
import Navigation from "../../components/Navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";

const supabase = createClient(supabaseConfig.url, supabaseConfig.anonKey);

export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState(null);
  const [turnos, setTurnos] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [stats, setStats] = useState({ total: 0, hoy: 0, semana: 0, pendientes: 0 });
  const [activeTab, setActiveTab] = useState("turnos");
  const [adminsPendientes, setAdminsPendientes] = useState([]);
  const [recomendacionesGenerales, setRecomendacionesGenerales] = useState("");
  const [imprimiendo, setImprimiendo] = useState(null);
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { session: s } } = await supabase.auth.getSession();
      setSession(s);

      if (s) {
        const { data } = await supabase
          .from("admins")
          .select("*")
          .eq("usuario_id", s.user.id)
          .eq("activo", true)
          .single();
        
        if (data) {
          setIsAdmin(true);
          setAdminRole(data.rol);
        }
      }
      setLoading(false);
    }
    init();
  }, []);

  async function loadTurnos() {
    let query = supabase
      .from("turnos")
      .select("*, proveedores:proveedor_id (empresa, email, telefono), turno_archivos(id, url, nombre_archivo)")
      .order("fecha", { ascending: false })
      .order("hora_inicio", { ascending: false });

    if (filtroFecha) query = query.eq("fecha", filtroFecha);
    if (filtroEstado) query = query.eq("estado", filtroEstado);

    const { data } = await query;
    setTurnos(data || []);

    const hoy = new Date().toISOString().split("T")[0];
    const semanaProx = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    setStats({
      total: data?.length || 0,
      hoy: data?.filter(t => t.fecha === hoy).length || 0,
      semana: data?.filter(t => t.fecha >= hoy && t.fecha <= semanaProx).length || 0,
      pendientes: data?.filter(t => t.estado === 'pendiente').length || 0
    });
  }

  useEffect(() => {
    if (!isAdmin) return;
    async function loadData() {
      if (adminRole === "superadmin") {
        const [adminsRes, configRes] = await Promise.all([
          supabase.from("admins").select("*").eq("activo", false),
          supabase.from("configuracion").select("*").eq("clave", "recomendaciones").single()
        ]);
        setAdminsPendientes(adminsRes.data || []);
        if (configRes.data) setRecomendacionesGenerales(configRes.data.valor || "");
      }
      await loadTurnos();
    }
    loadData();
  }, [isAdmin, adminRole, filtroFecha, filtroEstado]);

  async function guardarRecomendaciones() {
    if (adminRole !== "superadmin") return;
    await supabase.from("configuracion").upsert(
      { clave: "recomendaciones", valor: recomendacionesGenerales },
      { onConflict: "clave" }
    );
    alert("Recomendaciones guardadas");
  }

  async function aprobarAdmin(adminId) {
    if (adminRole !== "superadmin") return;
    await supabase.from("admins").update({ activo: true }).eq("id", adminId);
    const { data } = await supabase.from("admins").select("*").eq("activo", false);
    setAdminsPendientes(data || []);
  }

  async function rechazarAdmin(adminId) {
    if (adminRole !== "superadmin") return;
    await supabase.from("admins").delete().eq("id", adminId);
    const { data } = await supabase.from("admins").select("*").eq("activo", false);
    setAdminsPendientes(data || []);
  }

  async function actualizarEstado(turnoId, nuevoEstado) {
    if (adminRole !== "superadmin") return;
    const updateData = { estado: nuevoEstado, updated_at: new Date().toISOString() };
    
    if (nuevoEstado === 'confirmado') {
      updateData.fecha_llegada = new Date().toISOString().split('T')[0];
      updateData.hora_llegada = new Date().toTimeString().slice(0, 5);
    }
    
    await supabase.from("turnos").update(updateData).eq("id", turnoId);
    loadTurnos();
  }

  async function actualizarIndicaciones(turnoId, nuevasIndicaciones) {
    if (adminRole !== "superadmin") return;
    await supabase.from("turnos")
      .update({ indicaciones: nuevasIndicaciones, updated_at: new Date().toISOString() })
      .eq("id", turnoId);
  }

  async function handleReimprimir(turno) {
    if (adminRole !== "superadmin") return;
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
      alert("Hubo un error al generar el comprobante.");
    }
    setImprimiendo(null);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/admin-login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-main)" }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!session) {
    router.push("/admin-login");
    return null;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-main)" }}>
        <div className="card" style={{ textAlign: "center", maxWidth: 360 }}>
          <h2 style={{ marginBottom: "0.5rem" }}>Acceso Denegado</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "1rem" }}>No tienes permisos de administrador activos.</p>
          <Link href="/admin-login" className="btn btn-primary">Ir al Login</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-main)" }}>
      <Navigation session={session} onLogout={handleLogout} isAdmin={true} />

      <main className="main-content">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Panel de Administración {adminRole === "superadmin" && "(Superadmin)"}</h2>
          </div>

          <div className="admin-tabs">
            {["turnos", "config", "admins"].map(tab => {
              if (adminRole !== "superadmin" && tab !== "turnos") return null;

              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`admin-tab ${activeTab === tab ? "admin-tab-active" : ""}`}
                >
                  {tab === "turnos" && "Turnos"}
                  {tab === "config" && "Configuración"}
                  {tab === "admins" && `Admins (${adminsPendientes.length})`}
                </button>
              );
            })}
          </div>

          {activeTab === "turnos" && (
            <>
              <div className="admin-stats">
                <div className="stat-card">
                  <div className="stat-number">{stats.total}</div>
                  <div className="stat-label">Total Turnos</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{stats.hoy}</div>
                  <div className="stat-label">Hoy</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{stats.semana}</div>
                  <div className="stat-label">Esta Semana</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number" style={{ color: "var(--warning)" }}>{stats.pendientes}</div>
                  <div className="stat-label">Pendientes</div>
                </div>
              </div>

              <div className="admin-filters">
                <input
                  type="date"
                  value={filtroFecha}
                  onChange={(e) => setFiltroFecha(e.target.value)}
                  className="form-input"
                />
                <select
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  className="form-input"
                >
                  <option value="">Todos los estados</option>
                  <option value="reservado">Reservado</option>
                  <option value="confirmado">Confirmado</option>
                  <option value="en_proceso">En Proceso</option>
                  <option value="completado">Completado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
                {(filtroFecha || filtroEstado) && (
                  <button
                    onClick={() => { setFiltroFecha(""); setFiltroEstado(""); }}
                    className="btn btn-secondary btn-sm"
                  >
                    Limpiar filtros
                  </button>
                )}
              </div>

              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Hora</th>
                      <th>Empresa</th>
                      <th>Andén</th>
                      <th>Archivos</th>
                      <th>Indicaciones</th>
                      <th>Estado</th>
                      {adminRole === "superadmin" && <th>Acción</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {turnos.map((turno) => (
                      <tr key={turno.id}>
                        <td>
                          {formatearFechaCorta(turno.fecha)}
                          {turno.estado === 'pendiente' && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', padding: '0.1rem 0.3rem', background: 'var(--warning)', color: '#000', borderRadius: '3px' }}>PENDIENTE</span>
                          )}
                          {turno.estado === 'confirmado' && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', padding: '0.1rem 0.3rem', background: 'var(--success)', color: '#fff', borderRadius: '3px' }}>LLEGÓ</span>
                          )}
                          {turno.estado === 'atrasado' && (
                            <span style={{ marginLeft: '0.5rem', fontSize: '0.65rem', padding: '0.1rem 0.3rem', background: 'var(--danger)', color: '#fff', borderRadius: '3px' }}>ATRASADO</span>
                          )}
                        </td>
                        <td style={{ fontWeight: 600 }}>{turno.hora_inicio}</td>
                        <td>
                          <strong>{turno.proveedores?.empresa || "Sin empresa"}</strong>
                          <br />
                          <small style={{ color: "var(--text-muted)" }}>{turno.proveedores?.email}</small>
                        </td>
                        <td>{turno.anden}</td>
                        <td>
                          {turno.turno_archivos && turno.turno_archivos.length > 0 ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                              {turno.turno_archivos.map((archivo) => (
                                <a
                                  key={archivo.id}
                                  href={archivo.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ color: "var(--primary)", fontSize: "0.75rem", textDecoration: "underline" }}
                                  title={archivo.nombre_archivo}
                                >
                                  Ver archivo
                                </a>
                              ))}
                            </div>
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Ninguno</span>
                          )}
                        </td>
                        <td>
                          {adminRole === "superadmin" ? (
                            <input
                              type="text"
                              defaultValue={turno.indicaciones || ""}
                              placeholder="Agregar indicaciones..."
                              onBlur={(e) => actualizarIndicaciones(turno.id, e.target.value)}
                              className="form-input"
                              style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                            />
                          ) : (
                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                              {turno.indicaciones || "-"}
                            </span>
                          )}
                        </td>
                        <td>
                          <span className={`estado-select estado-${turno.estado}`}>
                            {turno.estado?.replace("_", " ")}
                          </span>
                        </td>
                        
                        {adminRole === "superadmin" && (
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                              <select
                                value={turno.estado || 'pendiente'}
                                onChange={(e) => actualizarEstado(turno.id, e.target.value)}
                                className="estado-select"
                                style={{ fontSize: "0.8rem", width: "100%" }}
                              >
                                <option value="pendiente">Pendiente</option>
                                <option value="confirmado">Confirmado (Llegó)</option>
                                <option value="atrasado">Atrasado</option>
                                <option value="cancelado">Cancelado</option>
                              </select>
                              <button
                                onClick={() => handleReimprimir(turno)}
                                disabled={imprimiendo === turno.id}
                                className="btn btn-sm btn-secondary"
                                style={{ width: "100%", textAlign: "center", justifyContent: "center" }}
                              >
                                {imprimiendo === turno.id ? "Generando..." : "Comprobante"}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {turnos.length === 0 && (
                <div className="empty-state">
                  <p className="empty-title">No hay turnos</p>
                  <p className="empty-description">No se encontraron turnos con los filtros seleccionados.</p>
                </div>
              )}
            </>
          )}

          {activeTab === "config" && adminRole === "superadmin" && (
            <div className="config-section">
              <h3>Recomendaciones Generales</h3>
              <p className="card-description" style={{ marginBottom: "1rem" }}>
                Estas recomendaciones serán visibles para todos los proveedores al agendar.
              </p>
              <textarea
                value={recomendacionesGenerales}
                onChange={(e) => setRecomendacionesGenerales(e.target.value)}
                className="form-input"
                placeholder="Ej: Traer documentos de identidad, llegar 15 min antes, etc."
                rows={5}
              />
              <button onClick={guardarRecomendaciones} className="btn btn-primary" style={{ marginTop: "1rem" }}>
                Guardar Recomendaciones
              </button>
            </div>
          )}

          {activeTab === "admins" && adminRole === "superadmin" && (
            <div className="admins-section">
              <h3>Admins Pendientes de Aprobación</h3>
              {adminsPendientes.length === 0 ? (
                <p className="empty-description" style={{ marginTop: "1rem" }}>
                  No hay solicitudes de acceso pendientes.
                </p>
              ) : (
                <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {adminsPendientes.map((admin) => (
                    <div
                      key={admin.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "1rem",
                        background: "var(--neutral-light)",
                        borderRadius: "var(--radius)",
                        border: "1px solid var(--border)",
                      }}
                    >
                      <div>
                        <strong>{admin.nombre}</strong>
                        <br />
                        <small style={{ color: "var(--text-muted)" }}>{admin.email}</small>
                        <br />
                        <span
                          style={{
                            fontSize: "0.7rem",
                            background: "var(--warning-light)",
                            color: "#92400e",
                            padding: "0.15rem 0.5rem",
                            borderRadius: "999px",
                            display: "inline-block",
                            marginTop: "0.25rem",
                          }}
                        >
                          {admin.rol}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button onClick={() => aprobarAdmin(admin.id)} className="btn btn-primary btn-sm">
                          Aprobar
                        </button>
                        <button
                          onClick={() => rechazarAdmin(admin.id)}
                          className="btn btn-secondary btn-sm"
                          style={{ color: "var(--danger)" }}
                        >
                          Rechazar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
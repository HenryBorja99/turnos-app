"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../../lib/config";
import { formatearFechaCorta, generarComprobanteHTML } from "../../utils/generarTurnos";
import { getAdminPermisos, puedeVer, puedeEditar, esSuperadmin } from "../../utils/permisos";
import Navigation from "../../components/Navigation";
import Link from "next/link";
import { useRouter } from "next/navigation";
import QrScanner from "../../components/QrScanner";
import { useInactivityWarning, INACTIVITY_TIMEOUT } from "../../hooks/useInactivityTimeout";

const supabase = (supabaseConfig.url && supabaseConfig.url.startsWith('http'))
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

function obtenerColoresEstado(estado) {
  switch (estado) {
    case "confirmado": return { bg: "#dcfce7", text: "#166534" }; 
    case "atrasado": return { bg: "#fee2e2", text: "#b91c1c" }; 
    case "cancelado": return { bg: "#f3f4f6", text: "#374151" }; 
    case "pendiente":
    default: return { bg: "#fef3c7", text: "#92400e" }; 
  }
}

export default function AdminPage() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminRole, setAdminRole] = useState(null);
  const [permisos, setPermisos] = useState({ ver: [], editar: [] });
  
  const [turnos, setTurnos] = useState([]);
  const [filtroFecha, setFiltroFecha] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [stats, setStats] = useState({ total: 0, hoy: 0, semana: 0, pendientes: 0 });
  const [activeTab, setActiveTab] = useState("turnos");
  const [adminsPendientes, setAdminsPendientes] = useState([]);
  const [proveedoresPendientes, setProveedoresPendientes] = useState([]);
  const [todosAdmins, setTodosAdmins] = useState([]);
  const [showCrearAdmin, setShowCrearAdmin] = useState(false);
  const [nuevoAdminEmail, setNuevoAdminEmail] = useState("");
  const [nuevoAdminNombre, setNuevoAdminNombre] = useState("");
  const [nuevoAdminRol, setNuevoAdminRol] = useState("admin");
  const [creandoAdmin, setCreandoAdmin] = useState(false);
  const [mensajeCrearAdmin, setMensajeCrearAdmin] = useState({ type: "", text: "" });
  const [recomendacionesGenerales, setRecomendacionesGenerales] = useState("");
  const [imprimiendo, setImprimiendo] = useState(null);
  const router = useRouter();
  const [busqueda, setBusqueda] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [scanBloqueado, setScanBloqueado] = useState(false);
  
  const [usuarioExpandido, setUsuarioExpandido] = useState(null);

  const [productosIngresados, setProductosIngresados] = useState([]);
  const [productosNoIngresados, setProductosNoIngresados] = useState([]);
  
  const [filtrosIngresados, setFiltrosIngresados] = useState({
    fechaInicio: "",
    fechaFin: "",
    codigo: ""
  });
  const [filtrosNoIngresados, setFiltrosNoIngresados] = useState({
    fechaInicio: "",
    fechaFin: "",
    codigo: ""
  });
  
  const [tablaIngresosActiva, setTablaIngresosActiva] = useState("ingresados");
  
  const [loadingIngresos, setLoadingIngresos] = useState(false);

  useInactivityWarning(async () => {
    await supabase.auth.signOut();
    router.push("/admin-login?timeout=true");
  }, INACTIVITY_TIMEOUT);

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
          
          let misPermisos = { ver: [], editar: [] };
          if (data.permisos) {
            try {
              misPermisos = typeof data.permisos === "string" ? JSON.parse(data.permisos) : data.permisos;
            } catch (e) { console.error("Error parseando permisos:", e); }
          }
          setPermisos(misPermisos);
        }
      }
      
      const hoyStr = new Date().toISOString().split('T')[0];
      setFiltrosIngresados({ fechaInicio: hoyStr, fechaFin: hoyStr, codigo: "" });
      setFiltrosNoIngresados({ fechaInicio: hoyStr, fechaFin: hoyStr, codigo: "" });
      setLoading(false);
    }
    init();
  }, []);

  async function loadTurnos() {
    const { data: allData } = await supabase.from("turnos").select("fecha, estado");

    const hoyDate = new Date();
    const hoyStr = `${hoyDate.getFullYear()}-${String(hoyDate.getMonth() + 1).padStart(2, '0')}-${String(hoyDate.getDate()).padStart(2, '0')}`;
    
    const diaSemana = hoyDate.getDay(); 
    const diffLunes = diaSemana === 0 ? -6 : 1 - diaSemana;
    
    const lunesDate = new Date(hoyDate);
    lunesDate.setDate(hoyDate.getDate() + diffLunes);
    const lunesStr = `${lunesDate.getFullYear()}-${String(lunesDate.getMonth() + 1).padStart(2, '0')}-${String(lunesDate.getDate()).padStart(2, '0')}`;

    const domingoDate = new Date(lunesDate);
    domingoDate.setDate(lunesDate.getDate() + 6);
    const domingoStr = `${domingoDate.getFullYear()}-${String(domingoDate.getMonth() + 1).padStart(2, '0')}-${String(domingoDate.getDate()).padStart(2, '0')}`;

    setStats({
      total: allData?.length || 0,
      hoy: allData?.filter(t => t.fecha === hoyStr).length || 0,
      semana: allData?.filter(t => t.fecha >= lunesStr && t.fecha <= domingoStr).length || 0,
      pendientes: allData?.filter(t => t.estado === 'pendiente').length || 0
    });

    let query = supabase
      .from("turnos")
      .select("*, proveedores:proveedor_id (empresa, email, telefono), turno_archivos(id, url, nombre_archivo)")
      .order("fecha", { ascending: true })
      .order("hora_inicio", { ascending: true });

    if (filtroFecha) query = query.eq("fecha", filtroFecha);
    if (filtroEstado) query = query.eq("estado", filtroEstado);

    const { data } = await query;
    setTurnos(data || []);
  }

  useEffect(() => {
    if (!isAdmin) return;
    async function loadData() {
      let configRes = await supabase.from("configuracion").select("*").eq("clave", "recomendaciones").single();
      if (configRes.data) setRecomendacionesGenerales(configRes.data.valor || "");


      if (esSuperadmin(permisos, adminRole) || puedeVer("admins", permisos)) {
        const { data } = await supabase.from("admins").select("*").eq("activo", false);
        setAdminsPendientes(data || []);
        
        const { data: todosAdmins } = await supabase.from("admins").select("*").eq("activo", true);
        setTodosAdmins(todosAdmins || []);
        
        const { data: provs } = await supabase.from("proveedores").select("*").eq("activo", false);
        setProveedoresPendientes(provs || []);
      }
      await loadTurnos();
    }
    loadData();
  }, [isAdmin, adminRole, filtroFecha, filtroEstado, permisos]);

  useEffect(() => {
    if (activeTab === "ingresos" && isAdmin) {
      cargarIngresos();
    }
  }, [activeTab, tablaIngresosActiva, filtrosIngresados, filtrosNoIngresados, isAdmin]);

  async function cargarIngresos() {
    setLoadingIngresos(true);
    
    const filtros = tablaIngresosActiva === "ingresados" ? filtrosIngresados : filtrosNoIngresados;
    
    if (!filtros.fechaInicio || !filtros.fechaFin) {
      setLoadingIngresos(false);
      return;
    }

    // --- LÓGICA PARA PRODUCTOS INGRESADOS ---
    if (tablaIngresosActiva === "ingresados") {
      const { data: turnosLlegaron, error: errTurnos } = await supabase
        .from("turnos")
        .select("id, fecha_llegada, hora_llegada, recibido_por")
        .gte("fecha_llegada", filtros.fechaInicio)
        .lte("fecha_llegada", filtros.fechaFin)
        .in("estado", ["confirmado", "atrasado"]);

      if (errTurnos || !turnosLlegaron?.length) {
        setProductosIngresados([]);
        setLoadingIngresos(false);
        return;
      }

      const turnoIds = turnosLlegaron.map(t => t.id);
      const { data: prods, error: errProds } = await supabase
        .from("turno_productos")
        .select("codigo, descripcion, cantidad, turno_id")
        .in("turno_id", turnoIds);

      if (errProds || !prods?.length) {
        setProductosIngresados([]);
      } else {
        // Optimización: Crear un mapa para búsqueda O(1)
        const turnosMap = turnosLlegaron.reduce((acc, t) => ({ ...acc, [t.id]: t }), {});
        
        const consolidados = prods.map(p => {
          const t = turnosMap[p.turno_id];
          return {
            ...p,
            recibido_por: t?.recibido_por || "No registrado",
            hora_llegada: t?.hora_llegada || "",
            fecha_llegada: t?.fecha_llegada || ""
          };
        });

        consolidados.sort((a,b) => new Date(`${b.fecha_llegada}T${b.hora_llegada}`).getTime() - new Date(`${a.fecha_llegada}T${a.hora_llegada}`).getTime());
        setProductosIngresados(consolidados);
      }
    }

    // --- LÓGICA PARA PRODUCTOS NO INGRESADOS ---
    if (tablaIngresosActiva === "no_ingresados") {
      const { data: turnosSinLlegar, error: errSinLlegar } = await supabase
        .from("turnos")
        .select("id, fecha, hora_inicio, anden, proveedor_id, estado, proveedores:proveedor_id (empresa)")
        .gte("fecha", filtros.fechaInicio)
        .lte("fecha", filtros.fechaFin)
        .eq("estado", "pendiente");

      if (errSinLlegar || !turnosSinLlegar?.length) {
        setProductosNoIngresados([]);
        setLoadingIngresos(false);
        return;
      }

      const turnoIdsPendientes = turnosSinLlegar.map(t => t.id);
      const { data: prodsSin, error: errProdsSin } = await supabase
        .from("turno_productos")
        .select("codigo, descripcion, cantidad, turno_id")
        .in("turno_id", turnoIdsPendientes);

      if (errProdsSin || !prodsSin?.length) {
        setProductosNoIngresados([]);
      } else {
        // Optimización: Crear un mapa para búsqueda O(1)
        const turnosMap = turnosSinLlegar.reduce((acc, t) => ({ ...acc, [t.id]: t }), {});

        const consolidadosNo = prodsSin.map(p => {
          const t = turnosMap[p.turno_id];
          return {
            ...p,
            empresa: t?.proveedores?.empresa || "Sin empresa",
            fecha_turno: t?.fecha || "",
            hora_turno: t?.hora_inicio || "",
            anden: t?.anden || ""
          };
        });

        consolidadosNo.sort((a,b) => new Date(`${a.fecha_turno}T${a.hora_turno}`).getTime() - new Date(`${b.fecha_turno}T${b.hora_turno}`).getTime());
        setProductosNoIngresados(consolidadosNo);
      }
    }

    setLoadingIngresos(false);
  }

  async function guardarRecomendaciones() {
    if (!permisosActivos.configuracion) return;
    await supabase.from("configuracion").upsert(
      { clave: "recomendaciones", valor: recomendacionesGenerales },
      { onConflict: "clave" }
    );
    alert("Recomendaciones guardadas");
  }

  async function aprobarAdmin(adminId) {
    if (!permisosActivos.admins) return;
    await supabase.from("admins").update({ activo: true }).eq("id", adminId);
    const { data } = await supabase.from("admins").select("*").eq("activo", false);
    setAdminsPendientes(data || []);
  }

  async function rechazarAdmin(adminId) {
    if (!permisosActivos.admins) return;
    await supabase.from("admins").delete().eq("id", adminId);
    const { data } = await supabase.from("admins").select("*").eq("activo", false);
    setAdminsPendientes(data || []);
  }

  async function aprobarProveedor(proveedorId) {
    if (!permisosActivos.admins) return;
    await supabase.from("proveedores").update({ activo: true }).eq("id", proveedorId);
    const { data } = await supabase.from("proveedores").select("*").eq("activo", false);
    setProveedoresPendientes(data || []);
  }

  async function rechazarProveedor(proveedorId) {
    if (!permisosActivos.admins) return;
    await supabase.from("proveedores").delete().eq("id", proveedorId);
    const { data } = await supabase.from("proveedores").select("*").eq("activo", false);
    setProveedoresPendientes(data || []);
  }

  async function crearAdmin(e) {
    e.preventDefault();
    if (!esSuperadmin(permisos, adminRole)) return;
    
    setCreandoAdmin(true);
    setMensajeCrearAdmin({ type: "", text: "" });

    try {
      const { data: existingAdmin } = await supabase
        .from("admins")
        .select("id")
        .eq("email", nuevoAdminEmail)
        .maybeSingle();
      
      if (existingAdmin) {
        setMensajeCrearAdmin({ type: "error", text: "Este email ya tiene una cuenta de admin." });
        setCreandoAdmin(false);
        return;
      }

      const { data: existingProvider } = await supabase
        .from("proveedores")
        .select("id")
        .eq("email", nuevoAdminEmail)
        .maybeSingle();
      
      if (existingProvider) {
        setMensajeCrearAdmin({ type: "error", text: "Este email ya está registrado como proveedor." });
        setCreandoAdmin(false);
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: nuevoAdminEmail,
        password: Math.random().toString(36).slice(-8) + "A1!"
      });

      if (signUpError) {
        setMensajeCrearAdmin({ type: "error", text: signUpError.message });
        setCreandoAdmin(false);
        return;
      }

      const newUser = signUpData?.user;
      
      if (!newUser) {
        setMensajeCrearAdmin({ type: "error", text: "Error al crear usuario. Verifica que el email sea válido." });
        setCreandoAdmin(false);
        return;
      }

      if (newUser) {
        const permisosDefault = nuevoAdminRol === "superadmin" 
          ? '{"ver": ["turnos", "configuracion", "admins", "checkin", "ingresos", "kpis"], "editar": ["turnos", "configuracion", "admins", "checkin", "ingresos", "kpis"]}'
          : '{"ver": ["turnos"], "editar": ["turnos"]}';

        await supabase.from("admins").insert({
          usuario_id: newUser.id,
          nombre: nuevoAdminNombre,
          email: nuevoAdminEmail,
          rol: nuevoAdminRol,
          activo: true,
          permisos: permisosDefault
        });

        setMensajeCrearAdmin({ type: "success", text: `Admin creado exitosamente. Se envió email a ${nuevoAdminEmail} para establecer contraseña.` });
        setNuevoAdminEmail("");
        setNuevoAdminNombre("");
        setNuevoAdminRol("admin");
        setShowCrearAdmin(false);
        
        const { data: admins } = await supabase.from("admins").select("*").eq("activo", true);
        setTodosAdmins(admins || []);
      }
    } catch (error) {
      setMensajeCrearAdmin({ type: "error", text: "Error al crear admin: " + error.message });
    }

    setCreandoAdmin(false);
  }

  async function actualizarEstado(turnoId, nuevoEstado) {
    const ahora = new Date();
    const updateData = { estado: nuevoEstado, updated_at: ahora.toISOString() };

    if (nuevoEstado === 'confirmado') {
      updateData.fecha_llegada = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`;
      updateData.hora_llegada = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
    }

    await supabase.from("turnos").update(updateData).eq("id", turnoId);
    loadTurnos();
  }

  async function actualizarIndicaciones(turnoId, nuevasIndicaciones) {
    if (!permisosActivos.turnos) return;
    await supabase.from("turnos")
      .update({ indicaciones: nuevasIndicaciones, updated_at: new Date().toISOString() })
      .eq("id", turnoId);
  }

  async function abrirComprobanteHTML(turnoId) {
    setImprimiendo(turnoId);
    try {
      const { data: turno } = await supabase.from("turnos").select("*").eq("id", turnoId).single();
      const { data: proveedor } = await supabase.from("proveedores").select("*").eq("id", turno.proveedor_id).single();
      const { data: productos } = await supabase.from("turno_productos").select("*").eq("turno_id", turno.id);
      const { data: config } = await supabase.from("configuracion").select("valor").eq("clave", "recomendaciones").single();

      const html = generarComprobanteHTML(
        turno,
        proveedor || {},
        productos || [],
        turno.indicaciones || "",
        config?.valor || "",
        proveedor?.email
      );

      const printWindow = window.open("", "_blank");
      printWindow.document.write(html);
      printWindow.document.close();
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
    return <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-main)" }}><div className="spinner"></div></div>;
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
  
  const turnosFiltrados = turnos.filter((t) => {
    if (!busqueda) return true;
    const texto = busqueda.toLowerCase();
    return (
      t.id?.toLowerCase().includes(texto) ||
      t.proveedores?.empresa?.toLowerCase().includes(texto) ||
      t.proveedores?.email?.toLowerCase().includes(texto) ||
      t.hora_inicio?.toLowerCase().includes(texto) ||
      String(t.anden)?.includes(texto) ||
      t.estado?.toLowerCase().includes(texto)
    );
  });

  const productosIngresadosFiltrados = productosIngresados.filter(p => {
    if (!filtrosIngresados.codigo) return true;
    return p.codigo && p.codigo.toLowerCase().includes(filtrosIngresados.codigo.toLowerCase());
  });

  const productosNoIngresadosFiltrados = productosNoIngresados.filter(p => {
    if (!filtrosNoIngresados.codigo) return true;
    return p.codigo && p.codigo.toLowerCase().includes(filtrosNoIngresados.codigo.toLowerCase());
  });

  async function handleScan(data) {
    if (!permisosActivos.checkin) {
      setMensaje("No tienes permisos para hacer check-in");
      return;
    }
    if (scanBloqueado) {
      return;
    }
    if (!data || typeof data !== 'string') {
      setMensaje("Escanea o ingresa un código válido");
      return;
    }
    const turnoId = data.trim();
    console.log("handleScan recibido:", turnoId);
    if (turnoId.length < 8) {
      setMensaje("El código debe tener al menos 8 caracteres");
      return;
    }
    
    setScanBloqueado(true);
    try {
      const idBusqueda = turnoId.toLowerCase().substring(0, 8);
      console.log("Buscando con prefijo:", idBusqueda);
      
      const { data: todosTurnos, error } = await supabase
        .from("turnos")
        .select("*, proveedores:proveedor_id (empresa)")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) {
        console.error("Error buscando turno:", error);
        setMensaje("Error en la búsqueda. Intenta de nuevo.");
        setScanBloqueado(false);
        return;
      }

      const turnosEncontrados = todosTurnos?.filter(t => 
        t.id.toLowerCase().startsWith(idBusqueda)
      ) || [];

      if (turnosEncontrados.length === 0) {
        setMensaje(`Turno no encontrado: ${idBusqueda}`);
        setScanBloqueado(false);
        return;
      }

      const turnoBuscado = turnosEncontrados[0];
      if (turnoBuscado.estado !== "pendiente") {
        const nombreEmpresa = turnoBuscado.proveedores?.empresa || "Sin empresa";
        setMensaje(`${nombreEmpresa}\nEl turno ya está: ${turnoBuscado.estado.toUpperCase()}`);
        setScanBloqueado(false);
        return;
      }

      const ahoraDate = new Date();
      const fechaHoy = `${ahoraDate.getFullYear()}-${String(ahoraDate.getMonth() + 1).padStart(2, '0')}-${String(ahoraDate.getDate()).padStart(2, '0')}`;
      const horaActualLocal = `${String(ahoraDate.getHours()).padStart(2, '0')}:${String(ahoraDate.getMinutes()).padStart(2, '0')}`;
      const esTurnoHoy = turnoBuscado.fecha === fechaHoy;

      let nuevoEstado = "confirmado";
      if (esTurnoHoy) {
        const horaInicio = turnoBuscado.hora_inicio.slice(0, 5);
        const [hInicio, mInicio] = horaInicio.split(":").map(Number);
        const [hActual, mActual] = horaActualLocal.split(":").map(Number);
        const minutosInicio = hInicio * 60 + mInicio;
        const minutosActual = hActual * 60 + mActual;
        if (minutosActual > minutosInicio) nuevoEstado = "atrasado";
      } else if (fechaHoy > turnoBuscado.fecha) {
        nuevoEstado = "atrasado";
      }

      await supabase.from("turnos").update({
        estado: nuevoEstado,
        fecha_llegada: fechaHoy,
        hora_llegada: horaActualLocal,
        recibido_por: session.user.email,
        updated_at: ahoraDate.toISOString()
      }).eq("id", turnoBuscado.id);

      const nombreEmpresa = turnoBuscado.proveedores?.empresa || "Sin empresa";
      setMensaje(`${nombreEmpresa} - Turno ${nuevoEstado.toUpperCase()}\nRecibido por: ${session.user.email}`);
      loadTurnos();
      setTimeout(() => setScanBloqueado(false), 3000);
    } catch (error) {
      console.error(error);
      setMensaje("Error al procesar. Verifica el código e intenta nuevamente.");
      setScanBloqueado(false);
    }
  }

  const turnosRecibidos = turnosFiltrados.filter(t => t.recibido_por);
  const kpisPorUsuario = turnosRecibidos.reduce((acc, turno) => {
    const usuario = turno.recibido_por || "Desconocido";
    if (!acc[usuario]) acc[usuario] = [];
    acc[usuario].push(turno);
    return acc;
  }, {});

  const turnosSinRecibir = turnosFiltrados.filter(t => !t.recibido_por && t.estado === "pendiente");

  const puedeEditarActivo = (modulo) => esSuperadmin(permisos, adminRole) || puedeEditar(modulo, permisos);

  const permisosActivos = {
    turnos: puedeEditarActivo("turnos"),
    ingresos: puedeEditarActivo("ingresos"),
    kpis: puedeEditarActivo("kpis"),
    checkin: puedeEditarActivo("checkin"),
    configuracion: puedeEditarActivo("configuracion"),
    admins: puedeEditarActivo("admins")
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-main)" }}>
      <Navigation session={session} onLogout={handleLogout} isAdmin={true} />

      <main className="main-content">
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Panel de Administración</h2>
          </div>

          <div className="admin-tabs">
            {["turnos", "ingresos", "kpis", "checkin", "config", "admins"].map(tab => {
              
              let permisoNecesario = "";
              if (tab === "turnos") permisoNecesario = "turnos";
              if (tab === "ingresos") permisoNecesario = "ingresos"; 
              if (tab === "kpis") permisoNecesario = "kpis";    
              if (tab === "checkin") permisoNecesario = "checkin"; 
              if (tab === "config") permisoNecesario = "configuracion"; 
              if (tab === "admins") permisoNecesario = "admins";   

              const tieneAcceso = esSuperadmin(permisos, adminRole) || puedeVer(permisoNecesario, permisos);
              if (!tieneAcceso) return null;
              
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`admin-tab ${activeTab === tab ? "admin-tab-active" : ""}`}
                >
                  {tab === "turnos" && "Turnos"}
                  {tab === "ingresos" && "Ingreso Productos"}
                  {tab === "kpis" && "KPIs Recepción"}
                  {tab === "checkin" && "Check-in QR"}
                  {tab === "config" && "Configuración"}
                  {tab === "admins" && `Usuarios (${adminsPendientes.length + proveedoresPendientes.length})`}
                </button>
              );
            })}
          </div>

          {activeTab === "turnos" && (
            <>
              <div className="admin-stats">
                <div className="stat-card"><div className="stat-number">{stats.total}</div><div className="stat-label">Total Turnos</div></div>
                <div className="stat-card"><div className="stat-number">{stats.hoy}</div><div className="stat-label">Hoy</div></div>
                <div className="stat-card"><div className="stat-number">{stats.semana}</div><div className="stat-label">Esta Semana</div></div>
                <div 
                  className="stat-card" 
                  style={{ cursor: "pointer" }}
                  onClick={() => {
                    const hoyDate = new Date();
                    setFiltroFecha(`${hoyDate.getFullYear()}-${String(hoyDate.getMonth() + 1).padStart(2, '0')}-${String(hoyDate.getDate()).padStart(2, '0')}`);
                    setFiltroEstado("pendiente");
                  }}
                  title="Ver pendientes de hoy"
                >
                  <div className="stat-number" style={{ color: "var(--warning)" }}>{stats.pendientes}</div>
                  <div className="stat-label">Pendientes</div>
                </div>
              </div>

              <div className="admin-filters">
                <input type="text" placeholder="Buscar empresa, email, hora..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} className="form-input" />
                <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="form-input" />
                <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="form-input">
                  <option value="">Todos los estados</option>
                  <option value="pendiente">Pendiente</option>                  
                  <option value="confirmado">Confirmado</option>
                  <option value="atrasado">Atrasado</option>
                  <option value="cancelado">Cancelado</option>
                </select>
                {(filtroFecha || filtroEstado) && <button onClick={() => { setFiltroFecha(""); setFiltroEstado(""); }} className="btn btn-secondary btn-sm">Limpiar filtros</button>}
              </div>

              <div className="admin-table">
                <table>
                  <thead>
                    <tr>
                      <th>Turno</th>
                      <th>Fecha</th>
                      <th>Hora</th>
                      <th>Empresa</th>
                      <th>Andén</th>
                      <th>Archivos</th>
                      <th>Indicaciones</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {turnosFiltrados.map((turno) => {
                      const coloresEstado = obtenerColoresEstado(turno.estado || "pendiente");
                      return (
                        <tr key={turno.id}>
                          <td>
                            <span 
                              onClick={() => abrirComprobanteHTML(turno.id)}
                              style={{ fontWeight: 600, fontFamily: "monospace", color: "var(--primary)", cursor: "pointer", textDecoration: "underline" }}
                              title="Ver Comprobante del Turno"
                            >
                              #{turno.id?.slice(0, 8).toUpperCase()}
                            </span>
                          </td>
                          <td>{formatearFechaCorta(turno.fecha)}</td>
                          <td style={{ fontWeight: 600 }}>{turno.hora_inicio}</td>
                          <td>
                            <strong>{turno.proveedores?.empresa || "Sin empresa"}</strong><br />
                            <small style={{ color: "var(--text-muted)" }}>{turno.proveedores?.email}</small>
                          </td>
                          <td>{turno.anden}</td>
                          <td>
                            {turno.turno_archivos && turno.turno_archivos.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                {turno.turno_archivos.map((archivo) => (
                                  <a key={archivo.id} href={archivo.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontSize: "0.75rem", textDecoration: "underline" }} title={archivo.nombre_archivo}>Ver archivo</a>
                                ))}
                              </div>
                            ) : (<span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Ninguno</span>)}
                          </td>
                          <td>
                            {permisosActivos.turnos ? (
                              <input
                                type="text"
                                defaultValue={turno.indicaciones || ""}
                                placeholder="Agregar indicaciones..."
                                onBlur={(e) => actualizarIndicaciones(turno.id, e.target.value)}
                                className="form-input"
                                style={{ fontSize: "0.75rem", padding: "0.25rem 0.5rem" }}
                              />
                            ) : (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{turno.indicaciones || "-"}</span>
                            )}
                          </td>
                          <td>
                            {permisosActivos.turnos ? (
                              <select
                                value={turno.estado || "pendiente"}
                                onChange={(e) => actualizarEstado(turno.id, e.target.value)}
                                style={{ backgroundColor: coloresEstado.bg, color: coloresEstado.text, border: "none", fontWeight: "bold", padding: "0.3rem 0.5rem", borderRadius: "6px", fontSize: "0.85rem", cursor: "pointer", outline: "none" }}
                              >
                                <option value="pendiente">Pendiente</option>
                                <option value="confirmado">Confirmado</option>
                                <option value="atrasado">Atrasado</option>
                                <option value="cancelado">Cancelado</option>
                              </select>
                            ) : (
                              <span style={{ backgroundColor: coloresEstado.bg, color: coloresEstado.text, fontWeight: "bold", padding: "0.3rem 0.6rem", borderRadius: "6px", fontSize: "0.85rem", display: "inline-block" }}>
                                {turno.estado?.replace("_", " ")?.toUpperCase()}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {turnosFiltrados.length === 0 && (
                <div className="empty-state">
                  <p className="empty-title">No hay turnos</p>
                  <p className="empty-description">No se encontraron turnos con los filtros seleccionados.</p>
                </div>
              )}
            </>
          )}

{activeTab === "ingresos" && (
            <div style={{ padding: "1.5rem" }}>
              {!permisosActivos.ingresos && (
                <div style={{ background: "#fef3c7", color: "#92400e", padding: "0.75rem", borderRadius: "8px", marginBottom: "1rem", textAlign: "center", fontWeight: "500" }}>
                  Modo solo lectura - No tienes permisos para editar
                </div>
              )}

              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "1px solid var(--border)", paddingBottom: "1rem" }}>
                <button
                  onClick={() => setTablaIngresosActiva("ingresados")}
                  className={`btn ${tablaIngresosActiva === "ingresados" ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontWeight: 600 }}
                >
                   Productos Ingresados
                </button>
                <button
                  onClick={() => setTablaIngresosActiva("no_ingresados")}
                  className={`btn ${tablaIngresosActiva === "no_ingresados" ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontWeight: 600, background: tablaIngresosActiva === "no_ingresados" ? "": "", color: tablaIngresosActiva === "no_ingresados" ? "white" : "" }}
                >
                  Productos NO Ingresados
                </button>
              </div>

              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "flex-end", marginBottom: "1.5rem", background: "white", padding: "1rem", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div style={{ flex: "1", minWidth: "200px" }}>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>Filtrar por Código</label>
                  <input
                    type="text"
                    placeholder="Ej. PRD-001..."
                    value={tablaIngresosActiva === "ingresados" ? filtrosIngresados.codigo : filtrosNoIngresados.codigo}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (tablaIngresosActiva === "ingresados") setFiltrosIngresados(prev => ({ ...prev, codigo: val }));
                      else setFiltrosNoIngresados(prev => ({ ...prev, codigo: val }));
                    }}
                    className="form-input"
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>Fecha Desde</label>
                  <input
                    type="date"
                    value={tablaIngresosActiva === "ingresados" ? filtrosIngresados.fechaInicio : filtrosNoIngresados.fechaInicio}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (tablaIngresosActiva === "ingresados") setFiltrosIngresados(prev => ({ ...prev, fechaInicio: val }));
                      else setFiltrosNoIngresados(prev => ({ ...prev, fechaInicio: val }));
                    }}
                    className="form-input"
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-muted)", display: "block", marginBottom: "0.4rem" }}>Fecha Hasta</label>
                  <input
                    type="date"
                    value={tablaIngresosActiva === "ingresados" ? filtrosIngresados.fechaFin : filtrosNoIngresados.fechaFin}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (tablaIngresosActiva === "ingresados") setFiltrosIngresados(prev => ({ ...prev, fechaFin: val }));
                      else setFiltrosNoIngresados(prev => ({ ...prev, fechaFin: val }));
                    }}
                    className="form-input"
                  />
                </div>
              </div>


              {loadingIngresos ? (
                <div className="spinner" style={{ margin: "3rem auto" }}></div>
              ) : (
                <div className="admin-table" style={{ background: "white", borderRadius: "8px", border: "1px solid var(--border)", overflow: "hidden" }}>
                  <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: tablaIngresosActiva === "ingresados" ? "var(--neutral-light)" : "#fef3c7", borderBottom: "2px solid var(--border)" }}>
                        <th style={{ padding: "1rem" }}>Código</th>
                        <th style={{ padding: "1rem" }}>Descripción</th>
                        <th style={{ padding: "1rem", textAlign: "center" }}>Cantidad</th>
                        {tablaIngresosActiva === "ingresados" ? (
                          <>
                            <th style={{ padding: "1rem" }}>Usuario (Recepción)</th>
                            <th style={{ padding: "1rem" }}>Llegada</th>
                          </>
                        ) : (
                          <>
                            <th style={{ padding: "1rem" }}>Empresa</th>
                            <th style={{ padding: "1rem" }}>Fecha/Hora Turno</th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody>
                      {tablaIngresosActiva === "ingresados" && productosIngresadosFiltrados.map((p, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "1rem", fontWeight: 600}}>{p.codigo || "S/C"}</td>
                          <td style={{ padding: "1rem" }}>{p.descripcion}</td>
                          <td style={{ padding: "1rem", textAlign: "center", fontWeight: "bold" }}>{p.cantidad}</td>
                          <td style={{ padding: "1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>{p.recibido_por}</td>
                          <td style={{ padding: "1rem", fontFamily: "monospace", fontSize: "0.85rem" }}>
                            {p.fecha_llegada ? formatearFechaCorta(p.fecha_llegada) : "N/A"} <br/>
                            <span style={{ color: "var(--text-muted)" }}>{p.hora_llegada || ""}</span>
                          </td>
                        </tr>
                      ))}
                      {tablaIngresosActiva === "ingresados" && productosIngresadosFiltrados.length === 0 && (
                        <tr><td colSpan="5" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>No hay productos ingresados en estas fechas.</td></tr>
                      )}

                      {tablaIngresosActiva === "no_ingresados" && productosNoIngresadosFiltrados.map((p, idx) => (
                        <tr key={idx} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "1rem", fontWeight: 600, }}>{p.codigo || "S/C"}</td>
                          <td style={{ padding: "1rem" }}>{p.descripcion}</td>
                          <td style={{ padding: "1rem", textAlign: "center", fontWeight: "bold" }}>{p.cantidad}</td>
                          <td style={{ padding: "1rem", color: "var(--text-muted)", fontSize: "0.9rem" }}>{p.empresa}</td>
                          <td style={{ padding: "1rem", fontFamily: "monospace", fontSize: "0.85rem" }}>
                            {p.fecha_turno ? formatearFechaCorta(p.fecha_turno) : ""} <br/>
                            <span style={{ color: "var(--text-muted)" }}>{p.hora_turno || ""}</span>
                            {p.anden && <span style={{ marginLeft: "0.5rem", background: "var(--neutral-light)", padding: "0.1rem 0.4rem", borderRadius: "4px", fontSize: "0.75rem", color: "var(--text)" }}>Andén {p.anden}</span>}
                          </td>
                        </tr>
                      ))}
                      {tablaIngresosActiva === "no_ingresados" && productosNoIngresadosFiltrados.length === 0 && (
                        <tr><td colSpan="5" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>No hay productos pendientes en estas fechas.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === "kpis" && (
            <div style={{ padding: "1.5rem" }}>
              {!permisosActivos.kpis && (
                <div style={{ background: "#fef3c7", color: "#92400e", padding: "0.75rem", borderRadius: "8px", marginBottom: "1rem", textAlign: "center" }}>
                  Modo solo lectura - No tienes permisos para editar
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
                <div>
                  <h3 style={{ fontSize: "1.2rem", marginBottom: "0.25rem" }}>KPIs de Recepción</h3>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
                    Seguimiento de check-in por usuario y turnos pendientes.
                  </p>
                </div>
                <div style={{ display: "flex", gap: "1rem" }}>
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Fecha del Turno</label>
                    <input
                      type="date"
                      value={filtroFecha}
                      onChange={(e) => setFiltroFecha(e.target.value)}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: "0.8rem", fontWeight: 600, display: "block", marginBottom: "0.25rem" }}>Estado</label>
                    <select
                      value={filtroEstado}
                      onChange={(e) => setFiltroEstado(e.target.value)}
                      className="form-input"
                    >
                      <option value="">Todos</option>
                      <option value="pendiente">Pendientes</option>
                      <option value="confirmado">Confirmados</option>
                      <option value="atrasado">Atrasados</option>
                      <option value="cancelado">Cancelados</option>
                    </select>
                  </div>
                  {(filtroFecha || filtroEstado) && (
                    <div style={{ display: "flex", alignItems: "flex-end" }}>
                      <button onClick={() => { setFiltroFecha(""); setFiltroEstado(""); }} className="btn btn-secondary btn-sm" style={{ height: "42px" }}>
                        Limpiar
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div style={{ marginBottom: "2rem" }}>
                <h4 style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--text)" }}>
                  Turnos Recibidos
                </h4>
                <div style={{ display: "grid", gap: "1rem" }}>
                  {Object.entries(kpisPorUsuario).map(([usuario, listaTurnos]) => (
                    <div key={usuario} style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "white", overflow: "hidden" }}>
                      <div 
                        style={{ display: "flex", justifyContent: "space-between", padding: "1rem", cursor: "pointer", background: usuarioExpandido === `recibido_${usuario}` ? "#f8fafc" : "white" }}
                        onClick={() => setUsuarioExpandido(usuarioExpandido === `recibido_${usuario}` ? null : `recibido_${usuario}`)}
                      >
                        <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>{usuario}</span>
                        <span style={{ fontWeight: 600, color: "var(--primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                          {listaTurnos.length} turnos
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{usuarioExpandido === `recibido_${usuario}` ? '▲' : '▼'}</span>
                        </span>
                      </div>

                      {usuarioExpandido === `recibido_${usuario}` && (
                        <div style={{ borderTop: "1px solid var(--border)", padding: "1rem", background: "#f8fafc" }}>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", fontSize: "0.85rem", textAlign: "left", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                                  <th style={{ padding: "0.5rem" }}>ID Turno</th>
                                  <th style={{ padding: "0.5rem" }}>Empresa</th>
                                  <th style={{ padding: "0.5rem" }}>Fecha Turno</th>
                                  <th style={{ padding: "0.5rem" }}>Check-in</th>
                                </tr>
                              </thead>
                              <tbody>
                                {listaTurnos.map(t => {
                                  const cEstado = obtenerColoresEstado(t.estado);
                                  return (
                                    <tr key={t.id} style={{ borderBottom: "1px solid #eee" }}>
                                      <td style={{ padding: "0.5rem", fontFamily: "monospace", fontWeight: 600 }}>
                                        <span 
                                          onClick={() => abrirComprobanteHTML(t.id)}
                                          style={{ color: "var(--primary)", cursor: "pointer", textDecoration: "underline" }}
                                          title="Abrir Comprobante"
                                        >
                                          #{t.id.slice(0,8).toUpperCase()}
                                        </span>
                                      </td>
                                      <td style={{ padding: "0.5rem" }}>{t.proveedores?.empresa || "N/A"}</td>
                                      <td style={{ padding: "0.5rem" }}>{formatearFechaCorta(t.fecha)} {t.hora_inicio}</td>
                                      <td style={{ padding: "0.5rem" }}>
                                        <span style={{ background: cEstado.bg, color: cEstado.text, padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.7rem", fontWeight: "bold" }}>
                                          {t.estado.toUpperCase()}
                                        </span>
                                        <br/>
                                        <small style={{ color: "var(--text-muted)" }}>
                                          {t.fecha_llegada ? formatearFechaCorta(t.fecha_llegada) : ""} {t.hora_llegada || ""}
                                        </small>
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {Object.keys(kpisPorUsuario).length === 0 && (
                    <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", background: "#f8fafc", borderRadius: "8px", border: "1px dashed var(--border)" }}>
                      No hay turnos recibidos con los filtros actuales.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 style={{ fontSize: "1rem", marginBottom: "1rem", color: "var(--text)" }}>
                  Turnos Pendientes
                </h4>
                <div style={{ display: "grid", gap: "1rem" }}>
                  {turnosSinRecibir.length > 0 ? (
                    <div style={{ border: "1px solid var(--border)", borderRadius: "8px", background: "white", overflow: "hidden" }}>
                      <div 
                        style={{ display: "flex", justifyContent: "space-between", padding: "1rem", cursor: "pointer", background: usuarioExpandido === "pendientes" ? "#f8fafc" : "white" }}
                        onClick={() => setUsuarioExpandido(usuarioExpandido === "pendientes" ? null : "pendientes")}
                      >
                        <span style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                          <span style={{ background: "#fef3c7", color: "#92400e", padding: "0.2rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>
                            PENDIENTE
                          </span>
                          Turnos sin recibir
                        </span>
                        <span style={{ fontWeight: 600, color: "var(--primary)", display: "flex", alignItems: "center", gap: "8px" }}>
                          {turnosSinRecibir.length} turnos
                          <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>{usuarioExpandido === "pendientes" ? '▲' : '▼'}</span>
                        </span>
                      </div>

                      {usuarioExpandido === "pendientes" && (
                        <div style={{ borderTop: "1px solid var(--border)", padding: "1rem", background: "#f8fafc" }}>
                          <div style={{ overflowX: "auto" }}>
                            <table style={{ width: "100%", fontSize: "0.85rem", textAlign: "left", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ color: "var(--text-muted)", borderBottom: "1px solid var(--border)" }}>
                                  <th style={{ padding: "0.5rem" }}>ID Turno</th>
                                  <th style={{ padding: "0.5rem" }}>Empresa</th>
                                  <th style={{ padding: "0.5rem" }}>Fecha</th>
                                  <th style={{ padding: "0.5rem" }}>Andén</th>
                                </tr>
                              </thead>
                              <tbody>
                                {turnosSinRecibir.map(t => (
                                  <tr key={t.id} style={{ borderBottom: "1px solid #eee" }}>
                                    <td style={{ padding: "0.5rem", fontFamily: "monospace", fontWeight: 600 }}>
                                      <span 
                                        onClick={() => abrirComprobanteHTML(t.id)}
                                        style={{ color: "var(--primary)", cursor: "pointer", textDecoration: "underline" }}
                                        title="Abrir Comprobante"
                                      >
                                        #{t.id.slice(0,8).toUpperCase()}
                                      </span>
                                    </td>
                                    <td style={{ padding: "0.5rem" }}>{t.proveedores?.empresa || "N/A"}</td>
                                    <td style={{ padding: "0.5rem" }}>{formatearFechaCorta(t.fecha)} {t.hora_inicio}</td>
                                    <td style={{ padding: "0.5rem" }}>{t.anden}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ padding: "1.5rem", textAlign: "center", color: "var(--text-muted)", background: "#f8fafc", borderRadius: "8px", border: "1px dashed var(--border)" }}>
                      No hay turnos pendientes sin recibir.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === "checkin" && (
            <div style={{ padding: "1.5rem" }}>
              {!permisosActivos.checkin && (
                <div style={{ background: "#fef3c7", color: "#92400e", padding: "0.75rem", borderRadius: "8px", marginBottom: "1rem", textAlign: "center" }}>
                  Modo solo lectura - No tienes permisos para editar
                </div>
              )}
              <div style={{ textAlign: "center", marginBottom: "3rem" }}>
                <h2>Check-in de Turnos</h2>
                <p style={{ color: "var(--text-muted)" }}>Escanea el QR o ingresa el ID del turno manualmente</p>

                {mensaje && (
                  <div style={{ 
                    marginBottom: "1rem", padding: "0.75rem", borderRadius: "8px",
                    background: mensaje.includes("") ? "#dcfce7" : mensaje.includes("ATRASADO") ? "#fef3c7" : "#fee2e2",
                    color: "#333", maxWidth: "500px", margin: "1rem auto",
                    whiteSpace: "pre-line",
                    textAlign: "center"
                  }}>
                    {mensaje}
                  </div>
                )}

                <div style={{ maxWidth: 400, margin: "1rem auto" }}>
                  <QrScanner onScan={handleScan} pauseAfterScan={true} onResume={() => setScanBloqueado(false)} />
                </div>
              </div>
            </div>
          )}

          {activeTab === "config" && (
            <div className="config-section">
              <h3>Recomendaciones Generales</h3>
              <p className="card-description" style={{ marginBottom: "1rem" }}>Estas recomendaciones serán visibles para todos los proveedores al agendar.</p>
              <textarea value={recomendacionesGenerales} onChange={(e) => setRecomendacionesGenerales(e.target.value)} className="form-input" placeholder="Ej: Traer documentos de identidad, llegar 15 min antes, etc." rows={5} />
              
              {permisosActivos.configuracion && (
                <button onClick={guardarRecomendaciones} className="btn btn-primary" style={{ marginTop: "1rem" }}>Guardar Recomendaciones</button>
              )}
            </div>
          )}

          {activeTab === "admins" && (
            <div className="admins-section">
              {esSuperadmin(permisos, adminRole) && (
                <div style={{ marginBottom: "2rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
                    <h3>Administradores del Sistema</h3>
                    <button onClick={() => setShowCrearAdmin(!showCrearAdmin)} className="btn btn-primary btn-sm">
                      {showCrearAdmin ? "Cancelar" : "+ Nuevo Admin"}
                    </button>
                  </div>
                  
                  {showCrearAdmin && (
                    <form onSubmit={crearAdmin} style={{ background: "var(--neutral-light)", padding: "1rem", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                      <div style={{ display: "grid", gap: "0.75rem" }}>
                        <div>
                          <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Nombre</label>
                          <input type="text" value={nuevoAdminNombre} onChange={(e) => setNuevoAdminNombre(e.target.value)} className="form-input" placeholder="Nombre del admin" required />
                        </div>
                        <div>
                          <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Email</label>
                          <input type="email" value={nuevoAdminEmail} onChange={(e) => setNuevoAdminEmail(e.target.value)} className="form-input" placeholder="email@empresa.com" required />
                        </div>
                        <div>
                          <label style={{ fontSize: "0.8rem", fontWeight: 600 }}>Rol</label>
                          <select value={nuevoAdminRol} onChange={(e) => setNuevoAdminRol(e.target.value)} className="form-input">
                            <option value="admin">Admin</option>
                            {esSuperadmin(permisos, adminRole) && <option value="superadmin">Superadmin</option>}
                          </select>
                        </div>
                        <button type="submit" disabled={creandoAdmin} className="btn btn-primary">
                          {creandoAdmin ? "Creando..." : "Crear Admin"}
                        </button>
                        {mensajeCrearAdmin.text && (
                          <div className={`alert ${mensajeCrearAdmin.type === "error" ? "alert-error" : "alert-success"}`}>
                            {mensajeCrearAdmin.text}
                          </div>
                        )}
                      </div>
                    </form>
                  )}
                  
                  {todosAdmins.length > 0 && (
                    <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                      {todosAdmins.map((admin) => (
                        <div key={admin.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.75rem", background: "white", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                          <div>
                            <strong>{admin.nombre}</strong>
                            <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem", background: admin.rol === "superadmin" ? "var(--primary)" : "var(--secondary)", color: "white", padding: "0.1rem 0.4rem", borderRadius: "4px" }}>{admin.rol}</span>
                            <br />
                            <small style={{ color: "var(--text-muted)" }}>{admin.email}</small>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <h3>Admins Pendientes de Aprobación</h3>
              {adminsPendientes.length === 0 ? (
                <p className="empty-description" style={{ marginTop: "1rem" }}>No hay solicitudes de acceso pendientes.</p>
              ) : (
                <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {adminsPendientes.map((admin) => (
                    <div key={admin.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "var(--neutral-light)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                      <div>
                        <strong>{admin.nombre}</strong><br />
                        <small style={{ color: "var(--text-muted)" }}>{admin.email}</small><br />
                        <span style={{ fontSize: "0.7rem", background: "var(--warning-light)", color: "#92400e", padding: "0.15rem 0.5rem", borderRadius: "999px", display: "inline-block", marginTop: "0.25rem" }}>{admin.rol}</span>
                      </div>
                      

                      {permisosActivos.admins && (
                        <div style={{ display: "flex", gap: "0.5rem" }}>
                          <button onClick={() => aprobarAdmin(admin.id)} className="btn btn-primary btn-sm">Aprobar</button>
                          <button onClick={() => rechazarAdmin(admin.id)} className="btn btn-secondary btn-sm" style={{ color: "var(--danger)" }}>Rechazar</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginTop: "2rem", borderTop: "2px solid var(--border)", paddingTop: "1.5rem" }}>
                <h3>Proveedores Pendientes de Aprobacion</h3>
                {proveedoresPendientes.length === 0 ? (
                  <p className="empty-description" style={{ marginTop: "1rem" }}>No hay solicitudes de proveedores pendientes.</p>
                ) : (
                  <div style={{ marginTop: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    {proveedoresPendientes.map((prov) => (
                      <div key={prov.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "1rem", background: "var(--neutral-light)", borderRadius: "var(--radius)", border: "1px solid var(--border)" }}>
                        <div>
                          <strong>{prov.empresa}</strong><br />
                          <small style={{ color: "var(--text-muted)" }}>{prov.email}</small><br />
                          {prov.telefono && <small style={{ color: "var(--text-muted)" }}>Tel: {prov.telefono}</small>}
                        </div>

                        {permisosActivos.admins && (
                          <div style={{ display: "flex", gap: "0.5rem" }}>
                            <button onClick={() => aprobarProveedor(prov.id)} className="btn btn-primary btn-sm">Aprobar</button>
                            <button onClick={() => rechazarProveedor(prov.id)} className="btn btn-secondary btn-sm" style={{ color: "var(--danger)" }}>Rechazar</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

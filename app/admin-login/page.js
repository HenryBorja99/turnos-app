"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../../lib/config";
import { useRouter } from "next/navigation";
import Link from "next/link";

const supabase = (supabaseConfig.url && supabaseConfig.url.startsWith('http'))
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [nombre, setNombre] = useState("");
  const router = useRouter();

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!email || !password) {
      setError("Por favor completa todos los campos");
      setLoading(false);
      return;
    }


    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      if (isRegister) {
        const { error: signUpError } = await supabase.auth.signUp({ email, password });
        if (signUpError) {
          setError(signUpError.message);
          setLoading(false);
          return;
        }
        const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
        if (loginError) {
          setError(loginError.message);
          setLoading(false);
          return;
        }
      } else {
        setError("Usuario o contraseña incorrectos");
        setLoading(false);
        return;
      }
    }

    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      setError("No se pudo obtener el usuario");
      setLoading(false);
      return;
    }

    const { data: adminExistente } = await supabase
      .from("admins")
      .select("id, activo, rol")
      .eq("usuario_id", user.id)
      .single();

    if (!adminExistente) {
      const { count } = await supabase
        .from("admins")
        .select("*", { count: "exact", head: true })
        .eq("rol", "superadmin")
        .eq("activo", true);

      let nuevoRol = "admin";
      let nuevoActivo = false;
      let permisosDefault = '{"ver": ["turnos"], "editar": []}';

      if (count === 0) {
        nuevoRol = "superadmin";
        nuevoActivo = true;
        permisosDefault = '{"ver": ["turnos", "configuracion", "admins", "checkin", "ingresos", "kpis"], "editar": ["turnos", "configuracion", "admins", "checkin", "ingresos", "kpis"]}';
      }

      await supabase.from("admins").insert({
        usuario_id: user.id,
        nombre: nombre || email.split('@')[0],
        email: email,
        rol: nuevoRol,
        activo: nuevoActivo,
        permisos: permisosDefault
      });

      if (nuevoActivo) {
        setSuccess("¡Cuenta de SuperAdmin creada!");
        router.push("/admin");
        setLoading(false);
        return;
      } else {
        setError("Tu cuenta ha sido creada pero está pendiente de aprobación. Contacta al administrador.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }
    }

    if (!adminExistente.activo) {
      setError("Tu cuenta aun no ha sido aprobada. Contacta al administrador.");
      await supabase.auth.signOut();
      setLoading(false);
      return;
    }
    router.push("/admin");
    setLoading(false);
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h1 className="auth-title">Administradores</h1>
          <p className="auth-subtitle">Login o registro para administradores del sistema</p>
        </div>

        <div style={{ display: 'flex', borderBottom: '2px solid var(--border)', marginBottom: '1.25rem', gap: '0' }}>
          <button
            type="button"
            onClick={() => { setIsRegister(false); setError(""); setSuccess(""); }}
            style={{
              flex: 1, padding: '0.65rem', background: 'transparent', border: 'none',
              borderBottom: !isRegister ? '2px solid var(--primary)' : '2px solid transparent',
              color: !isRegister ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', marginBottom: '-2px'
            }}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setError(""); setSuccess(""); }}
            style={{
              flex: 1, padding: '0.65rem', background: 'transparent', border: 'none',
              borderBottom: isRegister ? '2px solid var(--primary)' : '2px solid transparent',
              color: isRegister ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', marginBottom: '-2px'
            }}
          >
            Registrarse
          </button>
        </div>

        {success && (
          <div className="alert alert-success" style={{ marginBottom: '1rem' }}>
            {success}
          </div>
        )}

        {error && (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin}>
          {isRegister && (
            <div className="form-group">
              <label className="form-label">Nombre</label>
              <input
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="form-input"
                placeholder="Tu nombre"
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="form-input"
              placeholder="Digita tu correo electrónico"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="Digita tu contraseña mínimo 6 caracteres"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {loading ? "Procesando..." : isRegister ? "Registrarse" : "Iniciar Sesión"}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link href="/" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Volver al sistema de turnos
          </Link>
        </div>
      </div>
    </div>
  );
}

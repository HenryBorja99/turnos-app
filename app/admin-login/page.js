"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../../lib/config";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginRateLimiter, checkRateLimit } from "../../lib/rateLimiter";
import { getCsrfToken, validateCsrfToken } from "../../lib/csrf";

const supabase = (supabaseConfig.url && supabaseConfig.url.startsWith('http'))
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

export default function AdminLogin() {
  const [csrfToken, setCsrfToken] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [isRegister, setIsRegister] = useState(false);
  const [nombre, setNombre] = useState("");
  const router = useRouter();
  const [isRecovering, setIsRecovering] = useState(false);

  useEffect(() => {
    async function checkSession() {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s) {
        const { data: adminData } = await supabase
          .from("admins")
          .select("activo")
          .eq("usuario_id", s.user.id)
          .maybeSingle();
        
        if (adminData && adminData.activo) {
          router.push("/admin");
          return;
        }
      }
      setCsrfToken(getCsrfToken());
      setLoading(false);
    }
    checkSession();
  }, [router]);

  async function handleLogin(e) {
    e.preventDefault();
    
    const rateCheck = checkRateLimit(loginRateLimiter, email);
    if (rateCheck.blocked) {
      setError(`Demasiados intentos. Espera ${rateCheck.remaining} segundos.`);
      return;
    }
    
    const formData = new FormData(e.target);
    const submittedCsrf = formData.get('csrf_token');
    if (!validateCsrfToken(submittedCsrf)) {
      setError("Token de seguridad inválido. Recarga la página.");
      setLoading(false);
      return;
    }
    
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
        const { data: existingProvider } = await supabase
          .from("proveedores")
          .select("email")
          .eq("email", email)
          .maybeSingle();
        
        if (existingProvider) {
          setError("Este email ya está registrado como proveedor. Usa el login de proveedor.");
          setLoading(false);
          return;
        }

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

  async function handleResetPassword(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    if (!email) {
      setError("Por favor ingresa tu email");
      setLoading(false);
      return;
    }

    const rateCheck = checkRateLimit(loginRateLimiter, email);
    if (rateCheck.blocked) {
      setError(`Demasiados intentos. Espera ${rateCheck.remaining} segundos.`);
      setLoading(false);
      return;
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/nueva-contrasena`,
    });

    if (error) {
      setError(error.message);
    } else {
      setSuccess("Revisa tu correo para restablecer tu contraseña.");
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-main)' }}>
        <div className="spinner"></div>
      </div>
    );
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
            onClick={() => { setIsRegister(false); setIsRecovering(false); setError(""); setSuccess(""); }}
            style={{
              flex: 1, padding: '0.65rem', background: 'transparent', border: 'none',
              borderBottom: !isRegister && !isRecovering ? '2px solid var(--primary)' : '2px solid transparent',
              color: !isRegister && !isRecovering ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', marginBottom: '-2px'
            }}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            onClick={() => { setIsRegister(true); setIsRecovering(false); setError(""); setSuccess(""); }}
            style={{
              flex: 1, padding: '0.65rem', background: 'transparent', border: 'none',
              borderBottom: isRegister && !isRecovering ? '2px solid var(--primary)' : '2px solid transparent',
              color: isRegister && !isRecovering ? 'var(--primary)' : 'var(--text-muted)',
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

        <form onSubmit={isRecovering ? handleResetPassword : handleLogin}>
          {!isRecovering && <input type="hidden" name="csrf_token" value={csrfToken} />}
          {isRecovering && (
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
          )}
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

          {!isRecovering && (
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
          )}

          {!isRegister && !isRecovering && (
            <div className="form-group">
              <label className="form-label">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                placeholder="Digita tu contraseña mínimo 6 caracteres"
              />
              <button
                type="button"
                onClick={() => { setIsRecovering(true); setIsRegister(false); setError(""); setSuccess(""); }}
                style={{
                  background: 'none', border: 'none', color: 'var(--primary)',
                  fontSize: '0.75rem', cursor: 'pointer', padding: 0, marginTop: '0.25rem'
                }}
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem' }}
          >
            {loading ? "Procesando..." : isRegister ? "Registrarse" : isRecovering ? "Enviar enlace" : "Iniciar Sesión"}
          </button>
        </form>

        {isRecovering && (
          <div style={{ marginTop: '1rem', textAlign: 'center' }}>
            <button
              type="button"
              onClick={() => { setIsRecovering(false); setError(""); setSuccess(""); }}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: '0.875rem' }}
            >
              ← Volver a iniciar sesión
            </button>
          </div>
        )}

        <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
          <Link href="/" style={{ color: 'var(--primary)', textDecoration: 'none', fontSize: '0.875rem' }}>
            ← Volver al sistema de turnos
          </Link>
        </div>
      </div>
    </div>
  );
}

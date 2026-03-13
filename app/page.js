"use client";
import { useState, useEffect } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { useRouter } from "next/navigation";
import Navigation from "../components/Navigation";
import { useInactivityWarning } from "../hooks/useInactivityTimeout";
import { loginRateLimiter, checkRateLimit } from "../lib/rateLimiter";
import { getCsrfToken, validateCsrfToken } from "../lib/csrf";
import AgendaTurnos from "../components/AgendaTurnos";
import RegistroEmpresa from "../components/RegistroEmpresa";

export default function Home() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [proveedor, setProveedor] = useState(null);
  const [proveedorInactivo, setProveedorInactivo] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [activeTab, setActiveTab] = useState("agenda");
  const [isAdmin, setIsAdmin] = useState(false);
  const [csrfToken, setCsrfToken] = useState("");

  useEffect(() => {
    setCsrfToken(getCsrfToken());
  }, []);

  useInactivityWarning(async () => {
    await supabase.auth.signOut();
    router.push("/?timeout=true");
  }, 15 * 60 * 1000);

  async function cargarProveedor(userId, userEmail) {
    if (!supabase) return;
    const { data } = await supabase
      .from("proveedores")
      .select("*")
      .eq("usuario_id", userId)
      .single();
    
    if (!data) {
      const { data: byEmail } = await supabase
        .from("proveedores")
        .select("*")
        .eq("email", userEmail)
        .single();
      
      if (byEmail && !byEmail.activo) {
        setProveedorInactivo(true);
        setProveedor(null);
      } else {
        setProveedor(byEmail || null);
        setProveedorInactivo(false);
      }
    } else {
      if (!data.activo) {
        setProveedorInactivo(true);
        setProveedor(null);
      } else {
        setProveedor(data);
        setProveedorInactivo(false);
      }
    }
    setLoading(false);
  }

  async function verificarAdmin(userId) {
    if (!supabase || !userId) {
      setIsAdmin(false);
      return;
    }
    const { data } = await supabase
      .from("admins")
      .select("rol")
      .eq("usuario_id", userId)
      .eq("activo", true)
      .maybeSingle();
    
    if (data && (data.rol === 'admin' || data.rol === 'superadmin')) {
      setIsAdmin(true);
    } else {
      setIsAdmin(false);
    }
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        cargarProveedor(s.user.id, s.user.email);
        verificarAdmin(s.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        cargarProveedor(s.user.id, s.user.email);
        verificarAdmin(s.user.id);
      } else {
        setProveedor(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  async function handleAuth(e) {
    e.preventDefault();
    
    const rateCheck = checkRateLimit(loginRateLimiter, email);
    if (rateCheck.blocked) {
      setError(`Demasiados intentos. Espera ${rateCheck.remaining} segundos.`);
      setAuthLoading(false);
      return;
    }
    
    const formData = new FormData(e.target);
    const submittedCsrf = formData.get('csrf_token');
    if (!validateCsrfToken(submittedCsrf)) {
      setError("Token de seguridad inválido. Recarga la página.");
      setAuthLoading(false);
      return;
    }
    
    setError("");
    setSuccess("");
    setAuthLoading(true);

    if (!email || !password) {
      setError("Por favor completa todos los campos");
      setAuthLoading(false);
      return;
    }

    if (!supabase) {
      setError("Supabase no está configurado. Contacta al administrador.");
      setAuthLoading(false);
      return;
    }

    if (isRegister) {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
      if (signUpError) {
        setError(signUpError.message);
      } else if (signUpData?.user) {
        await supabase.from("proveedores").insert({
          usuario_id: signUpData.user.id,
          email: email,
          empresa: email.split('@')[0],
          activo: false
        });
        setSuccess("Cuenta creada. Pendiente de aprobación. Contacta al administrador.");
        setIsRegister(false);
      }
    } else {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError("Usuario o contraseña incorrectos");
      }
    }

    setAuthLoading(false);
  }

  async function handleResetPassword(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setAuthLoading(true);

    if (!email) {
      setError("Por favor ingresa tu email");
      setAuthLoading(false);
      return;
    }

    const formData = new FormData(e.target);
    const submittedCsrf = formData.get('csrf_token');
    if (!validateCsrfToken(submittedCsrf)) {
      setError("Token de seguridad inválido. Recarga la página.");
      setAuthLoading(false);
      return;
    }

    if (!supabase) {
      setError("Supabase no está configurado. Contacta al administrador.");
      setAuthLoading(false);
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
    setAuthLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setProveedor(null);
    setProveedorInactivo(false);
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
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="auth-title">Sistema de Turnos</h1>
            <p className="auth-subtitle">
              {isRecovering ? "Recupera tu contraseña" : isRegister ? "Crea tu cuenta de proveedor" : "Accede para agendar turnos"}
            </p>
          </div>

          {isRecovering ? (
            <form onSubmit={handleResetPassword} className="auth-form">
              <input type="hidden" name="csrf_token" value={csrfToken} />
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  placeholder="Digita tu correo electrónico"
                  autoComplete="email"
                />
              </div>
              {error && <div className="alert alert-error">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}
              <button type="submit" disabled={authLoading} className="btn btn-primary">
                {authLoading ? "Enviando..." : "Enviar enlace"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAuth} className="auth-form">
              <input type="hidden" name="csrf_token" value={csrfToken} />
              <div className="form-group">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-input"
                  placeholder="Digita tu correo electrónico"
                  autoComplete="email"
                />
              </div>

              <div className="form-group">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label">Contraseña</label>
                  {!isRegister && (
                    <span onClick={() => { setIsRecovering(true); setError(""); setSuccess(""); }} className="auth-link" style={{ fontSize: '0.75rem' }}>
                      ¿Olvidaste tu contraseña?
                    </span>
                  )}
                </div>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-input"
                  placeholder="Digita tu contraseña mínimo 6 caracteres"
                  autoComplete="current-password"
                  minLength={6}
                />
              </div>

              {error && <div className="alert alert-error">{error}</div>}
              {success && <div className="alert alert-success">{success}</div>}

              <button type="submit" disabled={authLoading} className="btn btn-primary">
                {authLoading ? "Procesando..." : isRegister ? "Crear cuenta" : "Iniciar sesión"}
              </button>
            </form>
          )}

          <div className="auth-footer">
            {isRecovering ? (
              <p style={{ margin: 0 }}>
                <span onClick={() => { setIsRecovering(false); setError(""); setSuccess(""); }} className="auth-link">
                  Volver a iniciar sesión
                </span>
              </p>
            ) : !isRegister ? (
              <p style={{ margin: 0 }}>
                ¿No tienes cuenta?{" "}
                <span onClick={() => { setIsRegister(true); setError(""); setSuccess(""); }} className="auth-link">
                  Regístrate gratis
                </span>
                <br />
                <span style={{ display: 'block', marginTop: '0.5rem' }}>
                  ¿Eres administrador?{" "}
                  <a href="/admin-login" className="auth-link">Acceso admin</a>
                </span>
              </p>
            ) : (
              <p style={{ margin: 0 }}>
                ¿Ya tienes cuenta?{" "}
                <span onClick={() => { setIsRegister(false); setError(""); setSuccess(""); }} className="auth-link">
                  Iniciar sesión
                </span>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-main)' }}>
      <Navigation session={session} onLogout={handleLogout} isAdmin={isAdmin} />

      <main className="main-content">
        <div className="admin-tabs">
          <button
            onClick={() => setActiveTab("agenda")}
            className={`admin-tab ${activeTab === "agenda" ? "admin-tab-active" : ""}`}
          >
            Agendar Turno
          </button>
          <button
            onClick={() => setActiveTab("empresa")}
            className={`admin-tab ${activeTab === "empresa" ? "admin-tab-active" : ""}`}
          >
            Mi Empresa
          </button>
        </div>

        {activeTab === "agenda" && (
          <>
            {proveedorInactivo && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                Tu cuenta está pendiente de aprobación. Contacta al administrador para activar tu acceso.
              </div>
            )}
            {!proveedor && !proveedorInactivo && (
              <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
                Primero completa los datos de tu empresa para poder agendar.{" "}
                <span
                  onClick={() => setActiveTab("empresa")}
                  className="auth-link"
                >
                  Ir a Mi Empresa
                </span>
              </div>
            )}
            <AgendaTurnos session={session} proveedor={proveedor} />
          </>
        )}

        {activeTab === "empresa" && (
          <RegistroEmpresa
            session={session}
            proveedorActual={proveedor}
            onActualizado={(data) => { setProveedor(data); setActiveTab("agenda"); }}
          />
        )}
      </main>
    </div>
  );
}
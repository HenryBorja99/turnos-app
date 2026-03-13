"use client";
import { useState, useEffect, Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import { supabaseConfig } from "../../lib/config";
import { useRouter, useSearchParams } from "next/navigation";

const supabase = (supabaseConfig.url && supabaseConfig.url.startsWith('http'))
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey)
  : null;

function NuevaContrasenaContent() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [validating, setValidating] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type');

  useEffect(() => {
    async function validateToken() {
      if (type === 'recovery' && tokenHash) {
        const { data, error } = await supabase.auth.getSession();
        if (!data.session && !error) {
          setError("El enlace ha expirado. Solicita uno nuevo desde la página de login.");
        }
      }
      setValidating(false);
    }
    validateToken();
  }, [tokenHash, type]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!password || !confirmPassword) {
      setError("Por favor completa todos los campos");
      return;
    }

    if (password.length < 6) {
      setError("La contrasena debe tener al menos 6 caracteres");
      return;
    }

    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden");
      return;
    }

    setLoading(true);

    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setError(error.message);
    } else {
      setSuccess("Contrasena actualizada correctamente");
      setTimeout(() => {
        router.push("/");
      }, 2000);
    }
    setLoading(false);
  }

  if (validating) {
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="auth-title">Nueva Contrasena</h1>
          <p className="auth-subtitle">Ingresa tu nueva contrasena</p>
        </div>

        {error ? (
          <div className="alert alert-error" style={{ marginBottom: '1rem' }}>
            {error}
            <div style={{ marginTop: '1rem' }}>
              <a href="/" className="auth-link">Volver al inicio</a>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Nueva Contrasena</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="form-input"
              placeholder="********"
              minLength={6}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Confirmar Contrasena</label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="form-input"
              placeholder="********"
              minLength={6}
            />
          </div>

          {error && <div className="alert alert-error">{error}</div>}
          {success && <div className="alert alert-success">{success}</div>}

          <button type="submit" disabled={loading} className="btn btn-primary">
            {loading ? "Actualizando..." : "Guardar Contrasena"}
          </button>
        </form>
        )}

        <div className="auth-footer">
          <a href="/" className="auth-link">Volver al inicio</a>
        </div>
      </div>
    </div>
  );
}

function LoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-main)' }}>
      <div className="spinner"></div>
    </div>
  );
}

export default function NuevaContrasena() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <NuevaContrasenaContent />
    </Suspense>
  );
}

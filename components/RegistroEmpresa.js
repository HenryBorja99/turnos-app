"use client";
import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function RegistroEmpresa({ session, proveedorActual, onActualizado }) {
  const [loading, setLoading] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: "", texto: "" });
  const [formData, setFormData] = useState({
    empresa: proveedorActual?.empresa || "",
    telefono: proveedorActual?.telefono || "",
    direccion: proveedorActual?.direccion || "",
    rut: proveedorActual?.rut || ""
  });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMensaje({ tipo: "", texto: "" });

    try {
      if (proveedorActual?.id) {
        const { error } = await supabase
          .from("proveedores")
          .update({
            empresa: formData.empresa,
            telefono: formData.telefono,
            direccion: formData.direccion,
            rut: formData.rut,
            updated_at: new Date().toISOString()
          })
          .eq("id", proveedorActual.id);

        if (error) throw error;
        setMensaje({ tipo: "exito", texto: "Empresa actualizada correctamente" });
      } else {
        const { data, error } = await supabase
          .from("proveedores")
          .insert({
            empresa: formData.empresa,
            email: session.user.email,
            telefono: formData.telefono,
            direccion: formData.direccion,
            rut: formData.rut
          })
          .select()
          .single();

        if (error) throw error;
        setMensaje({ tipo: "exito", texto: "Empresa registrada correctamente" });
        if (onActualizado) onActualizado(data);
      }
    } catch (error) {
      setMensaje({ tipo: "error", texto: error.message });
    }
    setLoading(false);
  }

  function handleChange(e) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  }

  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title">Datos de la Empresa</h2>
        <p className="card-description">
          {proveedorActual ? "Actualiza los datos de tu empresa" : "Registra los datos de tu empresa para agendar turnos"}
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label className="form-label">Nombre de la Empresa *</label>
            <input
              type="text"
              name="empresa"
              required
              value={formData.empresa}
              onChange={handleChange}
              className="form-input"
              placeholder="Nombre de tu empresa"
            />
          </div>

          <div className="form-group">
            <label className="form-label">RUT / Identificación</label>
            <input
              type="text"
              name="rut"
              value={formData.rut}
              onChange={handleChange}
              className="form-input"
              placeholder="12.345.678-9"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Teléfono</label>
            <input
              type="tel"
              name="telefono"
              value={formData.telefono}
              onChange={handleChange}
              className="form-input"
              placeholder="+56 9 1234 5678"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Dirección</label>
            <input
              type="text"
              name="direccion"
              value={formData.direccion}
              onChange={handleChange}
              className="form-input"
              placeholder="Dirección de la empresa"
            />
          </div>
        </div>

        {mensaje.texto && (
          <div className={`alert ${mensaje.tipo === "exito" ? "alert-success" : "alert-error"}`}>
            {mensaje.texto}
          </div>
        )}

        <button type="submit" disabled={loading} className="btn btn-primary">
          {loading ? "Guardando..." : proveedorActual ? "Actualizar Datos" : "Registrar Empresa"}
        </button>
      </form>
    </div>
  );
}

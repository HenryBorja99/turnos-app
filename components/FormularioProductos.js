"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function FormularioProductos({ turnoId, productos, onActualizado }) {
  const [loading, setLoading] = useState(false);
  const [productosLocal, setProductosLocal] = useState(productos || []);
  const [mostrarForm, setMostrarForm] = useState(false);
  const [productosDB, setProductosDB] = useState([]);
  const [nuevoProducto, setNuevoProducto] = useState({
    codigo: "",
    descripcion: "",
    cantidad: 1,
    numero_pallet: "",
    numero_cajas: "",
    comentario: ""
  });
  const [errorProducto, setErrorProducto] = useState("");

  useEffect(() => {
    cargarProductosDB();
  }, []);

  useEffect(() => {
    setProductosLocal(productos || []);
  }, [productos]);

  async function cargarProductosDB() {
    const { data } = await supabase
      .from("productos")
      .select("*")
      .eq("activo", true)
      .order("descripcion");
    setProductosDB(data || []);
  }

  function handleDescripcionChange(e) {
    const selectedProd = productosDB.find(p => p.id === e.target.value);
    setNuevoProducto({
      ...nuevoProducto,
      codigo: selectedProd?.codigo || "",
      descripcion: selectedProd?.descripcion || e.target.value
    });
  }

  async function agregarProducto() {
    setErrorProducto("");

    if (!nuevoProducto.descripcion) {
      setErrorProducto("La descripcion es requerida");
      return;
    }

    if (!nuevoProducto.numero_pallet && !nuevoProducto.numero_cajas) {
      setErrorProducto("Debe ingresar numero de pallet o numero de cajas");
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("turno_productos")
        .insert({
          turno_id: turnoId,
          codigo: nuevoProducto.codigo,
          descripcion: nuevoProducto.descripcion,
          cantidad: nuevoProducto.cantidad,
          numero_pallet: nuevoProducto.numero_pallet || null,
          numero_cajas: nuevoProducto.numero_cajas || null,
          comentario: nuevoProducto.comentario || null
        })
        .select()
        .single();

      if (error) throw error;
      
      setProductosLocal([...productosLocal, data]);
      setNuevoProducto({ codigo: "", descripcion: "", cantidad: 1, numero_pallet: "", numero_cajas: "", comentario: "" });
      setMostrarForm(false);
      if (onActualizado) onActualizado([...productosLocal, data]);
    } catch (error) {
      setErrorProducto("Error al agregar producto: " + error.message);
    }
    setLoading(false);
  }

  async function eliminarProducto(id) {
    if (!confirm("Eliminar este producto?")) return;
    
    try {
      await supabase.from("turno_productos").delete().eq("id", id);
      const nuevosProductos = productosLocal.filter(p => p.id !== id);
      setProductosLocal(nuevosProductos);
      if (onActualizado) onActualizado(nuevosProductos);
    } catch (error) {
      alert("Error al eliminar: " + error.message);
    }
  }

  return (
    <div className="productos-section">
      <div className="productos-header">
        <h3>Productos/Materiales</h3>
        <button type="button" onClick={() => setMostrarForm(!mostrarForm)} className="btn btn-sm btn-primary">
          {mostrarForm ? "Cancelar" : "+ Agregar"}
        </button>
      </div>

      {mostrarForm && (
        <div className="producto-form">
          <div className="form-group">
            <label className="form-label">Producto</label>
            <select
              value={nuevoProducto.descripcion}
              onChange={handleDescripcionChange}
              className="form-input"
            >
              <option value="">Selecciona un producto o escribe...</option>
              {productosDB.map(p => (
                <option key={p.id} value={p.descripcion}>{p.codigo} - {p.descripcion}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Descripcion personalizada</label>
            <input
              type="text"
              value={nuevoProducto.descripcion}
              onChange={(e) => setNuevoProducto({...nuevoProducto, descripcion: e.target.value})}
              className="form-input"
              placeholder="O escribe una descripcion"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Cantidad</label>
              <input
                type="number"
                min="1"
                value={nuevoProducto.cantidad}
                onChange={(e) => setNuevoProducto({...nuevoProducto, cantidad: parseInt(e.target.value) || 1})}
                className="form-input"
              />
            </div>
            <div className="form-group">
              <label className="form-label">N Pallet *</label>
              <input
                type="text"
                value={nuevoProducto.numero_pallet}
                onChange={(e) => setNuevoProducto({...nuevoProducto, numero_pallet: e.target.value})}
                className="form-input"
                placeholder="Numero de pallet"
              />
            </div>
            <div className="form-group">
              <label className="form-label">N Cajas *</label>
              <input
                type="number"
                min="0"
                value={nuevoProducto.numero_cajas}
                onChange={(e) => setNuevoProducto({...nuevoProducto, numero_cajas: parseInt(e.target.value) || 0})}
                className="form-input"
                placeholder="Cantidad de cajas"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Comentario</label>
            <input
              type="text"
              value={nuevoProducto.comentario}
              onChange={(e) => setNuevoProducto({...nuevoProducto, comentario: e.target.value})}
              className="form-input"
              placeholder="Comentario adicional (opcional)"
            />
          </div>

          {errorProducto && <div className="alert alert-error">{errorProducto}</div>}

          <button type="button" onClick={agregarProducto} disabled={loading} className="btn btn-primary">
            {loading ? "Guardando..." : "Agregar Producto"}
          </button>
        </div>
      )}

      {productosLocal.length > 0 ? (
        <div className="productos-list">
          {productosLocal.map((p) => (
            <div key={p.id} className="producto-item">
              <div className="producto-info">
                <strong>{p.codigo || 'Sin codigo'}</strong> - {p.descripcion}
                <span className="producto-detalle">
                  Cant: {p.cantidad} | Pallet: {p.numero_pallet || '-'} | Cajas: {p.numero_cajas || '-'}
                  {p.comentario && ` | Comentario: ${p.comentario}`}
                </span>
              </div>
              <button onClick={() => eliminarProducto(p.id)} className="btn-delete">X</button>
            </div>
          ))}
        </div>
      ) : (
        !mostrarForm && <p className="empty-text">No hay productos agregados</p>
      )}
    </div>
  );
}

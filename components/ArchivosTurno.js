"use client";
import { useState, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function ArchivosTurno({ turnoId, archivos, onActualizado }) {
  const [loading, setLoading] = useState(false);
  const [archivosLocal, setArchivosLocal] = useState(archivos || []);
  const fileInputRef = useRef(null);

  async function handleUpload(e) {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setLoading(true);
    
    for (const file of files) {
      try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${turnoId}/${Math.random()}.${fileExt}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('turnos-archivos')
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('turnos-archivos')
          .getPublicUrl(fileName);

        const { data, error } = await supabase
          .from("turno_archivos")
          .insert({
            turno_id: turnoId,
            nombre_archivo: file.name,
            tipo_archivo: file.type,
            url: publicUrl,
            tamano: file.size
          })
          .select()
          .single();

        if (error) throw error;
        setArchivosLocal([...archivosLocal, data]);
      } catch (error) {
        alert("Error al subir archivo: " + error.message);
      }
    }
    
    if (onActualizado) onActualizado(archivosLocal);
    setLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function eliminarArchivo(id) {
    if (!confirm("¿Eliminar este archivo?")) return;

    try {
      const archivo = archivosLocal.find(a => a.id === id);
      if (archivo?.url) {
        const fileName = archivo.url.split('/').pop();
        await supabase.storage.from('turnos-archivos').remove([`${turnoId}/${fileName}`]);
      }
      
      await supabase.from("turno_archivos").delete().eq("id", id);
      setArchivosLocal(archivosLocal.filter(a => a.id !== id));
      if (onActualizado) onActualizado(archivosLocal.filter(a => a.id !== id));
    } catch (error) {
      alert("Error al eliminar: " + error.message);
    }
  }

  function getFileIcon(tipo) {
    if (!tipo) return "📄";
    if (tipo.startsWith("image/")) return "🖼️";
    if (tipo.includes("pdf")) return "📕";
    if (tipo.includes("word") || tipo.includes("document")) return "📝";
    if (tipo.includes("excel") || tipo.includes("spreadsheet")) return "📊";
    return "📄";
  }

  function formatFileSize(bytes) {
    if (!bytes) return "";
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }

  return (
    <div className="archivos-section">
      <div className="archivos-header">
        <h3>Archivos/Documentos</h3>
        <label className="btn btn-sm btn-primary upload-btn">
          {loading ? "Subiendo..." : "+ Subir Archivos"}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            onChange={handleUpload}
            disabled={loading}
            style={{ display: 'none' }}
          />
        </label>
      </div>

      {archivosLocal.length > 0 ? (
        <div className="archivos-list">
          {archivosLocal.map((a) => (
            <div key={a.id} className="archivo-item">
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="archivo-link">
                <span className="archivo-icon">{getFileIcon(a.tipo_archivo)}</span>
                <div className="archivo-info">
                  <span className="archivo-nombre">{a.nombre_archivo}</span>
                  <span className="archivo-tamano">{formatFileSize(a.tamano)}</span>
                </div>
              </a>
              <button onClick={() => eliminarArchivo(a.id)} className="btn-delete">✕</button>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-text">No hay archivos subidos</p>
      )}
    </div>
  );
}

const PERMISOS_DEFAULT = {
  ver: [],
  editar: []
};

export function parsearPermisos(permisosRaw) {
  if (!permisosRaw) return PERMISOS_DEFAULT;
  if (typeof permisosRaw === 'object') return permisosRaw;
  
  if (typeof permisosRaw === 'string') {
    try {
      return JSON.parse(permisosRaw);
    } catch (e) {
      console.error("Error al leer permisos:", e);
      return PERMISOS_DEFAULT;
    }
  }
  return PERMISOS_DEFAULT;
}

export async function getAdminPermisos(supabase, usuarioId) {
  if (!supabase || !usuarioId) return PERMISOS_DEFAULT;
  
  const { data } = await supabase
    .from("admins")
    .select("permisos, rol")
    .eq("usuario_id", usuarioId)
    .eq("activo", true) 
    .maybeSingle();
  
  if (!data) return PERMISOS_DEFAULT;
  
  return parsearPermisos(data.permisos);
}

export function puedeVer(modulo, permisosRaw) {
  const permisos = parsearPermisos(permisosRaw);
  return permisos.ver?.includes(modulo) || false;
}

export function puedeEditar(modulo, permisosRaw) {
  const permisos = parsearPermisos(permisosRaw);
  return permisos.editar?.includes(modulo) || false;
}

export function esSuperadmin(permisosRaw, rol) {
  return rol === 'superadmin';
}
-- ============================================================
-- MIGRATION: Actualizar schema para nueva version
-- Ejecutar en Supabase SQL Editor
-- ============================================================

-- 1. Agregar campos de llegada
ALTER TABLE turnos ADD COLUMN fecha_llegada DATE;
ALTER TABLE turnos ADD COLUMN hora_llegada TIME;

-- 2. Eliminar campo dentro_14_horas
ALTER TABLE turnos DROP COLUMN IF EXISTS dentro_14_horas;

-- 3. Eliminar trigger de 14 horas
DROP TRIGGER IF EXISTS trg_dentro_14_horas ON turnos;
DROP FUNCTION IF EXISTS calcular_dentro_14_horas();

-- 4. Actualizar estados existentes
UPDATE turnos SET estado = 'pendiente' WHERE estado = 'reservado';
UPDATE turnos SET estado = 'confirmado' WHERE estado IN ('confirmado', 'en_proceso', 'completado');

-- 5. Actualizar constraint de estados
ALTER TABLE turnos DROP CONSTRAINT IF EXISTS turnos_estado_check;
ALTER TABLE turnos ADD CONSTRAINT turnos_estado_check 
  CHECK (estado IN ('pendiente', 'confirmado', 'atrasado', 'cancelado'));

-- 6. Crear function is_active_admin
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM admins WHERE usuario_id = auth.uid() AND activo = true
  );
$$;

-- 7. Actualizar politicas RLS
DROP POLICY IF EXISTS "admins_select_super" ON admins;
DROP POLICY IF EXISTS "admins_update_super" ON admins;
DROP POLICY IF EXISTS "admins_delete_super" ON admins;

CREATE POLICY "admins_select_super" ON admins FOR SELECT
  USING (public.is_active_admin());
CREATE POLICY "admins_update_super" ON admins FOR UPDATE
  USING (public.is_active_admin());
CREATE POLICY "admins_delete_super" ON admins FOR DELETE
  USING (public.is_active_admin());

DROP POLICY IF EXISTS "turnos_select_admin" ON turnos;
DROP POLICY IF EXISTS "turnos_update_admin" ON turnos;

CREATE POLICY "turnos_select_admin" ON turnos FOR SELECT
  USING (public.is_active_admin());
CREATE POLICY "turnos_update_admin" ON turnos FOR UPDATE
  USING (public.is_active_admin());

export function generarTurnos() {
  const turnos = [];
  const inicio = 8 * 60 + 30;
  const fin = 16 * 60 + 30;
  const intervalo = 30;

  for (let t = inicio; t < fin; t += intervalo) {
    const horas = Math.floor(t / 60);
    const minutos = t % 60;
    const hora = `${horas.toString().padStart(2, "0")}:${minutos.toString().padStart(2, "0")}`;
    
    const horaNum = horas * 60 + minutos;
    const bloqueoInicio = 13 * 60;
    const bloqueoFin = 13 * 60 + 35;
    
    if (horaNum >= bloqueoInicio && horaNum < bloqueoFin) {
      continue;
    }
    
    turnos.push(hora);
  }

  return turnos;
}

export function obtenerFechaMinima() {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return hoy.toISOString().split("T")[0];
}

export function validarAnticipacion(fechaStr) {
  const ahora = new Date();
  ahora.setHours(0, 0, 0, 0);
  const fechaSel = new Date(fechaStr);
  fechaSel.setHours(0, 0, 0, 0);
  return fechaSel >= ahora;
}

export function puedeReservar(fechaStr, horaStr) {
  const ahora = new Date();
  const [anio, mes, dia] = fechaStr.split('-');
  const fechaHoraTurno = new Date(anio, mes - 1, dia, ...horaStr.split(':').map(Number));
  
  const horasRestantes = (fechaHoraTurno - ahora) / (1000 * 60 * 60);
  
  if (horasRestantes < 2) {
    return { puede: false, mensaje: "Debe reservar con al menos 2 horas de anticipacion" };
  }
  
  return { puede: true, mensaje: "" };
}

export function formatearFecha(fechaStr) {
  const [year, month, day] = fechaStr.split("-").map(Number);
  const fecha = new Date(year, month - 1, day);
  return fecha.toLocaleDateString("es-ES", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  });
}

export function formatearFechaCorta(fechaStr) {
  if (!fechaStr) return "";
  const [year, month, day] = fechaStr.split("-").map(Number);
  const fecha = new Date(year, month - 1, day);
  return fecha.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

export function generarHoraFin(horaInicio) {
  const [horas, minutos] = horaInicio.split(":").map(Number);
  let totalMinutos = horas * 60 + minutos + 45;
  
  if (totalMinutos >= 13 * 60 && totalMinutos < 13 * 60 + 35) {
    totalMinutos = 13 * 60 + 35;
  }
  
  const horaFin = Math.floor(totalMinutos / 60);
  const minFin = totalMinutos % 60;
  
  return `${horaFin.toString().padStart(2, "0")}:${minFin.toString().padStart(2, "0")}`;
}

export function generarComprobanteHTML(turno, proveedor, productos, indicaciones, recomendaciones, email) {
  const productosHTML = productos && productos.length > 0
    ? productos.map(p => `
      <tr>
        <td>${p.codigo || 'Sin código'}</td>
        <td>${p.descripcion || '-'}</td>
        <td style="text-align:center">${p.cantidad || 0}</td>
      </tr>
    `).join('')
    : '';

  const indicacionesHTML = indicaciones
    ? `<div class="indicaciones"><h3>Extras del turno:</h3><p>${indicaciones}</p></div>`
    : '';

  const recomendacionesHTML = recomendaciones
    ? `<div class="indicaciones" style="background:#fef3c7;border-top:1px solid #fde68a"><h3 style="color:#92400e">Recomendaciones generales:</h3><p>${recomendaciones}</p></div>`
    : '';

  const qrData = turno.id;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(qrData)}`;

  const fechaGeneracion = new Date().toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Turno</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
    .comprobante { max-width: 600px; margin: 0 auto; border: 2px solid #3b82f6; border-radius: 8px; overflow: hidden; }
    .header { background: #3b82f6; color: white; padding: 20px; text-align: center; }
    .header h1 { font-size: 24px; }
    .content { padding: 20px; }
    .info-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee; }
    .info-label { font-weight: bold; color: #666; }
    .info-value { color: #333; }
    .indicaciones { background: #dbeafe; padding: 15px; border-radius: 8px; margin: 15px 0; }
    .indicaciones h3 { font-size: 14px; color: #1d4ed8; margin-bottom: 8px; }
    .indicaciones p { font-size: 13px; color: #333; line-height: 1.5; }
    .productos { margin-top: 20px; }
    .productos h3 { font-size: 16px; margin-bottom: 10px; color: #3b82f6; }
    .producto-item { padding: 8px; background: #f8f9fa; margin-bottom: 5px; border-radius: 4px; font-size: 14px; }
    .footer { background: #f8f9fa; padding: 15px; text-align: center; font-size: 12px; color: #666; }
    .codigo-qr { text-align: center; margin-top: 10px; }
    .codigo { font-size: 28px; font-weight: bold; padding: 4px 0; }
    .tabla-productos { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 13px; }
    .tabla-productos th { background: #3b82f6; color: white; padding: 8px; text-align: left; }
    .tabla-productos td { border: 1px solid #e5e7eb; padding: 6px 8px; }
    .tabla-productos tr:nth-child(even) { background: #f9fafb; }
    .qr-section img { width: 110px; height: 110px; margin-top: 4px; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="comprobante">
    <div class="header">
      <h1>Turno</h1>
    </div>
    <div class="content">
      <div class="info-row">
        <span class="info-label">Empresa:</span>
        <span class="info-value">${proveedor?.empresa || 'No registrado'} ${email ? `(${email})` : ''}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Orden de Compra:</span>
        <span class="info-value">${turno.orden_compra || "-"}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Fecha:</span>
        <span class="info-value">${formatearFecha(turno.fecha)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Hora:</span>
        <span class="info-value">${turno.hora_inicio} - ${turno.hora_fin || generarHoraFin(turno.hora_inicio)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Anden:</span>
        <span class="info-value">${turno.anden}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Estado:</span>
        <span class="info-value">${turno.estado?.toUpperCase() || 'RESERVADO'}</span>
      </div>
      ${indicacionesHTML}
      ${productos ? `
      <div class="productos">
        <h3>Productos / Materiales</h3>
        <table class="tabla-productos">
          <thead>
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th style="text-align:center">Cantidad</th>
            </tr>
          </thead>
          <tbody>
            ${productosHTML}
          </tbody>
        </table>
      </div>
      ` : ''}
      <div class="codigo-qr">
        <div class="codigo">${turno.id?.slice(0, 8).toUpperCase() || 'TURNO001'}</div>
        <div class="qr-section">
          <img src="${qrUrl}" alt="QR del turno">
        </div>
      </div>
      ${recomendacionesHTML}
    </div>
    <div class="footer">
      <p>Presente este turno al llegar</p>
      <p>Generado el ${fechaGeneracion}</p>
    </div>
  </div>
</body>
</html>`;
}
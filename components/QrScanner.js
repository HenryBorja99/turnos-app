"use client";
import { useState, useEffect, useRef } from "react";

export default function QrScanner({ onScan }) {
  const [mensaje, setMensaje] = useState("");
  const [codigoManual, setCodigoManual] = useState("");
  const [mostrarInput, setMostrarInput] = useState(false);
  const [cameraStatus, setCameraStatus] = useState("initializing");
  const [scannerReady, setScannerReady] = useState(false);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanningRef = useRef(false);

  useEffect(() => {
    let mounted = true;

    async function initCamera() {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setCameraStatus("not-supported");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: "environment",
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });

        if (!mounted) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        streamRef.current = stream;
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setScannerReady(true);
          setCameraStatus("ready");
          startScanning();
        }
      } catch (err) {
        console.error("Camera error:", err);
        if (!mounted) return;
        
        if (err.name === "NotAllowedError") {
          setCameraStatus("permission-denied");
        } else if (err.name === "NotFoundError") {
          setCameraStatus("not-found");
        } else {
          setCameraStatus("error");
        }
      }
    }

    initCamera();

    return () => {
      mounted = false;
      scanningRef.current = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (mostrarInput && streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
      setScannerReady(false);
    }
  }, [mostrarInput]);

  async function startScanning() {
    if (scanningRef.current || !videoRef.current || !canvasRef.current) return;
    scanningRef.current = true;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    async function scanFrame() {
      if (!scanningRef.current || video.paused || video.ended) {
        requestAnimationFrame(scanFrame);
        return;
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      try {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = await scanQRCode(imageData.data, canvas.width, canvas.height);
        
        if (code) {
          handleScanResult(code);
        }
      } catch (e) {
        // Silent fail for scanning errors
      }

      requestAnimationFrame(scanFrame);
    }

    scanFrame();
  }

  async function scanQRCode(data, width, height) {
    
    try {
      const { default: jsQR } = await import("jsqr");
      const imageData = new ImageData(new Uint8ClampedArray(data), width, height);
      const code = jsQR(imageData.data, width, height);
      return code?.data || null;
    } catch (e) {
 
      return null;
    }
  }

  const handleScanResult = (code) => {
    if (code) {
      console.log("QR escaneado:", code);
      const codigoCorto = code.trim().toLowerCase().substring(0, 8);
      console.log("Enviando código corto:", codigoCorto);
      onScan(codigoCorto);
      setMensaje("");
    }
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (codigoManual.trim()) {
      const codigoCorto = codigoManual.trim().toLowerCase().substring(0, 8);
      console.log("Código manual:", codigoCorto);
      onScan(codigoCorto);
      setCodigoManual("");
    }
  };

  const toggleInput = () => {
    const newValue = !mostrarInput;
    setMostrarInput(newValue);
    if (!newValue) {
      reiniciarCamara();
    }
  };

  const reiniciarCamara = async () => {
    setCameraStatus("initializing");
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: "environment",
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      });
      
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScannerReady(true);
        setCameraStatus("ready");
        startScanning();
      }
    } catch (err) {
      console.error("Error restarting camera:", err);
      setCameraStatus("error");
    }
  };

  const retryCamera = () => {
    setCameraStatus("initializing");
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    window.location.reload();
  };

  return (
    <div>
      <div style={{ 
        position: "relative", 
        width: "100%", 
        maxWidth: "400px", 
        margin: "0 auto",
        borderRadius: "var(--radius)",
        overflow: "hidden",
        background: "#000",
        minHeight: "300px"
      }}>
        <video 
          ref={videoRef}
          playsInline
          muted
          style={{ 
            width: "100%", 
            display: cameraStatus === "ready" ? "block" : "none" 
          }}
        />
        <canvas ref={canvasRef} style={{ display: "none" }} />
        
        {cameraStatus !== "ready" && (
          <div style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            background: "#1f2937",
            color: "white",
            padding: "2rem",
            textAlign: "center"
          }}>
            {cameraStatus === "initializing" && (
              <>
                <div className="spinner" style={{ marginBottom: "1rem" }}></div>
                <p>Inicializando cámara...</p>
              </>
            )}
            
            {cameraStatus === "permission-denied" && (
              <>
                <svg style={{ width: 48, height: 48, marginBottom: "1rem", opacity: 0.7 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <p style={{ marginBottom: "1rem" }}>Permiso de cámara denegado</p>
                <button onClick={retryCamera} className="btn btn-primary">Permitir Cámara</button>
              </>
            )}
            
            {cameraStatus === "not-found" && (
              <>
                <svg style={{ width: 48, height: 48, marginBottom: "1rem", opacity: 0.7 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p style={{ marginBottom: "1rem" }}>No se encontró cámara</p>
                <button onClick={() => setMostrarInput(true)} className="btn btn-primary">Ingresar Manualmente</button>
              </>
            )}
            
            {cameraStatus === "error" && (
              <>
                <svg style={{ width: 48, height: 48, marginBottom: "1rem", opacity: 0.7 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p style={{ marginBottom: "1rem" }}>Error al acceder a la cámara</p>
                <button onClick={retryCamera} className="btn btn-primary">Reintentar</button>
              </>
            )}
            
            {cameraStatus === "not-supported" && (
              <>
                <svg style={{ width: 48, height: 48, marginBottom: "1rem", opacity: 0.7 }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <p>Cámara no disponible en este dispositivo</p>
              </>
            )}
          </div>
        )}

        {cameraStatus === "ready" && (
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "200px",
            height: "200px",
            border: "3px solid rgba(255,255,255,0.8)",
            borderRadius: "12px",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.5)"
          }}>
            <div style={{
              position: "absolute",
              top: "-3px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "100px",
              height: "4px",
              background: "var(--primary)",
              borderRadius: "2px",
              animation: "scan 2s ease-in-out infinite"
            }} />
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes scan {
          0%, 100% { top: -3px; }
          50% { top: calc(100% - 4px); }
        }
      `}</style>

      <p style={{ 
        textAlign: "center", 
        marginTop: "0.75rem", 
        fontSize: "0.85rem",
        color: "var(--text-muted)" 
      }}>
        Posiciona el código QR dentro del marco
      </p>

      <button
        type="button"
        onClick={toggleInput}
        style={{
          marginTop: "1rem",
          padding: "0.75rem 1rem",
          width: "100%",
          background: "var(--neutral-light)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          cursor: "pointer",
          fontWeight: 500
        }}
      >
        {mostrarInput ? "← Volver a escanear QR" : "O digitar código manualmente"}
      </button>

      {mostrarInput && (
        <form onSubmit={handleManualSubmit} style={{ 
          marginTop: "1rem", 
          padding: "1.5rem", 
          border: "1px solid var(--border)", 
          borderRadius: "var(--radius)",
          background: "var(--neutral-light)"
        }}>
          <p style={{ marginBottom: "0.75rem", fontWeight: 600, fontSize: "0.95rem" }}>
            Ingresa el código del turno:
          </p>
          <input
            type="text"
            value={codigoManual}
            onChange={(e) => setCodigoManual(e.target.value)}
            placeholder="Código del turno (mínimo 8 caracteres)"
            style={{
              width: "100%",
              padding: "0.75rem",
              marginBottom: "0.75rem",
              border: "1px solid var(--border)",
              borderRadius: "var(--radius)",
              fontSize: "1rem"
            }}
          />
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="submit"
              disabled={!codigoManual.trim() || codigoManual.trim().length < 8}
              style={{
                flex: 1,
                padding: "0.75rem",
                background: codigoManual.trim().length >= 8 ? "var(--primary)" : "#ccc",
                color: "white",
                border: "none",
                borderRadius: "var(--radius)",
                cursor: codigoManual.trim().length >= 8 ? "pointer" : "not-allowed",
                fontWeight: 600
              }}
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={() => {
                setMostrarInput(false);
                setCodigoManual("");
              }}
              style={{
                padding: "0.75rem 1rem",
                background: "white",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                cursor: "pointer"
              }}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

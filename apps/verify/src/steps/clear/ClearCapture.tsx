import { useCallback, useEffect, useRef, useState } from 'react';
import type { CaptureImages } from '@/lib/api';
import './clear-capture.css';

// ============================================================================
// MOCK CLEAR CAPTURE — used only when the server runs with MOCK_CLEAR=true.
//
// Faithful local replica of CLEAR's hosted verification (ported from the
// legacy GA Gateway demo via the resident app's former /clear-verify page):
// phone → OTP (sandbox code 123456) → selfie → document capture via
// getUserMedia. Rendered embedded inside the Verify Assist FlowShell; on
// completion the parent posts /clear-complete and moves to processing.
//
// In sandbox mode the flow redirects to verified.clearme.com instead and this
// component never renders.
// ============================================================================

type Step = 'intro' | 'phone' | 'otp' | 'selfie' | 'document' | 'uploading';

const STEP_PROGRESS: Record<Step, number> = {
  intro: 8,
  phone: 25,
  otp: 40,
  selfie: 60,
  document: 80,
  uploading: 95,
};

// Keep uploaded stills small: long edge capped, jpeg-compressed. The staff
// console renders thumbnails; full camera resolution is never needed.
const MAX_CAPTURE_EDGE = 800;
const CAPTURE_QUALITY = 0.8;

function CameraCapture({
  facing,
  overlay,
  instruction,
  captureLabel,
  onCaptured,
}: {
  facing: 'user' | 'environment';
  overlay: 'oval' | 'frame';
  instruction: string;
  captureLabel: string;
  /** Called with the captured data URL, or null when the capture was simulated. */
  onCaptured: (photo: string | null) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async () => {
    setCameraError(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch {
      setCameraError(true);
    }
  }, [facing]);

  useEffect(() => {
    void startStream();
    return stopStream;
  }, [startStream, stopStream]);

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const srcW = video.videoWidth || 640;
    const srcH = video.videoHeight || 480;
    const scale = Math.min(1, MAX_CAPTURE_EDGE / Math.max(srcW, srcH));
    canvas.width = Math.round(srcW * scale);
    canvas.height = Math.round(srcH * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (facing === 'user') {
      // mirror selfies, like the real capture UI
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setPhoto(canvas.toDataURL('image/jpeg', CAPTURE_QUALITY));
    stopStream();
  };

  const retake = () => {
    setPhoto(null);
    void startStream();
  };

  if (cameraError) {
    return (
      <div>
        <p>
          We couldn't access your camera. Please allow camera access in your browser, or simulate the capture
          (sandbox).
        </p>
        <button className="clear-primary" onClick={() => onCaptured(null)}>
          Simulate capture — continue
        </button>
      </div>
    );
  }

  return (
    <div>
      <p>{instruction}</p>
      <div className="clear-video-wrap">
        {photo ? (
          <img src={photo} alt="Captured" />
        ) : (
          <video ref={videoRef} playsInline muted style={facing === 'user' ? { transform: 'scaleX(-1)' } : undefined} />
        )}
        {!photo && (overlay === 'oval' ? <div className="selfie-oval" /> : <div className="id-frame" />)}
      </div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
      {photo ? (
        <>
          <button className="clear-primary" onClick={() => onCaptured(photo)}>
            Looks good — continue
          </button>
          <button className="clear-secondary" onClick={retake}>
            Retake
          </button>
        </>
      ) : (
        <button className="clear-primary" onClick={capture}>
          {captureLabel}
        </button>
      )}
    </div>
  );
}

export function ClearCapture({ onComplete }: { onComplete: (images: CaptureImages) => void }) {
  const [step, setStep] = useState<Step>('intro');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState(false);
  // Captured stills, retained per slot until completion; simulated captures
  // leave their slot unset so the server receives no image for it.
  const imagesRef = useRef<CaptureImages>({});

  // Identity capture finished — show the securing state briefly, then hand
  // back to the flow (which completes the CLEAR session server-side).
  const finish = useCallback(() => {
    setStep('uploading');
    setTimeout(() => onComplete(imagesRef.current), 900);
  }, [onComplete]);

  const submitOtp = () => {
    if (otp.trim() === '123456') {
      setOtpError(false);
      setStep('selfie');
    } else {
      setOtpError(true);
    }
  };

  return (
    <div className="clear-embed">
      <div className="clear-topbar">
        <div className="clear-wordmark">CLEAR</div>
        <div className="clear-topbar-note">Secure identity verification</div>
      </div>

      <div className="clear-card">
        <span className="clear-sandbox-pill">SANDBOX</span>
        <div className="clear-progress">
          <div style={{ width: `${STEP_PROGRESS[step]}%` }} />
        </div>

        {step === 'intro' && (
          <>
            <h2>Verify your identity with CLEAR</h2>
            <p>
              A quick selfie and a photo of your government ID — that's it. Your photos are used only to verify
              your identity.
            </p>
            <button className="clear-primary" onClick={() => setStep('phone')}>
              Get started
            </button>
            <p style={{ fontSize: 11.5, marginTop: 14 }}>
              By continuing you agree to CLEAR's Terms of Use and Privacy Policy.
            </p>
          </>
        )}

        {step === 'phone' && (
          <>
            <h2>Enter your phone number</h2>
            <p>We'll text you a one-time code to confirm this device.</p>
            <input
              type="tel"
              placeholder="(408) 222-2222"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              aria-label="Phone number"
            />
            <button className="clear-primary" disabled={phone.trim().length < 7} onClick={() => setStep('otp')}>
              Send code
            </button>
          </>
        )}

        {step === 'otp' && (
          <>
            <h2>Enter the 6-digit code</h2>
            <p>
              We sent a code to <strong>{phone}</strong>.
              <br />
              <span style={{ fontSize: 11.5, color: '#8a93a8' }}>(Sandbox code is always 123456)</span>
            </p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="••••••"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              aria-label="One-time code"
            />
            {otpError && <p className="clear-error">That code didn't match. Try 123456.</p>}
            <button className="clear-primary" disabled={otp.trim().length !== 6} onClick={submitOtp}>
              Verify code
            </button>
          </>
        )}

        {step === 'selfie' && (
          <>
            <h2>Take a selfie</h2>
            <CameraCapture
              facing="user"
              overlay="oval"
              instruction="Center your face in the oval and make sure you're in a well-lit area."
              captureLabel="Take selfie"
              onCaptured={(photo) => {
                if (photo) imagesRef.current.selfie = photo;
                setStep('document');
              }}
            />
          </>
        )}

        {step === 'document' && (
          <>
            <h2>Photograph your ID</h2>
            <CameraCapture
              facing="environment"
              overlay="frame"
              instruction="Place the front of your driver's license or state ID inside the frame."
              captureLabel="Capture ID"
              onCaptured={(photo) => {
                if (photo) imagesRef.current.documentFront = photo;
                finish();
              }}
            />
          </>
        )}

        {step === 'uploading' && (
          <>
            <h2>Securing your photos…</h2>
            <div className="clear-spinner" />
            <p>Uploading your selfie and ID for verification.</p>
          </>
        )}
      </div>
    </div>
  );
}

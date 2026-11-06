import { useEffect, useRef } from 'react';
import { startPrism } from '../prism.js';

export default function Prism() {
  const gl = useRef<HTMLCanvasElement>(null);
  const fx = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const glCanvas = gl.current;
    const fxCanvas = fx.current;
    if (!glCanvas || !fxCanvas) return;
    let stop = () => {};
    try {
      stop = startPrism(glCanvas, fxCanvas);
    } catch {
      stop = () => {};
    }
    return () => {
      stop();
    };
  }, []);

  return (
    <div className="hero-stage" aria-hidden="true">
      <canvas ref={gl} />
      <canvas ref={fx} id="fx" className="hero-fx" />
    </div>
  );
}

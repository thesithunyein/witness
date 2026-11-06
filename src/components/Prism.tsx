import { useEffect, useRef } from 'react';

export default function Prism() {
  const gl = useRef<HTMLCanvasElement>(null);
  const fx = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const glCanvas = gl.current;
    const fxCanvas = fx.current;
    if (!glCanvas || !fxCanvas) return;
    let stop = () => {};
    let dead = false;
    import(/* @vite-ignore */ '/prism.js')
      .then((mod: { startPrism: (a: HTMLCanvasElement, b: HTMLCanvasElement) => () => void }) => {
        if (dead) return;
        stop = mod.startPrism(glCanvas, fxCanvas);
      })
      .catch(() => {});
    return () => {
      dead = true;
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

"use client";

/* Animación de bienvenida: las letras entran una a una (fundido + subida + desenfoque). Solo para el saludo del dashboard. */
import { useEffect, useState } from "react";

export default function Letters({ text }: { text: string }) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <span className={`orion-letters${on ? " in" : ""}`} aria-label={text}>
      {[...text].map((c, i) =>
        c === " " ? " " : (
          <span key={i} className="ch" aria-hidden="true" style={{ transitionDelay: `${0.25 + i * 0.035}s` }}>{c}</span>
        )
      )}
    </span>
  );
}

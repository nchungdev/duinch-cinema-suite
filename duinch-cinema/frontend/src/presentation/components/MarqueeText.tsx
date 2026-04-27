import { useRef, useEffect, useState } from 'react';

interface MarqueeTextProps {
  text: string;
  className?: string;
}

export const MarqueeText = ({ text, className = '' }: MarqueeTextProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflows, setOverflows] = useState(false);

  useEffect(() => {
    const check = () => {
      if (containerRef.current && textRef.current) {
        setOverflows(textRef.current.scrollWidth > containerRef.current.clientWidth);
      }
    };
    check();
    const ro = new ResizeObserver(check);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [text]);

  return (
    <div
      ref={containerRef}
      className={`overflow-hidden ${overflows ? 'marquee-container' : ''}`}
    >
      <span
        ref={textRef}
        className={`${overflows ? 'animate-marquee' : 'truncate block'} ${className}`}
      >
        {text}
      </span>
    </div>
  );
};

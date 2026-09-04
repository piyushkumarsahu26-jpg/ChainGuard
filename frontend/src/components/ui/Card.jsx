import React from 'react';
import { motion } from 'framer-motion';

export default function Card({ children, className = '', hover = false, as: Component = 'div', ...props }) {
  const Wrapper = hover ? motion.div : Component;
  const motionProps = hover
    ? {
        whileHover: { y: -3, transition: { duration: 0.18 } },
      }
    : {};

  return (
    <Wrapper
      className={`bg-bg-card border border-border rounded-xl shadow-soft ${className}`}
      {...motionProps}
      {...props}
    >
      {children}
    </Wrapper>
  );
}

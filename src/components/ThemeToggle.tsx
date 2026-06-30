'use client';

import { useState, useEffect } from 'react';

export default function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem('theme');
    const isDark = stored === 'dark';
    setDark(isDark);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('theme', next ? 'dark' : '');
  };

  return (
    <button
      onClick={toggle}
      style={{
        position: 'fixed',
        top: '1rem',
        right: '1rem',
        width: 40,
        height: 40,
        borderRadius: '50%',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
        cursor: 'pointer',
        fontSize: '1.2rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        zIndex: 100,
      }}
      title={dark ? '切换到浅色模式' : '切换到深色模式'}
    >
      {dark ? '☀️' : '🌙'}
    </button>
  );
}

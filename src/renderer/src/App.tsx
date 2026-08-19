import type { JSX } from 'react';

/**
 * Placeholder shell.
 *
 * Sub-session 1 owns no UI. The Pod bar, lane rail, transcript, composer,
 * permission cards, Beachcomber, and Helm all arrive in sub-sessions 2 and 3.
 * This component exists so `npm run dev` opens a window that renders, and
 * nothing more — do not grow it here.
 */
export function App(): JSX.Element {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        margin: 0,
        gap: '0.5rem',
        background: '#0f1720',
        color: '#e6edf3',
        fontFamily: 'Segoe UI, system-ui, sans-serif',
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600 }}>Orcastrate</h1>
      <p style={{ margin: 0, opacity: 0.6, fontSize: '0.875rem' }}>
        Shell ready. The workspace UI lands in a later sub-session.
      </p>
    </main>
  );
}

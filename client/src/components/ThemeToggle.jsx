import { Moon, Sun } from 'lucide-react';
import { useTheme } from './ThemeProvider.jsx';

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button type="button" className="btn icon-btn" onClick={toggle} aria-pressed={dark}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <Sun size={20} aria-hidden="true" /> : <Moon size={20} aria-hidden="true" />}
    </button>
  );
}

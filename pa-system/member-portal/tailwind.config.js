/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { 50:'#e3f2fd', 100:'#bbdefb', 200:'#90caf9', 300:'#64b5f6', 400:'#42a5f5', 500:'#2196F3', 600:'#1E88E5', 700:'#1976D2', 800:'#1565C0', 900:'#0D47A1' },
        success: { 50:'#e8f5e9', 500:'#4CAF50', 600:'#43A047', 700:'#388E3C' },
        warning: { 50:'#fff8e1', 500:'#FF9800', 600:'#FB8C00' },
        danger:  { 50:'#fce4ec', 500:'#F44336', 600:'#E53935' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      borderRadius: { xl: '12px', '2xl': '16px', '3xl': '20px' },
    },
  },
  plugins: [],
};

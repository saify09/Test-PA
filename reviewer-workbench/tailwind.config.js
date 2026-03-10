/** @type {import('tailwindcss').Config} */
// Colors per PRD Section 7.4: #1976D2 primary, #4FC3F7 secondary, #4CAF50 success,
// #FF9800 warning, #F44336 error, #757575 neutral gray
// Font: Inter (PRD: "Inter or Roboto"), body 14px line-height 1.5
module.exports = {
  content: ['./pages/**/*.{js,ts,jsx,tsx}', './components/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary:   { 50:'#e3f0fd',100:'#bbdafb',200:'#8fc2f8',300:'#60aaf5',400:'#3896f3',500:'#1976D2',600:'#1565c0',700:'#0d47a1',800:'#0a3880',900:'#062660' },
        secondary: { 50:'#e1f5fe',100:'#b3e5fc',200:'#81d4fa',300:'#4fc3f7',400:'#29b6f6',500:'#4FC3F7',600:'#039be5',700:'#0288d1',800:'#0277bd',900:'#01579b' },
        success:   { 50:'#e8f5e9',100:'#c8e6c9',500:'#4CAF50',600:'#43A047',700:'#388E3C' },
        warning:   { 50:'#fff8e1',100:'#ffecb3',500:'#FF9800',600:'#F57C00',700:'#E65100' },
        danger:    { 50:'#ffebee',100:'#ffcdd2',500:'#F44336',600:'#E53935',700:'#C62828' },
        neutral:   { 50:'#fafafa',100:'#f5f5f5',200:'#eeeeee',300:'#e0e0e0',400:'#bdbdbd',500:'#9e9e9e',600:'#757575',700:'#616161',800:'#424242',900:'#212121' },
        slate:     { 50:'#f8fafc',100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',500:'#64748b',600:'#475569',700:'#334155',800:'#1e293b',900:'#0f172a' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['Roboto Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

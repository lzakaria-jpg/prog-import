/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        qoyod: {
          navy: '#162560',
          'navy-dark': '#0F1A47',
          'navy-light': '#1E3370',
          'qoyod-accent': '#4A90D9',
          bg: '#F1F5F9',
          surface: '#FFFFFF',
          text: '#0F172A',
          'text-secondary': '#64748B',
          border: '#E2E8F0',
        },
      },
      fontFamily: {
        cairo: ['Cairo', 'Segoe UI', 'Tahoma', 'sans-serif'],
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0, 0, 0, 0.04)',
        'card-hover': '0 4px 12px rgba(0, 0, 0, 0.06)',
        'sidebar': '4px 0 24px rgba(15, 27, 45, 0.15)',
      },
    },
  },
  plugins: [],
};

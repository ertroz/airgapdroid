/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        studio: {
          canvas: '#F7F8FA',
          surface: '#FFFFFF',
          subtle: '#F3F4F6',
          hover: '#F9FAFB',
          ink: '#111827',
          muted: '#6B7280',
          border: '#E5E7EB',
          borderStrong: '#D1D5DB',
          coral: '#E54D2E',
          coralHover: '#CE3E21',
          pass: '#1F7A3E',
          passSoft: '#EBF9F0',
        },
      },
    },
  },
  plugins: [],
};

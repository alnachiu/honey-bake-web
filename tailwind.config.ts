import type { Config } from "tailwindcss"

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FFF5F0',
          100: '#FFE8DE',
          200: '#F5D4C0',
          300: '#F0B8A0',
          400: '#E8806A',
          500: '#E07050',
          600: '#D06040',
          700: '#B05038',
          800: '#904030',
          900: '#703028',
        },
        warm: {
          50: '#FFFCF9',
          100: '#FFF8F5',
          200: '#FFF0E8',
          300: '#F5E0D0',
          400: '#E8D0C0',
        },
        text: {
          primary: '#3D3028',
          secondary: '#7A6A60',
          light: '#B0A8A0',
        }
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      animation: {
        'slide-up': 'slideUp 0.3s ease-out',
        'fade-in': 'fadeIn 0.4s ease-out',
        'bounce-slow': 'bounce 1.5s ease-in-out infinite',
      },
      keyframes: {
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        }
      }
    },
  },
  plugins: [],
}
export default config

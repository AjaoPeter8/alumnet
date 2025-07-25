/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./views/**/*.{ejs,html}", 
    "./public/js/**/*.js",
    "./node_modules/flowbite/**/*.js"
  ],
  theme: {
    extend: {},
  },
  plugins: [
    require('flowbite/plugin')
  ],
};
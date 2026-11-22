// Vite's `?raw` suffix imports a file's text. The tests read the package
// stylesheet this way.
declare module '*.css?raw' {
  const text: string
  export default text
}

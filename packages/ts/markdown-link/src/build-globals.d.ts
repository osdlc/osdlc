// Build-only. The ES2022 lib lacks these two WHATWG Encoding globals, and the
// build loads no Node types. Declares only what src/ uses. The dev tsconfig.json
// excludes this file, so it does not clash with @types/node.
declare class TextEncoder {
  encode(input: string): Uint8Array
}

declare class TextDecoder {
  constructor(label?: string, options?: { fatal?: boolean; ignoreBOM?: boolean })
  decode(input: Uint8Array): string
}

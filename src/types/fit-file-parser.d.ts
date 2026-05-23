declare module 'fit-file-parser' {
  interface FitParserOptions {
    force?: boolean
    speedUnit?: string
    lengthUnit?: string
    temperatureUnit?: string
    elapsedRecordField?: boolean
    mode?: string
  }

  type ParseCallback = (error: Error | null, data: Record<string, unknown>) => void

  class FitParser {
    constructor(options?: FitParserOptions)
    parse(content: Buffer | ArrayBuffer, callback: ParseCallback): void
  }

  export = FitParser
}

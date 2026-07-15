declare module "multer" {
  import type { RequestHandler } from "express"

  interface StorageEngine {
    _handleFile?: unknown
    _removeFile?: unknown
  }

  interface Options {
    storage?: StorageEngine
    limits?: {
      fileSize?: number
      files?: number
    }
  }

  interface Multer {
    array(fieldName: string, maxCount?: number): RequestHandler
    single(fieldName: string): RequestHandler
  }

  interface MulterStatic {
    (options?: Options): Multer
    memoryStorage(): StorageEngine
  }

  const multer: MulterStatic
  export default multer
}

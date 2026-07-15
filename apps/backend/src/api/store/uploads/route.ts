/**
 * POST /store/uploads
 *
 * Public (publishable-key) file upload for cake personalisation photos.
 * Uses Medusa's File Module via `uploadFilesWorkflow` (local static / S3).
 *
 * Constraints:
 *  - Images only (jpeg/png/webp/gif)
 *  - Max 5 MB per file
 *  - Max 1 file per request
 *  - access: public (URL stored on line-item metadata.photo_url)
 *
 * Multer middleware is registered in `api/middlewares.ts` for this path.
 */

import type { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { MedusaError } from "@medusajs/framework/utils"
import { uploadFilesWorkflow } from "@medusajs/medusa/core-flows"

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
])

const MAX_BYTES = 5 * 1024 * 1024

type MulterFile = {
  originalname: string
  mimetype: string
  buffer: Buffer
  size: number
}

export const POST = async (
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> => {
  const files = (req as MedusaRequest & { files?: MulterFile[] }).files

  if (!files?.length) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "No files were uploaded. Send multipart field 'files'."
    )
  }

  if (files.length > 1) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only one photo may be uploaded at a time."
    )
  }

  const file = files[0]

  if (!ALLOWED_MIME.has(file.mimetype?.toLowerCase())) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Only JPEG, PNG, WebP, or GIF images are allowed."
    )
  }

  if (file.size > MAX_BYTES) {
    throw new MedusaError(
      MedusaError.Types.INVALID_DATA,
      "Image must be 5 MB or smaller."
    )
  }

  const safeName = (file.originalname || "cake-photo.jpg")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 120)

  const { result } = await uploadFilesWorkflow(req.scope).run({
    input: {
      files: [
        {
          filename: `cake-photo-${Date.now()}-${safeName}`,
          mimeType: file.mimetype,
          content: file.buffer.toString("base64"),
          access: "public",
        },
      ],
    },
  })

  const uploaded = result?.[0]
  if (!uploaded?.url) {
    throw new MedusaError(
      MedusaError.Types.UNEXPECTED_STATE,
      "File upload failed. Please try again."
    )
  }

  res.status(200).json({
    files: result.map((f) => ({
      id: f.id,
      url: f.url,
      filename: (f as { filename?: string }).filename ?? safeName,
      mime_type: (f as { mimeType?: string }).mimeType ?? file.mimetype,
    })),
  })
}

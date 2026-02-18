import { buildClient } from '@datocms/cma-client-browser'
import type { SvgRecord } from './types'

/** Upload raw SVG string to DatoCMS media library; returns the upload id for media_upload field. */
export async function uploadSvgToMediaLibrary(
  apiToken: string,
  rawSvg: string,
  filename: string,
  environment?: string,
): Promise<string> {
  const clientOptions: { apiToken: string; environment?: string } = {
    apiToken,
  }
  if (environment) {
    clientOptions.environment = environment
  }
  const client = buildClient(clientOptions)
  const svgData = new Blob([rawSvg], { type: 'image/svg+xml' })
  const svgFile = new File([svgData], filename)
  const upload = await client.uploads.createFromFileOrBlob({
    fileOrBlob: svgFile,
    filename: `${filename}.svg`,
  })
  return upload.id
}

/**
 * Update an existing upload with new SVG content (same upload id, file content replaced).
 * Uses a temp upload then updates the existing one with that path so the media is updated in place.
 */
export async function updateExistingUploadWithSvgContent(
  apiToken: string,
  uploadId: string,
  rawSvg: string,
  filename: string,
  environment?: string,
): Promise<void> {
  const clientOptions: { apiToken: string; environment?: string } = {
    apiToken,
  }
  if (environment) {
    clientOptions.environment = environment
  }
  const client = buildClient(clientOptions)
  const svgData = new Blob([rawSvg], { type: 'image/svg+xml' })
  const svgFile = new File([svgData], filename)
  const tempUpload = await client.uploads.createFromFileOrBlob({
    fileOrBlob: svgFile,
    filename: `${filename}.svg`,
  })
  try {
    await client.uploads.update(uploadId, { path: tempUpload.path })
  } finally {
    await client.uploads.destroy(tempUpload.id)
  }
}

export async function loadSvgRecords(
  apiToken: string,
  modelId: string,
  environment?: string,
): Promise<SvgRecord[]> {
  const clientOptions: any = { apiToken }
  if (environment) {
    clientOptions.environment = environment
  }

  const client = buildClient(clientOptions)

  try {
    const allRecords = await client.items.list({
      page: {
        limit: 500,
      },
      version: 'current', // Include draft/unpublished records
    })

    // Filter manually by item_type
    const records = allRecords.filter((record: any) => {
      const itemTypeId =
        record.item_type?.id || record.relationships?.item_type?.data?.id
      return itemTypeId === modelId
    })

    return records.map((record: any) => {
      // CMA client returns data nested in different structures
      // Check both direct access and attributes access
      const attrs = record.attributes || record

      const svgRecord: SvgRecord = {
        id: record.id as string,
        name: (attrs.name as string) || 'Untitled',
        svg_content: (attrs.svg_content as string) || '',
      }

      const mediaUpload = attrs.media_upload
      if (mediaUpload && typeof mediaUpload === 'object') {
        svgRecord.media_upload = {
          upload_id: mediaUpload.upload_id as string,
          url: mediaUpload.url as string,
        }
      }

      return svgRecord
    })
  } catch (error) {
    console.error('Error loading SVG records:', error)
    return []
  }
}

export async function createSvgRecord(
  apiToken: string,
  modelId: string,
  data: {
    name: string
    svg_content: string
    media_upload?: { upload_id: string }
  },
): Promise<SvgRecord | null> {
  const client = buildClient({ apiToken })

  try {
    const record = await client.items.create({
      item_type: { type: 'item_type', id: modelId },
      ...data,
    })

    const svgRecord: SvgRecord = {
      id: (record as any).id as string,
      name: (record as any).name as string,
      svg_content: (record as any).svg_content as string,
    }

    const mediaUpload = (record as any).media_upload
    if (mediaUpload && typeof mediaUpload === 'object') {
      svgRecord.media_upload = {
        upload_id: mediaUpload.upload_id as string,
        url: mediaUpload.url as string,
      }
    }

    return svgRecord
  } catch (error) {
    console.error('Error creating SVG record:', error)
    return null
  }
}

export async function updateSvgRecord(
  apiToken: string,
  recordId: string,
  data: Partial<{
    name: string
    svg_content: string
    media_upload: { upload_id: string }
  }>,
): Promise<SvgRecord | null> {
  const client = buildClient({ apiToken })

  try {
    const record = await client.items.update(recordId, data)

    const svgRecord: SvgRecord = {
      id: (record as any).id as string,
      name: (record as any).name as string,
      svg_content: (record as any).svg_content as string,
    }

    const mediaUpload = (record as any).media_upload
    if (mediaUpload && typeof mediaUpload === 'object') {
      svgRecord.media_upload = {
        upload_id: mediaUpload.upload_id as string,
        url: mediaUpload.url as string,
      }
    }

    return svgRecord
  } catch (error) {
    console.error('Error updating SVG record:', error)
    return null
  }
}

export async function deleteSvgRecord(
  apiToken: string,
  recordId: string,
): Promise<boolean> {
  const client = buildClient({ apiToken })

  try {
    await client.items.destroy(recordId)
    return true
  } catch (error) {
    console.error('Error deleting SVG record:', error)
    return false
  }
}

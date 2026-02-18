import { buildClient } from '@datocms/cma-client-browser'
import isSvg from 'is-svg'
import type { SvgRecord } from './types'

/** Payload shape we need from ItemCreateSchema | ItemUpdateSchema */
type ItemUpsertPayload = {
  data: {
    id?: string
    attributes?: Record<string, unknown>
    relationships?: { item_type?: { data: { id: string } } }
  }
}

/**
 * Updates the media file with svg_content only when the payload is explicitly for the
 * SVG model (item_type in payload) and svg_content was sent. Called from onBeforeItemUpsert.
 * We never fetch to discover item_type, so saving other records (e.g. parent with icon
 * links) does not trigger sync.
 */
export async function syncMediaOnItemUpsert(
  payload: ItemUpsertPayload,
  apiToken: string | undefined,
  environment: string,
  svgModelId: string | undefined,
): Promise<void> {
  if (!apiToken || !svgModelId) return

  // Only run when payload explicitly identifies the record as our SVG model (no fetch)
  const itemTypeId = payload.data.relationships?.item_type?.data?.id ?? null
  if (itemTypeId !== svgModelId) return

  const attrs = payload.data.attributes ?? {}
  const svgContent =
    typeof attrs.svg_content === 'string' ? attrs.svg_content : ''
  if (!svgContent || !isSvg(svgContent)) return

  const mediaUpload = attrs.media_upload as { upload_id?: string } | undefined
  let uploadId: string | null =
    mediaUpload && typeof mediaUpload.upload_id === 'string'
      ? mediaUpload.upload_id
      : null
  let name = typeof attrs.name === 'string' ? attrs.name : 'untitled'

  // For update, payload often has only changed fields; fetch only to get media_upload/name (we already know it's our model)
  if (payload.data.id && !uploadId) {
    try {
      const client = buildClient({ apiToken, environment })
      const item = await client.items.find(payload.data.id)
      const itemData = item as any
      const currentAttrs = itemData.attributes ?? itemData
      const mu = currentAttrs.media_upload
      if (mu && typeof mu.upload_id === 'string') uploadId = mu.upload_id
      if (name === 'untitled' && (itemData.attributes?.name ?? itemData.name))
        name = String(itemData.attributes?.name ?? itemData.name)
    } catch (err) {
      console.error(
        '[Everything SVG] Auto-sync media: failed to load current record',
        err,
      )
      return
    }
  }

  if (!uploadId) return

  try {
    await updateExistingUploadWithSvgContent(
      apiToken,
      uploadId,
      svgContent,
      name || 'untitled',
      environment,
    )
  } catch (err) {
    console.error('[Everything SVG] Auto-sync media on save failed:', err)
  }
}

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
    const records = await client.items.list({
      filter: { type: modelId },
      page: { limit: 500 },
      version: 'current',
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

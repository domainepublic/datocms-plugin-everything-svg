import { useState, useEffect } from 'react'
import { RenderPageCtx } from 'datocms-plugin-sdk'
import { Canvas, Button, Spinner } from 'datocms-react-ui'
import { Client, buildClient } from '@datocms/cma-client-browser'
import isSvg from 'is-svg'
import { ImageList } from '../../components/ImageList/ImageList'
import { SvgViewer } from '../../components/SvgViewer/SvgViewer'
import { Plus } from '../../components/Icons/plus'
import { GlobalParameters, SvgRecord, SvgUpload } from '../../lib/types'
import { customModalId, defaultFilename } from '../../lib/constants'
import {
  loadSvgRecords,
  createSvgRecord,
  updateSvgRecord,
  deleteSvgRecord,
  uploadSvgToMediaLibrary,
} from '../../lib/recordHelpers'

import * as styles from './PageScreen.module.css'

type Props = {
  ctx: RenderPageCtx
}

// Helper to convert SvgRecord to SvgUpload format for compatibility with existing components
function recordToSvgUpload(record: SvgRecord): SvgUpload {
  const base = {
    id: record.id,
    filename: record.name || undefined,
    raw: record.svg_content,
  }

  if (record.media_upload) {
    return {
      ...base,
      type: 'image' as const,
      imageId: record.media_upload.upload_id,
      url: record.media_upload.url,
    }
  }

  return {
    ...base,
    type: 'svg' as const,
  }
}

export default function PageScreen({ ctx }: Props) {
  let datoClient: Client
  const pluginParameters: GlobalParameters = ctx.plugin.attributes.parameters
  const [svgRecords, setSvgRecords] = useState<SvgRecord[]>([])
  const [rawSvg, setRawSvg] = useState('')
  const [filename, setFilename] = useState(defaultFilename)
  const [isUploading, setIsUploading] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const { currentUserAccessToken, environment } = ctx
  if (currentUserAccessToken) {
    datoClient = buildClient({ apiToken: currentUserAccessToken, environment })
  }

  // Load SVG records on mount
  useEffect(() => {
    async function loadSvgs() {
      if (!pluginParameters.svgModelId || !currentUserAccessToken) {
        setIsLoading(false)
        return
      }

      const records = await loadSvgRecords(
        currentUserAccessToken,
        pluginParameters.svgModelId,
        environment,
      )
      setSvgRecords(records)
      setIsLoading(false)
    }

    loadSvgs()
  }, [pluginParameters.svgModelId, currentUserAccessToken])

  async function saveSvg(rawSvg: string) {
    if (!rawSvg || !isSvg(rawSvg)) {
      return
    }

    if (!pluginParameters.svgModelId || !currentUserAccessToken) {
      ctx.alert('SVG model not found. Please complete setup.')
      return
    }

    try {
      setIsUploading(true)

      const uploadId = await uploadSvgToMediaLibrary(
        currentUserAccessToken,
        rawSvg,
        filename,
        environment,
      )

      const newRecord = await createSvgRecord(
        currentUserAccessToken,
        pluginParameters.svgModelId,
        {
          name: filename,
          svg_content: rawSvg,
          media_upload: { upload_id: uploadId },
        },
      )

      if (newRecord) {
        setSvgRecords([newRecord, ...svgRecords])
        ctx.notice('SVG uploaded successfully!')
      } else {
        ctx.alert('Failed to create SVG record')
      }
    } finally {
      setIsUploading(false)
      setRawSvg('')
      setFilename(defaultFilename)
    }
  }

  async function removeImageSvg(uploadId: string) {
    try {
      setIsRemoving(true)
      await datoClient.uploads.destroy(uploadId)
    } catch (error) {
      console.error(error)
    } finally {
      setIsRemoving(false)
    }
  }

  /** Sync media_upload (admin preview) from svg_content for all records. Use after editing SVG content in the CMS. */
  async function syncAllPreviews() {
    if (!pluginParameters.svgModelId || !currentUserAccessToken) {
      ctx.alert('SVG model not found. Please complete setup.')
      return
    }
    try {
      setIsSyncingAll(true)
      let synced = 0
      for (const record of svgRecords) {
        if (!record.svg_content || !isSvg(record.svg_content)) continue
        try {
          const uploadId = await uploadSvgToMediaLibrary(
            currentUserAccessToken,
            record.svg_content,
            record.name || 'untitled',
            environment,
          )
          if (record.media_upload) {
            await datoClient.uploads.destroy(record.media_upload.upload_id)
          }
          const updated = await updateSvgRecord(
            currentUserAccessToken,
            record.id,
            { media_upload: { upload_id: uploadId } },
          )
          if (updated) {
            setSvgRecords((prev) =>
              prev.map((r) => (r.id === record.id ? updated : r)),
            )
            synced += 1
          }
        } catch (err) {
          console.error(`Failed to sync preview for ${record.name}:`, err)
        }
      }
      if (synced > 0) {
        ctx.notice(
          synced === 1 ? '1 preview synced.' : `${synced} previews synced.`,
        )
      }
    } finally {
      setIsSyncingAll(false)
    }
  }

  async function deleteSvg(svg: SvgUpload) {
    if (!currentUserAccessToken) {
      return
    }

    // Find the actual record
    const record = svgRecords.find((r) => r.id === svg.id)
    if (!record) {
      return
    }

    if (record.media_upload) {
      await removeImageSvg(record.media_upload.upload_id)
    }

    // Delete the record
    const success = await deleteSvgRecord(currentUserAccessToken, record.id)

    if (success) {
      setSvgRecords(svgRecords.filter((r) => r.id !== record.id))
      ctx.notice('SVG deleted successfully!')
    } else {
      ctx.alert('Failed to delete SVG')
    }
  }

  async function openUploadModal(svg: SvgUpload) {
    if (svg.type !== 'image') {
      return
    }

    let item: any = null
    item = await ctx.editUpload(svg.imageId)

    if (item && item.deleted) {
      await deleteSvg(svg)
      return
    }

    if (item && item.attributes.basename !== svg.filename) {
      await renameSvg({ ...svg, filename: item.attributes.basename })
    }
  }

  async function openCustomModal(svg: SvgUpload) {
    let item: null | (typeof svg & { deleted?: boolean }) = null
    item = (await ctx.openModal({
      id: customModalId,
      title: 'Raw details',
      width: 's',
      parameters: { rawSvg: svg },
    })) as typeof svg & { deleted?: boolean }

    if (item && item.deleted) {
      await deleteSvg(svg)
      return
    }

    if (!item) return

    // If raw content changed, update record and re-sync media_upload (includes name)
    if (item.raw !== svg.raw && isSvg(item.raw) && currentUserAccessToken) {
      const record = svgRecords.find((r) => r.id === svg.id)
      if (record) {
        try {
          setIsUploading(true)
          const uploadId = await uploadSvgToMediaLibrary(
            currentUserAccessToken,
            item.raw,
            item.filename || record.name,
            environment,
          )
          if (record.media_upload) {
            await datoClient.uploads.destroy(record.media_upload.upload_id)
          }
          const updatedRecord = await updateSvgRecord(
            currentUserAccessToken,
            record.id,
            {
              name: item.filename || record.name,
              svg_content: item.raw,
              media_upload: { upload_id: uploadId },
            },
          )
          if (updatedRecord) {
            setSvgRecords(
              svgRecords.map((r) => (r.id === record.id ? updatedRecord : r)),
            )
            ctx.notice('SVG updated successfully!')
          }
        } finally {
          setIsUploading(false)
        }
        return
      }
    }

    if (item.filename !== svg.filename) {
      await renameSvg({ ...svg, filename: item.filename })
    }
  }

  async function renameSvg(svg: SvgUpload) {
    if (!currentUserAccessToken) {
      return
    }

    const updatedRecord = await updateSvgRecord(
      currentUserAccessToken,
      svg.id,
      {
        name: svg.filename,
      },
    )

    if (updatedRecord) {
      setSvgRecords(
        svgRecords.map((r) => (r.id === svg.id ? updatedRecord : r)),
      )
      ctx.notice('SVG renamed successfully!')
    } else {
      ctx.alert('Failed to rename SVG')
    }
  }

  // Convert records to SvgUpload format for ImageList component
  const svgUploads = svgRecords.map(recordToSvgUpload)

  return (
    <Canvas ctx={ctx}>
      <div className="layout">
        <SvgViewer
          value={rawSvg}
          onChangeSvg={setRawSvg}
          filename={filename}
          onChangeFilename={setFilename}
        />

        <div className={styles.uploadContainer}>
          {isUploading && <Spinner />}

          {!isUploading && (
            <Button
              disabled={!isSvg(rawSvg)}
              onClick={() => saveSvg(rawSvg)}
              leftIcon={<Plus />}
            >
              Upload raw svg
            </Button>
          )}
        </div>

        <h3 className="h2">Uploaded svgs</h3>

        {!isLoading && svgRecords.length > 0 && (
          <p className={styles.syncHint}>
            Changed SVG content in the CMS?{' '}
            <Button
              buttonType="muted"
              buttonSize="s"
              onClick={syncAllPreviews}
              disabled={isSyncingAll}
            >
              {isSyncingAll ? 'Syncing…' : 'Sync all previews'}
            </Button>
          </p>
        )}

        {isLoading && <Spinner />}
        {!isLoading && svgUploads.length === 0 && <p>Nothing to show (yet)</p>}
        {!isLoading && (
          <ImageList
            svgs={svgUploads}
            onDelete={isRemoving ? undefined : deleteSvg}
            onShowUpload={openUploadModal}
            onShowRaw={openCustomModal}
            isLoading={isRemoving}
            showTag
          />
        )}
      </div>
    </Canvas>
  )
}

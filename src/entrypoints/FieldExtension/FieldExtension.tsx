import { useState, useEffect, useRef } from 'react'
import get from 'lodash/get'
import { RenderFieldExtensionCtx } from 'datocms-plugin-sdk'
import { Canvas, Spinner, Button } from 'datocms-react-ui'
import isSvg from 'is-svg'
import { ImageList } from '../../components/ImageList/ImageList'
import {
  FieldParameters,
  GlobalParameters,
  SvgUpload,
  SvgRecord,
} from '../../lib/types'
import { ImageViewer } from '../../components/ImageViewer/ImageViewer'
import {
  loadSvgRecords,
  updateExistingUploadWithSvgContent,
} from '../../lib/recordHelpers'

import * as styles from './FieldExtension.module.css'

type Props = {
  ctx: RenderFieldExtensionCtx
}

// Helper to convert SvgRecord to SvgUpload format for compatibility
function recordToSvgUpload(record: SvgRecord): SvgUpload {
  const base = {
    id: record.id,
    filename: record.name,
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

export default function FieldExtension({ ctx }: Props) {
  const fieldValue: string = String(get(ctx.formValues, ctx.fieldPath))
  const pluginParameters: GlobalParameters = ctx.plugin.attributes.parameters
  const fieldParameters: FieldParameters = ctx.parameters

  const [svgRecords, setSvgRecords] = useState<SvgRecord[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncingMedia, setIsSyncingMedia] = useState(false)
  // Local value for svg_content textarea to avoid cursor jumping on re-renders
  const [localSvgContent, setLocalSvgContent] = useState(() => String(get(ctx.formValues, ctx.fieldPath) ?? get(ctx.formValues, 'svg_content') ?? ''))
  const lastSetSvgContentRef = useRef<string | null>(null)

  const isSvgModelRecord =
    ctx.itemType?.id && ctx.itemType.id === pluginParameters.svgModelId
  const isSvgContentFieldOnSvgModel =
    isSvgModelRecord && ctx.field?.attributes?.api_key === 'svg_content'
  const svgContentFromForm: string = String(
    get(ctx.formValues, ctx.fieldPath) ??
      get(ctx.formValues, 'svg_content') ??
      '',
  )
  const mediaUploadFromForm = get(ctx.formValues, 'media_upload') as
    | { upload_id?: string }
    | undefined
  const existingUploadId =
    mediaUploadFromForm?.upload_id &&
    typeof mediaUploadFromForm.upload_id === 'string'
      ? mediaUploadFromForm.upload_id
      : null
  const recordNameFromForm: string = String(get(ctx.formValues, 'name') ?? '')
  const effectiveSvgContent =
    isSvgContentFieldOnSvgModel ? localSvgContent : svgContentFromForm
  const canSyncMedia =
    isSvgModelRecord &&
    !!existingUploadId &&
    !!effectiveSvgContent &&
    isSvg(effectiveSvgContent) &&
    !!ctx.currentUserAccessToken

  // Sync local textarea value from form when it changes externally (e.g. record switch)
  useEffect(() => {
    if (svgContentFromForm !== lastSetSvgContentRef.current) {
      lastSetSvgContentRef.current = svgContentFromForm
      setLocalSvgContent(svgContentFromForm)
    }
  }, [svgContentFromForm])

  // Load SVG records on mount
  useEffect(() => {
    async function loadSvgs() {
      if (
        !pluginParameters.svgModelId ||
        !ctx.currentUserAccessToken ||
        !pluginParameters.isSetupComplete
      ) {
        // Fall back to parameter-based SVGs if model not set up
        setIsLoading(false)
        return
      }

      try {
        const records = await loadSvgRecords(
          ctx.currentUserAccessToken,
          pluginParameters.svgModelId,
          ctx.environment,
        )
        setSvgRecords(records)
      } catch (error) {
        console.error('Error loading SVG records:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadSvgs()
  }, [
    pluginParameters.svgModelId,
    pluginParameters.isSetupComplete,
    ctx.currentUserAccessToken,
  ])

  function handleClick(image: SvgUpload) {
    ctx.setFieldValue(ctx.fieldPath, image.raw)
  }

  function handleDelete() {
    ctx.setFieldValue(ctx.fieldPath, '')
  }

  function handleSvgContentChange(value: string) {
    setLocalSvgContent(value)
    lastSetSvgContentRef.current = value
    ctx.setFieldValue(ctx.fieldPath, value)
  }

  async function handleSyncMedia() {
    if (!canSyncMedia || !ctx.currentUserAccessToken) return
    setIsSyncingMedia(true)
    try {
      await updateExistingUploadWithSvgContent(
        ctx.currentUserAccessToken,
        existingUploadId!,
        effectiveSvgContent,
        recordNameFromForm || 'untitled',
        ctx.environment,
      )
      ctx.notice('Media preview updated with current SVG content.')
    } catch (err) {
      console.error('Sync media failed:', err)
      ctx.alert(
        err instanceof Error ? err.message : 'Failed to update media preview.',
      )
    } finally {
      setIsSyncingMedia(false)
    }
  }

  // Convert records to SvgUpload format
  const svgsFromRecords = svgRecords.map(recordToSvgUpload)

  // Fallback to parameter-based SVGs if records not loaded yet or setup not complete
  const parameterSvgs = fieldParameters.showAllSvgs
    ? pluginParameters.svgs
    : fieldParameters.selectedSvgs

  // Use records if available, otherwise use parameter-based SVGs
  const svgs =
    svgsFromRecords.length > 0 || pluginParameters.isSetupComplete
      ? svgsFromRecords
      : parameterSvgs || []

  // SVG model's svg_content field: show default-style textarea + Sync media below
  if (isSvgContentFieldOnSvgModel) {
    return (
      <Canvas ctx={ctx}>
        <div className={styles.svgContentEditor}>
          <textarea
            className={styles.svgContentTextarea}
            value={localSvgContent}
            onChange={(e) => handleSvgContentChange(e.target.value)}
            spellCheck={false}
            rows={12}
          />
          <div className={styles.syncMedia}>
            <Button
              buttonType="primary"
              buttonSize="s"
              onClick={handleSyncMedia}
              disabled={!canSyncMedia || isSyncingMedia}
            >
              {isSyncingMedia ? 'Syncing…' : 'Sync media'}
            </Button>
            <span className={styles.syncMediaHint}>
              {canSyncMedia
                ? 'Updates the media preview with the SVG content above.'
                : 'Add a media file in the Media Upload field first, then sync.'}
            </span>
          </div>
        </div>
      </Canvas>
    )
  }

  let content = <p>No SVG images to show</p>

  if (isLoading) {
    content = <Spinner />
  } else if (fieldValue) {
    content = (
      <div className={styles.content}>
        <ImageViewer
          size="s"
          image={{ id: ctx.field.id, raw: fieldValue, type: 'svg' }}
          onDelete={handleDelete}
        />
      </div>
    )
  } else if (svgs && svgs.length > 0) {
    content = <ImageList svgs={svgs} onClick={handleClick} size="s" />
  }

  return (
    <Canvas ctx={ctx}>
      <div className={styles.wrapper}>{content}</div>
    </Canvas>
  )
}

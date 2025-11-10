import { RenderPageCtx } from 'datocms-plugin-sdk'
import { Canvas, Button, Spinner } from 'datocms-react-ui'
import { useState } from 'react'
import { createSvgModel } from '../../lib/modelHelpers'
import type { GlobalParameters } from '../../lib/types'
import * as styles from './SetupScreen.module.css'

type Props = {
  ctx: RenderPageCtx
}

export default function SetupScreen({ ctx }: Props) {
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleCreateModel = async () => {
    setIsCreating(true)
    setError(null)

    try {
      const model = await createSvgModel(ctx.currentUserAccessToken!)

      // Update plugin parameters with the model ID
      const pluginParameters: GlobalParameters =
        ctx.plugin.attributes.parameters
      await ctx.updatePluginParameters({
        ...pluginParameters,
        svgModelId: model.id,
        isSetupComplete: true,
      })

      // Show success message
      ctx.notice('SVG model created successfully!')

      // Redirect to the main uploader page
      setTimeout(() => {
        ctx.navigateTo('/') // Navigate to home/main page
      }, 1000)
    } catch (err) {
      console.error('Error creating model:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to create SVG model',
      )
    } finally {
      setIsCreating(false)
    }
  }

  return (
    <Canvas ctx={ctx}>
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={styles.title}>Welcome to Everything SVG!</h1>
          <p className={styles.description}>
            To get started, we need to create a model to store your SVGs. This
            model will be used to store all your SVG files as records in
            DatoCMS.
          </p>

          <div className={styles.details}>
            <h2>What will be created:</h2>
            <ul>
              <li>
                <strong>Model:</strong> "Plugin SVG" (API key: plugin_svg)
              </li>
              <li>
                <strong>Fields:</strong>
                <ul>
                  <li>Name (single-line string)</li>
                  <li>SVG Content (textarea)</li>
                  <li>Type (single-line string: 'svg' or 'image')</li>
                  <li>Media Upload (optional asset field)</li>
                </ul>
              </li>
            </ul>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <Button
              buttonSize="l"
              buttonType="primary"
              onClick={handleCreateModel}
              disabled={isCreating}
            >
              {isCreating ? (
                <>
                  <Spinner size={24} />
                  <span>Creating model...</span>
                </>
              ) : (
                'Create SVG Model'
              )}
            </Button>
          </div>

          <p className={styles.note}>
            Note: You can delete this model later from your DatoCMS schema
            settings if needed.
          </p>
        </div>
      </div>
    </Canvas>
  )
}

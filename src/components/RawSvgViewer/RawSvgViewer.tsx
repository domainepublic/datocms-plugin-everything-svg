import { useState, useEffect } from 'react'
import classNames from 'classnames'
import { SidebarPanel, Button } from 'datocms-react-ui'
import { SvgUpload } from '../../lib/types'

import * as styles from './RawSvgViewer.module.css'

type Props = {
  svg: SvgUpload
  onRename?: (svg: SvgUpload) => void
  onDelete?: (svg: SvgUpload) => void
  onSave?: (svg: SvgUpload) => void
}

export function RawSvgViewer({ svg, onRename, onDelete, onSave }: Props) {
  const [isEditing, setIsEditing] = useState(false)
  const [name, setName] = useState(svg.filename)
  const [raw, setRaw] = useState(svg.raw)
  const [isEditingRaw, setIsEditingRaw] = useState(false)

  useEffect(() => {
    setName(svg.filename)
    setRaw(svg.raw)
  }, [svg.filename, svg.raw])

  function handleRename() {
    setIsEditing(true)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter' && onRename) {
      onRename({ ...svg, filename: name })
      setIsEditing(false)
    }
  }

  function handleSaveRaw() {
    if (onSave) {
      onSave({ ...svg, raw, filename: name || svg.filename })
      setIsEditingRaw(false)
    }
  }

  const hasRawChanges = raw !== svg.raw

  return (
    <>
      <div
        className={classNames(styles.header, {
          [styles.editing]: isEditing,
        })}
      >
        <div
          className={styles.svgLogo}
          dangerouslySetInnerHTML={{ __html: isEditingRaw ? '' : raw }}
        />
        <div>
          {isEditing ? (
            <input
              className={styles.input}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleKeyDown}
            />
          ) : (
            <h2 className={classNames('h3', styles.title)}>{name}</h2>
          )}
          <div className={styles.buttonList}>
            {isEditing ? (
              <p className={styles.editingText}>Press Enter to confirm</p>
            ) : (
              <>
                {onRename && (
                  <>
                    <button
                      className={styles.button}
                      type="button"
                      onClick={handleRename}
                    >
                      <span>Rename</span>
                    </button>
                    <span>•</span>
                  </>
                )}
                {onDelete && (
                  <button
                    className={classNames(styles.button, styles.deleteButton)}
                    type="button"
                    onClick={() => onDelete(svg)}
                  >
                    <span>Delete</span>
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <SidebarPanel title="Raw data" startOpen>
        {isEditingRaw ? (
          <>
            <textarea
              className={styles.rawTextarea}
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              spellCheck={false}
              rows={12}
            />
            <div className={styles.rawActions}>
              <Button onClick={handleSaveRaw} disabled={!hasRawChanges}>
                Save
              </Button>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setRaw(svg.raw)
                  setIsEditingRaw(false)
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <pre className={styles.rawCode}>{raw}</pre>
            {onSave && (
              <button
                type="button"
                className={styles.button}
                onClick={() => setIsEditingRaw(true)}
              >
                Edit & save
              </button>
            )}
          </>
        )}
      </SidebarPanel>
    </>
  )
}

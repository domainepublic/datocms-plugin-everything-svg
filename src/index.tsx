import {
  connect,
  ContentAreaSidebarItem,
  IntentCtx,
  MainNavigationTab,
  OnBootCtx,
  RenderConfigScreenCtx,
  RenderFieldExtensionCtx,
  RenderManualFieldExtensionConfigScreenCtx,
  RenderModalCtx,
  RenderPageCtx,
  SettingsAreaSidebarItemGroup,
} from 'datocms-plugin-sdk'

import ConfigScreen from './entrypoints/ConfigScreen/ConfigScreen'
import PageScreen from './entrypoints/PageScreen/PageScreen'
import FieldExtensionConfigScreen from './entrypoints/FieldExtensionConfigScreen/FieldExtensionConfigScreen'
import FieldExtension from './entrypoints/FieldExtension/FieldExtension'
import CustomModal from './entrypoints/CustomModal/CustomModal'
import { render } from './lib/render'
import { GlobalParameters, PageType } from './lib/types'
import {
  contentAreaSidebarItemPlacement,
  customModalId,
  defaultIconName,
  defaultPageGroupName,
  defaultPageName,
  defaultPageSlug,
  mainNavigationTabPlacement,
  placementOptions,
  settingsAreaSidebarItemPlacement,
} from './lib/constants'
import { checkIfModelExists } from './lib/modelHelpers'
import { syncMediaOnItemUpsert } from './lib/recordHelpers'

import './styles/index.css'

const fieldSettings = {
  id: 'svg-selector',
  name: 'SVG Selector',
}

connect({
  async onBoot(ctx: OnBootCtx) {
    const pluginParameters: GlobalParameters = ctx.plugin.attributes.parameters

    console.log(
      '[Plugin Boot] isSetupComplete:',
      pluginParameters.isSetupComplete,
    )
    console.log('[Plugin Boot] svgModelId:', pluginParameters.svgModelId)

    // Check if setup is complete
    if (!pluginParameters.isSetupComplete) {
      // Check if the model already exists (in case setup was interrupted)
      const existingModelId = await checkIfModelExists(
        ctx.currentUserAccessToken!,
      )

      console.log('[Plugin Boot] Found existing model ID:', existingModelId)

      if (existingModelId) {
        // Model exists, mark setup as complete
        await ctx.updatePluginParameters({
          ...pluginParameters,
          svgModelId: existingModelId,
          isSetupComplete: true,
        })
        console.log('[Plugin Boot] Auto-marked setup as complete')
      }
    }
  },
  renderConfigScreen(ctx: RenderConfigScreenCtx) {
    return render(<ConfigScreen ctx={ctx} />)
  },
  mainNavigationTabs(ctx: IntentCtx) {
    const pluginParameters: GlobalParameters = ctx.plugin.attributes.parameters

    if (
      !ctx.currentRole.meta.final_permissions.can_edit_schema &&
      pluginParameters.pageType?.value !== PageType.MainNavigationTabs
    ) {
      return []
    }

    const placement = [
      pluginParameters.placement?.value || placementOptions[0].value,
      pluginParameters.menuItemPlacement?.value ||
        mainNavigationTabPlacement[0].value,
    ] as MainNavigationTab['placement']

    return [
      {
        label: defaultPageName,
        icon: defaultIconName,
        placement,
        pointsTo: {
          pageId: `${defaultPageSlug}--${ctx.plugin.id}`,
        },
      },
    ]
  },
  contentAreaSidebarItems(ctx: IntentCtx) {
    const pluginParameters: GlobalParameters = ctx.plugin.attributes.parameters

    if (
      !ctx.currentRole.meta.final_permissions.can_edit_schema &&
      pluginParameters.pageType?.value !== PageType.ContentAreaSidebarItems
    ) {
      return []
    }

    const placement = [
      pluginParameters.placement?.value || placementOptions[0].value,
      pluginParameters.menuItemPlacement?.value ||
        contentAreaSidebarItemPlacement[0].value,
    ] as ContentAreaSidebarItem['placement']

    return [
      {
        label: defaultPageName,
        icon: defaultIconName,
        placement,
        pointsTo: {
          pageId: `${defaultPageSlug}--${ctx.plugin.id}`,
        },
      },
    ]
  },
  settingsAreaSidebarItemGroups(ctx: IntentCtx) {
    const pluginParameters: GlobalParameters = ctx.plugin.attributes.parameters

    if (
      !ctx.currentRole.meta.final_permissions.can_edit_schema &&
      pluginParameters.pageType?.value !==
        PageType.SettingsAreaSidebarItemGroups
    ) {
      return []
    }

    const placement = [
      pluginParameters.placement?.value || placementOptions[0].value,
      pluginParameters.menuItemPlacement?.value ||
        settingsAreaSidebarItemPlacement[0].value,
    ] as SettingsAreaSidebarItemGroup['placement']

    return [
      {
        label: defaultPageGroupName,
        placement,
        items: [
          {
            label: defaultPageName,
            icon: defaultIconName,
            pointsTo: {
              pageId: `${defaultPageSlug}--${ctx.plugin.id}`,
            },
          },
        ],
      },
    ]
  },
  renderPage(pageId: string, ctx: RenderPageCtx) {
    if (pageId === `${defaultPageSlug}--${ctx.plugin.id}`) {
      return render(<PageScreen ctx={ctx} />)
    }
  },
  renderModal(modalId: string, ctx: RenderModalCtx) {
    switch (modalId) {
      case customModalId:
        return render(<CustomModal ctx={ctx} />)
    }
  },
  manualFieldExtensions() {
    return [
      {
        id: fieldSettings.id,
        name: fieldSettings.name,
        type: 'editor',
        fieldTypes: ['string', 'text'],
        configurable: true,
      },
    ]
  },
  renderManualFieldExtensionConfigScreen(
    _,
    ctx: RenderManualFieldExtensionConfigScreenCtx,
  ) {
    return render(<FieldExtensionConfigScreen ctx={ctx} />)
  },
  renderFieldExtension(_, ctx: RenderFieldExtensionCtx) {
    return render(<FieldExtension ctx={ctx} />)
  },

  overrideFieldExtensions(field, ctx) {
    const pluginParameters: GlobalParameters = ctx.plugin.attributes.parameters
    const svgModelId = pluginParameters.svgModelId
    if (
      !svgModelId ||
      ctx.itemType.id !== svgModelId ||
      field.attributes?.api_key !== 'svg_content'
    ) {
      return undefined
    }
    return { editor: { id: fieldSettings.id } }
  },

  async onBeforeItemUpsert(payload, ctx) {
    const pluginParameters: GlobalParameters = ctx.plugin.attributes.parameters
    if (!pluginParameters.isSetupComplete || !pluginParameters.svgModelId) {
      return true
    }
    await syncMediaOnItemUpsert(
      payload as {
        data: {
          id?: string
          attributes?: Record<string, unknown>
          relationships?: { item_type?: { data: { id: string } } }
        }
      },
      ctx.currentUserAccessToken,
      ctx.environment,
      pluginParameters.svgModelId,
    )
    return true
  },
})

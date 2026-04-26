import { z } from "zod"

export const wizardModeSchema = z.enum(["section", "chat"])
export const themeSchema = z.enum(["system", "light", "dark"])

export type WizardMode = z.infer<typeof wizardModeSchema>
export type Theme = z.infer<typeof themeSchema>

export const updatePreferencesInputSchema = z.object({
  wizardMode: wizardModeSchema.optional(),
  theme: themeSchema.optional(),
})

export type UpdatePreferencesInput = z.infer<
  typeof updatePreferencesInputSchema
>

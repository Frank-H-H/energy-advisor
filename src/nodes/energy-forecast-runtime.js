import path from 'path'
import { pathToFileURL } from 'url'

export async function runForecast(input, systemConfigObject = null, batteryConfigObject = null, gridConfigObject = null) {
  // resolve core and schemas via file URLs so dynamic import works in different environments
  const coreUrl = pathToFileURL(path.join(process.cwd(), 'src', 'index.js')).href
  const schemasUrl = pathToFileURL(path.join(process.cwd(), 'src', 'configs', 'schemas.js')).href

  const core = await import(coreUrl)
  const schemas = await import(schemasUrl)
  const ForecastEngine = core.ForecastEngine

  const inputCopy = { ...input }
  if (systemConfigObject || batteryConfigObject || gridConfigObject) {
    inputCopy.components = schemas.mapSystemConfigToComponents(systemConfigObject || {}, batteryConfigObject, gridConfigObject)
  }

  const out = ForecastEngine.run(inputCopy)
  return out
}

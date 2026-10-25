/**
 * `validateToolDef`: check a value's shape before registering it as a tool,
 * for a host that loads `ToolDef`s from a module it did not write.
 */

import { EVIDENCE_TIERS } from './aspect.ts'

/**
 * The problems that keep `value` from being a `ToolDef`, one sentence each,
 * naming the field (`roles.runner.collect is not a function`). Empty when it
 * is one.
 *
 * Checks the shape only: types, required fields, and that each function is a
 * function. It never calls a function, so it runs none of the module's code.
 */
export function validateToolDef(value: unknown): string[] {
  const out: string[] = []
  if (!isObject(value)) return ['the tool is not an object']

  if (typeof value['id'] !== 'string' || value['id'] === '')
    out.push('id is not a non-empty string')
  optionalString(value, 'homepage', '', out)
  optionalString(value, 'description', '', out)
  optionalString(value, 'binary', '', out)
  optionalStrings(value, 'commandWords', '', out)
  optionalFunction(value, 'detect', '', out)
  optionalFunction(value, 'describe', '', out)
  if (value['brand'] !== undefined && !isObject(value['brand'])) out.push('brand is not an object')

  const markers = value['markers']
  if (markers !== undefined) {
    if (!Array.isArray(markers)) out.push('markers is not an array')
    else {
      markers.forEach((m: unknown, i) => {
        if (!isObject(m) || typeof m['files'] !== 'string') {
          out.push(`markers[${i}].files is not a string`)
        } else if (!Object.hasOwn(EVIDENCE_TIERS, String(m['tier']))) {
          out.push(`markers[${i}].tier is not one of ${Object.keys(EVIDENCE_TIERS).join(', ')}`)
        }
      })
    }
  }

  const eco = value['ecosystem']
  if (eco !== undefined) {
    if (!isObject(eco)) out.push('ecosystem is not an object')
    else {
      if (typeof eco['id'] !== 'string') out.push('ecosystem.id is not a string')
      for (const key of ['manifests', 'languages', 'tools']) {
        if (!Array.isArray(eco[key])) out.push(`ecosystem.${key} is not an array`)
      }
    }
  }

  const roles = value['roles']
  if (!isObject(roles)) {
    out.push('roles is not an object')
    return out
  }
  role(roles, 'packageManager', out, (r, at) => {
    requiredStrings(r, 'lockfiles', at, out)
    requiredStrings(r, 'install', at, out)
  })
  role(roles, 'runner', out, (r, at) => {
    if (r['kind'] !== 'parse' && r['kind'] !== 'exec') out.push(`${at}kind is not parse or exec`)
    if (typeof r['collect'] !== 'function') out.push(`${at}collect is not a function`)
    optionalFunction(r, 'invoke', at, out)
    if (r['chain'] !== undefined && !Array.isArray(r['chain']))
      out.push(`${at}chain is not an array`)
    optionalStrings(r, 'watch', at, out)
    const probe = r['probe']
    if (probe !== undefined) {
      if (!isObject(probe)) out.push(`${at}probe is not an object`)
      else {
        const ms = probe['timeoutMs']
        if (ms !== undefined && !(typeof ms === 'number' && Number.isFinite(ms) && ms > 0)) {
          out.push(`${at}probe.timeoutMs is not a positive number`)
        }
        const cost = probe['cost']
        if (cost !== undefined && cost !== 'cheap' && cost !== 'slow') {
          out.push(`${at}probe.cost is not cheap or slow`)
        }
      }
    }
  })
  role(roles, 'toolManager', out, (r, at) => requiredStrings(r, 'configs', at, out))
  role(roles, 'hookManager', out, (r, at) => {
    requiredStrings(r, 'configs', at, out)
    if (typeof r['arm'] !== 'function') out.push(`${at}arm is not a function`)
    optionalFunction(r, 'hooks', at, out)
  })
  return out
}

function role(
  roles: Record<string, unknown>,
  name: string,
  out: string[],
  check: (role: Record<string, unknown>, at: string) => void,
): void {
  const r = roles[name]
  if (r === undefined) return
  if (!isObject(r)) out.push(`roles.${name} is not an object`)
  else check(r, `roles.${name}.`)
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isStrings(v: unknown): boolean {
  return Array.isArray(v) && v.every((s) => typeof s === 'string')
}

function optionalString(o: Record<string, unknown>, key: string, at: string, out: string[]) {
  if (o[key] !== undefined && typeof o[key] !== 'string') out.push(`${at}${key} is not a string`)
}

function optionalStrings(o: Record<string, unknown>, key: string, at: string, out: string[]) {
  if (o[key] !== undefined && !isStrings(o[key])) out.push(`${at}${key} is not a list of strings`)
}

function requiredStrings(o: Record<string, unknown>, key: string, at: string, out: string[]) {
  if (!isStrings(o[key])) out.push(`${at}${key} is not a list of strings`)
}

function optionalFunction(o: Record<string, unknown>, key: string, at: string, out: string[]) {
  if (o[key] !== undefined && typeof o[key] !== 'function') {
    out.push(`${at}${key} is not a function`)
  }
}

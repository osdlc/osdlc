/**
 * The core entry: the log envelope every line carries, the correlation ids and
 * the environment tags that pass them to child processes, sortable ids, the
 * JSONL writer and reader, and the stable machine id. The session record lives
 * in the `./session` entry.
 */

export {
  correlationFromEnv,
  INVOCATION_ENV_VAR,
  INVOCATION_PID_ENV_VAR,
  LOG_ENVELOPE_VERSION,
  LOG_SOURCES,
  LogEnvelopeSchema,
  LogSourceSchema,
  newRunId,
  newSortableId,
  RUN_ENV_VAR,
  SESSION_ENV_VAR,
  SUBJECT_ENV_VAR,
  type Correlation,
  type LogEnvelope,
  type LogSource,
} from './envelope.ts'

export {
  appendJsonl,
  jsonlSize,
  parseJsonl,
  readJsonl,
  readJsonlFrom,
  type AppendOptions,
  type JsonlTail,
} from './writer.ts'

export {
  deriveMachineId,
  isThisMachine,
  MACHINE_ENV_VAR,
  machineId,
  resolveOriginator,
  type MachineProbe,
  type Originator,
  type OriginatorProbe,
} from './machine.ts'

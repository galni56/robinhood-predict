import assert from 'node:assert/strict'
import test from 'node:test'
import { earliestDeploymentDueAt, parseLegacyDeployments } from './keeper-deployments.mjs'

const active = '0x1111111111111111111111111111111111111111'
const legacyOne = '0x2222222222222222222222222222222222222222'
const legacyTwo = '0x3333333333333333333333333333333333333333'

test('legacy deployment parsing is explicit, ordered and uses the configured scan floor', () => {
  assert.deepEqual(parseLegacyDeployments(`${legacyOne}, ${legacyTwo}`, {
    activeAddress: active,
    scanFrom: 12n,
    variableName: 'TEST_LEGACY_ADDRESSES',
  }), [
    { address: legacyOne, label: 'legacy-1', scanFrom: 12n },
    { address: legacyTwo, label: 'legacy-2', scanFrom: 12n },
  ])
})

test('legacy deployment parsing rejects invalid, duplicate and active addresses', () => {
  assert.throws(() => parseLegacyDeployments('not-an-address', {
    activeAddress: active,
    variableName: 'TEST_LEGACY_ADDRESSES',
  }), /invalid address/)
  assert.throws(() => parseLegacyDeployments(`${legacyOne},${legacyOne}`, {
    activeAddress: active,
    variableName: 'TEST_LEGACY_ADDRESSES',
  }), /unique addresses/)
  assert.throws(() => parseLegacyDeployments(active, {
    activeAddress: active,
    variableName: 'TEST_LEGACY_ADDRESSES',
  }), /distinct from the active contract/)
})

test('poll scheduling follows the earliest due item across active and legacy deployments', () => {
  const deployments = [
    { tracker: { earliestDueAt: () => 300n } },
    { tracker: { earliestDueAt: () => undefined } },
    { tracker: { earliestDueAt: () => 125n } },
  ]
  assert.equal(earliestDeploymentDueAt(deployments), 125n)
  assert.equal(earliestDeploymentDueAt([{ tracker: { earliestDueAt: () => undefined } }]), undefined)
})

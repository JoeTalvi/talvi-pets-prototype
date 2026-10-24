import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, expectTypeOf, it } from 'vitest';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import * as select from '../../src/sim/select';
import { CONTRACT_VERSION } from '../../src/sim/state';
import * as names from '../fixtures/core-contract';
// The live Phase 2 document sits outside game/ and is untracked; isolated checkouts skip the drift check.
const liveDocPresent = existsSync(names.SOURCE_DOC);
if (!liveDocPresent)
  process.stdout.write(`contract.test: ${names.SOURCE_DOC} absent; live-doc drift check skipped (vendored fixture still asserted)\n`);

function unionNames(path: string, alias: string): string[] {
  const source = ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const declaration = source.statements.find(statement =>
    ts.isTypeAliasDeclaration(statement) && statement.name.text === alias) as ts.TypeAliasDeclaration;
  if (!ts.isUnionTypeNode(declaration.type)) throw new Error(`Expected union ${alias}`);
  return declaration.type.types.map(member => {
    if (!ts.isTypeLiteralNode(member)) throw new Error(`Expected literal ${alias} member`);
    const property = member.members.find(item => ts.isPropertySignature(item) &&
      item.name.getText(source) === 'type') as ts.PropertySignature;
    if (!property.type || !ts.isLiteralTypeNode(property.type) || !ts.isStringLiteral(property.type.literal))
      throw new Error(`Expected string discriminator in ${alias}`);
    return property.type.literal.text;
  });
}

it('VERIFY-CORE-001: three set equalities at v1.4 — Action union = 24 actions, SimEvent union = 39 events, select exports = 27 selectors; CONTRACT_VERSION 1.4', () => {
  expectTypeOf<Action['type']>().toEqualTypeOf<typeof names.actionNames[number]>();
  expectTypeOf<SimEvent['type']>().toEqualTypeOf<typeof names.eventNames[number]>();
  const actions = new Set(unionNames('src/sim/actions.ts', 'Action'));
  const events = new Set(unionNames('src/sim/events.ts', 'SimEvent'));
  const selectors = new Set(Object.keys(select));
  expect(actions).toEqual(new Set(names.actionNames));
  expect(events).toEqual(new Set(names.eventNames));
  expect(selectors).toEqual(new Set(names.selectorNames));
  expect([actions.size, events.size, selectors.size]).toEqual([24, 39, 27]);
  expect(CONTRACT_VERSION).toBe('1.4');
  expect(names.CONTRACT_VERSION).toBe('1.4');
});

it.skipIf(!liveDocPresent)('VERIFY-CORE-001 drift: live core.md still declares the vendored version and names', () => {
  const core = readFileSync(names.SOURCE_DOC, 'utf8');
  expect(core).toContain(`Version **${names.CONTRACT_VERSION}**`);
  const absent = [...names.actionNames, ...names.eventNames, ...names.selectorNames].filter(name => !core.includes(name));
  expect(absent).toEqual([]);
  if (createHash('sha256').update(core).digest('hex') !== names.SOURCE_SHA256)
    process.stdout.write('contract.test: core.md changed since the fixture was vendored; review tests/fixtures/core-contract.ts\n');
});

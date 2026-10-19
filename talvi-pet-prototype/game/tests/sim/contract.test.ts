import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { expect, expectTypeOf, it } from 'vitest';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import * as select from '../../src/sim/select';
import { CONTRACT_VERSION } from '../../src/sim/state';
import * as names from './contract-names';

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

it('VERIFY-CORE-001 partial: exact v1.4 Action and SimEvent unions (not handler completion)', () => {
  expectTypeOf<Action['type']>().toEqualTypeOf<typeof names.actionNames[number]>();
  expectTypeOf<SimEvent['type']>().toEqualTypeOf<typeof names.eventNames[number]>();
  expect(unionNames('src/sim/actions.ts', 'Action').sort()).toEqual([...names.actionNames].sort());
  expect(unionNames('src/sim/events.ts', 'SimEvent').sort()).toEqual([...names.eventNames].sort());
  expect(CONTRACT_VERSION).toBe(names.CONTRACT_VERSION);
  const core = readFileSync('../phase-2-technical/systems/core.md', 'utf8');
  expect(core).toContain(`Version **${CONTRACT_VERSION}**`);
});

it('VERIFY-CORE-001 partial: selector exports cover only the delivered slice; full set remains deferred', () => {
  const implemented = Object.keys(select).sort();
  expect(implemented).toEqual(['chooserTypes', 'doorEnabled', 'inputFrozen', 'ownsTag', 'starsOf', 'typeUnlockPhase']);
  expect(implemented.every(name => (names.selectorNames as readonly string[]).includes(name))).toBe(true);
  expect(names.selectorNames.length - implemented.length).toBe(21);
});

import { describe, expect, it } from 'vitest';
import { parseHiddenComponents } from '@/lib/componentVisibilityConfig';

describe('parseHiddenComponents', () => {
  it('reads the camelCase config response returned by the API', () => {
    expect(parseHiddenComponents({ configValue: { hidden: ['dashboard.blocks', 'defi.swap'] } }))
      .toEqual(['dashboard.blocks', 'defi.swap']);
  });

  it('accepts legacy snake_case rows and JSON string values', () => {
    expect(parseHiddenComponents({ config_value: '{"hidden":["tokens.create"]}' }))
      .toEqual(['tokens.create']);
  });

  it('returns an empty list for a missing setting and removes invalid duplicates', () => {
    expect(parseHiddenComponents(null)).toEqual([]);
    expect(parseHiddenComponents({ configValue: { hidden: ['a', 4, 'a', null, 'b'] } }))
      .toEqual(['a', 'b']);
  });

  it('returns null for malformed responses so callers do not reset saved settings', () => {
    expect(parseHiddenComponents({ configValue: '{not-json' })).toBeNull();
    expect(parseHiddenComponents('unexpected')).toBeNull();
  });
});

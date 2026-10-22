import { describe, it, expect } from 'vitest';
import { readProviderConfig, providerDiagnostics } from '../../src/lib/shopping/provider-config';
describe('official configuration', () => {
  it('does not enable a platform with partial credentials', () => {
    expect(readProviderConfig({ JD_APP_KEY: 'key' }).jd.configured).toBe(false);
  });
  it('reports only missing key names, never secret values', () => {
    const config = readProviderConfig({ TAOBAO_APP_KEY: 'key', TAOBAO_APP_SECRET: 'secret-value', TAOBAO_ADZONE_ID: '123' });
    expect(config.taobao.configured).toBe(true);
    expect(JSON.stringify(providerDiagnostics(config))).not.toContain('secret-value');
    expect(providerDiagnostics(config).pdd.configured).toBe(false);
  });
});

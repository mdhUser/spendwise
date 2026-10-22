export type Platform = 'taobao' | 'jd' | 'pdd';
export type ProviderConfig = { configured: false; missing: string[] } | {
  configured: true; key: string; secret: string; placement: string;
};
const keys = {
  taobao: ['TAOBAO_APP_KEY', 'TAOBAO_APP_SECRET', 'TAOBAO_ADZONE_ID'],
  jd: ['JD_APP_KEY', 'JD_APP_SECRET', 'JD_SITE_ID'],
  pdd: ['PDD_CLIENT_ID', 'PDD_CLIENT_SECRET', 'PDD_PID'],
} as const;
export function readProviderConfig(env: NodeJS.ProcessEnv): Record<Platform, ProviderConfig> {
  return Object.fromEntries(Object.entries(keys).map(([platform, names]) => {
    const missing = names.filter(name => !env[name]?.trim());
    return [platform, missing.length ? { configured: false, missing } : {
      configured: true, key: env[names[0]]!.trim(), secret: env[names[1]]!.trim(), placement: env[names[2]]!.trim(),
    }];
  })) as Record<Platform, ProviderConfig>;
}
export function providerDiagnostics(config: Record<Platform, ProviderConfig>) {
  return Object.fromEntries(Object.entries(config).map(([platform, value]) => [platform, {
    configured: value.configured, missing: value.configured ? [] : value.missing,
  }])) as Record<Platform, { configured: boolean; missing: string[] }>;
}

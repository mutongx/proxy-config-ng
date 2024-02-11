export type ConfigValue = string | number | boolean | null | ConfigValue[] | { "$ref": string } | ConfigObject;
export interface ConfigObject extends Record<string, ConfigValue> {};

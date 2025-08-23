import anytls from "./_anytls.json";
import hysteria2 from "./_hysteria2.json";
import trojan from "./_trojan.json";
import vless from "./_vless.json";

export type ConfigValue = string | number | boolean | null | ConfigValue[] | { "$ref": string } | ConfigObject;
export interface ConfigObject extends Record<string, ConfigValue> {};

export default {
    anytls,
    hysteria2,
    trojan,
    vless,
} as Record<string, ConfigObject>;

import JsonPointer from "json-pointer";

import Database from "../db";
import ProxyDefs, { ConfigObject, ConfigValue } from "./defs";

function orDefault<T>(value: T | undefined, defaultValue: T) {
  if (value === undefined) {
    return defaultValue;
  }
  return value;
}

function splitArray(s: string | null) {
  if (s === null) {
    return [];
  }
  return s.split(",");
}

export class SingBoxConfigBuilder {

  user: User;
  db: Database;
  rulesetMapping: Map<string, string>;
  config: any;

  constructor(user: User, db: Database) {
    this.user = user;
    this.db = db;
    this.rulesetMapping = new Map();
    this.config = {};
  }

  async fillConfig(obj: ConfigObject, args: object) {
    for (const key of Object.keys(obj)) {
      const value = obj[key];
      if (typeof value == "string" || typeof value == "number" || typeof value == "boolean") {
        continue;
      }
      if (value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        continue;
      }
      if (value.$ref) {
        const ref = value.$ref as string;
        const url = new URL(ref);
        if (url.protocol == "args:") {
          var newValue: ConfigValue;
          try {
            newValue = JsonPointer.get(args, url.pathname) as ConfigValue;
          } catch (e) {
            newValue = url.searchParams.get("default");
          }
          obj[key] = newValue;
        } else if (url.protocol == "secrets:") {
          obj[key] = await this.db.getSecretByName(url.pathname);
        } else {
          throw new Error(`unsupported ref: ${ref}`);
        }
      } else {
        await this.fillConfig(value as ConfigObject, args);
      }
    }
  }

  async getRuleSet(name: string): Promise<string> {
    var tag = this.rulesetMapping.get(name);
    if (tag) {
      return tag;
    }
    // Build remote rule
    if (name.startsWith("ref:")) {
      const splitedRef = name.split(":");
      if (splitedRef.length != 3) {
        throw `invalid rule set ref: ${name}`;
      }
      const repo = splitedRef[1];
      const file = splitedRef[2];
      switch (repo) {
        case "geosite":
          tag = `${repo}-${file}`;
          this.config.route.rule_set.push({
            "type": "remote",
            "tag": tag,
            "format": "binary",
            "url": `https://github.com/SagerNet/sing-geosite/raw/refs/heads/rule-set/geosite-${file}.srs`,
            "download_detour": "proxy",
          });
          break;
        case "geoip":
          tag = `${repo}-${file}`;
          this.config.route.rule_set.push({
            "type": "remote",
            "tag": tag,
            "format": "binary",
            "url": `https://github.com/SagerNet/sing-geoip/raw/refs/heads/rule-set/geoip-${file}.srs`,
            "download_detour": "proxy",
          })
          break;
        default:
          throw `unsupported rule set ref: ${name}`;
      }
    } else {
      // Build inline rule
      const ruleList = await this.db.getRuleSet(name);
      if (ruleList.length == 0) {
        throw `unknown rule set name: ${name}`;
      }
      const mergedRules: Record<string, (string | number)[]>[] = [];
      for (const rule of ruleList) {
        while (rule.index >= mergedRules.length) {
          mergedRules.push({});
        }
        const values = splitArray(rule.values).map(
          (value) => /^\d+$/.test(value) ? parseInt(value) : value);
        mergedRules[rule.index][rule.type] = values;
      }
      tag = name;
      this.config.route.rule_set.push({
        "type": "inline",
        "tag": tag,
        "rules": mergedRules,
      });
    }
    return tag;
  }

  async buildInbounds() {
    this.config.inbounds = [];
    this.config.inbounds.push({
      "type": "mixed",
      "tag": "mixed",
      "listen": orDefault(this.user.config.listen, "127.0.0.1"),
      "listen_port": orDefault(this.user.config.listen_port, 5353),
      "sniff": true,
    });
    if (this.user.config.enable_tun) {
      this.config.inbounds.push({
        "type": "tun",
        "tag": "tun",
        "address": [
          "172.27.0.1/30",
          "fd77:baba:9999::1/126",
        ],
        "sniff": true,
        "stack": this.user.config.tun_stack,
        "auto_route": orDefault(this.user.config.tun_auto_route, true),
        "auto_redirect": orDefault(this.user.config.tun_auto_redirect, undefined),
        "strict_route": orDefault(this.user.config.tun_strict_route, true),
      })
    }
    if (this.user.config.enable_tproxy) {
      this.config.inbounds.push({
        "type": "tproxy",
        "tag": "tproxy",
        "listen": orDefault(this.user.config.tproxy_listen, "0.0.0.0"),
        "listen_port": orDefault(this.user.config.tproxy_listen_port, 5356),
        "sniff": true,
      })
    }
  }

  async buildOutbounds(proxyList: Proxy[]) {
    const grouper = new Map<string, string[]>();
    const counter = new Map<string, number>();
    this.config.outbounds = [];
    for (const proxy of proxyList) {
      const host = await this.db.getHostByName(proxy.host);
      if (!host) {
        throw "host undefined";
      }
      // Generate a unique name
      const slug = `${host.name}-${proxy.type}`;
      if (!counter.has(slug)) {
        counter.set(slug, 0);
      }
      const count = counter.get(slug)!;
      counter.set(slug, count + 1);
      // Create tag and group
      const tag = `${slug}-${count}`;
      const groups = ["proxy", ...splitArray(proxy.routes)];
      for (const group of groups) {
        if (!grouper.has(group)) {
          grouper.set(group, []);
        }
        grouper.get(group)!.push(tag);
      }
      // Create the proxy config
      const proxyConfig = structuredClone(ProxyDefs[proxy.type]);
      await this.fillConfig(proxyConfig, {
        "server": this.user.config.ipv6 ? (host.addr6 || host.addr) : host.addr,
        "server_port": proxy.port,
      })
      this.config.outbounds.push({
        "tag": tag,
        ...proxyConfig,
      });
    }
    for (const [groupName, groupValues] of grouper) {
      this.config.outbounds.push({
        "type": "selector",
        "tag": groupName,
        "outbounds": groupValues,
      });
    }
    this.config.outbounds.push({ "type": "direct", "tag": "direct" });
    this.config.outbounds.push({ "type": "block", "tag": "block" });
    this.config.outbounds.push({ "type": "dns", "tag": "dns" });
  }

  async buildDns(dnsList: Dns[]) {
    this.config.dns = { servers: [] };
    this.config.dns.servers.push({
      "tag": "local",
      "address": "local",
    });
    for (const dns of dnsList) {
      this.config.dns.servers.push({
        "tag": dns.addr,
        "address": dns.addr,
        "detour": dns.detour,
      });
    }
    if (this.user.config.enable_fakeip) {
      this.config.dns.fakeip = {
        "enabled": true,
        "inet4_range": orDefault(this.user.config.fakeip_inet4_range, "198.18.0.0/15"),
        "inet6_range": orDefault(this.user.config.fakeip_inet6_range, "fc00::/18"),
      }
      this.config.dns.servers.push({
        "tag": "fakeip",
        "address": "fakeip",
      });
    }
  }

  async buildRoute(routeList: Route[]) {
    this.config.route = {
      "rules": [],
      "rule_set": [],
    };
    this.config.route.rules.push({
      "protocol": "dns",
      "outbound": "dns",
    });
    this.config.route.rules.push({
      "ip_is_private": true,
      "outbound": "direct",
    });
    for (const route of routeList) {
      // Special handling for final route
      if (route.rule === null) {
        if (route.inbound !== null) {
          throw "final route cannot define inbound";
        }
        if (route.outbound !== null) {
          throw "final route cannot define outbound";
        }
        this.config.route.final = route.target;
        continue;
      }
      // Validity check
      if (route.outbound !== null) {
        throw "proxy route cannot define outbound";
      }
      // Generate rule
      const tag = await this.getRuleSet(route.rule);
      this.config.route.rules.push({
        "inbound": route.inbound || undefined,
        "rule_set": tag,
        "outbound": route.target,
      });
    }
  }

  async buildDnsRoute(routeList: Route[]) {
    this.config.dns.rules = [];
    for (const route of routeList) {
      // Special handling for final route
      if (route.rule === null) {
        if (route.inbound !== null) {
          throw "final route cannot define inbound";
        }
        if (route.outbound !== null) {
          throw "final route cannot define outbound";
        }
        this.config.dns.final = route.target;
        continue;
      }
      // Generate rule
      const tag = await this.getRuleSet(route.rule);
      this.config.dns.rules.push({
        "inbound": route.inbound || undefined,
        "outbound": route.outbound || undefined,
        "rule_set": tag,
        "server": route.target,
      });
    }
    if (this.user.config.enable_fakeip) {
      this.config.dns.rules.push({
        "query_type": ["A", "AAAA"],
        "server": "fakeip",
      });
    }
  }

  async finalize() {
    this.config.dns.independent_cache = true;
    this.config.route.auto_detect_interface = true;
    this.config.log = { "level": "info" };
    this.config.experimental = {}
    this.config.experimental.cache_file = {
      "enabled": true,
      "path": "cache.db",
      "cache_id": "",
      "store_fakeip": true
    };
    if (this.user.config.enable_clash_api !== false) {
      this.config.experimental.clash_api = {
        "external_controller": orDefault(this.user.config.clash_api_listen, "127.0.0.1:9090"),
        "external_ui": "ui",
        "external_ui_download_url": "https://github.com/MetaCubeX/Yacd-meta/archive/gh-pages.zip",
        "secret": orDefault(this.user.config.clash_api_token, ""),
      };
    }
  }

  get() {
    return this.config;
  }

};

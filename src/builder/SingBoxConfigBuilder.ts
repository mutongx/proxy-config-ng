import JsonPointer from "json-pointer";

import Database from "../db";
import ProxyDefs, { ConfigObject, ConfigValue } from "./defs";
import { orDefault, ensureArray } from "../utils";

export class SingBoxConfigBuilder {

  user: User;
  db: Database;
  ruleSetMapping: Map<string, string>;
  buildResult: any;

  constructor(user: User, db: Database) {
    this.user = user;
    this.db = db;
    this.ruleSetMapping = new Map();
    this.buildResult = {};
  }

  async fillConfig(obj: ConfigObject, host: string, port: number, vars: object) {
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
        var refValue: ConfigValue = null;
        if (url.protocol == "proxy:") {
          if (url.pathname == "host") { refValue = host; }
          if (url.pathname == "port") { refValue = port; }
        } else if (url.protocol == "vars:") {
          try {
            refValue = JsonPointer.get(vars, url.pathname) as ConfigValue;
          } catch (e) {
            refValue = await this.db.getVariableByName(url.pathname.substring(1)) || url.searchParams.get("default");
          }
        }
        obj[key] = refValue;
      } else {
        await this.fillConfig(value as ConfigObject, host, port, vars);
      }
    }
  }

  async getRuleSet(name: string): Promise<string> {
    var ruleSetTag = this.ruleSetMapping.get(name);
    if (ruleSetTag) {
      return ruleSetTag;
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
          ruleSetTag = `${repo}-${file}`;
          this.buildResult.route.rule_set.push({
            "type": "remote",
            "tag": ruleSetTag,
            "format": "binary",
            "url": `https://github.com/SagerNet/sing-geosite/raw/refs/heads/rule-set/geosite-${file}.srs`,
            "download_detour": "proxy",
          });
          break;
        case "geoip":
          ruleSetTag = `${repo}-${file}`;
          this.buildResult.route.rule_set.push({
            "type": "remote",
            "tag": ruleSetTag,
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
      const ruleSets = await this.db.getRuleSets(name);
      if (ruleSets.length == 0) {
        throw `unknown rule set name: ${name}`;
      }
      const parsedRules: { [key: string] : (string|number)[] }[] = [];
      for (const ruleSet of ruleSets) {
        for (const key of Object.keys(ruleSet.config)) {
          ruleSet.config[key] = ensureArray(ruleSet.config[key]).map((v) => /^\d+$/.test(v) ? parseInt(v) : v);
        }
        parsedRules.push(ruleSet.config);
      }
      ruleSetTag = name;
      this.buildResult.route.rule_set.push({
        "type": "inline",
        "tag": ruleSetTag,
        "rules": parsedRules,
      });
    }
    this.ruleSetMapping.set(name, ruleSetTag);
    return ruleSetTag;
  }

  async buildInbounds() {
    this.buildResult.inbounds = [];
    this.buildResult.inbounds.push({
      "type": "mixed",
      "tag": "mixed",
      "listen": orDefault(this.user.config.listen, "127.0.0.1"),
      "listen_port": orDefault(this.user.config.listen_port, 5353),
    });
    if (this.user.config.enable_tun) {
      const address = ["172.27.0.1/30", "fd77:baba:9999::1/126"];
      const exclude_address = [];
      if (!this.user.config.enable_tailscale) {
        if (orDefault(this.user.config.tun_exclude_tailscale_network, true)) {
          if (this.user.config.tailscale_network) {
            exclude_address.push(...this.user.config.tailscale_network);
          } else {
            exclude_address.push("100.64.0.0/10", "fd7a:115c:a1e0::/48");
          }
          exclude_address.push("100.100.100.100/32", "fd7a:115c:a1e0::53/128")
        }
      }
      this.buildResult.inbounds.push({
        "type": "tun",
        "tag": "tun",
        "address": address,
        "auto_route": orDefault(this.user.config.tun_auto_route, true),
        "strict_route": orDefault(this.user.config.tun_strict_route, true),
        "auto_redirect": orDefault(this.user.config.tun_auto_redirect, true),
        "route_exclude_address": exclude_address,
      })
    }
    if (this.user.config.enable_tproxy) {
      this.buildResult.inbounds.push({
        "type": "tproxy",
        "tag": "tproxy",
        "listen": orDefault(this.user.config.tproxy_listen, "0.0.0.0"),
        "listen_port": orDefault(this.user.config.tproxy_listen_port, 5356),
      })
    }
  }

  async buildOutbounds(proxyList: Proxy[]) {
    const grouper = new Map<string, string[]>();
    const counter = new Map<string, number>();
    this.buildResult.outbounds = [];
    this.buildResult.outbounds.push({ "type": "direct", "tag": "direct" });
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
      const groups = ["proxy", ...ensureArray(proxy.config.selector)];
      for (const group of groups) {
        if (!grouper.has(group)) {
          grouper.set(group, []);
        }
        grouper.get(group)!.push(tag);
      }
      // Create the proxy config
      const proxyDef = structuredClone(ProxyDefs[proxy.type]);
      await this.fillConfig(
        proxyDef,
        this.user.config.ipv6 ? (host.addr6 || host.addr) : host.addr,
        proxy.port,
        proxy.variable,
      )
      this.buildResult.outbounds.push({
        "tag": tag,
        ...proxyDef,
      });
    }
    for (const [groupName, groupValues] of grouper) {
      this.buildResult.outbounds.push({
        "type": "selector",
        "tag": groupName,
        "outbounds": groupValues,
      });
    }
    if (this.user.config.enable_tailscale) {
      this.buildResult.endpoints = [
        {
          "type": "tailscale",
          "auth_key": this.user.config.tailscale_auth_key,
          "control_url": this.user.config.tailscale_control_url,
        }
      ]
    }
  }

  async buildDns(dnsList: Dns[]) {
    this.buildResult.dns = { servers: [] };
    if (!this.user.config.ipv6) {
      this.buildResult.dns.strategy = "ipv4_only"
    }
    this.buildResult.dns.servers.push({
      "tag": "local",
      "type": "local",
    });
    for (const dns of dnsList) {
      this.buildResult.dns.servers.push({
        "tag": dns.name,
        "type": dns.type,
        "server": dns.addr,
        "detour": dns.detour != "direct" ? dns.detour : undefined,
      });
    }
    if (this.user.config.enable_fakeip) {
      this.buildResult.dns.fakeip = {
        "enabled": true,
        "inet4_range": orDefault(this.user.config.fakeip_inet4_range, "198.18.0.0/15"),
        "inet6_range": orDefault(this.user.config.fakeip_inet6_range, "fc00::/18"),
      }
      this.buildResult.dns.servers.push({
        "tag": "fakeip",
        "type": "fakeip",
      });
    }
  }

  async buildRules(actions: RuleAction[]) {
    this.buildResult.route = {
      "rules": [],
      "rule_set": [],
      "default_domain_resolver": {
        "server": "local",
      },
    };
    this.buildResult.route.rules.push({
      "action": "sniff",
    });
    this.buildResult.route.rules.push({
      "protocol": "dns",
      "action": "hijack-dns",
    });
    this.buildResult.route.rules.push({
      "protocol": "stun",
      "action": "route",
      "outbound": "direct",
    });
    this.buildResult.route.rules.push({
      "protocol": "bittorrent",
      "action": "route",
      "outbound": "direct",
    });
    
    this.buildResult.route.rules.push({
      "ip_is_private": true,
      "action": "route",
      "outbound": "direct",
    });
    for (const action of actions) {
      // Special handling for final route
      if (action.rule_set === null) {
        if (action.inbound !== null) {
          throw new Error("final action cannot define inbound");
        }
        if (action.rule_action !== "route") {
          throw new Error("final action must be route");
        }
        if (action.config.outbound === undefined) {
          throw new Error("final action must have an outbound")
        }
        this.buildResult.route.final = action.config.outbound;
        continue;
      }
      // Generate rule
      const tag = await this.getRuleSet(action.rule_set);
      this.buildResult.route.rules.push({
        "inbound": action.inbound || undefined,
        "rule_set": tag,
        "action": action.rule_action,
        ...action.config,
      });
    }
  }

  async buildDnsRules(actions: RuleAction[]) {
    this.buildResult.dns.rules = [];
    for (const action of actions) {
      // Special handling for final route
      if (action.rule_set === null) {
        if (action.inbound !== null) {
          throw new Error("final dns actoun cannot define inbound");
        }
        if (action.rule_action !== "route") {
          throw new Error("final dns action must be route");
        }
        if (action.config.server === undefined) {
          throw new Error("final dns action must have an outbound")
        }
        this.buildResult.dns.final = action.config.server;
        continue;
      }
      // Generate rule
      const tag = await this.getRuleSet(action.rule_set);
      this.buildResult.dns.rules.push({
        "inbound": action.inbound || undefined,
        "rule_set": tag,
        "action": action.rule_action,
        ...action.config,
      });
    }
    if (this.user.config.enable_fakeip) {
      this.buildResult.dns.rules.push({
        "query_type": ["A", "AAAA"],
        "server": "fakeip",
      });
    }
  }

  async finalize() {
    this.buildResult.dns.independent_cache = true;
    this.buildResult.route.auto_detect_interface = true;
    this.buildResult.log = { "level": orDefault(this.user.config.log_level, "info") };
    this.buildResult.experimental = {}
    this.buildResult.experimental.cache_file = {
      "enabled": true,
      "path": "cache.db",
      "cache_id": "",
      "store_fakeip": true
    };
    if (this.user.config.enable_clash_api !== false) {
      this.buildResult.experimental.clash_api = {
        "external_controller": orDefault(this.user.config.clash_api_listen, "127.0.0.1:9090"),
        "external_ui": "ui",
        "external_ui_download_url": "https://github.com/MetaCubeX/Yacd-meta/archive/gh-pages.zip",
        "secret": orDefault(this.user.config.clash_api_token, ""),
      };
    }
  }

  get() {
    return this.buildResult;
  }

};
